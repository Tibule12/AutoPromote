// instagramPublisher.js
// Instagram Publishing via Facebook Graph API (Images, Videos, Carousels)
// NOTE: Real production usage requires ensuring the media URL is publicly accessible and handling video processing states.
// Environment:
//   IG_USER_ID=<instagram_business_account_id>
//   FACEBOOK_PAGE_ACCESS_TOKEN=<page_access_token with instagram_basic, instagram_content_publish>

const fetch = require("node-fetch");
const { db } = require("../firebaseAdmin");

async function buildContentContext(contentId) {
  if (!contentId) return {};
  try {
    const snap = await db.collection("content").doc(contentId).get();
    if (!snap.exists) return {};
    const d = snap.data();
    return {
      title: d.title,
      description: d.description,
      landingPageUrl: d.landingPageUrl || d.smartLink || d.url,
      url: d.url,
      type: d.type,
      tags: d.tags || [],
      mediaUrls: d.mediaUrls || [], // For carousel
    };
  } catch (_) {
    return {};
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Create carousel post with multiple images
 */
async function publishCarousel({ igUserId, accessToken, mediaUrls, caption }) {
  const creationEndpoint = `https://graph.facebook.com/v18.0/${igUserId}/media`;

  // Step 1: Create container for each image
  const childrenIds = [];

  for (const imageUrl of mediaUrls) {
    const params = new URLSearchParams({
      access_token: accessToken,
      image_url: imageUrl,
      is_carousel_item: "true",
    });

    try {
      const createRes = await fetch(creationEndpoint, { method: "POST", body: params });
      const createJson = await createRes.json();

      if (!createRes.ok || !createJson.id) {
        throw new Error(
          `Failed to create carousel item: ${createJson.error?.message || JSON.stringify(createJson)}`
        );
      }

      childrenIds.push(createJson.id);
    } catch (e) {
      throw new Error(`Carousel item creation failed: ${e.message}`);
    }
  }

  // Step 2: Create carousel container
  const carouselParams = new URLSearchParams({
    access_token: accessToken,
    media_type: "CAROUSEL",
    caption,
    children: childrenIds.join(","),
  });

  const carouselRes = await fetch(creationEndpoint, { method: "POST", body: carouselParams });
  const carouselJson = await carouselRes.json();

  if (!carouselRes.ok || !carouselJson.id) {
    throw new Error(
      `Carousel container creation failed: ${carouselJson.error?.message || JSON.stringify(carouselJson)}`
    );
  }

  return carouselJson.id;
}

async function publishInstagram({ contentId, payload, reason, uid }) {
  if (!uid) {
    return { platform: "instagram", simulated: true, reason: "missing_uid" };
  }

  // Multi-tenant: Fetch credentials from user's Facebook connection
  let IG_USER_ID, ACCESS_TOKEN;
  try {
    const fbSnap = await db.collection("users").doc(uid).collection("connections").doc("facebook").get();
    if (!fbSnap.exists) {
        return { platform: "instagram", simulated: true, reason: "facebook_not_connected" };
    }
    const data = fbSnap.data();
    IG_USER_ID = data.ig_business_account_id;
    
    // We need a page access token. We can try the first page, or a specific page if specified in payload.
    // Ideally the user selected a page in the UI.
    const selectedPageId = payload?.pageId || payload?.platform_options?.facebook?.pageId;
    if (selectedPageId && Array.isArray(data.pages)) {
        const p = data.pages.find(page => page.id === selectedPageId);
        if (p) ACCESS_TOKEN = p.access_token;
    } 
    
    // Fallback: Use the first page's token if available, or the generic one if stored (though FB Graph usually requires page token)
    if (!ACCESS_TOKEN && Array.isArray(data.pages) && data.pages.length > 0) {
        ACCESS_TOKEN = data.pages[0].access_token;
    }
    
    // Fallback Legacy: process.env (only for single-tenant / admin operations)
    if (!IG_USER_ID && process.env.IG_USER_ID) IG_USER_ID = process.env.IG_USER_ID;
    if (!ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  } catch (e) {
      console.error("[InstagramPublisher] Credential fetch failed", e);
      return { platform: "instagram",  success: false, error: "credential_error" };
  }

  if (!IG_USER_ID || !ACCESS_TOKEN) {
    return { platform: "instagram", simulated: true, reason: "missing_credentials" };
  }
  const ctx = await buildContentContext(contentId);
  let captionBase = payload?.caption || payload?.message || ctx.title || "New post";
  
  // SPONSORSHIP DISCLOSURE/CONFIG
  let isReel = false;
  if (contentId) {
    try {
      const snap = await db.collection("content").doc(contentId).get();
      if (snap.exists) {
        const cData = snap.data();
        const mon = cData.monetization_settings || {};
        const igSettings = mon.instagram || {};
        
        // Reel Config
        if (igSettings.is_reel) isReel = true;

        // Disclosure Config
        const isSponsored = mon.is_sponsored || igSettings.is_paid_partnership;
        if (isSponsored) {
           const partner = igSettings.sponsor_user || mon.brand_name || "";
           const disclosure = partner 
            ? ` #ad @${partner.replace(/^@/, '')}` 
            : " #ad #sponsored";
           
           if (!captionBase.toLowerCase().includes("#ad") && !captionBase.toLowerCase().includes("sponsored")) {
             captionBase += "\n\n" + disclosure;
           }
        }
      }
    } catch (_) {}
  }

  const hashtags = (ctx.tags || [])
    .slice(0, 5)
    .map(t => `#${String(t).replace(/[^a-zA-Z0-9]/g, "")}`)
    .join(" ");
  const caption = [captionBase, hashtags].filter(Boolean).join("\n");

  // Check if carousel (multiple images)
  const mediaUrls = payload?.mediaUrls || ctx.mediaUrls || [];
  const isCarousel = mediaUrls.length > 1;

  let creationId;

  try {
    if (isCarousel) {
      // Carousel post
      creationId = await publishCarousel({
        igUserId: IG_USER_ID,
        accessToken: ACCESS_TOKEN,
        mediaUrls,
        caption,
      });
    } else {
      // Single image or video
      const mediaUrl = payload?.mediaUrl || mediaUrls[0] || ctx.url || ctx.landingPageUrl;
      if (!mediaUrl) {
        return { platform: "instagram", simulated: true, reason: "no_media_url" };
      }
      const isVideo = /\.mp4($|\?|#)/i.test(mediaUrl) || ctx.type === "video";

      const creationEndpoint = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`;
      const params = new URLSearchParams({
        access_token: ACCESS_TOKEN,
        caption,
      });
      if (isVideo) {
        // Enforce Reel type if requested (REELS or VIDEO)
        params.append("media_type", isReel ? "REELS" : "VIDEO"); 
        params.append("video_url", mediaUrl);
        if (isReel) params.append("share_to_feed", "true"); // Default to sharing to feed for growth
      } else {
        params.append("image_url", mediaUrl);
      }

      const createRes = await fetch(creationEndpoint, { method: "POST", body: params });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.id) {
        return {
          platform: "instagram",
          success: false,
          stage: "create",
          error: createJson.error?.message || JSON.stringify(createJson),
        };
      }
      creationId = createJson.id;

      // For video we should poll status
      if (isVideo) {
        for (let i = 0; i < 5; i++) {
          // Increased from 2 to 5 attempts
          await sleep(2000); // Increased from 1500ms to 2000ms
          try {
            const statusRes = await fetch(
              `https://graph.facebook.com/v18.0/${creationId}?fields=status_code&access_token=${ACCESS_TOKEN}`
            );
            const statusJson = await statusRes.json();
            if (statusJson.status_code === "FINISHED") break;
            if (statusJson.status_code === "ERROR") {
              return {
                platform: "instagram",
                success: false,
                stage: "processing",
                error: "VIDEO_PROCESSING_ERROR",
              };
            }
          } catch (_) {}
        }
      }
    }
  } catch (e) {
    return { platform: "instagram", success: false, stage: "create", error: e.message };
  }

  // Publish the media
  try {
    const publishRes = await fetch(
      `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        body: new URLSearchParams({ creation_id: creationId }),
      }
    );
    const publishJson = await publishRes.json();
    if (!publishRes.ok || !publishJson.id) {
      return {
        platform: "instagram",
        success: false,
        stage: "publish",
        error: publishJson.error?.message || JSON.stringify(publishJson),
      };
    }
    return {
      platform: "instagram",
      success: true,
      mediaId: publishJson.id,
      reason,
      carousel: isCarousel,
      itemCount: isCarousel ? mediaUrls.length : 1,
    };
  } catch (e) {
    return { platform: "instagram", success: false, stage: "publish", error: e.message };
  }
}

module.exports = { publishInstagram };

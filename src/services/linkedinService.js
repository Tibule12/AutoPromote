// linkedinService.js - LinkedIn Share API integration
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

/**
 * Get user's LinkedIn connection tokens
 */
const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserLinkedInConnection(uid) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("connections")
    .doc("linkedin")
    .get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

/**
 * Get valid access token (with refresh if needed)
 */
async function getValidAccessToken(uid) {
  const connection = await getUserLinkedInConnection(uid);
  if (!connection || !connection.tokens) {
    console.warn(`[LinkedIn] No connection/tokens for ${uid}`);
    return null;
  }

  const tokens = connection.tokens;

  // Backward compatibility: If tokens is just a string, assume it IS the access token (legacy/manual set)
  if (typeof tokens === "string" && !tokens.access_token) {
    return tokens; // Return the raw string as the access token
  }

  const now = Date.now();

  // Check if token is still valid (LinkedIn tokens typically last 60 days)
  if (tokens.expires_in && tokens.access_token) {
    const expiresAt = (connection.updatedAt?._seconds || 0) * 1000 + tokens.expires_in * 1000;
    if (now < expiresAt - 300000) {
      // 5 min buffer
      return tokens.access_token;
    }
  }

  // LinkedIn doesn't support refresh tokens in the same way as Twitter
  // Tokens last 60 days, so if expired, user needs to re-authenticate
  return tokens.access_token;
}

/**
 * Get LinkedIn user profile (person URN)
 */
async function getUserProfile(accessToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  // Try v2/me (Classic / r_liteprofile)
  const response = await safeFetch("https://api.linkedin.com/v2/me", fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    },
    requireHttps: true,
    allowHosts: ["api.linkedin.com"],
  });

  if (response.ok) {
    const profile = await response.json();
    return profile.id; // Returns the person URN ID
  }

  // Fallback: Try /v2/userinfo (OIDC / profile)
  // New tokens often only have 'profile' scope which doesn't allow /v2/me
  if (response.status === 403) {
    try {
      const oidcConn = await safeFetch("https://api.linkedin.com/v2/userinfo", fetchFn, {
        fetchOptions: {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            // OIDC endpoint might not need X-Restli-Protocol-Version, but it shouldn't hurt or can be omitted
          },
        },
        requireHttps: true,
        allowHosts: ["api.linkedin.com"],
      });

      if (oidcConn.ok) {
        const oidcProfile = await oidcConn.json();
        if (oidcProfile.sub) {
          return oidcProfile.sub; // OIDC subject ID matches person URN ID
        }
      }
    } catch (e) {
      console.warn("LinkedIn OIDC fallback failed:", e.message);
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get LinkedIn profile: ${error}`);
  }

  const profile = await response.json();
  return profile.id; // Returns the person URN ID
}

/**
 * Upload image to LinkedIn for use in posts
 */
async function uploadImage({ uid, imageUrl }) {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid LinkedIn access token");

  const personId = await getUserProfile(accessToken);

  // Step 1: Register upload
  const registerResponse = await safeFetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: `urn:li:person:${personId}`,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        }),
      },
      requireHttps: true,
      allowHosts: ["api.linkedin.com"],
    }
  );

  if (!registerResponse.ok) {
    throw new Error("Failed to register LinkedIn image upload");
  }

  const registerData = await registerResponse.json();
  const uploadUrl =
    registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
      .uploadUrl;
  const asset = registerData.value.asset;

  // Step 2: Download image
  const imageResponse = await safeFetch(imageUrl, fetchFn, { requireHttps: true });
  if (!imageResponse.ok) throw new Error("Failed to download image");
  const imageBuffer =
    typeof imageResponse.buffer === "function"
      ? await imageResponse.buffer()
      : Buffer.from(await imageResponse.arrayBuffer());

  // Step 3: Upload image
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image to LinkedIn");
  }

  return asset; // Return asset URN
}

/**
 * Upload video to LinkedIn
 */
async function uploadVideo({ uid, videoUrl }) {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid LinkedIn access token");

  const personId = await getUserProfile(accessToken);

  // Step 1: Register upload
  const registerResponse = await safeFetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
            owner: `urn:li:person:${personId}`,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        }),
      },
      requireHttps: true,
      allowHosts: ["api.linkedin.com"],
    }
  );

  if (!registerResponse.ok) {
    const err = await registerResponse.text();
    throw new Error(`Failed to register LinkedIn video upload: ${err}`);
  }

  const registerData = await registerResponse.json();
  const uploadUrl =
    registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
      .uploadUrl;
  const asset = registerData.value.asset;

  // Step 2: Download video stream
  const videoResponse = await safeFetch(videoUrl, fetchFn, { requireHttps: true });
  if (!videoResponse.ok) throw new Error("Failed to download video for upload");

  // Use buffer for compatibility
  const videoBuffer =
    typeof videoResponse.buffer === "function"
      ? await videoResponse.buffer()
      : Buffer.from(await videoResponse.arrayBuffer());

  // Step 3: Upload video
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload video bytes to LinkedIn");
  }

  // Step 4: Poll for completion
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 20;
    const interval = 2000;

    const poll = async () => {
      attempts++;
      try {
        const statusRes = await safeFetch(`https://api.linkedin.com/v2/assets/${asset}`, fetchFn, {
          fetchOptions: {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Restli-Protocol-Version": "2.0.0",
            },
          },
          requireHttps: true,
          allowHosts: ["api.linkedin.com"],
        });

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const state = statusData.recipes[0].status;
          if (state === "AVAILABLE") {
            resolve(asset);
            return;
          } else if (state === "CLIENT_ERROR" || state === "PROCESSING_FAILED") {
            reject(new Error("LinkedIn video processing failed"));
            return;
          }
        }
      } catch (e) {
        console.warn("Polling error", e);
      }

      if (attempts >= maxAttempts) {
        // Return asset anyway, it might process eventually
        console.warn("LinkedIn video processing timed out, proceeding anyway");
        resolve(asset);
      } else {
        setTimeout(poll, interval);
      }
    };
    poll();
  });
}

/**
 * Post to LinkedIn (text, image, video, or article)
 */
async function postToLinkedIn({
  uid,
  text,
  imageUrl,
  videoUrl,
  mediaUrl,
  articleUrl,
  link,
  url,
  postType,
  articleTitle,
  articleDescription,
  contentId,
  hashtags: _hashtags = [],
  hashtagString = "",
  companyId = null,
  personId: personIdParam = null,
}) {
  if (!uid) throw new Error("uid required");

  // Auto-detect media types from generic 'mediaUrl' if specific ones not provided
  let useVideo = videoUrl;
  let useImage = imageUrl;
  if (mediaUrl && !useVideo && !useImage) {
    if (/\.(mp4|mov|avi|webm)$/i.test(mediaUrl)) {
      useVideo = mediaUrl;
    } else {
      useImage = mediaUrl;
    }
  }

  // Auto-detect article/link url
  let useArticleUrl = articleUrl || link || url;

  // If postType is explicitly 'post' (not article) and we have media,
  // we might want to ignore the link as an attachment and just put it in text.
  // But if we have NO media, we should definitely use the link as an attachment (Article).

  if (!text && !useArticleUrl && !useImage && !useVideo) throw new Error("content required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid LinkedIn access token");

  // If a companyId is provided, use org posting rules; otherwise get person ID
  const resolvedPersonId = personIdParam || (await getUserProfile(accessToken));
  const authorUrn = companyId
    ? `urn:li:organization:${companyId}`
    : `urn:li:person:${resolvedPersonId}`;

  // Build share payload
  const sharePayload = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: (text || "") + (hashtagString ? ` ${hashtagString}` : ""),
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  // Add video if provided (prioritize video over image)
  if (useVideo) {
    try {
      const assetUrn = await uploadVideo({ uid, videoUrl: useVideo });
      sharePayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "VIDEO";
      sharePayload.specificContent["com.linkedin.ugc.ShareContent"].media = [
        {
          status: "READY",
          media: assetUrn,
          title: { text: "Video" },
        },
      ];
    } catch (e) {
      console.warn("[LinkedIn] Video upload failed, posting as text/link:", e.message);
      // Fallback logic could go here
    }
  }
  // Add image if provided & no video
  else if (useImage) {
    try {
      const assetUrn = await uploadImage({ uid, imageUrl: useImage });
      sharePayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
      sharePayload.specificContent["com.linkedin.ugc.ShareContent"].media = [
        {
          status: "READY",
          media: assetUrn,
          title: { text: "Image" },
        },
      ];
    } catch (e) {
      console.warn("[LinkedIn] Image upload failed, posting without image:", e.message);
    }
  }

  // Add article if provided & no media
  // Use 'Article' type if we have a URL and no media, or if explicitly requested and we have a URL
  if (!useVideo && !useImage && useArticleUrl) {
    sharePayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "ARTICLE";
    sharePayload.specificContent["com.linkedin.ugc.ShareContent"].media = [
      {
        status: "READY",
        originalUrl: useArticleUrl,
        title: {
          text: articleTitle || "Article",
        },
        description: {
          text: articleDescription || "",
        },
      },
    ];
  }

  // Post to LinkedIn
  const response = await safeFetch("https://api.linkedin.com/v2/ugcPosts", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(sharePayload),
    },
    requireHttps: true,
    allowHosts: ["api.linkedin.com"],
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    const errorMsg = responseData.message || responseData.error || "LinkedIn posting failed";
    throw new Error(`LinkedIn posting failed: ${errorMsg}`);
  }

  const shareId = responseData.id;
  const shareUrl = `https://www.linkedin.com/feed/update/${shareId}`;

  // Store post info in Firestore if contentId provided
  if (contentId && shareId) {
    try {
      const contentRef = db.collection("content").doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().linkedin || {} : {};

      await contentRef.set(
        {
          linkedin: {
            ...existingData,
            shareId,
            text: text || "",
            postedAt: new Date().toISOString(),
            createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[LinkedIn] Failed to store post info in Firestore:", e.message);
    }
  }

  return {
    success: true,
    platform: "linkedin",
    shareId,
    url: shareUrl,
    raw: responseData,
  };
}

/**
 * Get LinkedIn post statistics
 */
async function getPostStats({ uid, shareId }) {
  if (!uid) throw new Error("uid required");
  if (!shareId) throw new Error("shareId required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid LinkedIn access token");

  // LinkedIn uses a different endpoint for analytics
  const url = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(shareId)}/(likes,comments)`;

  const response = await safeFetch(url, fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    },
    requireHttps: true,
    allowHosts: ["api.linkedin.com"],
  });

  if (!response.ok) {
    throw new Error("Failed to fetch LinkedIn post stats");
  }

  const data = await response.json();

  return {
    shareId,
    likes: data.likes?.paging?.total || 0,
    comments: data.comments?.paging?.total || 0,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  getUserLinkedInConnection,
  getValidAccessToken,
  postToLinkedIn,
  uploadImage,
  getPostStats,
};

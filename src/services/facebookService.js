// facebookService.js - Facebook Graph API OAuth and page posting
const { db } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

const TOKEN_URL = "https://graph.facebook.com/v18.0/oauth/access_token";
const AUTH_URL = "https://www.facebook.com/v18.0/dialog/oauth";

/**
 * Get user's Facebook connection tokens
 */
const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserFacebookConnection(uid) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("connections")
    .doc("facebook")
    .get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

/**
 * Generate Facebook OAuth authorization URL
 */
function generateAuthUrl({
  appId,
  redirectUri,
  state,
  scope = "public_profile,pages_manage_posts,pages_read_engagement,publish_to_groups",
}) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope,
    response_type: "code",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken({ code, redirectUri }) {
  if (!fetchFn) throw new Error("Fetch not available");

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Facebook app credentials not configured");
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await safeFetch(`${TOKEN_URL}?${params.toString()}`, fetchFn, {
    fetchOptions: {
      method: "GET",
    },
    requireHttps: true,
    allowHosts: ["graph.facebook.com"],
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook token exchange failed: ${error}`);
  }

  const data = await response.json();

  if (data.error || !data.access_token) {
    throw new Error(data.error?.message || "Token exchange failed");
  }

  return data; // { access_token, token_type, expires_in }
}

/**
 * Exchange short-lived token for long-lived token
 */
async function getLongLivedToken(shortLivedToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Facebook app credentials not configured");
  }

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const response = await safeFetch(`${TOKEN_URL}?${params.toString()}`, fetchFn, {
    fetchOptions: {
      method: "GET",
    },
    requireHttps: true,
    allowHosts: ["graph.facebook.com"],
  });

  if (!response.ok) {
    throw new Error("Failed to get long-lived token");
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Get user's Facebook pages
 */
async function getUserPages(accessToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const response = await safeFetch(
    "https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,category,tasks",
    fetchFn,
    {
      fetchOptions: {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      requireHttps: true,
      allowHosts: ["graph.facebook.com"],
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch user pages");
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Get user profile
 */
async function getUserProfile(accessToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const response = await safeFetch(
    "https://graph.facebook.com/v18.0/me?fields=id,name,email",
    fetchFn,
    {
      fetchOptions: {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      requireHttps: true,
      allowHosts: ["graph.facebook.com"],
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch user profile");
  }

  return response.json();
}

/**
 * Post to Facebook page (supports Feed, Photos, and Videos)
 */
async function postToFacebookPage({
  pageId,
  pageAccessToken,
  message,
  link,
  imageUrl,
  videoUrl,
  title,
}) {
  if (!fetchFn) throw new Error("Fetch not available");

  const params = new URLSearchParams({ access_token: pageAccessToken });
  let endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;

  if (videoUrl) {
    // Post Native Video
    endpoint = `https://graph.facebook.com/v18.0/${pageId}/videos`;
    params.append("file_url", videoUrl);
    if (title) params.append("title", title);
    if (message) params.append("description", message); // videos use description
  } else if (imageUrl) {
    // Post Native Photo
    endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
    params.append("url", imageUrl);
    if (message) params.append("caption", message); // photos use caption
  } else {
    // Post Link or Status
    if (message) params.append("message", message);
    if (link) params.append("link", link);
  }

  const response = await safeFetch(endpoint, fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
    requireHttps: true,
    allowHosts: ["graph.facebook.com"],
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || "Post failed");
  }

  return response.json();
}

/**
 * Post to Facebook (wrapper for platformPoster integration)
 */
async function postToFacebook({ contentId, payload, reason, uid }) {
  if (!uid) {
    return { platform: "facebook", success: false, error: "uid_required" };
  }

  try {
    const connection = await getUserFacebookConnection(uid);

    if (!connection || !connection.tokens) {
      return { platform: "facebook", success: false, error: "not_authenticated" };
    }

    // connection.tokens intentionally omitted (unused in this path)
    const meta = connection.meta || {};

    // Get selected page from payload or use default from connection
    const pageId =
      payload?.pageId ||
      payload?.platformOptions?.facebook?.pageId ||
      meta.selectedPageId ||
      connection.selectedPageId;

    if (!pageId) {
      // If we only have one page, default to it
      const allPages = connection.pages || meta.pages || [];
      if (allPages.length === 1) {
        // Proceed with the only page we have
      } else {
        return { platform: "facebook", success: false, error: "page_id_required" };
      }
    }

    // Find page access token
    const pages = connection.pages || meta.pages || [];
    // If pageId was not provided/resolved but we have pages, pick the first one as default
    const targetPageId = pageId || (pages.length > 0 ? pages[0].id : null);

    if (!targetPageId) {
      return { platform: "facebook", success: false, error: "no_pages_linked" };
    }

    const selectedPage = pages.find(p => p.id === targetPageId);

    if (!selectedPage || (!selectedPage.access_token && !selectedPage.encrypted_access_token)) {
      return { platform: "facebook", success: false, error: "page_token_not_found" };
    }

    let pageToken = selectedPage.access_token;
    // Handle encrypted page token
    if (!pageToken && selectedPage.encrypted_access_token) {
      try {
        const { decryptToken } = require("./secretVault");
        pageToken = decryptToken(selectedPage.encrypted_access_token);
      } catch (e) {
        return { platform: "facebook", success: false, error: "page_token_decryption_failed" };
      }
    }

    // Build content context
    let message = payload?.message || payload?.text || "";
    let title = payload?.title || "";
    const link = payload?.link || payload?.url;
    const imageUrl = payload?.imageUrl || payload?.mediaUrl;

    // Determine video URL if type is video
    const videoUrl = payload?.videoUrl || (payload?.type === "video" ? payload?.url : null);

    if (contentId) {
      try {
        const contentSnap = await db.collection("content").doc(contentId).get();
        if (contentSnap.exists) {
          const content = contentSnap.data();
          // Fallback message if not provided in payload
          if (!message) {
            message = content.title || content.description || "New content";
          }
          if (!title) title = content.title;

          // SPONSORSHIP DISCLOSURE
          const mon = content.monetization_settings || {};
          if (mon.is_sponsored) {
            const disclosure = mon.brand_name
              ? ` #ad #${mon.brand_name.replace(/\s+/g, "")}`
              : " #ad #sponsored";
            const promoLink = mon.product_link ? `\n\nCheck it out here: ${mon.product_link}` : "";

            if (!message.includes("#ad") && !message.includes("#sponsored")) {
              message += disclosure;
            }
            if (promoLink && !message.includes(mon.product_link)) {
              message += promoLink;
            }
          }
        }
      } catch (_) {}
    }

    const result = await postToFacebookPage({
      pageId: targetPageId,
      pageAccessToken: pageToken,
      message,
      link,
      imageUrl,
      videoUrl,
      title,
    });

    // Store result in Firestore
    if (contentId) {
      try {
        await db
          .collection("content")
          .doc(contentId)
          .set(
            {
              facebook: {
                postId: result.id,
                pageId: targetPageId,
                pageName: selectedPage.name,
                postedAt: new Date().toISOString(),
              },
            },
            { merge: true }
          );
      } catch (_) {}
    }

    return {
      platform: "facebook",
      success: true,
      postId: result.id,
      pageId: targetPageId,
      pageName: selectedPage.name,
      reason,
    };
  } catch (e) {
    return {
      platform: "facebook",
      success: false,
      error: e.message || "post_failed",
    };
  }
}

/**
 * Get Facebook post value/metrics
 */
async function getPostStats({ uid, postId, pageId }) {
  if (!uid || !postId) throw new Error("uid and postId required");
  if (!fetchFn) throw new Error("Fetch not available");

  const connection = await getUserFacebookConnection(uid);
  if (!connection || !connection.tokens) throw new Error("No Facebook connection found");

  let accessToken = null;
  // If pageId provided, try to find specific page token
  if (pageId && connection.meta && connection.meta.pages) {
    const p = connection.meta.pages.find(page => page.id === pageId);
    if (p) accessToken = p.access_token;
  }
  // Fallback to first page if available
  if (
    !accessToken &&
    connection.meta &&
    connection.meta.pages &&
    connection.meta.pages.length > 0
  ) {
    accessToken = connection.meta.pages[0].access_token;
  }

  if (!accessToken) accessToken = connection.tokens.access_token;

  // 1. Try fetching Insights (Impressions, Engaged Users) - requires Page Token usually
  try {
    const metrics = "post_impressions,post_engaged_users";
    const url = `https://graph.facebook.com/v18.0/${postId}/insights?metric=${metrics}&access_token=${accessToken}`;

    // safeFetch handles the request
    const response = await safeFetch(url, fetchFn, {
      fetchOptions: { method: "GET" },
      requireHttps: true,
      allowHosts: ["graph.facebook.com"],
    });

    if (response.ok) {
      const data = await response.json();
      const values = {};
      (data.data || []).forEach(item => {
        values[item.name] = item.values && item.values[0] ? item.values[0].value : 0;
      });

      // Also fetch basic interactions (likes/comments) separately as they aren't in "insights" metric list easily
      const basicUrl = `https://graph.facebook.com/v18.0/${postId}?fields=shares,comments.summary(true),likes.summary(true)&access_token=${accessToken}`;
      const basicRes = await safeFetch(basicUrl, fetchFn, {
        fetchOptions: { method: "GET" },
        requireHttps: true,
        allowHosts: ["graph.facebook.com"],
      });
      let likes = 0,
        comments = 0,
        shares = 0;

      if (basicRes.ok) {
        const bData = await basicRes.json();
        likes = bData.likes?.summary?.total_count || 0;
        comments = bData.comments?.summary?.total_count || 0;
        shares = bData.shares?.count || 0;
      }

      return {
        postId,
        impressions: values.post_impressions || 0,
        engagedUsers: values.post_engaged_users || 0,
        likes,
        comments,
        shares,
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("[Facebook] Insights fetch failed, falling back to basic:", e.message);
  }

  // 2. Fallback: Basic Graph Object fields (Likes, Comments)
  const basicUrl = `https://graph.facebook.com/v18.0/${postId}?fields=shares,comments.summary(true),likes.summary(true)&access_token=${accessToken}`;
  const response = await safeFetch(basicUrl, fetchFn, {
    fetchOptions: { method: "GET" },
    requireHttps: true,
    allowHosts: ["graph.facebook.com"],
  });

  if (!response.ok) throw new Error("Failed to fetch Facebook post stats");

  const data = await response.json();
  return {
    postId,
    likes: data.likes?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: data.shares?.count || 0,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  postToFacebook,
  generateAuthUrl,
  exchangeCodeForToken,
  getLongLivedToken,
  getUserPages,
  getUserProfile,
  getUserFacebookConnection,
  getPostStats,
};

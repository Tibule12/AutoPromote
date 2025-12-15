// facebookService.js - Facebook Graph API OAuth and page posting
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");
const crypto = require("crypto");

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
 * Post to Facebook page
 */
async function postToFacebookPage({ pageId, pageAccessToken, message, link, imageUrl }) {
  if (!fetchFn) throw new Error("Fetch not available");

  const params = new URLSearchParams({ message, access_token: pageAccessToken });

  if (link) {
    params.append("link", link);
  }

  let endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;

  // If image URL provided, post as photo
  if (imageUrl) {
    endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
    params.set("url", imageUrl);
    params.set("caption", message);
    params.delete("message");
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
    const error = await response.json();
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

    const tokens = connection.tokens;
    const meta = connection.meta || {};

    // Get selected page from payload or use default from connection
    const pageId =
      payload?.pageId || payload?.platformOptions?.facebook?.pageId || meta.selectedPageId;

    if (!pageId) {
      return { platform: "facebook", success: false, error: "page_id_required" };
    }

    // Find page access token
    const pages = meta.pages || [];
    const selectedPage = pages.find(p => p.id === pageId);

    if (!selectedPage || !selectedPage.access_token) {
      return { platform: "facebook", success: false, error: "page_token_not_found" };
    }

    // Build content context
    let message = payload?.message || payload?.text || "";
    const link = payload?.link || payload?.url;
    const imageUrl = payload?.imageUrl || payload?.mediaUrl;

    if (contentId && !message) {
      try {
        const contentSnap = await db.collection("content").doc(contentId).get();
        if (contentSnap.exists) {
          const content = contentSnap.data();
          message = content.title || content.description || "New content";
        }
      } catch (_) {}
    }

    const result = await postToFacebookPage({
      pageId,
      pageAccessToken: selectedPage.access_token,
      message,
      link,
      imageUrl,
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
                pageId,
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
      pageId,
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

module.exports = {
  postToFacebook,
  generateAuthUrl,
  exchangeCodeForToken,
  getLongLivedToken,
  getUserPages,
  getUserProfile,
  getUserFacebookConnection,
};

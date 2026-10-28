// facebookService.js - Facebook Graph API OAuth and page posting
const { db } = require("../firebaseAdmin");
const { numericMetric } = require("./platformMetricValues");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

const TOKEN_URL = "https://graph.facebook.com/v19.0/oauth/access_token";
const AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";

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

// mark in the database that this user must re-authenticate with Facebook
async function flagFacebookReauth(uid) {
  try {
    await db
      .collection("users")
      .doc(uid)
      .collection("connections")
      .doc("facebook")
      .set({ needsReauth: true }, { merge: true });
  } catch (e) {
    console.warn("Failed to flag Facebook token stale for", uid, e);
  }
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
    "https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category,tasks",
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
    "https://graph.facebook.com/v19.0/me?fields=id,name,email",
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
  let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;

  if (videoUrl) {
    // Post Native Video
    endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
    params.append("file_url", videoUrl);
    if (title) params.append("title", title);
    if (message) params.append("description", message); // videos use description
  } else if (imageUrl) {
    // Post Native Photo
    endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
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
    const errorText = error.error?.message || "Post failed";
    console.error("[Facebook] API Error response:", JSON.stringify(error, null, 2));

    // if missing permission (#10) or related, flag token stale so user reconnects
    if (
      errorText.includes("(#10)") ||
      errorText.includes("(#100)") ||
      errorText.includes("permission")
    ) {
      console.warn(
        `[Facebook] Soft fail while publishing page post: ${errorText.substring(0, 100)}...`
      );
      // throw so calling code can treat as partial/soft error
      const ex = new Error(errorText);
      ex.soft = true;
      throw ex;
    }

    throw new Error(errorText);
  }

  const result = await response.json().catch(() => ({}));
  if (!result || !result.id) {
    throw new Error("Facebook accepted the request but did not return a post id");
  }
  return result;
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

    // --- AUTO-FIX: IF WE ARE USING A USER TOKEN, EXCHANGE IT FOR A PAGE TOKEN ---
    try {
      console.log(`[Facebook] Attempting to ensure Page Token for Page ${targetPageId}...`);
      const exchangeUrl = `https://graph.facebook.com/v19.0/${targetPageId}?fields=access_token&access_token=${pageToken}`;
      const exRes = await safeFetch(exchangeUrl, fetchFn, {
        fetchOptions: { method: "GET" },
        requireHttps: true,
        allowHosts: ["graph.facebook.com"],
      });
      if (exRes.ok) {
        const exData = await exRes.json();
        if (exData.access_token) {
          console.log("[Facebook] Successfully exchanged for proper Page Token.");
          pageToken = exData.access_token;
        }
      }
    } catch (exErr) {
      console.warn("[Facebook] Token exchange check failed:", exErr.message);
    }
    // -----------------------------------------------------------------------------

    // Build content context
    let message = payload?.message || payload?.text || "";
    let title = payload?.title || "";
    let link = payload?.link || payload?.url;
    let imageUrl = payload?.imageUrl || payload?.mediaUrl;
    let videoUrl = payload?.videoUrl;
    let contentType = payload?.type; // Capture type from payload if present

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

          // Fetch type from content if not in payload
          if (!contentType && content.type) contentType = content.type;

          // Hydrate URLs from content if missing
          if (contentType === "video" && !videoUrl) {
            videoUrl = content.url || content.mediaUrl;
          }
          if ((contentType === "image" || contentType === "photo") && !imageUrl) {
            imageUrl = content.url || content.mediaUrl;
          }
          if (!link) {
            link = content.url || content.smartLink || content.landingPageUrl;
          }

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

    let result;
    try {
      result = await postToFacebookPage({
        pageId: targetPageId,
        pageAccessToken: pageToken,
        message,
        link,
        imageUrl,
        videoUrl,
        title,
      });
    } catch (err) {
      // treat errors flagged by postToFacebookPage as soft (permission) failures
      if (err.soft) {
        console.warn("Facebook permission issue detected for uid", uid, "token will be refreshed");
        await flagFacebookReauth(uid);
      }
      // rethrow so outer try/catch handles generic failure response
      throw err;
    }

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
    // If we flagged this as a permission issue, forward a recognisable code
    if (e.soft) {
      return {
        platform: "facebook",
        success: false,
        error: "permission_expired",
        message: "User must re-authorize Facebook permissions",
      };
    }
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
  if (!/^[0-9]+(?:_[0-9]+)?$/.test(String(postId))) throw new Error("Invalid Facebook object ID");
  if (!fetchFn) throw new Error("Fetch not available");
  const connection = await getUserFacebookConnection(uid);
  if (!connection) throw new Error("No Facebook connection found");
  const pages = connection.pages || connection.meta?.pages || [];
  const page = pageId ? pages.find(p => p.id === pageId) : pages.length === 1 ? pages[0] : null;
  if (pageId && !page) throw new Error("Facebook Page is not in the connected account");
  const accessToken = tokensFromDoc(page)?.access_token || connection.tokens?.access_token;
  if (!accessToken) throw new Error("No Facebook access token");
  const version = process.env.FACEBOOK_METRICS_GRAPH_VERSION || "v24.0";
  if (!/^v[0-9]+\.[0-9]+$/.test(version)) throw new Error("Invalid Facebook metrics API version");
  const { collectFacebookMetrics } = require("./facebookMetrics");
  return collectFacebookMetrics({ postId, request: async suffix => {
    const response = await safeFetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(postId)}${suffix}`, fetchFn,
      { fetchOptions: { method: "GET", headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(12000) },
        requireHttps: true, allowHosts: ["graph.facebook.com"] }
    );
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
  } });
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

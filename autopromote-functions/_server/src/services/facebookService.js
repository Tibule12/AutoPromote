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
        `[Facebook] Soft fail for post ${postId || "?"}: ${errorText.substring(0, 100)}...`
      );
      // attempt to flag the owning user if we have uid in scope
      if (uid) {
        flagFacebookReauth(uid);
      }
      // throw so calling code can treat as partial/soft error
      const ex = new Error(errorText);
      ex.soft = true;
      throw ex;
    }

    throw new Error(errorText);
  }
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
  if (!fetchFn) throw new Error("Fetch not available");

  const connection = await getUserFacebookConnection(uid);
  if (!connection || !connection.tokens) throw new Error("No Facebook connection found");

  let accessToken = null;
  // If pageId provided, try to find specific page token
  // Fix: Check both connection.pages (new schema) and connection.meta.pages (legacy)
  const pages = connection.pages || (connection.meta && connection.meta.pages);

  if (pageId && pages) {
    const p = pages.find(page => page.id === pageId);
    if (p) accessToken = p.access_token;
  }
  // Fallback to first page if available
  if (!accessToken && pages && pages.length > 0) {
    accessToken = pages[0].access_token;
  }

  if (!accessToken) accessToken = connection.tokens.access_token;

  // 1. Try fetching Insights
  try {
    // Determine metrics based on content type if possible, or try a broad set.
    // Error (#100) indicates some metrics aren't valid for this object type (e.g. Video vs Post).
    // Let's try separate calls or fallbacks.

    // Attempt A: Standard Post Metrics
    const metricsParams = "post_impressions,post_engaged_users";
    const url = `https://graph.facebook.com/v19.0/${postId}/insights?metric=${metricsParams}&access_token=${accessToken}`;
    let response = await safeFetch(url, fetchFn, {
      fetchOptions: { method: "GET" },
      requireHttps: true,
      allowHosts: ["graph.facebook.com"],
    });

    // Attempt B: If A fails with #100 or returns empty data (sometimes videos don't show post_impressions), try video metrics
    let shouldRetryVideo = false;
    if (!response.ok) {
      const txt = await response.text();
      if (
        txt.includes("(#100)") &&
        (txt.includes("valid insights metric") || txt.includes("nonexisting field"))
      ) {
        shouldRetryVideo = true;
      } else {
        throw new Error(txt);
      }
    } else {
      // Even if OK, check if data is empty. If so, might be video needing video metrics.
      try {
        const data = await response.clone().json(); // clone so we can re-read if needed, or just parse once
        if (!data.data || data.data.length === 0) {
          shouldRetryVideo = true;
        }
      } catch (_) {}
    }

    if (shouldRetryVideo) {
      // Retry with Video metrics (lifetime period usually implied or needed)
      // Note: For some video metrics, 'period=lifetime' or 'period=day' matters.
      const vidMetrics = "post_video_views,post_video_view_time_organic";
      // try without a date range first, using period=lifetime if supported, OR just let FB defaults apply
      const vidUrl = `https://graph.facebook.com/v19.0/${postId}/insights?metric=${vidMetrics}&period=lifetime&access_token=${accessToken}`;

      response = await safeFetch(vidUrl, fetchFn, {
        fetchOptions: { method: "GET" },
        requireHttps: true,
        allowHosts: ["graph.facebook.com"],
      });

      // Debug
      // const t = await response.clone().text(); console.log("Video Retry Result:", t);
    }

    if (response.ok) {
      const data = await response.json();
      const values = {};
      (data.data || []).forEach(item => {
        values[item.name] = item.values && item.values[0] ? item.values[0].value : 0;
      });

      if (Object.keys(values).length === 0) {
        console.warn(
          `[Facebook] Insights GET returned empty data for ${postId}. Metadata:`,
          JSON.stringify(data)
        );
      }

      // Also fetch basic interactions (likes/comments) separately as they aren't in "insights" metric list easily
      // Try fetching shares separately or omit if problematic
      let likes = 0,
        comments = 0;

      try {
        // If video, try 'post_video_views' from insights result if 'post_impressions' is missing/zero
        let impressions = parseInt(values.post_impressions || 0, 10);
        if (impressions === 0 && values.post_video_views) {
          impressions = parseInt(values.post_video_views || 0, 10);
        }
        if (impressions === 0 && values.post_video_views_organic) {
          // New: fallback to organic
          impressions = parseInt(values.post_video_views_organic || 0, 10);
        }

        // Use attachments to get video ID. Split basic stats to separate call if needed later.
        // Prioritizing attachments to fix video view tracking first.
        const basicUrl = `https://graph.facebook.com/v19.0/${postId}?fields=attachments&access_token=${accessToken}`;
        const basicRes = await safeFetch(basicUrl, fetchFn, {
          fetchOptions: { method: "GET" },
          requireHttps: true,
          allowHosts: ["graph.facebook.com"],
        });

        let objectId = null;

        if (!basicRes.ok) {
          const err = await basicRes.text();
          console.warn(`[Facebook] Attachments fetch failed for ${postId}: ${err}`);
        } else {
          const bData = await basicRes.json();

          // Extract object ID from attachments if present
          if (bData.attachments && bData.attachments.data && bData.attachments.data.length > 0) {
            const target = bData.attachments.data[0].target;
            if (target && target.id) {
              objectId = target.id;
            }
          }
        }

        // If we have an object ID (like a video ID) and impressions are 0, try fetching video metrics on that ID
        if (objectId && objectId !== postId) {
          try {
            console.log(
              `[Facebook] Found video object ID ${objectId} via attachments for post ${postId}. Fetching video insights...`
            );
            const vidMetric = "total_video_views,total_video_views_unique";
            const vUrl = `https://graph.facebook.com/v19.0/${objectId}/video_insights?metric=${vidMetric}&access_token=${accessToken}`;
            const vRes = await safeFetch(vUrl, fetchFn, {
              fetchOptions: { method: "GET" },
              requireHttps: true,
              allowHosts: ["graph.facebook.com"],
            });
            if (vRes.ok) {
              const vData = await vRes.json();
              const vVals = {};
              (vData.data || []).forEach(item => {
                vVals[item.name] = item.values && item.values[0] ? item.values[0].value : 0;
              });
              console.log(`[Facebook] Video Metrics for ${objectId}:`, JSON.stringify(vVals));
              if (vVals.total_video_views) {
                impressions = vVals.total_video_views;
                // Update values object so we return it correctly below if needed
                values.post_video_views = impressions;
              }
            } else {
              const vErr = await vRes.text();
              console.warn(`[Facebook] Video fetch failed for ${objectId}:`, vErr);
            }
          } catch (e) {
            console.warn("[Facebook] Video object fetch exception", e.message);
          }
        } else {
          // console.warn(`[Facebook] No distinct video object ID found for ${postId}`);
        }

        return {
          postId,
          impressions,
          engagedUsers: parseInt(values.post_engaged_users || 0, 10),
          likes,
          comments,
          shares: 0,
          fetchedAt: new Date().toISOString(),
        };
      } catch (_) {}
    } else {
      const errText = await response.text();
      console.warn(`[Facebook] Insights GET failed for ${postId}:`, errText);
    }
  } catch (e) {
    console.warn("[Facebook] Insights fetch error:", e.message);
  }

  // 2. Fallback: Basic Graph Object fields (Likes, Comments) - removed shares to avoid #100
  const basicUrl = `https://graph.facebook.com/v19.0/${postId}?fields=comments.summary(true),likes.summary(true),reactions.summary(true),shares,attachments&access_token=${accessToken}`;
  let response;
  try {
    response = await safeFetch(basicUrl, fetchFn, {
      fetchOptions: { method: "GET" },
      requireHttps: true,
      allowHosts: ["graph.facebook.com"],
    });
  } catch (netErr) {
    throw new Error(`Network failed: ${netErr.message}`);
  }

  if (response.ok) {
    const data = await response.json();

    // Infer object_id from attachments if missing
    if (!data.object_id && data.attachments?.data?.[0]?.target?.id) {
      data.object_id = data.attachments.data[0].target.id;
      console.warn(`[Facebook] Inferred object_id from attachment: ${data.object_id}`);
    }

    // Prefer reaction count
    const likes = data.reactions?.summary?.total_count || data.likes?.summary?.total_count || 0;
    const comments = data.comments?.summary?.total_count || 0;

    // Attempt to fetch video views if object_id present
    let views = 0;
    if (data.object_id && data.object_id !== postId) {
      try {
        const vUrl = `https://graph.facebook.com/v19.0/${data.object_id}/video_insights?metric=total_video_views&access_token=${accessToken}`;
        const vRes = await safeFetch(vUrl, fetchFn, {
          fetchOptions: { method: "GET" },
          requireHttps: true,
          allowHosts: ["graph.facebook.com"],
        });
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.data && vData.data[0] && vData.data[0].values && vData.data[0].values[0]) {
            views = vData.data[0].values[0].value;
          }
        }
      } catch (_) {}
    }

    return {
      postId,
      likes,
      comments,
      shares: 0,
      impressions: views, // Populate impressions with views in fallback
      fetchedAt: new Date().toISOString(),
    };
  }

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch (e) {
      errorText = "[Could not read response body]";
    }

    // Handle known non-critical errors gracefully
    // #100: Tried accessing nonexisting field (shares) on node type (Video) - happens when we query generic post fields on a video object
    // #10: Permission missing (pages_read_engagement)
    if (
      errorText.includes("(#100)") &&
      errorText.includes("nonexisting field") &&
      errorText.includes("Video")
    ) {
      console.warn(
        `[Facebook] Post ${postId} is a video; skipping 'shares' field fetch. (Metrics may be partial)`
      );
      // Return partial result (zeros) instead of throwing
      return {
        postId,
        likes: 0,
        comments: 0,
        shares: 0,
        fetchedAt: new Date().toISOString(),
        partial: true,
      };
    }

    // New: If permissions are missing (#10) or any other non-critical graph error (#100), return 0s instead of throwing
    // This allows the poller to continue updating other metrics (or successfully recording the fetch attempt)
    if (errorText.includes("(#10)") || errorText.includes("(#100)")) {
      console.warn(`[Facebook] Soft fail for post ${postId}: ${errorText.substring(0, 100)}...`);
      return {
        postId,
        likes: 0,
        comments: 0,
        shares: 0,
        fetchedAt: new Date().toISOString(),
        partial: true,
      };
    }

    console.error(
      `[Facebook] Stats fetch failed for post ${postId}. Status: ${response.status}. Body: ${errorText}`
    );
    throw new Error(`Failed to fetch Facebook post stats: ${errorText}`);
  }

  const data = await response.json();
  return {
    postId,
    likes: data.likes?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: 0, // Disabled
    fetchedAt: new Date().toISOString(),
  };
}

// Export public helpers
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

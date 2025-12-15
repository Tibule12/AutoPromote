// snapchatService.js
// Minimal Snapchat integration helpers: create creative (ad) or simulate
const { db } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (_) {
    fetchFn = null;
  }
}

const { tokensFromDoc } = require("./connectionTokenUtils");

async function postToSnapchat({ contentId, payload, reason, uid }) {
  const bypass =
    process.env.CI_ROUTE_IMPORTS === "1" ||
    process.env.FIREBASE_ADMIN_BYPASS === "1" ||
    process.env.NODE_ENV === "test" ||
    typeof process.env.JEST_WORKER_ID !== "undefined";
  if (bypass) {
    return {
      platform: "snapchat",
      simulated: true,
      success: true,
      creativeId: `sim_${Date.now()}`,
    };
  }
  // Snapchat posting creates ad creatives via Marketing API
  let conn = null;
  try {
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("connections")
      .doc("snapchat")
      .get();
    if (snap.exists) conn = snap.data() || {};
  } catch (_) {}

  // Normalize tokens
  if (conn) {
    const tokens = tokensFromDoc(conn);
    if (tokens) conn.tokens = tokens;
  }

  const accessToken = conn?.accessToken || conn?.tokens?.access_token;
  if (!accessToken) {
    return { platform: "snapchat", success: false, error: "missing_access_token" };
  }

  // Check token expiration
  if (conn.expiresAt && conn.expiresAt < Date.now()) {
    return { platform: "snapchat", success: false, error: "token_expired" };
  }

  // Get ad account ID from connection metadata or platform options
  const adAccountId =
    conn.profile?.adAccountId ||
    conn.meta?.adAccountId ||
    payload.platformOptions?.snapchat?.adAccountId ||
    process.env.SNAPCHAT_AD_ACCOUNT_ID;

  if (!adAccountId) {
    return { platform: "snapchat", success: false, error: "missing_ad_account_id" };
  }

  // First, upload media to Snapchat if needed
  let mediaId = null;
  if (payload.url || payload.mediaUrl) {
    try {
      const mediaUrl = payload.url || payload.mediaUrl;
      const mediaType = payload.type === "video" ? "VIDEO" : "IMAGE";

      // Upload media to Snapchat
      const mediaUploadRes = await safeFetch(
        `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/media`,
        fetchFn,
        {
          fetchOptions: {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: payload.title || "AutoPromote Media",
              type: mediaType,
              media_url: mediaUrl,
            }),
          },
          allowHosts: ["adsapi.snapchat.com"],
          requireHttps: true,
        }
      );

      if (mediaUploadRes.ok) {
        const mediaData = await mediaUploadRes.json();
        mediaId = mediaData.media?.id || mediaData.id;
      }
    } catch (e) {
      console.warn("[Snapchat] Media upload failed:", e.message);
    }
  }

  // Build creative payload
  const creativePayload = {
    name: payload.title || `AutoPromote ${contentId}`,
    type: "SNAP_AD",
    headline: payload.title || payload.message,
    brand_name: payload.brandName || "AutoPromote",
    shareable: true,
    ad_product: "SNAP_AD",
  };

  if (mediaId) {
    creativePayload.top_snap_media_id = mediaId;
  }

  // Add call-to-action if provided
  if (payload.callToAction || payload.platformOptions?.snapchat?.callToAction) {
    creativePayload.call_to_action =
      payload.callToAction || payload.platformOptions.snapchat.callToAction;
  }

  // Add web URL if provided
  if (payload.webUrl || payload.platformOptions?.snapchat?.webUrl) {
    creativePayload.web_view_url = payload.webUrl || payload.platformOptions.snapchat.webUrl;
  }

  try {
    const res = await safeFetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/creatives`,
      fetchFn,
      {
        fetchOptions: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(creativePayload),
        },
        allowHosts: ["adsapi.snapchat.com"],
        requireHttps: true,
      }
    );

    const json = await (res.ok
      ? res.json()
      : res.text().then(t => {
          try {
            return JSON.parse(t);
          } catch (_) {
            return { error: t };
          }
        }));

    if (!res.ok) {
      const errorMsg = json.request_status?.message || json.error || JSON.stringify(json);
      return { platform: "snapchat", success: false, error: errorMsg, status: res.status };
    }

    const creativeId = json.creative?.id || json.id;

    // Store creative ID in content document
    if (contentId && creativeId && uid) {
      try {
        await db
          .collection("content")
          .doc(contentId)
          .set(
            {
              platforms: {
                snapchat: {
                  creativeId,
                  mediaId,
                  createdAt: new Date().toISOString(),
                  status: "created",
                },
              },
            },
            { merge: true }
          );
      } catch (_) {}
    }

    return {
      platform: "snapchat",
      success: true,
      creativeId,
      mediaId,
      data: json,
    };
  } catch (e) {
    return {
      platform: "snapchat",
      success: false,
      error: e.message || "snapchat_api_failed",
    };
  }
}

module.exports = { postToSnapchat };

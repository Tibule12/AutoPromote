// Snapchat OAuth and API integration (server-side only)
// Note: Snapchat does not have a sandbox environment - only production
const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();
const authMiddleware = require("./authMiddleware");
const { admin: _admin, db } = require("./firebaseAdmin");
void _admin;
const { safeFetch } = require("./utils/ssrfGuard");
const { rateLimiter } = require("./middlewares/globalRateLimiter");

// Normalize/canonicalize redirect URIs to our custom domain
function canonicalizeRedirectUri(uri) {
  const { CANONICAL_HOST } = require("./utils/redirectUri");
  try {
    const u = new URL((uri || "").toString().trim());
    const legacyHosts = new Set([
      "autopromote.onrender.com",
      "autopromote-1.onrender.com",
      "autopromote-1.onrender.com:443",
    ]);
    if (legacyHosts.has(u.host) || u.host !== CANONICAL_HOST) {
      u.protocol = "https:";
      u.host = CANONICAL_HOST;
    }
    if (!u.pathname || !u.pathname.startsWith("/api/snapchat/auth/callback")) {
      u.pathname = "/api/snapchat/auth/callback";
    }
    return u.toString();
  } catch (_) {
    return `https://${process.env.CANONICAL_OAUTH_HOST || process.env.CANONICAL_HOST || "www.autopromote.org"}/api/snapchat/auth/callback`;
  }
}

// Snapchat only supports production environment
const _rawRedirectEnv = (process.env.SNAPCHAT_REDIRECT_URI || "").toString().trim();

// If explicit env var is set, use it blindly to respect user overrides.
// Otherwise, fall back to canonical auto-construction.
const _effectiveRedirect = _rawRedirectEnv
  ? _rawRedirectEnv
  : canonicalizeRedirectUri(`https://www.autopromote.org/api/snapchat/auth/callback`);

if (_rawRedirectEnv && _effectiveRedirect !== _rawRedirectEnv) {
  // Logic path not hit anymore if we use _rawRedirectEnv directly, but keeping structure clean
} else if (!_rawRedirectEnv) {
  // Only warn if we are auto-generating
  try {
    const _u = new URL(_effectiveRedirect);
    if (_u.host !== "api.autopromote.org") {
      // Debug log if needed
    }
  } catch (_) {}
}

const oauth = require("./services/snapchatOAuth");
const { normalizeScopes } = oauth;

// Support explicit env vars to avoid mixing Public vs Confidential IDs.
// Login Kit public clients use the same ID and PKCE for both OAuth steps.
// Marketing uses its own confidential client ID/secret for both steps.
// For backwards compatibility, `SNAPCHAT_CLIENT_ID` will be used as a fallback for both roles.
const config = {
  publicClientId:
    (process.env.SNAPCHAT_PUBLIC_CLIENT_ID || process.env.SNAPCHAT_CLIENT_ID || "")
      .toString()
      .trim() || null,
  confidentialClientId:
    (process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID || process.env.SNAPCHAT_CLIENT_ID || "")
      .toString()
      .trim() || null,
  secret: (process.env.SNAPCHAT_CLIENT_SECRET || "").toString().trim() || null,
  // Prefer custom domain; retain legacy env but auto-upgrade to canonical host
  redirect: _effectiveRedirect,
};

function activeConfig() {
  return config;
}

// For dashboard redirect
const dashboardUrl = new URL(process.env.DASHBOARD_URL || "https://autopromote.org");
if (dashboardUrl.hostname === "www.autopromote.org") dashboardUrl.hostname = "autopromote.org";
const DASHBOARD_URL = dashboardUrl.href;

// Lightweight health for diagnostics
router.get("/health", (req, res) => {
  try {
    const cfg = activeConfig();
    const mask = s => (s ? `${String(s).slice(0, 8)}…${String(s).slice(-4)}` : null);
    return res.json({
      ok: !!oauth.createRequest(
        cfg,
        process.env.SNAPCHAT_DEFAULT_SCOPE || "snapchat-marketing-api"
      ),
      pkceMethod: "S256",
      hasPublicClientId: !!cfg.publicClientId,
      hasConfidentialClientId: !!cfg.confidentialClientId,
      hasClientSecret: !!cfg.secret,
      redirect: cfg.redirect,
      publicClientIdMasked: mask(cfg.publicClientId),
      confidentialClientIdMasked: mask(cfg.confidentialClientId),
    });
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.code || "snapchat_oauth_unavailable" });
  }
});

// OAuth starts must be owned by a verified AutoPromote identity. Public preflight
// URLs are diagnostic only; their unpersisted state cannot complete a connection.
const oauthPrepareLimiter = rateLimiter({
  capacity: parseInt(process.env.SNAPCHAT_OAUTH_PREPARE_CAP || "60", 10),
  refillPerSec: 5,
  windowHint: "snapchat_oauth_prepare",
});
async function prepareSnapchat(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    const cfg = activeConfig();
    const requestedScope = req.method === "GET" ? req.query.test_scope : req.body?.test_scope;
    const result = oauth.createRequest(
      cfg,
      requestedScope || process.env.SNAPCHAT_DEFAULT_SCOPE || "snapchat-marketing-api"
    );
    const uid = req.userId;
    if (!uid || uid === "anonymous")
      return res.status(401).json({ error: "Authentication required" });
    const popup = req.body?.popup === true;
    await db
      .collection("oauth_states")
      .doc(result.state)
      .create({ ...result.request, uid, popup });
    return res.json({
      authUrl: result.authUrl,
      state: result.state,
      popup,
      scope: result.request.scope,
      scopeList: result.request.scopeList,
      scopeSource: requestedScope
        ? "request"
        : process.env.SNAPCHAT_DEFAULT_SCOPE
          ? "env"
          : "default",
      oauthProduct: result.request.product,
      pkceMethod: "S256",
      probeStatus: null,
    });
  } catch (error) {
    console.warn("[snapchat] prepare failed", error.code || "oauth_prepare_failed");
    return res
      .status(503)
      .json({
        error: error.code || "snapchat_oauth_unavailable",
        message: "Snapchat connection is not configured correctly. Please contact support.",
      });
  }
}
router.get("/auth", authMiddleware, oauthPrepareLimiter, prepareSnapchat);
router.post("/oauth/prepare", authMiddleware, oauthPrepareLimiter, prepareSnapchat);
router.get(
  "/oauth/preflight",
  rateLimiter({ capacity: 60, refillPerSec: 10, windowHint: "snapchat_preflight" }),
  async (req, res) => {
    try {
      const result = oauth.createRequest(
        activeConfig(),
        req.query.test_scope || process.env.SNAPCHAT_DEFAULT_SCOPE || "snapchat-marketing-api"
      );
      return res.json({
        ok: true,
        authUrl: result.authUrl,
        scope: result.request.scope,
        scopeList: result.request.scopeList,
        scopeSource: req.query.test_scope
          ? "request"
          : process.env.SNAPCHAT_DEFAULT_SCOPE
            ? "env"
            : "default",
        oauthProduct: result.request.product,
        pkceMethod: "S256",
        requiresAuthenticatedPrepare: true,
        probeStatus: null,
      });
    } catch (error) {
      return res.status(503).json({ ok: false, error: error.code || "snapchat_oauth_unavailable" });
    }
  }
);

// 2. Handle Snapchat OAuth callback and exchange code for access token
// Support both GET (redirect from provider) and POST (programmatic exchange)
// Public callback from Snapchat - rate limit to mitigate abuse/forgery
const callbackLimiter = rateLimiter({
  capacity: parseInt(process.env.SNAPCHAT_CALLBACK_CAP || "300", 10),
  refillPerSec: 10,
  windowHint: "snapchat_callback",
});
router.all("/auth/callback", callbackLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const payload = req.method === "GET" ? req.query : req.body || {};
  const failCallback = (code, message, status = 400) => {
    if (req.method === "GET") {
      const target = new URL(DASHBOARD_URL);
      target.searchParams.set("snapchat", "error");
      target.searchParams.set("oauth", "snapchat");
      target.searchParams.set("status", "error");
      target.searchParams.set("message", message);
      return res.redirect(target.href);
    }
    return res.status(status).json({ error: code, message });
  };
  if (!payload.state)
    return failCallback(
      "invalid_oauth_state",
      "This Snapchat connection request is invalid. Start Connect Snapchat again."
    );
  try {
    const saved = await oauth.consumeRequest(db, payload.state);
    if (payload.error)
      return failCallback(
        "snapchat_authorization_denied",
        "Snapchat did not authorize the connection. Start Connect Snapchat again."
      );
    const token = oauth.tokenRequest(activeConfig(), saved, payload.code);
    const tokenRes = await safeFetch(token.endpoint, fetch, {
      allowHosts: ["accounts.snapchat.com"],
      requireHttps: true,
      fetchOptions: {
        method: "POST",
        redirect: "error",
        timeout: 15000,
        size: 1048576,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: token.body,
      },
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || typeof tokenData.access_token !== "string" || !tokenData.access_token) {
      console.warn("[snapchat] token exchange rejected", tokenRes.status, saved.product);
      return failCallback(
        "snapchat_token_exchange_failed",
        "Snapchat could not complete the connection. Start a new connection attempt."
      );
    }
    const expiresIn = Number(tokenData.expires_in);
    if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0)
      throw Object.assign(new Error("Invalid token expiry"), {
        code: "SNAPCHAT_INVALID_TOKEN_RESPONSE",
      });
    const profile = oauth.profileRequest(saved, tokenData.access_token);
    const profileRes = await safeFetch(profile.url, fetch, {
      allowHosts: saved.product === "login_kit" ? ["kit.snapchat.com"] : ["adsapi.snapchat.com"],
      requireHttps: true,
      fetchOptions: { headers: profile.headers, redirect: "error", timeout: 15000, size: 1048576 },
    });
    const rawProfile = await profileRes.json();
    const profileData = saved.product === "login_kit" ? rawProfile.data?.me : rawProfile;
    if (!profileRes.ok || !profileData || rawProfile.errors?.length) {
      return failCallback(
        "snapchat_profile_failed",
        "Snapchat authorization completed, but account details could not be loaded. Please reconnect."
      );
    }
    const { encryptToken, hasEncryption } = require("./services/secretVault");
    if (require("./utils/authAuthority").isHostedRuntime() && !hasEncryption()) {
      throw Object.assign(new Error("Token storage unavailable"), {
        code: "TOKEN_ENCRYPTION_UNAVAILABLE",
      });
    }
    const plaintext = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_in: expiresIn,
    });
    const encrypted = encryptToken(plaintext);
    if (hasEncryption() && encrypted === plaintext) {
      throw Object.assign(new Error("Token encryption failed"), {
        code: "TOKEN_ENCRYPTION_FAILED",
      });
    }
    await db
      .collection("users")
      .doc(saved.uid)
      .collection("connections")
      .doc("snapchat")
      .set({
        tokens: encrypted,
        hasEncryption: hasEncryption(),
        expiresAt: Date.now() + expiresIn * 1000,
        profile: profileData,
        oauthProduct: saved.product,
        scope: saved.scope,
        capabilities: {
          identity: true,
          publishing:
            saved.product === "marketing" && saved.scopeList.includes("snapchat-marketing-api"),
        },
        connectedAt: new Date().toISOString(),
      });
    require("./utils/simpleCache").setCache(`platform_connections_status_${saved.uid}`, null, 0);
    if (req.method === "GET") {
      const target = new URL(DASHBOARD_URL);
      target.searchParams.set("snapchat", "connected");
      target.searchParams.set("oauth", "snapchat");
      target.searchParams.set("status", "success");
      if (saved.popup) {
        // JSON-encode script strings and use an origin (never a path) for postMessage.
        const destination = JSON.stringify(target.href).replace(/</g, "\\u003c");
        const origin = JSON.stringify(target.origin).replace(/</g, "\\u003c");
        const nonce = require("crypto").randomBytes(18).toString("base64");
        res.set(
          "Content-Security-Policy",
          `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`
        );
        res.set("Cache-Control", "no-store");
        res.type("html");
        return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Snapchat Connected</title></head><body><script nonce="${nonce}">
          if (window.opener) window.opener.postMessage('snapchat_oauth_complete', ${origin});
          window.close();
          window.location.replace(${destination});
          </script></body></html>`);
      }
      return res.redirect(target.href);
    }
    return res.json({
      success: true,
      message: "Snapchat connected successfully",
      profile: profileData,
      oauthProduct: saved.product,
    });
  } catch (error) {
    const invalidState = error.code === "SNAPCHAT_INVALID_STATE";
    console.warn("[snapchat] callback failed", error.code || "oauth_callback_failed");
    return failCallback(
      invalidState ? "invalid_oauth_state" : "snapchat_connection_failed",
      invalidState
        ? "This Snapchat connection request expired or was already used. Start Connect Snapchat again."
        : "Snapchat could not complete the connection. Start Connect Snapchat again."
    );
  }
});

// 3. Get Snapchat connection status
router.get(
  "/status",
  authMiddleware,
  rateLimiter({
    capacity: parseInt(process.env.SNAPCHAT_STATUS_CAP || "300", 10),
    refillPerSec: 20,
    windowHint: "snapchat_status",
  }),
  async (req, res) => {
    try {
      const snap = await db
        .collection("users")
        .doc(req.userId)
        .collection("connections")
        .doc("snapchat")
        .get();
      if (!snap.exists) return res.json({ connected: false });

      const data = snap.data();
      const isExpired = data.expiresAt && data.expiresAt < Date.now();

      res.json({
        connected: !isExpired,
        profile: data.profile,
        expiresAt: data.expiresAt,
        connectedAt: data.connectedAt,
        oauthProduct: data.oauthProduct || null,
        capabilities: data.capabilities || null,
        identityOnly: data.oauthProduct === "login_kit",
        message: isExpired ? "Token expired - please reconnect" : "Connected to Snapchat",
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get Snapchat status", details: err.message });
    }
  }
);

// 3b. Get Snapchat metadata (ad accounts, organizations)
router.get(
  "/metadata",
  authMiddleware,
  rateLimiter({
    capacity: parseInt(process.env.SNAPCHAT_STATUS_CAP || "300", 10),
    refillPerSec: 20,
    windowHint: "snapchat_metadata",
  }),
  async (req, res) => {
    try {
      const snap = await db
        .collection("users")
        .doc(req.userId)
        .collection("connections")
        .doc("snapchat")
        .get();
      if (!snap.exists) {
        return res.status(401).json({ error: "Snapchat not connected" });
      }

      const connection = snap.data();
      if (connection.oauthProduct === "login_kit") {
        return res.json({
          success: true,
          meta: { organizations: [], oauthProduct: "login_kit", publishingReady: false },
        });
      }
      const { tokensFromDoc } = require("./services/connectionTokenUtils");
      const tokens = tokensFromDoc(connection) || connection.tokens || null;
      const accessToken = tokens?.access_token;

      if (!accessToken) {
        return res.status(401).json({ error: "No access token found" });
      }

      if (connection.expiresAt && connection.expiresAt < Date.now()) {
        return res.status(401).json({ error: "Snapchat token expired - please reconnect" });
      }

      // Fetch organizations (which contain ad accounts)
      const orgsRes = await safeFetch("https://adsapi.snapchat.com/v1/me/organizations", fetch, {
        allowHosts: ["adsapi.snapchat.com"],
        requireHttps: true,
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      });

      if (!orgsRes.ok) {
        const errorData = await orgsRes.json();
        return res.status(orgsRes.status).json({
          error: "Failed to fetch Snapchat organizations",
          details: errorData.request_status?.message || errorData.error,
        });
      }

      const orgsData = await orgsRes.json();
      const organizations = orgsData.organizations || [];

      // Fetch ad accounts for each organization
      const adAccountsPromises = organizations.map(async org => {
        try {
          const adAccountsRes = await safeFetch(
            `https://adsapi.snapchat.com/v1/organizations/${org.organization.id}/adaccounts`,
            fetch,
            {
              allowHosts: ["adsapi.snapchat.com"],
              requireHttps: true,
              fetchOptions: {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
              },
            }
          );

          if (adAccountsRes.ok) {
            const adAccountsData = await adAccountsRes.json();
            return {
              organization: org.organization,
              adAccounts: adAccountsData.adaccounts || [],
            };
          }
          return { organization: org.organization, adAccounts: [] };
        } catch (e) {
          return { organization: org.organization, adAccounts: [] };
        }
      });

      const orgWithAdAccounts = await Promise.all(adAccountsPromises);

      res.json({
        success: true,
        meta: {
          organizations: orgWithAdAccounts,
        },
      });
    } catch (err) {
      console.error("[Snapchat] Metadata fetch error:", err);
      res.status(500).json({ error: "Failed to fetch Snapchat metadata", details: err.message });
    }
  }
);

// 4. Create Snapchat ad creative
const apiActionLimiter = rateLimiter({
  capacity: parseInt(process.env.SNAPCHAT_API_ACTION_CAP || "120", 10),
  refillPerSec: 10,
  windowHint: "snapchat_api",
});
router.post("/creative", authMiddleware, apiActionLimiter, async (req, res) => {
  try {
    const { title, description, media_url, type, ad_account_id, call_to_action, web_url } =
      req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Get Snapchat connection
    const snap = await db
      .collection("users")
      .doc(req.userId)
      .collection("connections")
      .doc("snapchat")
      .get();
    if (!snap.exists) {
      return res.status(401).json({ error: "Snapchat not connected" });
    }

    const connection = snap.data();
    if (connection.oauthProduct === "login_kit") {
      return res.status(403).json({ error: "snapchat_publishing_permission_required" });
    }
    const { tokensFromDoc } = require("./services/connectionTokenUtils");
    const tokens = tokensFromDoc(connection) || connection.tokens || null;
    const accessToken = tokens?.access_token;

    if (!accessToken) {
      return res.status(401).json({ error: "No access token found" });
    }

    if (connection.expiresAt && connection.expiresAt < Date.now()) {
      return res.status(401).json({ error: "Snapchat token expired - please reconnect" });
    }

    // Determine ad account ID
    const adAccountId =
      ad_account_id ||
      connection.profile?.adAccountId ||
      connection.meta?.adAccountId ||
      process.env.SNAPCHAT_AD_ACCOUNT_ID;

    if (!adAccountId) {
      return res.status(400).json({
        error:
          "Ad account ID is required. Please provide ad_account_id or configure SNAPCHAT_AD_ACCOUNT_ID",
      });
    }

    // Upload media if media_url provided
    let mediaId = null;
    if (media_url) {
      try {
        const mediaType = type === "video" ? "VIDEO" : "IMAGE";
        const mediaRes = await safeFetch(
          `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/media`,
          fetch,
          {
            allowHosts: ["adsapi.snapchat.com"],
            requireHttps: true,
            fetchOptions: {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: title,
                type: mediaType,
                media_url: media_url,
              }),
            },
          }
        );

        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          mediaId = mediaData.media?.id || mediaData.id;
        } else {
          const errorData = await mediaRes.json();
          console.warn("[Snapchat] Media upload warning:", errorData);
        }
      } catch (e) {
        console.warn("[Snapchat] Media upload error:", e.message);
      }
    }

    // Build creative payload
    const creativePayload = {
      name: title,
      type: "SNAP_AD",
      headline: title,
      brand_name: req.body.brand_name || "AutoPromote",
      shareable: true,
      ad_product: "SNAP_AD",
    };

    if (description) {
      creativePayload.description = description;
    }

    if (mediaId) {
      creativePayload.top_snap_media_id = mediaId;
    }

    if (call_to_action) {
      creativePayload.call_to_action = call_to_action;
    }

    if (web_url) {
      creativePayload.web_view_url = web_url;
    }

    // Create creative via Snapchat Marketing API
    const creativeRes = await safeFetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/creatives`,
      fetch,
      {
        allowHosts: ["adsapi.snapchat.com"],
        requireHttps: true,
        fetchOptions: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(creativePayload),
        },
      }
    );

    const creativeData = await creativeRes.json();

    if (!creativeRes.ok) {
      const errorMsg =
        creativeData.request_status?.message || creativeData.error || "Unknown error";
      return res.status(creativeRes.status).json({
        error: "Failed to create Snapchat creative",
        details: errorMsg,
        raw: creativeData,
      });
    }

    const creativeId = creativeData.creative?.id || creativeData.id;

    res.json({
      success: true,
      creative_id: creativeId,
      media_id: mediaId,
      data: creativeData,
    });
  } catch (err) {
    console.error("[Snapchat] Creative creation error:", err);
    res.status(500).json({ error: "Snapchat creative creation failed", details: err.message });
  }
});

// 5. Get Snapchat ad performance metrics
router.get("/analytics/:creativeId", authMiddleware, apiActionLimiter, async (req, res) => {
  try {
    const { creativeId } = req.params;
    const { start_time, end_time, granularity } = req.query;

    // Get Snapchat connection
    const snap = await db
      .collection("users")
      .doc(req.userId)
      .collection("connections")
      .doc("snapchat")
      .get();
    if (!snap.exists) {
      return res.status(401).json({ error: "Snapchat not connected" });
    }

    const connection = snap.data();
    if (connection.oauthProduct === "login_kit") {
      return res.status(403).json({ error: "snapchat_publishing_permission_required" });
    }
    const { tokensFromDoc } = require("./services/connectionTokenUtils");
    const tokens = tokensFromDoc(connection) || connection.tokens || null;
    const accessToken = tokens?.access_token;

    if (!accessToken) {
      return res.status(401).json({ error: "No access token found" });
    }

    if (connection.expiresAt && connection.expiresAt < Date.now()) {
      return res.status(401).json({ error: "Snapchat token expired - please reconnect" });
    }

    // Build query params for analytics
    const queryParams = new URLSearchParams({
      fields:
        "impressions,swipes,quartile_1,quartile_2,quartile_3,view_completion,spend,conversion_purchases,conversion_save",
      granularity: granularity || "DAY",
    });

    // Add time range if provided (defaults to last 7 days)
    if (start_time) {
      queryParams.append("start_time", start_time);
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      queryParams.append("start_time", sevenDaysAgo.toISOString());
    }

    if (end_time) {
      queryParams.append("end_time", end_time);
    } else {
      queryParams.append("end_time", new Date().toISOString());
    }

    // Get analytics data from Snapchat
    const analyticsRes = await safeFetch(
      `https://adsapi.snapchat.com/v1/creatives/${creativeId}/stats?${queryParams.toString()}`,
      fetch,
      {
        allowHosts: ["adsapi.snapchat.com"],
        requireHttps: true,
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      }
    );

    const analyticsData = await analyticsRes.json();

    if (!analyticsRes.ok) {
      const errorMsg =
        analyticsData.request_status?.message || analyticsData.error || "Unknown error";
      return res.status(analyticsRes.status).json({
        error: "Failed to fetch Snapchat analytics",
        details: errorMsg,
        raw: analyticsData,
      });
    }

    // Format analytics data for easier consumption
    const stats = analyticsData.timeseries_stats?.[0]?.timeseries_stat || analyticsData;
    const formatted = {
      creative_id: creativeId,
      impressions: stats.impressions || 0,
      swipes: stats.swipes || 0,
      spend: stats.spend || 0,
      quartile_1: stats.quartile_1 || 0,
      quartile_2: stats.quartile_2 || 0,
      quartile_3: stats.quartile_3 || 0,
      view_completion: stats.view_completion || 0,
      conversion_purchases: stats.conversion_purchases || 0,
      conversion_save: stats.conversion_save || 0,
      raw: analyticsData,
    };

    res.json({
      success: true,
      analytics: formatted,
    });
  } catch (err) {
    console.error("[Snapchat] Analytics fetch error:", err);
    res.status(500).json({ error: "Snapchat analytics fetch failed", details: err.message });
  }
});

// Attach helper to the router for unit tests and external use
router.normalizeScopes = normalizeScopes;

module.exports = router;

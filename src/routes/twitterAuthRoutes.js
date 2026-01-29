const express = require("express");
const authMiddleware = require("../authMiddleware");
const {
  generatePkcePair,
  createAuthStateDoc,
  buildAuthUrl,
  consumeAuthState,
  exchangeCode,
  storeUserTokens,
  getValidAccessToken,
} = require("../services/twitterService");
const fetch = require("node-fetch");
const { db, admin } = require("../firebaseAdmin");
const { enqueuePlatformPostTask } = require("../services/promotionTaskQueue");
const logger = require("../utils/logger");

const router = express.Router();
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const twitterPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_TWITTER_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "twitter_public",
});
const twitterWriteLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_TWITTER_WRITES || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "twitter_writes",
});

// Helper to resolve Twitter env config with fallbacks (covers common typos / alt names)
function resolveTwitterConfig() {
  const clientId = process.env.TWITTER_CLIENT_ID || null;
  // Accept both canonical TWITTER_REDIRECT_URI and an alternate TWITTER_CLIENT_REDIRECT_URI (found in screenshot)
  let redirectUri =
    process.env.TWITTER_REDIRECT_URI || process.env.TWITTER_CLIENT_REDIRECT_URI || null;
  // Secret not currently required for PKCE start, but detect both correct and common misspelling SECTRET
  const clientSecret =
    process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECTRET || null;
  try {
    const { canonicalizeRedirect } = require("../utils/redirectUri");
    redirectUri = canonicalizeRedirect(redirectUri, {
      requiredPath: "/api/twitter/oauth/callback",
    });
  } catch (_) {}
  return { clientId, redirectUri, clientSecret };
}

// Diagnostic: report whether required Twitter OAuth env vars are present (with fallbacks)
router.get("/oauth/config", (req, res) => {
  const cfg = resolveTwitterConfig();
  return res.json({
    ok: true,
    hasClientId: !!cfg.clientId,
    hasRedirectUri: !!cfg.redirectUri,
    hasClientSecret: !!cfg.clientSecret,
    redirectUri: cfg.redirectUri,
    // Indicate if fallback names were used so user can clean up naming
    usedFallbackRedirect:
      !process.env.TWITTER_REDIRECT_URI && !!process.env.TWITTER_CLIENT_REDIRECT_URI,
    usedFallbackSecret: !process.env.TWITTER_CLIENT_SECRET && !!process.env.TWITTER_CLIENT_SECTRET,
  });
});

// Helper: log only if DEBUG_TWITTER_OAUTH enabled
function debugLog(...args) {
  if (process.env.DEBUG_TWITTER_OAUTH) {
    logger.debug("Twitter.routes", ...args);
  }
}

// Lightweight in-memory usage metrics (best-effort)
let oauthStartCount = 0;
let oauthPrepareCount = 0;
let oauthPreflightCount = 0;

// GET /oauth/preflight - does NOT create state; surfaces config + sample (non-usable) auth URL for diagnostics
router.get("/oauth/preflight", twitterPublicLimiter, (req, res) => {
  try {
    oauthPreflightCount++;
    const { clientId, redirectUri, clientSecret } = resolveTwitterConfig();
    const issues = [];
    if (!clientId) issues.push("missing_client_id");
    if (!redirectUri) issues.push("missing_redirect_uri");
    // Build a preview URL with placeholder state & PKCE (not persisted)
    let previewAuthUrl = null;
    if (clientId && redirectUri) {
      const { code_challenge } = generatePkcePair(); // ephemeral (code_verifier not needed for preview)
      previewAuthUrl = buildAuthUrl({
        clientId,
        redirectUri,
        state: "PREVIEW_STATE",
        code_challenge,
      });
    }
    debugLog("preflight", { issues, havePreview: !!previewAuthUrl });
    return res.json({
      ok: issues.length === 0,
      mode: "diagnostic",
      clientIdPresent: !!clientId,
      redirectUriPresent: !!redirectUri,
      clientSecretPresent: !!clientSecret,
      usedFallbackRedirect:
        !process.env.TWITTER_REDIRECT_URI && !!process.env.TWITTER_CLIENT_REDIRECT_URI,
      usedFallbackSecret:
        !process.env.TWITTER_CLIENT_SECRET && !!process.env.TWITTER_CLIENT_SECTRET,
      previewAuthUrl,
      issues,
      metrics: { oauthPreflightCount, oauthStartCount, oauthPrepareCount },
    });
  } catch (e) {
    return res.status(500).json({ error: "preflight_failed", detail: e.message });
  }
});

// Start OAuth (PKCE) - redirects user agent
router.get("/oauth/start", authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    oauthStartCount++;
    const { clientId, redirectUri } = resolveTwitterConfig();
    if (!clientId || !redirectUri) {
      debugLog("start missing config", { clientId: !!clientId, redirectUri: !!redirectUri });
      return res.status(500).json({
        error: "twitter_client_config_missing",
        detail: { clientId: !!clientId, redirectUri: !!redirectUri },
      });
    }
    const { code_verifier, code_challenge } = generatePkcePair();
    const state = await createAuthStateDoc({ uid: req.userId || req.user?.uid, code_verifier });
    const url = buildAuthUrl({ clientId, redirectUri, state, code_challenge });
    debugLog("start redirect", { state });
    return res.redirect(url);
  } catch (e) {
    debugLog("start error", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Prepare OAuth (returns JSON authUrl to allow frontend fetch + redirect with auth header)
router.post("/oauth/prepare", authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    oauthPrepareCount++;
    const { clientId, redirectUri } = resolveTwitterConfig();
    if (!clientId || !redirectUri) {
      debugLog("prepare missing config", { clientId: !!clientId, redirectUri: !!redirectUri });
      return res.status(500).json({
        error: "twitter_client_config_missing",
        detail: { clientId: !!clientId, redirectUri: !!redirectUri },
      });
    }
    const { code_verifier, code_challenge } = generatePkcePair();
    const state = await createAuthStateDoc({ uid: req.userId || req.user?.uid, code_verifier });
    const authUrl = buildAuthUrl({ clientId, redirectUri, state, code_challenge });
    debugLog("prepare generated", { state });
    return res.json({ authUrl, state });
  } catch (e) {
    debugLog("prepare error", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// OAuth callback
router.get("/oauth/callback", twitterPublicLimiter, async (req, res) => {
  // Sanitize provider-controlled query params: copy into local vars and remove from req.query
  const stateRaw = req.query.state;
  const codeRaw = req.query.code;
  const errorRaw = req.query.error;
  const state = stateRaw ? String(stateRaw) : null;
  const code = codeRaw ? String(codeRaw) : null;
  const error = errorRaw ? String(errorRaw) : null;
  try {
    delete req.query.state;
    delete req.query.code;
    delete req.query.error;
  } catch (_) {}

  if (error) {
    // Avoid reflecting provider text back to the user to prevent leakage or reflected content
    debugLog("callback error received from provider");
    return res.status(400).send("Twitter auth error");
  }
  if (!state || !code) {
    debugLog("callback missing param", { statePresent: !!state, codePresent: !!code });
    return res.status(400).send("Missing state or code");
  }
  try {
    const stored = await consumeAuthState(state);
    if (!stored) {
      debugLog("callback invalid/expired state", state);
      return res.status(400).send("Invalid or expired state");
    }
    const { clientId, redirectUri } = resolveTwitterConfig();
    if (!clientId || !redirectUri) {
      debugLog("callback missing config", { clientId: !!clientId, redirectUri: !!redirectUri });
      return res.status(500).send("Server missing client config");
    }
    const tokens = await exchangeCode({
      code,
      code_verifier: stored.code_verifier,
      redirectUri,
      clientId,
    });
    await storeUserTokens(stored.uid, tokens);
    debugLog("callback success for uid", stored.uid);
    return res.send(
      "<html><body><h2>Twitter connected successfully.</h2><p>You can close this window.</p></body></html>"
    );
  } catch (e) {
    // Avoid reflecting error messages into HTML to prevent reflected XSS.
    debugLog("callback exchange error", e.message);
    return res.status(500).send("Exchange failed");
  }
});

// -------------------------
// OAuth1.0a flow (request_token -> authenticate -> access_token)
// -------------------------

// Prepare OAuth1 (returns authUrl for frontend redirect)
router.post("/oauth1/prepare", authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    const consumerKey = process.env.TWITTER_CLIENT_ID || process.env.TWITTER_CONSUMER_KEY;
    const consumerSecret =
      process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CONSUMER_SECRET || null;
    if (!consumerKey || !consumerSecret) {
      return res.status(500).json({ error: "twitter_consumer_config_missing" });
    }

    // Build callback URL (same hostname + path)
    let callbackUrl = process.env.TWITTER_CLIENT_REDIRECT_URI || null;
    try {
      const { canonicalizeRedirect } = require("../utils/redirectUri");
      callbackUrl = canonicalizeRedirect(callbackUrl, {
        requiredPath: "/api/twitter/oauth1/callback",
      });
    } catch (_) {}
    if (!callbackUrl) {
      return res.status(500).json({ error: "missing_callback_url" });
    }

    const requestTokenUrl = "https://api.twitter.com/oauth/request_token";
    const { buildOauth1Header } = require("../utils/oauth1");

    const extraParams = { oauth_callback: callbackUrl };
    const authHeader = buildOauth1Header({
      method: "POST",
      url: requestTokenUrl,
      consumerKey,
      consumerSecret,
      extraParams,
    });

    const r = await fetch(requestTokenUrl, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(extraParams),
    });
    const txt = await r.text();
    if (!r.ok) {
      debugLog("oauth1 request_token failed", r.status, txt);
      return res.status(500).json({ error: "request_token_failed", detail: txt });
    }

    // Parse form-encoded response
    const resp = Object.fromEntries(new URLSearchParams(txt));
    if (!resp.oauth_token || !resp.oauth_token_secret) {
      return res.status(500).json({ error: "invalid_request_token_response", raw: txt });
    }

    // Store temporary state mapping oauth_token -> secret + uid
    await db
      .collection("oauth1_states")
      .doc(resp.oauth_token)
      .set({
        uid: req.userId || req.user?.uid,
        oauth_token_secret: resp.oauth_token_secret,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    const authUrl = `https://api.twitter.com/oauth/authenticate?oauth_token=${resp.oauth_token}`;
    return res.json({ authUrl });
  } catch (e) {
    debugLog("oauth1 prepare error", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// OAuth1 callback - exchanges request_token + verifier for access token
router.get("/oauth1/callback", twitterPublicLimiter, async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  // OAuth1 callback parameters come via query string from Twitter (provider-controlled).
  // Treat them as sensitive: normalize to local variables and remove them from `req.query` immediately
  // so they cannot be accidentally logged or serialized by other middleware.
  const oauthToken = oauth_token ? String(oauth_token) : null;
  const oauthVerifier = oauth_verifier ? String(oauth_verifier) : null;
  // Remove sensitive query params to avoid accidental leakage in logs or downstream middleware
  try {
    delete req.query.oauth_token;
    delete req.query.oauth_verifier;
  } catch (_) {}

  if (!oauthToken || !oauthVerifier)
    return res.status(400).send("Missing oauth_token or oauth_verifier");

  try {
    const doc = await db.collection("oauth1_states").doc(oauth_token).get();
    if (!doc.exists) return res.status(400).send("Invalid or expired oauth token");
    const data = doc.data();
    const requestTokenSecret = data.oauth_token_secret;
    const uid = data.uid;

    const accessTokenUrl = "https://api.twitter.com/oauth/access_token";
    const consumerKey = process.env.TWITTER_CLIENT_ID || process.env.TWITTER_CONSUMER_KEY;
    const consumerSecret =
      process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CONSUMER_SECRET || null;
    const { buildOauth1Header } = require("../utils/oauth1");

    // Use the sanitized local variables rather than raw req.query values
    const extraParams = { oauth_verifier: oauthVerifier };
    const authHeader = buildOauth1Header({
      method: "POST",
      url: accessTokenUrl,
      consumerKey,
      consumerSecret,
      token: oauthToken,
      tokenSecret: requestTokenSecret,
      extraParams,
    });

    const r = await fetch(accessTokenUrl, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(extraParams),
    });
    const txt = await r.text();
    if (!r.ok) {
      debugLog("oauth1 access_token failed", r.status, txt);
      return res.status(500).send("Access token exchange failed");
    }

    const resp = Object.fromEntries(new URLSearchParams(txt));
    if (!resp.oauth_token || !resp.oauth_token_secret) {
      return res.status(500).send("Invalid access token response");
    }

    // Persist OAuth1 access tokens to user's connection doc
    await require("../services/twitterService").storeUserOAuth1Tokens(
      uid,
      resp.oauth_token,
      resp.oauth_token_secret,
      {
        screen_name: resp.screen_name,
        user_id: resp.user_id,
      }
    );

    // Cleanup temporary state (use sanitized oauthToken and ignore delete errors)
    await db
      .collection("oauth1_states")
      .doc(oauthToken)
      .delete()
      .catch(() => {});

    debugLog("oauth1 callback success for uid", uid);
    return res.send(
      "<html><body><h2>Twitter (OAuth1) connected successfully.</h2><p>You can close this window.</p></body></html>"
    );
  } catch (e) {
    debugLog("oauth1 callback error", e.message);
    return res.status(500).send("OAuth1 exchange failed");
  }
});

module.exports = router;

// -------------------------------------------------------
// Additional Twitter utility endpoints (status, disconnect,
// test tweet enqueue). These are additive and keep the file
// backward compatible with existing mounts.
// -------------------------------------------------------

// Connection status (instrumented + in-flight dedupe)
router.get(
  "/connection/status",
  authMiddleware,
  twitterPublicLimiter,
  require("../statusInstrument")("twitterStatus", async (req, res) => {
    try {
      const { getCache, setCache } = require("../utils/simpleCache");
      const { dedupe } = require("../utils/inFlight");
      const { instrument } = require("../utils/queryMetrics");
      const uid = req.userId;
      const cacheKey = `twitter_status_${uid}`;
      const cached = getCache(cacheKey);
      if (cached) return res.json({ ...cached, _cached: true });

      const payload = await dedupe(cacheKey, async () => {
        // Firestore fetch instrumented
        const snap = await instrument("twitterStatusDoc", () =>
          db.collection("users").doc(uid).collection("connections").doc("twitter").get()
        );
        if (!snap.exists) {
          return { connected: false };
        }
        const data = snap.data();
        let identity = null;
        // External call instrumented separately (best-effort)
        try {
          const token = await getValidAccessToken(uid);
          if (token) {
            const idJson = await instrument("twitterIdentityFetch", async () => {
              const r = await fetch("https://api.twitter.com/2/users/me", {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (r.ok) return r.json();
              return null;
            });
            if (idJson?.data)
              identity = {
                id: idJson.data.id,
                name: idJson.data.name,
                username: idJson.data.username,
              };
          }
        } catch (_) {
          /* ignore identity errors */
        }
        return {
          connected: true,
          scope: data.scope,
          expires_at: data.expires_at || null,
          willRefreshInMs: data.expires_at ? Math.max(0, data.expires_at - Date.now()) : null,
          identity,
          // Indicate whether OAuth1 reauth is required for native media uploads (e.g., video)
          oauth1_missing: !!data.oauth1_missing,
          oauth1_missingAt: data.oauth1_missingAt || null,
        };
      });
      setCache(cacheKey, payload, 7000);
      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  })
);

// Disconnect (revoke local tokens; note: full revocation via Twitter API not implemented here)
router.post("/connection/disconnect", authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    const ref = db.collection("users").doc(req.userId).collection("connections").doc("twitter");
    await ref.delete();
    res.json({ disconnected: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enqueue a test tweet via promotion task queue
// Body: { message?: string, contentId?: string }
router.post("/tweet/test", authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    // Ensure connection exists (attempt token retrieval)
    const token = await getValidAccessToken(req.userId).catch(() => null);
    if (!token) return res.status(400).json({ error: "not_connected" });
    const { message, contentId } = req.body || {};
    const payload = { message: message || "Test tweet from AutoPromote" };
    const r = await enqueuePlatformPostTask({
      platform: "twitter",
      contentId: contentId || null,
      uid: req.userId,
      reason: "manual_test",
      payload,
      skipIfDuplicate: false, // allow repeated manual tests
    });
    res.json({ queued: true, task: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Immediate tweet (bypasses queue) - admin / testing convenience
router.post("/tweet/immediate", authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    const token = await getValidAccessToken(req.userId).catch(() => null);
    if (!token) return res.status(400).json({ error: "not_connected" });
    const { message } = req.body || {};
    const text = (message || "Immediate tweet from AutoPromote").slice(0, 280);
    const twRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const bodyText = await twRes.text();
    let json;
    try {
      json = JSON.parse(bodyText);
    } catch (_) {
      json = { raw: bodyText };
    }
    if (!twRes.ok) return res.status(twRes.status).json({ error: "tweet_failed", details: json });
    res.json({ success: true, tweet: json });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

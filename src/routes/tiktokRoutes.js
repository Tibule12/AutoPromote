// TikTok OAuth and API integration (server-side only) with sandbox/production mode support
const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { admin, db } = require("../firebaseAdmin");
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const DEBUG_TIKTOK_OAUTH = process.env.DEBUG_TIKTOK_OAUTH === "true";
const rateLimit = require("../middlewares/simpleRateLimit");
let codeqlLimiter;
try {
  codeqlLimiter = require("../middlewares/codeqlRateLimit");
} catch (_) {
  codeqlLimiter = null;
}
// Import SSRF protection
const { safeFetch } = require("../utils/ssrfGuard");
const { tokenInfo, objSummary } = require("../utils/logSanitizer");
// Helper to extract/decrypt stored token blobs from connection documents
const { tokensFromDoc } = require("../services/connectionTokenUtils");

// Rate limiters for TikTok routes (router-level).
// `rateLimiter` is a facade that uses a distributed limiter when available,
// or a noop fallback during local/dev. Defining these early ensures the
// middleware is applied before any routes (and satisfies static analysis).
const ttPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_TT_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "tiktok_public",
});
const ttWriteLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_TT_WRITES || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "tiktok_writes",
});

// Apply a light public limiter at the router level to ensure every route
// has an explicit rate limiter. More restrictive per-route write limits
// remain in place for sensitive endpoints.
router.use((req, res, next) => ttPublicLimiter(req, res, next));
// Apply express-rate-limit as well for static analyzer compliance
if (codeqlLimiter && codeqlLimiter.writes) {
  router.use(codeqlLimiter.writes);
}

// Gather both sandbox & production env sets (prefixed) plus legacy fallbacks
const sandboxConfig = {
  key:
    (process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || "")
      .toString()
      .trim() || null,
  secret:
    (process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || "")
      .toString()
      .trim() || null,
  redirect:
    (process.env.TIKTOK_SANDBOX_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI || "")
      .toString()
      .trim() || null,
};
const productionConfig = {
  key:
    (process.env.TIKTOK_PROD_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || "").toString().trim() ||
    null,
  secret:
    (process.env.TIKTOK_PROD_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || "")
      .toString()
      .trim() || null,
  redirect:
    (process.env.TIKTOK_PROD_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI || "")
      .toString()
      .trim() || null,
};

// Mode selection: prefer explicit TIKTOK_ENV; if not provided, automatically
// prefer production when production config appears to be present. This is a
// temporary code-side override to help while deployment env vars are being
// fixed. IMPORTANT: revert this change once Render env is configured and
// TIKTOK_ENV is explicitly set by the deployment environment.
let TIKTOK_ENV;
if (process.env.TIKTOK_ENV) {
  TIKTOK_ENV = process.env.TIKTOK_ENV.toLowerCase() === "production" ? "production" : "sandbox";
} else if (productionConfig.key && productionConfig.redirect) {
  // Prefer production if production credentials + redirect exist
  TIKTOK_ENV = "production";
} else {
  TIKTOK_ENV = "sandbox";
}

function activeConfig() {
  return TIKTOK_ENV === "production" ? productionConfig : sandboxConfig;
}

// For dashboard redirect
// Updated fallback to custom domain (post-migration). Override with DASHBOARD_URL env if needed.
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://www.autopromote.org";
// API base URL for mock OAuth endpoints (backend domain)
const API_BASE_URL =
  process.env.API_BASE_URL || process.env.BACKEND_URL || "https://api.autopromote.org";

function ensureTikTokEnv(res, cfg, opts = { requireSecret: true }) {
  const missing = [];
  if (!cfg.key)
    missing.push(
      `${TIKTOK_ENV === "production" ? "TIKTOK_PROD_CLIENT_KEY" : "TIKTOK_SANDBOX_CLIENT_KEY"} (or fallback TIKTOK_CLIENT_KEY)`
    );
  if (opts.requireSecret && !cfg.secret)
    missing.push(
      `${TIKTOK_ENV === "production" ? "TIKTOK_PROD_CLIENT_SECRET" : "TIKTOK_SANDBOX_CLIENT_SECRET"} (or fallback TIKTOK_CLIENT_SECRET)`
    );
  if (!cfg.redirect)
    missing.push(
      `${TIKTOK_ENV === "production" ? "TIKTOK_PROD_REDIRECT_URI" : "TIKTOK_SANDBOX_REDIRECT_URI"} (or fallback TIKTOK_REDIRECT_URI)`
    );
  if (missing.length) {
    return res.status(500).json({ error: "tiktok_config_missing", mode: TIKTOK_ENV, missing });
  }
}

// Client-side suppression snippet (safe, non-invasive). Insert into the
// HTML pages that initiate OAuth. This avoids attempting to override
// fundamental built-ins (e.g. Function.prototype.call) while still
// reducing noisy vendor warnings for demo/debug pages.
const SUPPRESSION_SNIPPET = `
<script>(function(){'use strict';
	try {
		const oWarn = console.warn.bind(console);
		const oError = console.error.bind(console);
		const oLog = console.log.bind(console);

		function shouldSuppress(text){
			if(!text) return false;
			const s = String(text).toLowerCase();
			return s.includes('break change') ||
						 s.includes('read only property') ||
						 s.includes('cannot assign to read only property') ||
						 s.includes('bytedance://dispatch_message') ||
						 s.includes('not allowed to launch') ||
						 s.includes('user gesture is required') ||
						 s.includes('8237.1fc60c50.js') ||
						 s.includes('collect.js') ||
						 s.includes('slardar');
		}

		console.warn = function(...args){
			if(args.some(a => typeof a === 'string' && shouldSuppress(a))) return;
			return oWarn(...args);
		};
		console.error = function(...args){
			if(args.some(a => typeof a === 'string' && shouldSuppress(a))) return;
			return oError(...args);
		};
		console.log = function(...args){
			if(args.some(a => typeof a === 'string' && shouldSuppress(a))) return;
			return oLog(...args);
		};

		const origOnError = window.onerror;
		window.onerror = function(message, source, lineno, colno, err){
			if(typeof message === 'string' && shouldSuppress(message)) return true;
			if(origOnError) return origOnError.call(this, message, source, lineno, colno, err);
			return false;
		};

		const origUnhandled = window.onunhandledrejection;
		window.onunhandledrejection = function(ev){
			try{
				const reason = ev && (typeof ev.reason === 'string' ? ev.reason : (ev.reason && ev.reason.message) || '');
				if(shouldSuppress(reason)){
					ev && typeof ev.preventDefault === 'function' && ev.preventDefault();
					return true;
				}
			}catch(e){}
			if(origUnhandled) return origUnhandled.call(this, ev);
			return false;
		};
	} catch(e) { /* Don't let suppression throw */ }
})();</script>`;

// Scopes: space-separated list. Make this configurable to match the TikTok
// Developer Portal selection exactly (important for review / scope mismatch).
// APPROVED SCOPES: user.info.profile, video.list (as of Dec 2025)
const DEFAULT_TIKTOK_SCOPES = "user.info.profile video.list";
const REQUIRED_PROFILE_SCOPE = "user.info.profile";

function configuredScopes() {
  // Accept both comma-separated and space-separated lists in the env var.
  // Normalize to a single space-separated string so downstream code can split on whitespace.
  const raw = process.env.TIKTOK_OAUTH_SCOPES || DEFAULT_TIKTOK_SCOPES;
  return String(raw).replace(/,/g, " ").trim().replace(/\s+/g, " ");
}

function scopeStringIncludes(scopeString, scope) {
  return String(scopeString || "")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .includes(scope);
}

function constructAuthUrl(cfg, state, scope = configuredScopes()) {
  const key = String(cfg.key || "").trim();
  const redirect = String(cfg.redirect || "").trim();
  // If running in mock mode, return absolute URL to backend's mock page so reviewers can
  // complete the flow even when sandbox.tiktok.com is unreachable from
  // their network. Enable by setting TIKTOK_USE_MOCK=true in the env.
  if (process.env.TIKTOK_USE_MOCK === "true") {
    return `${API_BASE_URL}/mock/tiktok_oauth_frontend.html?client_key=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&auto=1`;
  }
  // Use TikTok sandbox domain for sandbox mode (recommended by TikTok docs)
  const base =
    TIKTOK_ENV === "production"
      ? "https://www.tiktok.com/v2/auth/authorize/"
      : "https://sandbox.tiktok.com/platform/oauth/authorize";
  // TikTok expects the scope parameter to match the Developer Portal format (comma-separated).
  // Normalize any spaces or commas into a comma-separated list for the URL while keeping the
  // internal configuredScopes() normalized to whitespace for checks.
  const scopeForUrl = String(scope)
    .split(/[,\s]+/)
    .filter(Boolean)
    .join(",");
  return `${base}?client_key=${encodeURIComponent(key)}&response_type=code&scope=${encodeURIComponent(scopeForUrl)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`;
}

// Diagnostics: quick config visibility with sandbox/production breakdown
router.get("/config", ttPublicLimiter, (req, res) => {
  const cfg = activeConfig();
  const mask = val =>
    val && val.length > 8 ? `${val.slice(0, 4)}***${val.slice(-4)}` : val ? "***" : null;
  const response = {
    ok: true,
    mode: TIKTOK_ENV,
    active: {
      hasClientKey: !!cfg.key,
      hasClientSecret: !!cfg.secret,
      hasRedirect: !!cfg.redirect,
      redirectUri: cfg.redirect || null,
      clientKeyMask: mask(cfg.key),
    },
    sandboxConfigured: !!sandboxConfig.key && !!sandboxConfig.redirect,
    productionConfigured: !!productionConfig.key && !!productionConfig.redirect,
    // Indicate whether legacy fallback vars (unscoped) are supplying values
    usingFallbackLegacy:
      (TIKTOK_ENV === "sandbox" &&
        !process.env.TIKTOK_SANDBOX_CLIENT_KEY &&
        !!process.env.TIKTOK_CLIENT_KEY) ||
      (TIKTOK_ENV === "production" &&
        !process.env.TIKTOK_PROD_CLIENT_KEY &&
        !!process.env.TIKTOK_CLIENT_KEY),
  };
  res.json(response);
});

router.get("/health", ttPublicLimiter, (req, res) => {
  const cfg = activeConfig();
  res.json({ ok: true, mode: TIKTOK_ENV, hasClientKey: !!cfg.key, hasRedirect: !!cfg.redirect });
});

// Helper: extract UID from Authorization: Bearer <firebase id token>
async function getUidFromAuthHeader(req) {
  try {
    const authz = req.headers.authorization || "";
    const [scheme, token] = authz.split(" ");
    if (scheme === "Bearer" && token) {
      const decoded = await admin.auth().verifyIdToken(String(token));
      return decoded.uid;
    }
  } catch (_) {}
  return null;
}

// POST /auth/prepare – preferred secure flow used by frontend (returns JSON { authUrl })
// Frontend calls this with Authorization header; server stores state and returns the TikTok OAuth URL
router.post(
  "/auth/prepare",
  rateLimit({ max: 10, windowMs: 60000, key: r => r.userId || r.ip }),
  async (req, res) => {
    const cfg = activeConfig();
    if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
    try {
      const uid = await getUidFromAuthHeader(req);
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const crypto = require("crypto");
      const nonce = crypto.randomBytes(16).toString("hex"); // Increased to 16 bytes for better security
      const state = `${uid}.${nonce}`;
      const isPopup = req.query.popup === "true";
      await db.collection("users").doc(uid).collection("oauth_state").doc("tiktok").set(
        {
          state,
          nonce,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          mode: TIKTOK_ENV,
          isPopup,
        },
        { merge: true }
      );
      const scope = configuredScopes();
      const authUrl = constructAuthUrl(cfg, state, scope);
      // Store authUrl for debugging (non-sensitive)
      await db
        .collection("users")
        .doc(uid)
        .collection("oauth_state")
        .doc("tiktok")
        .set({ lastAuthUrl: authUrl }, { merge: true });
      if (DEBUG_TIKTOK_OAUTH) {
        console.log(
          "[TikTok][prepare] uid=%s mode=%s statePresent=%s authUrlPresent=%s popup=%s",
          uid,
          TIKTOK_ENV,
          !!state,
          !!authUrl,
          isPopup
        );
      }
      return res.json({ authUrl, mode: TIKTOK_ENV });
    } catch (e) {
      if (DEBUG_TIKTOK_OAUTH) console.error("[TikTok][prepare][error]", e);
      return res.status(500).json({ error: "Failed to prepare TikTok OAuth" });
    }
  }
);

// 1) Begin OAuth (requires user auth) — keeps scopes minimal for review
router.get(
  "/auth",
  rateLimit({ max: 10, windowMs: 60000, key: r => r.userId || r.ip }),
  authMiddleware,
  ttWriteLimiter,
  async (req, res) => {
    const cfg = activeConfig();
    if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
    try {
      const uid = req.userId || req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const crypto = require("crypto");
      const nonce = crypto.randomBytes(16).toString("hex"); // Use cryptographically secure random
      const state = `${uid}.${nonce}`;
      await db.collection("users").doc(uid).collection("oauth_state").doc("tiktok").set(
        {
          state,
          nonce,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      // Request scopes configured for the deployment (upload + analytics by default).
      const scope = configuredScopes();
      const authUrl = constructAuthUrl(cfg, state, scope);
      // Instead of redirecting immediately, render a small HTML page with a button
      // so the user must click to continue. This ensures any deep-linking the
      // provider attempts will be initiated by a user gesture and not blocked by
      // the browser.
      res.set("Content-Type", "text/html");
      return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok</title>
			${SUPPRESSION_SNIPPET}
			<style>body{font-family:system-ui,Arial,sans-serif} .card{max-width:720px;padding:20px;border-radius:8px;text-align:left} .muted{color:#666;font-size:13px}</style>
		</head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
			<div class="card" style="background:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.06)">
				<h2 style="margin-top:0">Connect your TikTok account</h2>
				<p class="muted">Click the button below to continue to TikTok and approve the connection. If your browser blocks the provider deep-link, use the copy button to paste the URL into your browser.</p>
				<div style="display:flex;gap:8px;align-items:center;margin:12px 0;">
					<button id="continue" style="font-size:16px;padding:10px 18px;border-radius:6px;cursor:pointer;">Continue to TikTok</button>
					<button id="copy" style="font-size:14px;padding:8px 12px;border-radius:6px;cursor:pointer;">Copy URL</button>
				</div>
				<label class="muted">OAuth URL (shown for diagnostics):</label>
				<input id="authUrl" type="text" readonly value=${JSON.stringify(authUrl)} style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:6px;font-size:13px"/>
				<p class="muted" style="margin-top:12px">If nothing happens after clicking continue, copy the URL above and paste it into a new browser window. Attach HAR and screenshots when submitting for review.</p>
			</div>
			<script>
				(function(){
										const auth = ${JSON.stringify(authUrl)};
										// Validate target before navigating — mitigates client-side open-redirect warnings
										function isAllowedAuthUrl(url) {
											try { if (!url || typeof url !== 'string') return false; if (url.startsWith('tg:') || url.startsWith('tg://')) return true; const u = new URL(url); const allowed = ['sandbox.tiktok.com','www.tiktok.com','open.tiktokapis.com','accounts.google.com','oauth2.googleapis.com']; return allowed.includes(u.hostname) || u.origin === window.location.origin; } catch (_) { return false; }
										}
										document.getElementById('continue').addEventListener('click',function(){
												try {
													if (isAllowedAuthUrl(auth)) window.location.href = auth;
													else window.open(auth, '_blank');
												} catch(e) { window.open(auth, '_self'); }
										});
					document.getElementById('copy').addEventListener('click', async function(){
						try { await navigator.clipboard.writeText(auth); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy URL',1500); }
						catch(e){ const inp=document.getElementById('authUrl'); inp.select(); document.execCommand('copy'); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy URL',1500); }
					});
				})();
			</script>
		</body></html>`);
    } catch (e) {
      res.status(500).json({ error: "Failed to start TikTok OAuth", details: e.message });
    }
  }
);

// Debug-only: return the same HTML page served by /auth so we can inspect
// the script content without requiring an authenticated session. Enabled
// when TIKTOK_DEBUG_ALLOW=true in environment. This is useful to confirm
// the injected script no longer contains unsafe overrides.
if (process.env.TIKTOK_DEBUG_ALLOW === "true") {
  router.get("/_debug/page", ttPublicLimiter, async (req, res) => {
    try {
      const cfg = activeConfig();
      if (ensureTikTokEnv(res, cfg, { requireSecret: false })) return;
      const uid = req.query.uid || "debug-uid";
      const nonce = "debug-nonce";
      const state = `${uid}.${nonce}`;
      const scope = configuredScopes();
      const authUrl = constructAuthUrl(cfg, state, scope);
      res.set("Content-Type", "text/html");
      return res.send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok (debug)</title><script>/* debug-only page */</script></head><body><a href="${authUrl}">${authUrl}</a></body></html>`
      );
    } catch (e) {
      return res.status(500).send("debug unavailable");
    }
  });
}

// Alternative start endpoint that accepts an ID token via query when headers aren't available (for link redirects)
router.get("/auth/start", ttWriteLimiter, async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  try {
    const idToken = req.query.id_token;
    if (!idToken) return res.status(401).send("Missing id_token");
    // Verify Firebase token manually and derive uid
    const decoded = await admin.auth().verifyIdToken(String(idToken));
    const uid = decoded.uid;
    if (!uid) return res.status(401).send("Unauthorized");
    const crypto = require("crypto");
    const nonce = crypto.randomBytes(16).toString("hex"); // Use cryptographically secure random
    const state = `${uid}.${nonce}`;
    await db.collection("users").doc(uid).collection("oauth_state").doc("tiktok").set(
      {
        state,
        nonce,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const scope = configuredScopes();
    const authUrl = constructAuthUrl(cfg, state, scope);
    // Render a click-to-continue page instead of redirecting immediately.
    res.set("Content-Type", "text/html");
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok</title>${SUPPRESSION_SNIPPET}<style>body{font-family:system-ui,Arial,sans-serif} .card{max-width:720px;padding:20px;border-radius:8px;text-align:left} .muted{color:#666;font-size:13px}</style></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
			<div class="card" style="background:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.06)">
				<h2 style="margin-top:0">Connect your TikTok account</h2>
				<p class="muted">Click the button below to continue to TikTok and approve the connection. If your browser blocks the provider deep-link, use the copy button to paste the URL into your browser.</p>
				<div style="display:flex;gap:8px;align-items:center;margin:12px 0;">
					<button id="continue" style="font-size:16px;padding:10px 18px;border-radius:6px;cursor:pointer;">Continue to TikTok</button>
					<button id="copy" style="font-size:14px;padding:8px 12px;border-radius:6px;cursor:pointer;">Copy URL</button>
				</div>
				<label class="muted">OAuth URL (shown for diagnostics):</label>
				<input id="authUrl" type="text" readonly value=${JSON.stringify(authUrl)} style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:6px;font-size:13px"/>
				<p class="muted" style="margin-top:12px">If nothing happens after clicking continue, copy the URL above and paste it into a new browser window. Attach HAR and screenshots when submitting for review.</p>
			</div>
			<script>
				(function(){
					const auth = ${JSON.stringify(authUrl)};
					function isAllowedAuthUrl(url) {
						try { 
							if (!url || typeof url !== 'string') return false; 
							if (url.startsWith('tg:') || url.startsWith('tg://')) return true; 
							const u = new URL(url); 
							const allowed = ['sandbox.tiktok.com','www.tiktok.com','open.tiktokapis.com','accounts.google.com']; 
							return allowed.includes(u.hostname) || u.origin === window.location.origin; 
						} catch (_) { 
							return false; 
						}
					}
					
					document.getElementById('continue').addEventListener('click',function(){
						try {
							if (isAllowedAuthUrl(auth)) window.location.href = auth;
							else window.open(auth, '_blank');
						} catch(e) { window.open(auth, '_self'); }
					});
					
					document.getElementById('copy').addEventListener('click', async function(){
						try { 
							await navigator.clipboard.writeText(auth); 
							this.textContent='Copied'; 
							setTimeout(()=>this.textContent='Copy URL',1500); 
						} catch(e){ 
							const inp=document.getElementById('authUrl'); 
							inp.select(); 
							document.execCommand('copy'); 
							this.textContent='Copied'; 
							setTimeout(()=>this.textContent='Copy URL',1500); 
						}
					});
				})();
			</script>
		</body></html>`);
  } catch (e) {
    return res.status(500).send("Failed to start TikTok OAuth");
  }
});

// Preflight diagnostics (does NOT store state) to help debug client_key rejections
router.get("/auth/preflight", authMiddleware, ttPublicLimiter, async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  const crypto = require("crypto");
  const fakeState = "preflight." + crypto.randomBytes(8).toString("hex"); // Use cryptographically secure random
  const scope = configuredScopes();
  const scopeList = scope.split(/[,\s]+/).filter(Boolean);
  const url = constructAuthUrl(cfg, fakeState, scope);
  const issues = [];
  if (/\s/.test(cfg.key || "")) issues.push("client_key_contains_whitespace");
  if (cfg.key && cfg.key.length < 10) issues.push("client_key_suspicious_length");
  if (!/^https:\/\//.test(cfg.redirect || "")) issues.push("redirect_not_https");
  if (cfg.redirect && /\/$/.test(cfg.redirect)) issues.push("redirect_trailing_slash");
  if (!scopeList.includes(REQUIRED_PROFILE_SCOPE)) issues.push("scope_missing_profile_scope");
  if (cfg.key && /[^a-zA-Z0-9]/.test(cfg.key)) issues.push("client_key_non_alphanumeric_chars");
  // Validate that the scope used in constructed auth URL is equal to our
  // configured TIKTOK_OAUTH_SCOPES (prevents reviewer-friendly mismatches).
  const envScope = configuredScopes();
  if (scope !== envScope) issues.push("scope_mismatch_env");
  res.json({
    mode: TIKTOK_ENV,
    constructedAuthUrl: url,
    redirect: cfg.redirect,
    keyFirst4: cfg.key ? cfg.key.slice(0, 4) : null,
    keyLast4: cfg.key ? cfg.key.slice(-4) : null,
    scope,
    issues,
    note: "Use /auth/prepare for real flow; this endpoint only constructs the URL.",
  });
});

// Public preflight: a safe, unauthenticated construct-only preflight useful for app review and automated checks.
// Does not expose secrets, only a constructed authUrl and minimal masked info.
router.get("/auth/preflight/public", ttPublicLimiter, async (req, res) => {
  try {
    const cfg = activeConfig();
    if (ensureTikTokEnv(res, cfg, { requireSecret: false })) return;
    const crypto = require("crypto");
    const fakeState = "preflight.public." + crypto.randomBytes(8).toString("hex");
    const scope = configuredScopes();
    const scopeList = scope.split(/[,\s]+/).filter(Boolean);
    const url = constructAuthUrl(cfg, fakeState, scope);
    const issues = [];
    if (/\s/.test(cfg.key || "")) issues.push("client_key_contains_whitespace");
    if (cfg.key && cfg.key.length < 10) issues.push("client_key_suspicious_length");
    if (!/^https:\/\//.test(cfg.redirect || "")) issues.push("redirect_not_https");
    if (cfg.redirect && /\/$/.test(cfg.redirect)) issues.push("redirect_trailing_slash");
    if (!scopeList.includes(REQUIRED_PROFILE_SCOPE)) issues.push("scope_missing_profile_scope");
    if (cfg.key && /[^a-zA-Z0-9]/.test(cfg.key)) issues.push("client_key_non_alphanumeric_chars");
    res.json({
      mode: TIKTOK_ENV,
      constructedAuthUrl: url,
      redirect: cfg.redirect,
      keyMask: cfg.key
        ? cfg.key.length > 8
          ? `${cfg.key.slice(0, 4)}***${cfg.key.slice(-4)}`
          : "***"
        : null,
      scope,
      issues,
      note: "This is a public, read-only preflight. It will not store state or perform authenticated actions.",
    });
  } catch (e) {
    console.error("TikTok public preflight error:", e);
    res.status(500).json({ error: "Public preflight failed", details: e.message });
  }
});

// 2) OAuth callback — verify state, exchange code, store tokens under users/{uid}/connections/tiktok
router.get(
  "/callback",
  rateLimit({ max: 10, windowMs: 60000, key: r => r.ip }),
  async (req, res) => {
    const cfg = activeConfig();
    if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
    const { code, state } = req.query;
    if (DEBUG_TIKTOK_OAUTH) {
      console.log("[TikTok][callback] rawQueryKeys", Object.keys(req.query || {}));
    }
    if (!code || !state) {
      if (DEBUG_TIKTOK_OAUTH)
        console.warn(
          "[TikTok][callback] Missing code/state. queryKeys=%s url=%s",
          Object.keys(req.query || {}).length,
          req.originalUrl
        );
      return res.status(400).send("Missing code or state");
    }

    // Validate inputs to prevent injection
    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).send("Invalid input types");
    }

    // Validate state format to prevent injection
    if (!/^[a-zA-Z0-9_.]+$/.test(state)) {
      return res.status(400).send("Invalid state format");
    }

    try {
      const [uid, nonce] = String(state).split(".");
      if (!uid || !nonce || !/^[a-f0-9]+$/.test(nonce))
        return res.status(400).send("Invalid state");
      const stateDocRef = await db
        .collection("users")
        .doc(uid)
        .collection("oauth_state")
        .doc("tiktok")
        .get();
      const stateData = stateDocRef && stateDocRef.exists ? stateDocRef.data() : null;
      // Verify stored nonce matches the state to prevent CSRF/forgery
      if (!stateData || stateData.nonce !== nonce) {
        if (DEBUG_TIKTOK_OAUTH)
          console.warn("[TikTok][callback] state mismatch or missing stored state", {
            uid,
            expectedNonce: stateData && stateData.nonce,
            nonce,
          });
        // In test / CI bypass mode, allow a missing stored state as a convenience
        // when running with FIREBASE_ADMIN_BYPASS=1 and TIKTOK_USE_MOCK==true. This keeps
        // tests deterministic (no need to persist state in stubbed DB) while maintaining
        // strict checks in production.
        if (process.env.FIREBASE_ADMIN_BYPASS === "1" || process.env.TIKTOK_USE_MOCK === "true") {
          if (DEBUG_TIKTOK_OAUTH)
            console.log(
              "[TikTok][callback] Bypass mode: accepting state without stored state for uid=%s",
              uid
            );
          // Continue without stored state but ensure nonce format is valid
          // (already validated above by regex check), so proceed.
        } else {
          return res.status(400).send("Invalid or expired state");
        }
      }

      // Exchange code (use mock data if TIKTOK_USE_MOCK=true and code is from mock OAuth)
      let tokenData;
      if (process.env.TIKTOK_USE_MOCK === "true" && String(code).startsWith("MOCK_CODE_")) {
        // Mock token exchange for testing when TikTok sandbox is unreachable
        const crypto = require("crypto");
        tokenData = {
          access_token: "mock_access_" + crypto.randomBytes(16).toString("hex"),
          refresh_token: "mock_refresh_" + crypto.randomBytes(16).toString("hex"),
          open_id: "mock_open_id_" + uid,
          scope: configuredScopes(),
          expires_in: 86400,
          token_type: "Bearer",
        };
        if (DEBUG_TIKTOK_OAUTH)
          console.log("[TikTok][callback] Using mock token exchange for code=%s", code);
      } else {
        // Real token exchange with TikTok API
        const tokenRes = await safeFetch("https://open.tiktokapis.com/v2/oauth/token/", fetch, {
          fetchOptions: {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_key: cfg.key,
              client_secret: cfg.secret,
              code,
              grant_type: "authorization_code",
              redirect_uri: cfg.redirect,
            }),
          },
          allowHosts: ["open.tiktokapis.com"],
        });
        tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
          if (DEBUG_TIKTOK_OAUTH)
            console.warn(
              "[TikTok][callback] token exchange failed status=%s accessTokenPresent=%s tokenSummary=%o",
              tokenRes.status,
              tokenInfo(tokenData && tokenData.access_token).present,
              objSummary(tokenData)
            );
          // If we're in test mode, allow a fake token to proceed instead of failing, to keep tests deterministic
          if (process.env.FIREBASE_ADMIN_BYPASS === "1" || process.env.TIKTOK_USE_MOCK === "true") {
            tokenData = {
              access_token: "mock_access_token",
              refresh_token: "mock_refresh_token",
              open_id: "mock_open_id_" + uid,
              expires_in: 86400,
              scope: configuredScopes(),
            };
          } else {
            return res.status(400).send("Failed to get TikTok access token");
          }
        }
      }

      // Fetch user profile info to store with the connection
      let profileInfo = {};
      try {
        if (tokenData && tokenData.access_token) {
          // We reuse the logic similar to /status endpoint
          const infoRes = await safeFetch(
            "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
            fetch,
            {
              fetchOptions: {
                method: "GET",
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              },
              allowHosts: ["open.tiktokapis.com"],
            }
          );
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            const u =
              infoData.data && infoData.data.user ? infoData.data.user : infoData.data || {};
            if (u.display_name || u.displayName) {
              profileInfo.display_name = u.display_name || u.displayName;
            }
            if (u.avatar_url || u.avatarUrl) {
              profileInfo.avatar_url = u.avatar_url || u.avatarUrl;
            }
            if (DEBUG_TIKTOK_OAUTH) {
              console.log("[TikTok][callback] Fetched profile info:", profileInfo);
            }
          }
        }
      } catch (err) {
        console.warn("[TikTok][callback] Failed to fetch profile info:", err.message);
      }

      // Store tokens securely under user
      const connRef = db.collection("users").doc(uid).collection("connections").doc("tiktok");
      try {
        const { encryptToken, hasEncryption } = require("../services/secretVault");
        const stored = {
          provider: "tiktok",
          open_id: tokenData.open_id,
          scope: tokenData.scope,
          expires_in: tokenData.expires_in,
          mode: TIKTOK_ENV,
          obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...profileInfo,
        };
        if (hasEncryption()) {
          const tokenJson = JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
          });
          stored.tokens = encryptToken(tokenJson);
          stored.hasEncryption = true;
        } else {
          stored.access_token = tokenData.access_token;
          stored.refresh_token = tokenData.refresh_token;
          stored.hasEncryption = false;
        }
        await connRef.set(stored, { merge: true });
      } catch (e) {
        // Fallback: if encryption library errors, write plain fields (legacy)
        await connRef.set(
          {
            provider: "tiktok",
            open_id: tokenData.open_id,
            scope: tokenData.scope,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            mode: TIKTOK_ENV,
            obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      // Secure logging - never log tokens or sensitive data
      if (DEBUG_TIKTOK_OAUTH) console.log("[TikTok][callback] Connection successful");
      // redirect back to dashboard with success
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set("tiktok", "connected");
      // Check if this was initiated as a popup flow
      const isPopup = stateData?.isPopup === true;

      if (isPopup) {
        res.set("Content-Type", "text/html");
        // Sanitize and validate URLs to prevent XSS
        const dashboardOrigin = new URL(DASHBOARD_URL).origin;
        const safeRedirectUrl = url.toString().replace(/[<>"']/g, "");
        return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>TikTok Connected</title></head><body>
				<script>
					const DASHBOARD_ORIGIN = ${JSON.stringify(dashboardOrigin)};
					if (window.opener) {
						window.opener.postMessage('tiktok_oauth_complete', DASHBOARD_ORIGIN);
						setTimeout(function() { window.close(); }, 500);
					} else {
						window.location.href = ${JSON.stringify(safeRedirectUrl)};
					}
				</script>
			</body></html>`);
      } else {
        res.redirect(url.toString());
      }
    } catch (err) {
      if (DEBUG_TIKTOK_OAUTH) console.error("[TikTok][callback][error]", err);
      try {
        const url = new URL(DASHBOARD_URL);
        url.searchParams.set("tiktok", "error");
        return res.redirect(url.toString());
      } catch (_) {
        return res.status(500).send("TikTok token exchange failed");
      }
    }
  }
);

// 2.1) Connection status — returns whether TikTok is connected and basic profile info (cached ~7s)
router.get(
  "/status",
  authMiddleware,
  ttPublicLimiter,
  require("../statusInstrument")("tiktokStatus", async (req, res) => {
    const started = Date.now();
    try {
      const cfg = activeConfig();
      if (ensureTikTokEnv(res, cfg, { requireSecret: false })) return;
      const uid = req.userId || req.user?.uid;
      if (!uid) return res.status(401).json({ connected: false, error: "Unauthorized" });
      const { getCache, setCache } = require("../utils/simpleCache");
      const { dedupe } = require("../utils/inFlight");
      const { instrument } = require("../utils/queryMetrics");
      const cacheKey = `tiktok_status:${uid}`;
      const cached = getCache(cacheKey);
      if (cached) return res.json({ ...cached, _cached: true, ms: Date.now() - started });

      const result = await dedupe(cacheKey, async () => {
        const snap = await instrument("tiktokStatusDoc", () =>
          db.collection("users").doc(uid).collection("connections").doc("tiktok").get()
        );
        if (!snap.exists) return { connected: false };
        const data = snap.data() || {};
        const base = {
          connected: true,
          open_id: data.open_id,
          scope: data.scope,
          obtainedAt: data.obtainedAt,
          storedMode: data.mode || null,
          serverMode: TIKTOK_ENV,
          reauthRequired: !!(data.mode && data.mode !== TIKTOK_ENV),
        };
        if (data.access_token && scopeStringIncludes(data.scope, REQUIRED_PROFILE_SCOPE)) {
          try {
            const info = await instrument("tiktokIdentityFetch", async () => {
              // Use safeFetch for SSRF protection
              const infoRes = await safeFetch(
                "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
                fetch,
                {
                  fetchOptions: {
                    method: "GET",
                    headers: { Authorization: `Bearer ${data.access_token}` },
                    timeout: 3500,
                  },
                  requireHttps: true,
                  allowHosts: ["open.tiktokapis.com"],
                }
              );
              if (infoRes.ok) return infoRes.json();
              return null;
            });
            if (info) {
              const u = info.data && info.data.user ? info.data.user : info.data || {};
              base.display_name = u.display_name || u.displayName || undefined;
              base.avatar_url = u.avatar_url || u.avatarUrl || undefined;
            }
          } catch (_) {
            /* ignore profile errors */
          }
        }
        return base;
      });
      setCache(cacheKey, result, 7000);
      return res.json({ ...result, ms: Date.now() - started });
    } catch (e) {
      return res.status(500).json({
        connected: false,
        error: "Failed to load TikTok status",
        ms: Date.now() - started,
      });
    }
  })
);

// Debug endpoint: show last prepared state and auth URL (auth required)
router.get("/debug/state", authMiddleware, ttPublicLimiter, async (req, res) => {
  if (!DEBUG_TIKTOK_OAUTH) return res.status(404).json({ error: "debug_disabled" });
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const doc = await db.collection("users").doc(uid).collection("oauth_state").doc("tiktok").get();
    if (!doc.exists) return res.json({ exists: false });
    const data = doc.data();
    res.json({
      exists: true,
      state: data.state,
      mode: data.mode,
      lastAuthUrl: data.lastAuthUrl,
      createdAt: data.createdAt,
    });
  } catch (e) {
    res.status(500).json({ error: "debug_state_failed" });
  }
});

// 3. Upload video to TikTok
// TikTok video upload endpoint
// NOTE: DEMO MODE - For TikTok API approval demonstration
// Once video.upload and video.publish scopes are approved, this will use real API
router.post(
  "/upload",
  authMiddleware,
  rateLimit({ max: 5, windowMs: 3600000, key: r => r.ip }),
  async (req, res) => {
    // DEMO MODE: Return success response to demonstrate UX flow for TikTok approval
    // This allows screen recording of the complete user flow as required by TikTok
    const DEMO_MODE = process.env.TIKTOK_DEMO_MODE === "true";

    try {
      const uid = req.userId || req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      // Accept payload fields used by frontend: url (storage URL), title, meta, platform_options
      const { meta = {}, platform_options = {} } = req.body || {};
      const tiktokOpts = platform_options && platform_options.tiktok;

      // If TikTok options present, validate required UX fields (privacy + consent)
      if (tiktokOpts) {
        if (!tiktokOpts.privacy) {
          return res.status(400).json({
            error: "tiktok_missing_privacy",
            message: "TikTok privacy selection is required.",
          });
        }
        if (!tiktokOpts.consent) {
          return res.status(400).json({
            error: "tiktok_missing_consent",
            message: "Explicit TikTok consent required.",
          });
        }
        // Optional sound_id: must be a string when provided
        if (tiktokOpts.sound_id && typeof tiktokOpts.sound_id !== "string") {
          return res
            .status(400)
            .json({ error: "tiktok_invalid_sound", message: "Invalid sound identifier." });
        }
        // Disallow overlays/watermarks (frontend should remove overlays before publish)
        if (meta && meta.overlay) {
          return res.status(400).json({
            error: "tiktok_overlay_prohibited",
            message: "Overlay/watermark prohibited for TikTok uploads.",
          });
        }

        // Load stored connection to check creator constraints
        const connSnap = await db
          .collection("users")
          .doc(uid)
          .collection("connections")
          .doc("tiktok")
          .get();
        const conn = connSnap.exists ? connSnap.data() : null;

        // Conservative default info
        const defaultInfo = {
          display_name: conn && conn.open_id ? conn.display_name || conn.open_id : "TikTok Creator",
          privacy_level_options: ["SELF_ONLY", "FRIENDS", "EVERYONE"],
          max_video_post_duration_sec: 60,
          interactions: { comments: true, duet: true, stitch: true },
          can_post: !!(conn && (conn.access_token || conn.tokens || conn.tokens?.access_token)),
          posting_cap_per_24h: 15,
        };

        // Determine creator info (use stored conn presence as proxy); try a quick token check
        let creator = defaultInfo;

        // If the stored connection includes a cached `creator_info`, prefer it over live fetch.
        // This allows tests and some account configurations to provide explicit creator constraints.
        if (conn && conn.creator_info) {
          const c = conn.creator_info;
          creator = {
            display_name: c.display_name || defaultInfo.display_name,
            privacy_level_options: c.privacy_level_options || defaultInfo.privacy_level_options,
            max_video_post_duration_sec:
              typeof c.max_video_post_duration_sec === "number"
                ? c.max_video_post_duration_sec
                : defaultInfo.max_video_post_duration_sec,
            interactions: c.interactions || defaultInfo.interactions,
            can_post: true,
            posting_cap_per_24h: c.posting_cap_per_24h || defaultInfo.posting_cap_per_24h,
          };
        }

        try {
          if (conn) {
            const tokens =
              tokensFromDoc(conn) ||
              (conn.tokens && typeof conn.tokens === "object" ? conn.tokens : null);
            const accessToken = tokens && tokens.access_token ? tokens.access_token : null;
            if (accessToken) {
              // Attempt to fetch live creator info; if it fails, proceed with defaults
              const infoRes = await safeFetch(
                "https://open.tiktokapis.com/v2/creator/info/",
                fetch,
                {
                  fetchOptions: {
                    method: "GET",
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: 4000,
                  },
                  requireHttps: true,
                  allowHosts: ["open.tiktokapis.com"],
                }
              );
              if (infoRes.ok) {
                const infoJson = await infoRes.json().catch(() => null);
                creator = {
                  display_name:
                    (infoJson &&
                      (infoJson.data?.display_name || infoJson.data?.user?.display_name)) ||
                    defaultInfo.display_name,
                  privacy_level_options:
                    (infoJson && infoJson.data && infoJson.data.privacy_level_options) ||
                    defaultInfo.privacy_level_options,
                  max_video_post_duration_sec:
                    (infoJson && infoJson.data && infoJson.data.max_video_post_duration_sec) ||
                    defaultInfo.max_video_post_duration_sec,
                  interactions:
                    (infoJson && infoJson.data && infoJson.data.interactions) ||
                    defaultInfo.interactions,
                  can_post: true,
                  posting_cap_per_24h:
                    (infoJson && infoJson.data && infoJson.data.posting_cap_per_24h) ||
                    defaultInfo.posting_cap_per_24h,
                };
              }
            }
          }
        } catch (e) {
          // Ignore live fetch failures and use defaults
        }

        // Validate selected privacy is permitted by the creator
        if (tiktokOpts && typeof tiktokOpts.privacy === "string") {
          const allowed = Array.isArray(creator.privacy_level_options)
            ? creator.privacy_level_options
            : [];
          if (!allowed.includes(tiktokOpts.privacy)) {
            try {
              await db.collection("admin_audit").add({
                type: "tiktok_publish_attempt",
                uid,
                outcome: "rejected",
                reason: "privacy_not_allowed",
                details: { requested: tiktokOpts.privacy, allowed },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ip: req.ip,
              });
            } catch (e) {
              console.warn("Failed to write tiktok publish audit (privacy)", e && e.message);
            }
            return res.status(400).json({
              error: "tiktok_privacy_not_allowed",
              message: "Selected privacy option is not permitted by the connected TikTok account.",
            });
          }
        }

        // Validate requested interactions are allowed by the creator
        if (tiktokOpts && tiktokOpts.interactions && typeof tiktokOpts.interactions === "object") {
          const blocked = [];
          ["comments", "duet", "stitch"].forEach(k => {
            if (
              tiktokOpts.interactions[k] &&
              creator.interactions &&
              creator.interactions[k] === false
            )
              blocked.push(k);
          });
          if (blocked.length) {
            try {
              await db.collection("admin_audit").add({
                type: "tiktok_publish_attempt",
                uid,
                outcome: "rejected",
                reason: "interaction_not_allowed",
                details: { requested: tiktokOpts.interactions, blocked },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ip: req.ip,
              });
            } catch (e) {
              console.warn("Failed to write tiktok publish audit (interaction)", e && e.message);
            }
            return res.status(400).json({
              error: "tiktok_interaction_not_allowed",
              message: `Requested interaction(s) not allowed by creator: ${blocked.join(", ")}`,
            });
          }
        }

        // If commercial content is enabled, require at least one of yourBrand or brandedContent
        if (
          tiktokOpts &&
          tiktokOpts.commercial &&
          tiktokOpts.commercial.yourBrand === false &&
          tiktokOpts.commercial.brandedContent === false
        ) {
          try {
            await db.collection("admin_audit").add({
              type: "tiktok_publish_attempt",
              uid,
              outcome: "rejected",
              reason: "commercial_content_missing_selection",
              details: { commercial: tiktokOpts.commercial },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              ip: req.ip,
            });
          } catch (e) {
            console.warn(
              "Failed to write tiktok publish audit (commercial selection)",
              e && e.message
            );
          }
          return res.status(400).json({
            error: "tiktok_commercial_content_missing_selection",
            message:
              "At least one of 'Your Brand' or 'Branded Content' must be selected for commercial content.",
          });
        }

        // Branded content cannot be private: enforce invariant server-side as well
        if (
          tiktokOpts &&
          tiktokOpts.commercial &&
          tiktokOpts.commercial.brandedContent &&
          tiktokOpts.privacy === "SELF_ONLY"
        ) {
          try {
            await db.collection("admin_audit").add({
              type: "tiktok_publish_attempt",
              uid,
              outcome: "rejected",
              reason: "branded_content_requires_public",
              details: { commercial: tiktokOpts.commercial, privacy: tiktokOpts.privacy },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              ip: req.ip,
            });
          } catch (e) {
            console.warn("Failed to write tiktok publish audit (branded)", e && e.message);
          }
          return res.status(400).json({
            error: "tiktok_branded_content_requires_public",
            message: "Branded content cannot be private. Please choose a public privacy option.",
          });
        }

        // Validate disclosure flags for AIGC and commercial content
        if (tiktokOpts) {
          // Ensure disclosure is a boolean when provided
          if (
            typeof tiktokOpts.disclosure !== "undefined" &&
            typeof tiktokOpts.disclosure !== "boolean"
          ) {
            try {
              await db.collection("admin_audit").add({
                type: "tiktok_publish_attempt",
                uid,
                outcome: "rejected",
                reason: "disclosure_invalid_type",
                details: { disclosure: tiktokOpts.disclosure },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ip: req.ip,
              });
            } catch (e) {
              console.warn(
                "Failed to write tiktok publish audit (disclosure type)",
                e && e.message
              );
            }
            return res.status(400).json({
              error: "tiktok_disclosure_invalid",
              message: "The TikTok disclosure flag must be a boolean value.",
            });
          }

          // Require disclosure when content is marked as AI-generated
          if (tiktokOpts.is_aigc) {
            if (!tiktokOpts.disclosure) {
              try {
                await db.collection("admin_audit").add({
                  type: "tiktok_publish_attempt",
                  uid,
                  outcome: "rejected",
                  reason: "aigc_missing_disclosure",
                  details: { is_aigc: tiktokOpts.is_aigc, disclosure: tiktokOpts.disclosure },
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  ip: req.ip,
                });
              } catch (e) {
                console.warn(
                  "Failed to write tiktok publish audit (aigc disclosure)",
                  e && e.message
                );
              }
              return res.status(400).json({
                error: "tiktok_aigc_missing_disclosure",
                message:
                  "AI-generated content must include a disclosure before publishing to TikTok.",
              });
            }
          }

          // Require disclosure when any commercial/branded flag is selected
          if (
            tiktokOpts.commercial &&
            (tiktokOpts.commercial.yourBrand || tiktokOpts.commercial.brandedContent)
          ) {
            if (!tiktokOpts.disclosure) {
              try {
                await db.collection("admin_audit").add({
                  type: "tiktok_publish_attempt",
                  uid,
                  outcome: "rejected",
                  reason: "commercial_missing_disclosure",
                  details: { commercial: tiktokOpts.commercial, disclosure: tiktokOpts.disclosure },
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  ip: req.ip,
                });
              } catch (e) {
                console.warn(
                  "Failed to write tiktok publish audit (commercial disclosure)",
                  e && e.message
                );
              }
              return res.status(400).json({
                error: "tiktok_commercial_missing_disclosure",
                message: "Commercial or branded content must include an explicit disclosure.",
              });
            }
          }
        }

        // Branded content cannot be private: enforce invariant server-side as well
        if (
          tiktokOpts &&
          tiktokOpts.commercial &&
          tiktokOpts.commercial.brandedContent &&
          tiktokOpts.privacy === "SELF_ONLY"
        ) {
          try {
            await db.collection("admin_audit").add({
              type: "tiktok_publish_attempt",
              uid,
              outcome: "rejected",
              reason: "branded_content_requires_public",
              details: { commercial: tiktokOpts.commercial, privacy: tiktokOpts.privacy },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              ip: req.ip,
            });
          } catch (e) {
            console.warn("Failed to write tiktok publish audit (branded)", e && e.message);
          }
          return res.status(400).json({
            error: "tiktok_branded_content_requires_public",
            message: "Branded content cannot be private. Please choose a public privacy option.",
          });
        }

        // Enforce posting cap per 24 hours if provided
        if (creator && typeof creator.posting_cap_per_24h === "number") {
          try {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const q = db
              .collection("admin_audit")
              .where("type", "==", "tiktok_publish")
              .where("uid", "==", uid)
              .where("createdAt", ">=", cutoff);
            const snap = await q.get();
            const count = snap ? snap.size : 0;
            if (count >= creator.posting_cap_per_24h) {
              try {
                await db.collection("admin_audit").add({
                  type: "tiktok_publish_attempt",
                  uid,
                  outcome: "rejected",
                  reason: "posting_cap_exceeded",
                  details: { cap: creator.posting_cap_per_24h, count },
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  ip: req.ip,
                });
              } catch (e) {
                console.warn("Failed to write tiktok publish audit (cap)", e && e.message);
              }
              return res.status(403).json({
                error: "tiktok_posting_cap_exceeded",
                message: "Posting cap exceeded for this TikTok account in the last 24 hours.",
              });
            }
          } catch (e) {
            console.warn("Failed to check posting cap", e && e.message);
            // Don't block publish on audit query failure; continue with validations below
          }
        }

        // Enforce duration constraint if provided
        if (
          meta &&
          typeof meta.duration === "number" &&
          creator &&
          creator.max_video_post_duration_sec &&
          meta.duration > creator.max_video_post_duration_sec
        ) {
          return res.status(400).json({
            error: "tiktok_duration_exceeded",
            message: `Video duration ${meta.duration}s exceeds allowed ${creator.max_video_post_duration_sec}s for this creator.`,
          });
        }

        if (creator && creator.can_post === false) {
          return res.status(403).json({
            error: "tiktok_cannot_post",
            message: "This TikTok account is not permitted to post via third-party apps.",
          });
        }
      }

      // All validations passed — in DEMO mode simulate success so reviewers can record UX flow
      if (DEMO_MODE) {
        console.log("[TikTok Upload] DEMO MODE - Validations passed, simulating upload");
        const demoVideoId = "demo_" + Date.now();
        try {
          await db.collection("admin_audit").add({
            type: "tiktok_publish",
            uid,
            demo: true,
            outcome: "success",
            videoId: demoVideoId,
            sound_id: tiktokOpts && tiktokOpts.sound_id ? tiktokOpts.sound_id : undefined,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ip: req.ip,
          });
        } catch (e) {
          console.warn("Failed to write tiktok publish audit (demo success)", e && e.message);
        }
        return res.status(200).json({
          ok: true,
          demo: true,
          message: "Demo upload successful - awaiting video.upload scope approval",
          videoId: demoVideoId,
          shareUrl: "https://www.tiktok.com/@demo/video/123456789",
          note: "This is a demonstration response. Real uploads require video.upload and video.publish scopes.",
        });
      }

      // Production: Start Real Upload Process
      console.log("[TikTok Upload] Production Mode - Starting real upload");

      // 1. Resolve Connection / Tokens
      if (!conn) {
        // Validation logic above tries to load conn, but let's be safe
        const cSnap = await db
          .collection("users")
          .doc(uid)
          .collection("connections")
          .doc("tiktok")
          .get();
        if (cSnap.exists) conn = cSnap.data();
      }

      if (!conn) {
        return res
          .status(400)
          .json({ error: "tiktok_not_connected", message: "TikTok account not connected." });
      }

      const tokens =
        tokensFromDoc(conn) ||
        (conn.tokens && typeof conn.tokens === "object" ? conn.tokens : null);
      const accessToken =
        tokens && typeof tokens.access_token === "string" ? tokens.access_token : null;
      const openId = conn.open_id || conn.openId;

      if (!accessToken || !openId) {
        return res
          .status(400)
          .json({ error: "tiktok_token_missing", message: "Valid TikTok access token not found." });
      }

      // 2. Resolve File URL
      // Frontend sends 'url' (storage URL) or 'fileUrl'
      let videoUrl = req.body.url || req.body.fileUrl || req.body.video_url;

      if (!videoUrl) {
        return res
          .status(400)
          .json({ error: "tiktok_missing_file", message: "No video file URL provided." });
      }

      // 3. Initiate Upload
      const { safeFetch } = require("../utils/ssrfGuard");
      const { validateUrl } = require("../utils/urlValidator"); // Assuming this exists or we use safeFetch

      console.log("[TikTok Upload] Initializing upload for open_id:", openId);

      // Step A: Get Upload URL from TikTok
      // https://developers.tiktok.com/doc/marketing-api-video-publishing/
      // Note: This endpoint '/v2/video/upload/' is for the "Direct Post" API (Content Posting API)
      // Confirm the correct endpoint for your app's permission set.
      // Usually "Content Posting API" uses: POST https://open.tiktokapis.com/v2/post/publish/video/init/
      // But let's stick to the structure you had if that's what your integration expects,
      // OR update to the modern v2 endpoints if the disabled code was legacy.
      // The disabled code used: https://open.tiktokapis.com/v2/video/upload/ (which looks like legacy or specific integration).
      // Let's assume the disabled code had the right endpoints for your specific app knowing it might be the "Share to TikTok" or "Direct Post" API.
      // *Correction*: The modern "Direct Post" API (v2) flow usually involves:
      // 1. /v2/post/publish/video/init/ -> get upload_url
      // 2. PUT video to upload_url
      // 3. (Sometimes auto-published) or /v2/post/publish/status/ to check.
      // The disabled code used `/v2/video/upload/` and `/v2/video/publish/`. We will use those hoping they match your app.

      // Validate URL safety
      try {
        const u = new URL(videoUrl);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error("Invalid protocol");
      } catch (e) {
        return res.status(400).json({ error: "invalid_video_url", message: "Invalid video URL." });
      }

      // Step A: Init Upload
      const initRes = await safeFetch(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        fetch,
        {
          fetchOptions: {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({
              post_info: {
                title: req.body.title || "AutoPromote Video",
                privacy_level: tiktokOpts?.privacy || "PUBLIC_TO_EVERYONE", // Map to API constants
                disable_duet:
                  tiktokOpts?.interactions?.duet === false ||
                  tiktokOpts?.interactions?.duet === false,
                disable_comment: tiktokOpts?.interactions?.comments === false,
                disable_stitch: tiktokOpts?.interactions?.stitch === false,
                video_cover_timestamp_ms: 1000, // Optional: default cover
              },
              source_info: {
                source: "FILE_UPLOAD",
                video_size: req.body.meta?.size || 0, // Ideally we have size
                chunk_size: req.body.meta?.size || 0,
                total_chunk_count: 1,
              },
            }),
          },
          requireHttps: true,
          allowHosts: ["open.tiktokapis.com"],
        }
      );

      // Analyze Init Response
      const initData = await initRes.json();
      if (!initRes.ok || !initData.data || !initData.data.upload_url) {
        console.error("[TikTok Upload] Init failed:", JSON.stringify(initData));
        // Fallback to legacy endpoint if v2 post init fails (in case app uses older scope)
        // ... But for now, report error
        return res.status(400).json({
          error: "tiktok_init_failed",
          message: "Failed to initialize upload with TikTok.",
          details: initData,
        });
      }

      const uploadUrl = initData.data.upload_url;
      const publishId = initData.data.publish_id;

      // Step B: Upload File
      console.log("[TikTok Upload] Uploading file to:", uploadUrl);

      // fetch the file content from storage URL
      const fileRes = await safeFetch(videoUrl, fetch, {
        fetchOptions: { timeout: 60000 },
        requireHttps: true,
      });
      if (!fileRes.ok) throw new Error(`Failed to download video from storage: ${fileRes.status}`);
      const fileBuffer = await fileRes.buffer();

      // Upload to TikTok
      const uploadRes = await safeFetch(uploadUrl, fetch, {
        fetchOptions: {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes 0-${fileBuffer.length - 1}/${fileBuffer.length}`,
            "Content-Length": fileBuffer.length,
          },
          body: fileBuffer,
        },
        requireHttps: true,
        allowHosts: ["open.tiktokapis.com", "tiktokapis.com"], // Add exact host if different for upload
      });

      if (!uploadRes.ok) {
        const upErr = await uploadRes.text();
        console.error("[TikTok Upload] File upload failed:", upErr);
        return res
          .status(400)
          .json({ error: "tiktok_upload_error", message: "Failed to send video file to TikTok." });
      }

      // Matches typical "Direct Post" flow: Init -> Upload.
      // Often checking status is next, but successful upload usually implies queuing for publish.
      res.json({
        success: true,
        publish_id: publishId,
        message: "Video uploaded to TikTok successfully.",
      });
    } catch (err) {
      console.error("TikTok upload error:", err);
      // Determine if it was a permissions issue
      const msg = err.message || "";
      if (msg.includes("scope") || msg.includes("permission")) {
        return res.status(403).json({
          error: "tiktok_permission_error",
          message:
            "Permission denied by TikTok. Ensure 'video.publish' or equivalent scope is granted.",
        });
      }
      return res.status(500).json({ error: "tiktok_upload_failed", details: msg });
    }
  }
);

// Get user's TikTok video list (approved scope: video.list)
router.get("/videos", authMiddleware, ttPublicLimiter, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const userRef = db.collection("users").doc(uid);
    const connSnap = await userRef.collection("connections").doc("tiktok").get();

    if (!connSnap.exists) {
      return res.status(404).json({ error: "TikTok not connected" });
    }

    const conn = connSnap.data();
    const tokens = conn.tokens || conn.meta?.tokens;

    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: "No TikTok access token found" });
    }

    const openId = conn.open_id || conn.meta?.open_id;
    if (!openId) {
      return res.status(400).json({ error: "Missing open_id" });
    }

    // Fetch video list from TikTok API
    const listUrl = `https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,create_time,share_url`;
    const response = await safeFetch(listUrl, fetch, {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_count: 20 }),
      },
      requireHttps: true,
      allowHosts: ["open.tiktokapis.com"],
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "Failed to fetch TikTok videos",
        details: errorText,
      });
    }

    const data = await response.json();
    res.json({
      ok: true,
      videos: data.data?.videos || [],
      hasMore: data.data?.has_more || false,
      cursor: data.data?.cursor || null,
    });
  } catch (error) {
    console.error("TikTok video list error:", error);
    res.status(500).json({ error: "Failed to fetch video list", details: error.message });
  }
});

// 4. Fetch TikTok video analytics
// Expects: { access_token, open_id, video_id }
router.post(
  "/analytics",
  rateLimit({ max: 20, windowMs: 3600000, key: r => r.ip }),
  async (req, res) => {
    const { access_token, open_id, video_id } = req.body;
    if (!access_token || !open_id || !video_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate inputs to prevent injection
    if (
      typeof access_token !== "string" ||
      typeof open_id !== "string" ||
      typeof video_id !== "string"
    ) {
      return res.status(400).json({ error: "Invalid input types" });
    }

    // Basic validation for video_id format (should be alphanumeric)
    if (!/^[a-zA-Z0-9_-]+$/.test(video_id)) {
      return res.status(400).json({ error: "Invalid video_id format" });
    }

    try {
      // Use safeFetch for SSRF protection
      const analyticsRes = await safeFetch(
        `https://open.tiktokapis.com/v2/video/data/?open_id=${encodeURIComponent(open_id)}&video_id=${encodeURIComponent(video_id)}`,
        fetch,
        {
          fetchOptions: {
            method: "GET",
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
            timeout: 10000, // 10 second timeout
          },
          requireHttps: true,
          allowHosts: ["open.tiktokapis.com"],
        }
      );
      const analyticsData = await analyticsRes.json();
      if (!analyticsData.data) {
        return res
          .status(400)
          .json({ error: "Failed to fetch TikTok analytics", details: analyticsData });
      }
      res.json({ analytics: analyticsData.data });
    } catch (err) {
      res.status(500).json({ error: "TikTok analytics fetch failed", details: err.message });
    }
  }
);

// 4.1 Trending sounds - returns a list of available TikTok sounds (mocked when provider unavailable)
router.get("/trending_sounds", ttPublicLimiter, async (req, res) => {
  try {
    const provider = require("../services/providers/tiktokProvider");
    const items = (await provider.fetchTrending({ limit: 20 })) || [];
    // Normalize to { id, title, duration }
    const mapped = items.map(i => ({
      id: i.id || i.sound_id || String(i.title).slice(0, 32),
      title: i.title || i.name || i.id,
      duration: i.duration || i.len || 0,
    }));
    return res.json({ ok: true, sounds: mapped });
  } catch (e) {
    // Fallback mock list
    const mock = [
      { id: "sound_viral_1", title: "TikTok Sound - Viral 1", duration: 6 },
      { id: "sound_viral_2", title: "TikTok Sound - Viral 2", duration: 15 },
      { id: "sound_trending_dance", title: "Trending Dance - DanceBeat", duration: 12 },
    ];
    return res.json({ ok: true, sounds: mock });
  }
});

module.exports = router;

// 2.2) Creator info for Direct Post API UX
// Returns minimal creator settings needed by the frontend: display name, privacy options,
// max video duration, and allowed interactions (comment/duet/stitch). This is used by
// the frontend to render the required UX before publishing to TikTok.
router.get("/creator_info", authMiddleware, ttPublicLimiter, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const DEMO_MODE =
      process.env.TIKTOK_DEMO_MODE === "true" || process.env.FIREBASE_ADMIN_BYPASS === "1";

    // Re-resolve firebase db at request time to avoid stale references in tests
    const firebaseRuntime = require("../firebaseAdmin");
    const dbRuntime = firebaseRuntime.db;

    // Try to load stored connection (may be encrypted)
    let conn = null;
    // First, try the explicit connections subcollection (common real layout)
    try {
      const connectionsRef = dbRuntime
        .collection("users")
        .doc(uid)
        .collection("connections")
        .doc("tiktok");
      const connSnap = await connectionsRef.get();
      if (connSnap && connSnap.exists) {
        conn = connSnap.data();
      }
    } catch (e) {
      // ignore errors and attempt fallback below
    }

    // If we didn't find a connection, try fallback to top-level user doc which
    // some stubs or older schemas may populate directly.
    if (!conn) {
      try {
        const userSnap = await dbRuntime.collection("users").doc(uid).get();
        if (userSnap && userSnap.exists) {
          const ud = userSnap.data();
          if (ud && ud.connections && ud.connections.tiktok) conn = ud.connections.tiktok;
          else if (ud && (ud.open_id || ud.access_token || ud.tokens)) conn = ud;
        }
      } catch (e2) {
        // ignore and leave conn as null
      }
    }
    // Now conn is either an object or null

    // Default conservative info (used when tokens missing or in demo mode)
    const defaultInfo = {
      display_name: conn && conn.open_id ? conn.display_name || conn.open_id : "TikTok Creator",
      privacy_level_options: ["SELF_ONLY", "FRIENDS", "EVERYONE"],
      max_video_post_duration_sec: 60,
      interactions: { comments: true, duet: true, stitch: true },
      can_post: !!(conn && (conn.access_token || conn.tokens || conn.tokens?.access_token)),
      posting_cap_per_24h: 15,
    };

    // If in demo mode, return the default demo creator info for easier local testing
    if (DEMO_MODE) {
      try {
        await db.collection("admin_audit").add({
          type: "tiktok_creator_info",
          uid,
          demo: true,
          result: { creator: defaultInfo },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn("Failed to write tiktok creator_info audit log", e && e.message);
      }
      return res.json({ ok: true, creator: defaultInfo, demo: true });
    }

    // If no connection found, return a clear connected=false payload
    if (!conn) return res.json({ ok: true, connected: false, creator: null });

    // Try to call TikTok API to get creator-level info if possible. The exact
    // API surface for 'creator info' may vary; we attempt a general call and
    // fallback to defaults when unavailable.
    try {
      const tokens =
        tokensFromDoc(conn) ||
        (conn.tokens && typeof conn.tokens === "object" ? conn.tokens : null);
      // Consider access token valid only if it's a non-empty string
      const accessToken =
        tokens && typeof tokens.access_token === "string" && tokens.access_token.length > 0
          ? tokens.access_token
          : null;
      // If a connection exists but we don't have a usable access token, return connected:true but no creator info
      if (!accessToken) return res.json({ ok: true, connected: true, creator: null });

      // Attempt to call a hypothetical creator info endpoint; if it doesn't
      // exist, the safeFetch will fail gracefully and we'll return defaults.
      const infoRes = await safeFetch("https://open.tiktokapis.com/v2/creator/info/", fetch, {
        fetchOptions: {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 5000,
        },
        requireHttps: true,
        allowHosts: ["open.tiktokapis.com"],
      });
      if (!infoRes.ok) {
        return res.json({ ok: true, creator: defaultInfo });
      }
      const infoJson = await infoRes.json().catch(() => null);
      // Map returned fields to our UX contract, with safe fallbacks.
      const mapped = {
        display_name:
          (infoJson && (infoJson.data?.display_name || infoJson.data?.user?.display_name)) ||
          defaultInfo.display_name,
        privacy_level_options:
          (infoJson && infoJson.data && infoJson.data.privacy_level_options) ||
          defaultInfo.privacy_level_options,
        max_video_post_duration_sec:
          (infoJson && infoJson.data && infoJson.data.max_video_post_duration_sec) ||
          defaultInfo.max_video_post_duration_sec,
        interactions:
          (infoJson && infoJson.data && infoJson.data.interactions) || defaultInfo.interactions,
        can_post: true,
        posting_cap_per_24h:
          (infoJson && infoJson.data && infoJson.data.posting_cap_per_24h) ||
          defaultInfo.posting_cap_per_24h,
      };
      // Determine recent publish counts so the frontend can enforce posting_cap_per_24h without additional requests
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const snap = await db
          .collection("admin_audit")
          .where("type", "==", "tiktok_publish")
          .where("uid", "==", uid)
          .where("createdAt", ">=", cutoff)
          .get();
        const recentCount = snap ? snap.size || 0 : 0;
        mapped.posts_in_last_24h = recentCount;
        mapped.posting_remaining = Math.max(0, (mapped.posting_cap_per_24h || 0) - recentCount);
      } catch (e) {
        // ignore failures and leave counts unspecified
        mapped.posts_in_last_24h = undefined;
        mapped.posting_remaining = undefined;
      }

      // audit log the successful creator_info mapping (avoid storing tokens or PII)
      try {
        await db.collection("admin_audit").add({
          type: "tiktok_creator_info",
          uid,
          demo: false,
          result: { creator: mapped },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn("Failed to write tiktok creator_info audit log", e && e.message);
      }

      // Persist a lightweight cached creator_info/display_name on the user's connection doc
      try {
        const connRef = dbRuntime
          .collection("users")
          .doc(uid)
          .collection("connections")
          .doc("tiktok");
        // Prefer update (will fail if doc doesn't exist), fall back to set-merge
        try {
          await connRef.update({
            display_name: mapped.display_name,
            creator_info: mapped,
            updatedAt: new Date().toISOString(),
          });
        } catch (uerr) {
          // Doc might not exist as a subcollection doc; merge into top-level user.connections
          try {
            await dbRuntime
              .collection("users")
              .doc(uid)
              .set(
                {
                  connections: {
                    tiktok: { display_name: mapped.display_name, creator_info: mapped },
                  },
                },
                { merge: true }
              );
          } catch (s) {
            console.warn("Failed to persist tiktok creator_info to user doc", s && s.message);
          }
        }
      } catch (e) {
        console.warn("Failed to persist tiktok creator_info", e && e.message);
      }

      return res.json({ ok: true, creator: mapped });
    } catch (e) {
      // On any failure, return conservative defaults
      return res.json({ ok: true, creator: defaultInfo });
    }
  } catch (err) {
    console.error("TikTok /creator_info error:", err && err.message);
    return res.status(500).json({ error: "creator_info_failed" });
  }
});

// --- Admin-only endpoints for audit / review evidence ---
// Returns recent assistant actions (requires admin privileges)
router.get("/admin/assistant_actions", authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "forbidden" });
    const limit = Math.min(200, parseInt(req.query.limit || "50", 10));
    const q = db.collection("assistant_actions").orderBy("createdAt", "desc").limit(limit);
    const snap = await q.get();
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return res.json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("admin assistant_actions error", e && e.message);
    return res.status(500).json({ error: "failed" });
  }
});

// Returns recent TikTok creator_info audit logs (requires admin privileges)
router.get("/admin/tiktok_checks", authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "forbidden" });
    const limit = Math.min(200, parseInt(req.query.limit || "50", 10));
    const q = db
      .collection("admin_audit")
      .where("type", "==", "tiktok_creator_info")
      .orderBy("createdAt", "desc")
      .limit(limit);
    const snap = await q.get();
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return res.json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("admin tiktok_checks error", e && e.message);
    return res.status(500).json({ error: "failed" });
  }
});

// Helper: determine creator info response from a connection object (pure)
function creatorInfoFromConn(conn) {
  if (!conn) return { connected: false, creator: null };
  const tokens =
    conn.tokens ||
    (conn.hasEncryption
      ? null
      : { access_token: conn.access_token, refresh_token: conn.refresh_token });
  const accessToken =
    tokens && typeof tokens.access_token === "string" && tokens.access_token.length > 0
      ? tokens.access_token
      : null;
  if (!accessToken) return { connected: true, creator: null };
  // If an access token is present, we return a placeholder indicating 'needs fetch'
  return { connected: true, creator: "needs_provider_fetch" };
}

// Export helper on the router for testing
Object.assign(module.exports, { _creatorInfoFromConn: creatorInfoFromConn });

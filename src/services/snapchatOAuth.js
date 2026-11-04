const crypto = require("crypto");

const LOGIN_SCOPES = {
  display_name: "https://auth.snapchat.com/oauth2/api/user.display_name",
  external_id: "https://auth.snapchat.com/oauth2/api/user.external_id",
  "bitmoji.avatar": "https://auth.snapchat.com/oauth2/api/user.bitmoji.avatar",
  camkit_lens_push_to_device: "https://auth.snapchat.com/oauth2/api/camkit_lens_push_to_device",
};
const MARKETING_SCOPES = ["snapchat-marketing-api"];
const aliases = {
  ...LOGIN_SCOPES,
  ...Object.fromEntries(MARKETING_SCOPES.map(scope => [scope, scope])),
  // Repair the former invented Marketing scope URL; do not request a different product.
  "https://auth.snapchat.com/oauth2/api/marketing-api": "snapchat-marketing-api",
};
const allowed = new Set([...Object.values(LOGIN_SCOPES), ...MARKETING_SCOPES]);
function normalizeScopes(input) {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[ ,]+/);
  const scopeList = [
    ...new Set(
      raw
        .filter(value => typeof value === "string")
        .map(value => {
          const scope = value.trim();
          return (
            aliases[scope] || aliases[scope.toLowerCase()] || (allowed.has(scope) ? scope : null)
          );
        })
        .filter(Boolean)
    ),
  ];
  return { scopeList, scope: scopeList.join(" ") };
}
function invalid(code) {
  throw Object.assign(new Error(code), { code });
}

function createRequest(cfg, input, now = Date.now()) {
  const normalized = normalizeScopes(input || "snapchat-marketing-api");
  if (!normalized.scopeList.length) invalid("SNAPCHAT_INVALID_SCOPE");
  const login = normalized.scopeList.some(scope => scope.startsWith("https://auth.snapchat.com/"));
  if (login && normalized.scopeList.some(scope => MARKETING_SCOPES.includes(scope))) {
    invalid("SNAPCHAT_MIXED_OAUTH_PRODUCTS");
  }
  const product = login ? "login_kit" : "marketing";
  // A public Login Kit client uses PKCE, not another client's confidential secret.
  const clientId = login
    ? cfg.publicClientId || cfg.confidentialClientId
    : cfg.confidentialClientId || cfg.publicClientId;
  const clientKind = login && cfg.publicClientId ? "public" : "confidential";
  if (!clientId || (clientKind === "confidential" && !cfg.secret))
    invalid("SNAPCHAT_CLIENT_NOT_CONFIGURED");
  const redirect = new URL(cfg.redirect);
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.hash) {
    invalid("SNAPCHAT_INVALID_REDIRECT");
  }
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(32).toString("hex");
  const request = {
    version: 2,
    platform: "snapchat",
    product,
    clientId,
    clientKind,
    redirect: cfg.redirect,
    scope: normalized.scope,
    scopeList: normalized.scopeList,
    codeVerifier: verifier,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
  };
  const authorize = new URL(
    login
      ? "https://accounts.snapchat.com/accounts/oauth2/auth"
      : "https://accounts.snapchat.com/login/oauth2/authorize"
  );
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: normalized.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { state, authUrl: authorize.href, request };
}

async function consumeRequest(db, state, now = Date.now()) {
  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) invalid("SNAPCHAT_INVALID_STATE");
  const ref = db.collection("oauth_states").doc(state);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const value = snap.exists ? snap.data() : null;
    if (
      !value ||
      value.version !== 2 ||
      value.platform !== "snapchat" ||
      typeof value.uid !== "string" ||
      !value.uid ||
      value.uid === "anonymous" ||
      !["login_kit", "marketing"].includes(value.product) ||
      !["public", "confidential"].includes(value.clientKind) ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= now ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(value.codeVerifier || "")
    ) {
      invalid("SNAPCHAT_INVALID_STATE");
    }
    tx.delete(ref);
    return value;
  });
}

function tokenRequest(cfg, saved, code) {
  const currentClient =
    saved.clientKind === "public"
      ? cfg.publicClientId
      : cfg.confidentialClientId || cfg.publicClientId;
  if (currentClient !== saved.clientId || cfg.redirect !== saved.redirect) {
    invalid("SNAPCHAT_CONFIGURATION_CHANGED");
  }
  if (typeof code !== "string" || !code || code.length > 8192) invalid("SNAPCHAT_INVALID_CODE");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: saved.redirect,
    client_id: saved.clientId,
    code_verifier: saved.codeVerifier,
  });
  if (saved.clientKind === "confidential") {
    if (!cfg.secret) invalid("SNAPCHAT_CLIENT_NOT_CONFIGURED");
    body.set("client_secret", cfg.secret);
  }
  return {
    endpoint:
      saved.product === "login_kit"
        ? "https://accounts.snapchat.com/accounts/oauth2/token"
        : "https://accounts.snapchat.com/login/oauth2/access_token",
    body,
  };
}

function profileRequest(saved, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (saved.product !== "login_kit") return { url: "https://adsapi.snapchat.com/v1/me", headers };
  const fields = [];
  if (saved.scopeList.includes(LOGIN_SCOPES.display_name)) fields.push("displayName");
  if (saved.scopeList.includes(LOGIN_SCOPES.external_id)) fields.push("externalId");
  if (saved.scopeList.includes(LOGIN_SCOPES["bitmoji.avatar"])) fields.push("bitmoji { avatar }");
  if (!fields.length) invalid("SNAPCHAT_PROFILE_SCOPE_REQUIRED");
  return {
    url:
      "https://kit.snapchat.com/v1/me?" +
      new URLSearchParams({ query: `{me { ${fields.join(" ")} }}` }),
    headers,
  };
}

module.exports = { normalizeScopes, createRequest, consumeRequest, tokenRequest, profileRequest };

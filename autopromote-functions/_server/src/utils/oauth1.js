const crypto = require("crypto");
const { URL } = require("url");

function percentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function normalizeParams(params) {
  const kv = [];
  Object.keys(params)
    .sort()
    .forEach(k => {
      const v = params[k];
      // If value is array, include each item separately
      if (Array.isArray(v)) {
        v.forEach(item => kv.push([percentEncode(k), percentEncode(String(item))]));
      } else {
        kv.push([percentEncode(k), percentEncode(String(v))]);
      }
    });
  return kv.map(([k, v]) => `${k}=${v}`).join("&");
}

function baseString(method, baseUrl, paramsString) {
  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramsString)].join("&");
}

function signingKey(consumerSecret, tokenSecret = "") {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || "")}`;
}

function hmacSha1(key, data) {
  return crypto.createHmac("sha1", key).update(data).digest("base64");
}

function nonce() {
  return crypto.randomBytes(16).toString("hex");
}

function timestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

// Build OAuth1 Authorization header
// options: { method, url, consumerKey, consumerSecret, token, tokenSecret, extraParams }
function buildOauth1Header(options) {
  const {
    method,
    url,
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    extraParams = {},
  } = options;
  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp(),
    oauth_version: "1.0",
  };
  if (token) oauthParams.oauth_token = token;

  // Collect parameters from query and any extra params (body form params for x-www-form-urlencoded)
  const allParams = Object.assign({}, extraParams);
  // Include query params
  parsed.searchParams.forEach((v, k) => {
    if (allParams[k]) {
      if (Array.isArray(allParams[k])) allParams[k].push(v);
      else allParams[k] = [allParams[k], v];
    } else {
      allParams[k] = v;
    }
  });

  // Merge oauth params for signing
  const signingParams = Object.assign({}, allParams, oauthParams);

  const paramsString = normalizeParams(signingParams);
  const base = baseString(method, baseUrl, paramsString);
  const key = signingKey(consumerSecret, tokenSecret || "");
  const sig = hmacSha1(key, base);
  oauthParams.oauth_signature = sig;

  const header = `OAuth ${Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ")}`;
  return header;
}

module.exports = { buildOauth1Header };

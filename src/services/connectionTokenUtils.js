const { decryptToken } = require("./secretVault");

function isEncryptedString(val) {
  return typeof val === "string" && val.length > 40; // heuristic for base64 of iv+tag+enc
}

function parseMaybeJson(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

function tokensFromDoc(doc) {
  if (!doc) return null;
  const plainAccessToken =
    typeof doc.access_token === "string" && doc.access_token.trim()
      ? doc.access_token.trim()
      : null;
  const plainRefreshToken =
    typeof doc.refresh_token === "string" && doc.refresh_token.trim()
      ? doc.refresh_token.trim()
      : null;
  // If tokens is an object (legacy), return as-is
  if (doc.tokens && typeof doc.tokens === "object") return doc.tokens;
  // If tokens is a string, decrypt + parse JSON
  if (doc.tokens && typeof doc.tokens === "string") {
    const dec = decryptToken(doc.tokens);
    const parsed = parseMaybeJson(dec);
    if (parsed) return parsed;
    // If decryptToken returned an object as string, try parse
    return parsed || { raw: dec };
  }
  // If stored as `encrypted_access_token`, reconstruct token object
  const accessEnc = doc.encrypted_access_token || doc.encrypted_user_access_token;
  const refreshEnc = doc.encrypted_refresh_token || doc.encrypted_refresh_token;
  if (accessEnc || refreshEnc) {
    const access = accessEnc ? decryptToken(accessEnc) : null;
    const refresh = refreshEnc ? decryptToken(refreshEnc) : null;
    const tokens = {};
    if (access) tokens.access_token = access;
    if (refresh) tokens.refresh_token = refresh;
    if (doc.expires_in) tokens.expires_in = doc.expires_in;
    if (doc.refresh_token && !tokens.refresh_token) tokens.refresh_token = doc.refresh_token;
    return tokens;
  }
  if (plainAccessToken || plainRefreshToken) {
    const tokens = {};
    if (plainAccessToken) tokens.access_token = plainAccessToken;
    if (plainRefreshToken) tokens.refresh_token = plainRefreshToken;
    if (doc.expires_in) tokens.expires_in = doc.expires_in;
    return tokens;
  }
  return null;
}

module.exports = { tokensFromDoc, isEncryptedString };

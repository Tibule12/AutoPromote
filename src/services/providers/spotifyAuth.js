const axios = require("axios");

// Simple in-memory cache for tokens keyed by clientId
const tokenCache = new Map();

async function requestToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  const data = res.data || {};
  const token = data.access_token;
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  const expiresAt = Date.now() + (expiresIn - 30) * 1000; // refresh leeway
  return { token, expiresAt };
}

async function getAccessToken(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;
  const key = clientId;
  const cached = tokenCache.get(key);
  if (cached && cached.token && cached.expiresAt > Date.now()) return cached.token;
  const t = await requestToken(clientId, clientSecret);
  tokenCache.set(key, t);
  return t.token;
}

module.exports = { getAccessToken };

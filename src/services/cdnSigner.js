const crypto = require("crypto");

function signPlaybackUrl({ liveId, token, ttlSeconds = 300 }) {
  const secret = process.env.CDN_SIGNING_SECRET || null;
  const base = process.env.PLAYBACK_BASE_URL || `/play/${encodeURIComponent(liveId)}.m3u8`;
  if (!secret) return null;
  const expires = Math.floor(Date.now() / 1000) + parseInt(ttlSeconds, 10);
  const payload = `${liveId}:${token || ""}:${expires}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const url = `${base}?e=${expires}&sig=${hmac}`;
  return url;
}

module.exports = { signPlaybackUrl };

const ALLOWED_AUTH_HOSTS = new Set([
  "sandbox.tiktok.com",
  "www.tiktok.com",
  "open.tiktokapis.com",
  "accounts.google.com",
  "oauth2.googleapis.com",
  "www.facebook.com",
  "connect.facebook.net",
  "api.twitter.com",
  "www.youtube.com",
  "accounts.youtube.com",
  "accounts.snapchat.com",
  "t.me",
  "web.telegram.org",
  "discord.com",
  "www.linkedin.com",
  "www.pinterest.com",
  "accounts.spotify.com",
  "www.reddit.com",
]);

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/g, "");
}

function isAllowedTelegramDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "tg:") return false;
    if (normalizeHostname(parsed.hostname) !== "resolve") return false;

    const domain = parsed.searchParams.get("domain") || "";
    const start = parsed.searchParams.get("start") || "";
    if (!/^[A-Za-z0-9_]{5,32}$/.test(domain)) return false;
    if (start && !/^[A-Za-z0-9_-]{1,128}$/.test(start)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

export function isAllowedAuthUrl(url) {
  try {
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("tg://")) return isAllowedTelegramDeepLink(url);
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin) {
      return u.protocol === "http:" || u.protocol === "https:";
    }
    if (u.protocol !== "https:") return false;
    return ALLOWED_AUTH_HOSTS.has(normalizeHostname(u.hostname));
  } catch (_) {}
  return false;
}

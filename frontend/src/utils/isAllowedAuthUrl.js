export function isAllowedAuthUrl(url) {
  try {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('tg:') || url.startsWith('tg://')) return true;
    const u = new URL(url, window.location.origin);
    const allowed = new Set([
      'sandbox.tiktok.com', 'www.tiktok.com', 'open.tiktokapis.com',
      'accounts.google.com', 'oauth2.googleapis.com',
      'www.facebook.com', 'connect.facebook.net', 'api.twitter.com',
      'www.youtube.com', 'accounts.youtube.com',
      'accounts.snapchat.com',
      't.me', 'web.telegram.org', 'discord.com', 'www.linkedin.com',
      'www.pinterest.com', 'accounts.spotify.com', 'www.reddit.com'
    ]);
    if (allowed.has(u.hostname)) return true;
    if (u.origin === window.location.origin) return true;
  } catch (_) {}
  return false;
}

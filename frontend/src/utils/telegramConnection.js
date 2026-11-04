// Telegram Web K accepts the same tg:// bot-start link in its tgaddr fragment.
// Keep the one-time start parameter; opening a plain bot profile cannot link it.
export function telegramConnectionLinks(data) {
  const url = new URL(data.authUrl);
  const bot = url.pathname.slice(1);
  const start = url.searchParams.get("start");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "t.me" ||
    url.port ||
    url.username ||
    url.password ||
    !/^[A-Za-z0-9_]{5,32}$/.test(bot) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(start || "") ||
    (data.state && data.state !== start)
  ) {
    throw new Error("Telegram returned an invalid connection link. Please try again.");
  }
  const appUrl = "tg://resolve?" + new URLSearchParams({ domain: bot, start });
  return {
    bot,
    appUrl,
    webUrl: "https://web.telegram.org/k/#?tgaddr=" + encodeURIComponent(appUrl),
  };
}

// Pending UI metadata contains no bot token or Firebase credentials. It is
// scoped to the signed-in UID and expires with the server's ten-minute request.
export const TELEGRAM_PENDING_PREFIX = "autopromote:telegram-connect:";
export const TELEGRAM_LINK_TTL = 10 * 60 * 1000;

export function readPendingTelegram(uid) {
  if (!uid) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + uid) || "null");
    if (
      !saved ||
      !Number.isFinite(saved.startedAt) ||
      saved.startedAt > Date.now() ||
      Date.now() - saved.startedAt >= TELEGRAM_LINK_TTL ||
      !Number.isInteger(saved.attempts) ||
      saved.attempts < 0 ||
      saved.attempts > 20
    )
      return null;
    return saved;
  } catch {
    return null;
  }
}

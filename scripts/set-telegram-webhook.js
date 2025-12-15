// set-telegram-webhook.js
// Usage: run in CI/post-deploy where TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET
// and optionally TELEGRAM_WEBHOOK_URL are set in environment.
const fetch = global.fetch || require("node-fetch");

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const webhookUrl =
    process.env.TELEGRAM_WEBHOOK_URL || "https://www.autopromote.org/api/telegram/webhook";
  if (!token) {
    console.error("[set-webhook] TELEGRAM_BOT_TOKEN not set. Skipping.");
    process.exit(1);
  }
  try {
    const body = { url: webhookUrl };
    if (secret) body.secret_token = secret;
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.ok) {
      console.log("[set-webhook] success:", json.description || "Webhook set");
      process.exit(0);
    } else {
      console.error("[set-webhook] failed:", json || res.statusText);
      process.exit(2);
    }
  } catch (e) {
    console.error("[set-webhook] error", e && e.message);
    process.exit(3);
  }
}

main();

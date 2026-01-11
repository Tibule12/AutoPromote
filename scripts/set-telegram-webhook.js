// set-telegram-webhook.js
// Usage: 
// 1. With .env: node scripts/set-telegram-webhook.js
// 2. Manual: node scripts/set-telegram-webhook.js <BOT_TOKEN> <WEBHOOK_SECRET> [WEBHOOK_URL]

require("dotenv").config();
const fetch = global.fetch || require("node-fetch");

async function main() {
  const args = process.argv.slice(2);
  
  const token = args[0] || process.env.TELEGRAM_BOT_TOKEN;
  const secret = args[1] || process.env.TELEGRAM_WEBHOOK_SECRET;
  const webhookUrl = args[2] || process.env.TELEGRAM_WEBHOOK_URL || "https://www.autopromote.org/api/telegram/webhook";

  console.log("Configuration:");
  console.log("- Token:", token ? `${token.substring(0, 5)}...` : "(missing)");
  console.log("- Secret:", secret ? "(present)" : "(missing)");
  console.log("- URL:", webhookUrl);

  if (!token) {
    console.error("\n[Error] TELEGRAM_BOT_TOKEN not found in .env or arguments.");
    console.error("Usage: node scripts/set-telegram-webhook.js <token> <secret>");
    process.exit(1);
  }

  try {
    const body = { url: webhookUrl };
    if (secret) body.secret_token = secret;
    
    // Drop pending updates to stop the spam loop if it's stuck
    body.drop_pending_updates = true;

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    
    if (res.ok && json && json.ok) {
      console.log("\n[Success] Webhook updated!");
      console.log("Response:", json.description);
      console.log("Note: drop_pending_updates was set to true to clear the backlog causing 401 logs.");
    } else {
      console.error("\n[Failed] Telegram API error:", json || res.statusText);
      process.exit(2);
    }
  } catch (e) {
    console.error("\n[Error] Network/Script error:", e.message);
    process.exit(3);
  }
}

main();

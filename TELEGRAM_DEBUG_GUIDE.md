# Telegram Connection Debugging Guide

If you are having trouble connecting your Telegram account, follow these steps to diagnose and fix the issue.

## 1. Webhook Configuration (Crucial)

AutoPromote uses the "Deep Link" flow for best compatibility. This requires your Telegram Bot to have a **Webhook** set up pointing to your backend.

When you click "Connect Telegram" and then "Start" in the bot, Telegram sends a web request to your server. If the webhook is not set, your server never knows you clicked start.

### How to check your Webhook

Open this URL in your browser (replace `<YOUR_BOT_TOKEN>`):
`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo`

You should see:

```json
{
  "ok": true,
  "result": {
    "url": "https://your-api-domain.com/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### How to Set your Webhook

If the `url` is empty or incorrect, you must set it.

**Using curl:**

```bash
curl -F "url=https://your-api-domain.com/api/telegram/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

_Note: Replace `your-api-domain.com` with your actual backend URL (e.g., `autopromote-api.onrender.com`)._

## 2. Environment Variables

Ensure these variables are set correctly in your backend environment (Render/Heroku/etc):

- `TELEGRAM_BOT_TOKEN`: Your full bot token from @BotFather.
- `TELEGRAM_BOT_USERNAME`: The username of your bot (e.g., `AutoPromoteBot` or `@AutoPromoteBot`).
- `TELEGRAM_WEBHOOK_SECRET`: (Optional) If you set a secret when creating the webhook, it must match this.

## 3. Bot Settings

1. Go to @BotFather in Telegram.
2. Select your bot.
3. Ensure **Domain** is not blocking requests (though this mainly affects the Widget flow).
4. Ensure **Allow Groups?** is enabled if you plan to add the bot to groups.

## 4. Common Errors

### "Telegram configuration error" (500)

This means your `TELEGRAM_BOT_USERNAME` in specific configuration does not match the token's actual username. Check your `.env` file and ensure it matches exactly what @BotFather says.

### Connection "Spins" Indefinitely

This usually means the Webhook is not receiving events.

1. Check Server Logs: Do you see `Telegram webhook received` in your logs?
2. If NO: Your Webhook URL is wrong or Telegram cannot reach your server.
3. If YES: success! The fix applied in `telegramRoutes.js` should now correctly link your account.

## 5. Testing

1. Go to Connections Dashboard.
2. Click "Connect Telegram".
3. A link will open to `t.me/<your_bot>?start=<token>`.
4. Click "Open Telegram" -> "Start".
5. The Bot should reply: "✅ Successfully connected to AutoPromote!"
6. Your dashboard should update to show "Connected".

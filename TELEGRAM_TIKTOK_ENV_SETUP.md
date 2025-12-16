# Telegram and TikTok Integration - Environment Variables Setup

This document outlines the required environment variables for Telegram and TikTok platform integrations.

## Telegram Integration

### Required Environment Variables

#### `TELEGRAM_BOT_TOKEN` (Required)

- **Description**: Bot API token from @BotFather
- **How to obtain**:
  1. Open Telegram and search for @BotFather
  2. Send `/newbot` command
  3. Follow the prompts to create your bot
  4. Copy the HTTP API token provided
- **Format**: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
- **Example**: `TELEGRAM_BOT_TOKEN=5678901234:AAHsD_FGH123456789abcdefghijklmno`

#### `TELEGRAM_BOT_USERNAME` (Required)

- **Description**: Username of your Telegram bot (without @)
- **How to obtain**: This is the username you chose when creating the bot
- **Format**: `your_bot_username`
- **Example**: `TELEGRAM_BOT_USERNAME=AutoPromoteBot`

#### `TELEGRAM_WEBHOOK_SECRET` (Optional but Recommended)

- **Description**: Secret token for webhook security
- **How to set**: Generate a random secure string
- **Format**: Any secure random string (32+ characters recommended)
- **Example**: `TELEGRAM_WEBHOOK_SECRET=your_secure_random_string_here_32chars`
- **Usage**: Sent as `X-Telegram-Bot-Api-Secret-Token` header in webhook requests

#### `TELEGRAM_WEBHOOK_URL` (Optional)

- **Description**: Public URL where Telegram will send updates
- **Format**: `https://yourdomain.com/api/telegram/webhook`
- **Example**: `TELEGRAM_WEBHOOK_URL=https://api.autopromote.org/api/telegram/webhook`
- **Note**: Required if you want to receive bot messages and commands

### Setup Instructions

1. **Create Telegram Bot**:

   ```
   Open Telegram → Search @BotFather → /newbot
   ```

2. **Configure Bot Settings**:

   ```
   /setdescription - Set bot description
   /setuserpic - Set bot profile picture
   /setcommands - Set bot commands (optional)
   ```

3. **Set Environment Variables** in your deployment platform (Render, Heroku, etc.):

   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_BOT_USERNAME=YourBotUsername
   TELEGRAM_WEBHOOK_SECRET=your_secure_random_string
   TELEGRAM_WEBHOOK_URL=https://api.autopromote.org/api/telegram/webhook
   ```

4. **Setup Webhook** (if using webhook mode):
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://api.autopromote.org/api/telegram/webhook",
       "secret_token": "your_secure_random_string"
     }'
   ```

### Authentication Flow

1. User clicks "Connect Telegram" button in dashboard
2. Opens `/api/telegram/auth/start` (authenticated endpoint)
3. Displays HTML page with Telegram Login Widget
4. User authenticates via Telegram Login Widget
5. Widget calls JavaScript callback with auth data
6. Frontend sends auth data to `/api/telegram/auth/callback`
7. Backend verifies HMAC signature and stores connection
8. User redirected to dashboard with success message

### API Endpoints

- **GET** `/api/telegram/auth/start` - Display Telegram Login Widget page
- **POST** `/api/telegram/auth/callback` - Process auth data from Login Widget
- **GET** `/api/telegram/status` - Check connection status
- **DELETE** `/api/telegram/disconnect` - Disconnect Telegram account
- **POST** `/api/telegram/webhook` - Receive bot updates
- **POST** `/api/telegram/test-message` - Send test message (authenticated)

---

## TikTok Integration

### Required Environment Variables

#### Sandbox Mode (Development/Testing)

#### `TIKTOK_SANDBOX_CLIENT_KEY` (Required for Sandbox)

- **Description**: TikTok sandbox app client key
- **How to obtain**:
  1. Go to [TikTok Developer Portal](https://developers.tiktok.com/)
  2. Create an app (select "Login Kit" and relevant scopes)
  3. Navigate to "Basic Information" → Copy "Client Key"
- **Format**: Alphanumeric string (20+ characters)
- **Example**: `TIKTOK_SANDBOX_CLIENT_KEY=awxyz1234567890abcdef`

#### `TIKTOK_SANDBOX_CLIENT_SECRET` (Required for Sandbox)

- **Description**: TikTok sandbox app client secret
- **How to obtain**: In TikTok Developer Portal under "Basic Information"
- **Format**: Alphanumeric string
- **Example**: `TIKTOK_SANDBOX_CLIENT_SECRET=secretkey1234567890abcdef`
- **Security**: Keep this secret! Never expose in frontend code

#### `TIKTOK_SANDBOX_REDIRECT_URI` (Required for Sandbox)

- **Description**: OAuth callback URL for sandbox
- **How to configure**:
  1. In TikTok Developer Portal → "Login Kit" settings
  2. Add redirect URI: `https://api.autopromote.org/api/tiktok/callback`
- **Format**: Full HTTPS URL
- **Example**: `TIKTOK_SANDBOX_REDIRECT_URI=https://api.autopromote.org/api/tiktok/callback`
- **Note**: Must match exactly what's configured in TikTok portal

#### Production Mode (Live App)

#### `TIKTOK_PROD_CLIENT_KEY` (Required for Production)

- **Description**: TikTok production app client key
- **How to obtain**: Same process as sandbox, but use production app credentials
- **Example**: `TIKTOK_PROD_CLIENT_KEY=prodkey1234567890abcdef`

#### `TIKTOK_PROD_CLIENT_SECRET` (Required for Production)

- **Description**: TikTok production app client secret
- **Example**: `TIKTOK_PROD_CLIENT_SECRET=prodsecret1234567890abcdef`

#### `TIKTOK_PROD_REDIRECT_URI` (Required for Production)

- **Description**: OAuth callback URL for production
- **Example**: `TIKTOK_PROD_REDIRECT_URI=https://api.autopromote.org/api/tiktok/callback`

#### Optional Configuration

#### `TIKTOK_ENV` (Optional)

- **Description**: Force sandbox or production mode
- **Options**: `sandbox` | `production`
- **Default**: Auto-detects based on available credentials (prefers production if both are present)
- **Example**: `TIKTOK_ENV=sandbox`

#### `TIKTOK_OAUTH_SCOPES` (Optional)

- **Description**: OAuth scopes to request (space-separated)
- **Default**: `user.info.profile video.list`
- **Approved Scopes**: Must match what's approved in TikTok Developer Portal
- **Example**: `TIKTOK_OAUTH_SCOPES=user.info.profile video.upload video.publish`
- **Note**: `video.upload` and `video.publish` require TikTok app review approval

#### `TIKTOK_USE_MOCK` (Development Only)

- **Description**: Use mock OAuth flow for testing when TikTok sandbox is unreachable
- **Options**: `true` | `false`
- **Default**: `false`
- **Example**: `TIKTOK_USE_MOCK=true`

#### `TIKTOK_DEMO_MODE` (Development Only)

- **Description**: Simulate successful video uploads without real API calls
- **Options**: `true` | `false`
- **Default**: `false`
- **Example**: `TIKTOK_DEMO_MODE=true`
- **Usage**: For screen recording demos during app review process

#### `DEBUG_TIKTOK_OAUTH` (Development Only)

- **Description**: Enable verbose OAuth debugging logs
- **Options**: `true` | `false`
- **Default**: `false`
- **Example**: `DEBUG_TIKTOK_OAUTH=true`

### Setup Instructions

1. **Create TikTok Developer Account**:
   - Go to https://developers.tiktok.com/
   - Sign up with TikTok account
   - Complete developer verification

2. **Create TikTok App**:
   - Click "Manage apps" → "Create an app"
   - Select "Login Kit" product
   - Choose required scopes (user.info.profile minimum)
   - Submit for review if requesting video scopes

3. **Configure OAuth Settings**:
   - Add redirect URI: `https://api.autopromote.org/api/tiktok/callback`
   - Must use HTTPS
   - URI must match exactly (no trailing slash)

4. **Set Environment Variables**:

   ```env
   # Sandbox (for development)
   TIKTOK_SANDBOX_CLIENT_KEY=your_sandbox_key
   TIKTOK_SANDBOX_CLIENT_SECRET=your_sandbox_secret
   TIKTOK_SANDBOX_REDIRECT_URI=https://api.autopromote.org/api/tiktok/callback

   # Production (after app approval)
   TIKTOK_PROD_CLIENT_KEY=your_production_key
   TIKTOK_PROD_CLIENT_SECRET=your_production_secret
   TIKTOK_PROD_REDIRECT_URI=https://api.autopromote.org/api/tiktok/callback

   # Optional
   TIKTOK_ENV=sandbox
   TIKTOK_OAUTH_SCOPES=user.info.profile video.list
   ```

### Authentication Flow

1. User clicks "Connect TikTok" button
2. Frontend calls `/api/tiktok/auth/prepare` (authenticated)
3. Backend generates OAuth state, stores in Firestore
4. Backend returns TikTok authorization URL
5. Frontend opens TikTok OAuth page
6. User authorizes app on TikTok
7. TikTok redirects to `/api/tiktok/callback?code=...&state=...`
8. Backend validates state, exchanges code for tokens
9. Backend stores encrypted tokens in Firestore
10. User redirected to dashboard with success message

### API Endpoints

- **POST** `/api/tiktok/auth/prepare` - Generate OAuth URL (authenticated)
- **GET** `/api/tiktok/auth/start` - Alternative OAuth start with HTML page
- **GET** `/api/tiktok/callback` - OAuth callback handler
- **GET** `/api/tiktok/status` - Check connection status
- **POST** `/api/tiktok/upload` - Upload video (requires video.upload scope)
- **GET** `/api/tiktok/config` - View current configuration
- **GET** `/api/tiktok/auth/preflight` - Test OAuth URL generation

### Current Implementation Status

**TikTok Integration: 85% Complete**

✅ **Completed**:

- OAuth 2.0 flow (authorization code grant)
- Token exchange and refresh
- Connection status checking
- Encrypted token storage
- Sandbox/production mode switching
- SSRF protection
- Rate limiting
- CORS configuration

⚠️ **Partial Implementation**:

- Video upload API (stub implementation for demo)
- Requires `video.upload` and `video.publish` scopes
- Currently returns simulated success for app review demos
- Set `TIKTOK_DEMO_MODE=true` for demo mode

🔄 **Pending TikTok App Review**:

- `video.upload` scope approval
- `video.publish` scope approval
- Once approved, implement real video upload in `tiktokService.js`

---

## Security Notes

### Token Storage

- All access tokens and refresh tokens are encrypted using `secretVault.js`
- Tokens stored in Firestore at `users/{uid}/connections/{platform}`
- Never expose tokens in API responses or logs

### Webhook Security

- Telegram: Verify HMAC-SHA256 signature of auth data
- Telegram webhook: Validate `X-Telegram-Bot-Api-Secret-Token` header
- TikTok: Validate OAuth state parameter to prevent CSRF

### SSRF Protection

- All external API calls use `ssrfGuard.js` utilities
- Only allow HTTPS connections to approved hosts
- Validate URLs before making requests

### Rate Limiting

- Public endpoints: 120 requests per window
- Write endpoints: 60 requests per window
- Configurable via environment variables

---

## Testing

### Test Telegram Connection

```bash
# 1. Visit auth page
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.autopromote.org/api/telegram/auth/start

# 2. Check connection status
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.autopromote.org/api/telegram/status

# 3. Send test message
curl -X POST https://api.autopromote.org/api/telegram/test-message \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Test message from AutoPromote"}'
```

### Test TikTok Connection

```bash
# 1. Prepare OAuth
curl -X POST https://api.autopromote.org/api/tiktok/auth/prepare \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 2. Check connection status
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.autopromote.org/api/tiktok/status

# 3. Check configuration
curl https://api.autopromote.org/api/tiktok/config
```

---

## Troubleshooting

### Telegram Issues

**Bot not responding**:

- Check `TELEGRAM_BOT_TOKEN` is correct
- Verify bot is not blocked
- Check webhook is set correctly: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

**Auth verification fails**:

- Ensure server time is synchronized (NTP)
- Check bot token matches widget configuration
- Verify HMAC calculation uses correct data format

### TikTok Issues

**OAuth redirect fails**:

- Verify redirect URI matches exactly in developer portal
- Check HTTPS is used (HTTP not allowed)
- Ensure no trailing slash in redirect URI

**Token exchange fails**:

- Confirm client secret is correct
- Check code hasn't expired (valid for 10 minutes)
- Verify state parameter matches stored value

**Scope errors**:

- Requested scopes must match approved scopes in portal
- `video.upload` and `video.publish` require app review
- Use `user.info.profile` for basic authentication

---

## Next Steps

### For Telegram

1. Create bot via @BotFather
2. Set environment variables
3. Configure webhook (optional)
4. Test connection in dashboard

### For TikTok

1. Register TikTok developer account
2. Create app and request scopes
3. Configure sandbox credentials
4. Test OAuth flow
5. Submit for app review (if video scopes needed)
6. Configure production credentials after approval

---

## Support

For issues with:

- **Telegram**: https://core.telegram.org/bots/faq
- **TikTok**: https://developers.tiktok.com/doc/developer-portal-overview
- **AutoPromote**: Contact your development team

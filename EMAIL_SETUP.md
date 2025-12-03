# Email Service Setup Guide

AutoPromote supports three email providers: **Resend**, **SendGrid**, and **Mailtrap**.

## 📧 Email Providers

### 1. **Resend** (Recommended for Production)
- **Best for**: Modern API, great deliverability, simple setup
- **Pricing**: Free tier: 3,000 emails/month, then $20/month for 50k emails
- **Setup**: https://resend.com

```bash
RESEND_API_KEY=re_your_api_key_here
EMAIL_PROVIDER=resend
```

### 2. **SendGrid** (Alternative for Production)
- **Best for**: High volume, established provider
- **Pricing**: Free tier: 100 emails/day, then $19.95/month for 40k emails
- **Setup**: https://sendgrid.com

```bash
SENDGRID_API_KEY=SG.your_api_key_here
EMAIL_PROVIDER=sendgrid
```

### 3. **Mailtrap** (Testing Only)
- **Best for**: Development and testing (emails don't actually send)
- **Pricing**: Free tier available
- **Setup**: https://mailtrap.io

```bash
MAILTRAP_HOST=sandbox.smtp.mailtrap.io
MAILTRAP_PORT=2525
MAILTRAP_USER=your_username
MAILTRAP_PASSWORD=your_password
EMAIL_PROVIDER=mailtrap
```

## 🚀 Quick Setup

### Step 1: Install Dependencies

```bash
npm install resend @sendgrid/mail nodemailer
```

### Step 2: Configure Environment Variables

Copy `.env.email.example` to your `.env` file and add your credentials:

```bash
# Choose your primary provider
EMAIL_PROVIDER=resend  # or sendgrid, or mailtrap

# Add your API keys
RESEND_API_KEY=re_xxxxx
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=AutoPromote <noreply@autopromote.org>
```

### Step 3: Test Your Configuration

```bash
node test-email.js
```

## 📨 Available Email Templates

1. **Welcome Email** - Sent when users sign up
2. **Password Reset** - Password recovery emails
3. **Payout Notification** - Earnings payout confirmations
4. **Content Published** - Content goes live notifications
5. **Security Alert** - Suspicious login detection

## 💻 Usage Examples

### Send Basic Email

```javascript
const { sendEmail } = require('./src/services/emailService');

await sendEmail({
  to: 'user@example.com',
  subject: 'Hello from AutoPromote',
  html: '<h1>Hello!</h1><p>This is a test email.</p>',
  text: 'Hello! This is a test email.'
});
```

### Send Templated Email

```javascript
const { sendTemplatedEmail } = require('./src/services/emailService');

await sendTemplatedEmail('welcome', {
  name: 'John Doe',
  loginUrl: 'https://autopromote.org/dashboard'
}, 'john@example.com');
```

### Send Password Reset

```javascript
await sendTemplatedEmail('passwordReset', {
  name: 'John Doe',
  resetUrl: 'https://autopromote.org/reset?token=abc123',
  expiresIn: '1 hour'
}, 'john@example.com');
```

### Send Payout Notification

```javascript
await sendTemplatedEmail('payoutNotification', {
  name: 'John Doe',
  amount: '150.00',
  method: 'PayPal',
  expectedDate: 'December 10, 2025'
}, 'john@example.com');
```

## 🔄 Automatic Fallback

The email service automatically falls back to other configured providers if the primary fails:

1. Try primary provider (e.g., Resend)
2. If fails, try SendGrid
3. If fails, try Mailtrap
4. If all fail, throw error

## 🔧 Troubleshooting

### Emails Not Sending

1. **Check API keys**: Ensure they're correctly set in `.env`
2. **Verify sender domain**: Some providers require domain verification
3. **Check rate limits**: Free tiers have daily/monthly limits
4. **Review logs**: Check console for error messages

### Test with Mailtrap First

Start with Mailtrap to test without sending real emails:

```bash
EMAIL_PROVIDER=mailtrap
```

Once working, switch to production provider:

```bash
EMAIL_PROVIDER=resend
```

### SPF/DKIM Setup (Production)

For better deliverability, configure DNS records:

- **Resend**: Automatic for resend.dev domain, custom domain requires DNS setup
- **SendGrid**: Requires SPF/DKIM records in your DNS

## 📊 Monitoring

Check email delivery status:

- **Resend**: Dashboard at https://resend.com/dashboard
- **SendGrid**: Activity feed at https://app.sendgrid.com/email_activity
- **Mailtrap**: Inbox at https://mailtrap.io/inboxes

## 🔐 Security Best Practices

1. **Never commit API keys** - Use `.env` files (already in `.gitignore`)
2. **Use environment-specific keys** - Different keys for dev/prod
3. **Rotate keys regularly** - Change API keys every 90 days
4. **Monitor usage** - Watch for unusual sending patterns
5. **Verify sender identity** - Set up proper DNS records

## 📝 Environment Variables Summary

```bash
# Required
EMAIL_PROVIDER=resend|sendgrid|mailtrap
EMAIL_FROM=AutoPromote <noreply@autopromote.org>

# At least one provider required
RESEND_API_KEY=re_xxxxx
SENDGRID_API_KEY=SG.xxxxx

# Or for testing
MAILTRAP_HOST=sandbox.smtp.mailtrap.io
MAILTRAP_PORT=2525
MAILTRAP_USER=xxxxx
MAILTRAP_PASSWORD=xxxxx

# Optional
TEST_EMAIL=your-test@email.com
```

## 🚀 Next Steps

1. Choose your email provider (Resend recommended)
2. Sign up and get API key
3. Add credentials to `.env`
4. Run `node test-email.js`
5. Integrate into your authentication flows
6. Set up domain verification for production

## 📞 Support

- **Resend**: https://resend.com/docs
- **SendGrid**: https://docs.sendgrid.com
- **Mailtrap**: https://help.mailtrap.io

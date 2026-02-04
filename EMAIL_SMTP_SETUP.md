# Custom SMTP Email Setup Guide

You can send emails directly from AutoPromote using your own email account (Gmail, Outlook, Yahoo, or private hosting) via SMTP interaction, avoiding paid transactional email services.

## Prerequisites

1.  **Email Account**: You need an email address that allows SMTP access.
    - **Gmail**: Requires an "App Password" if 2FA is enabled (Standard passwords won't work).
    - **Hosting Provider** (Bluehost, GoDaddy, Namecheap): Use your cPanel email credentials.
    - **Outlook/Office365**: Requires SMTP auth to be enabled for the user.

## Configuration

Add the following variables to your `.env` file:

```dotenv
# Enable Email
EMAIL_SENDER_MODE=enabled
EMAIL_PROVIDER=smtp

# SMTP Configuration
SMTP_HOST=smtp.gmail.com       # e.g., smtp.office365.com, mail.yourdomain.com
SMTP_PORT=587                  # Usually 587 (TLS) or 465 (SSL)
SMTP_USER=your-email@gmail.com # Your full email address
SMTP_PASS=your-app-password    # Your password or App Password
SMTP_SECURE=false              # true for port 465, false for port 587

# Sender Identity
EMAIL_FROM="AutoPromote Support <your-email@gmail.com>"
```

## Provider Settings Examples

### Gmail

1.  Go to Google Account > Security.
2.  Enable "2-Step Verification".
3.  Go to "App Passwords" (search for it in the search bar).
4.  Create a new app password named "AutoPromote".
5.  Use that 16-character password in `SMTP_PASS`.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
```

### Outlook / Office 365

```dotenv
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@outlook.com
SMTP_PASS=your-password
```

## Troubleshooting

- **Connection Refused**: Check if your firewall or ISP blocks port 587.
- **Auth Failed**: Double-check your App Password. Standard Google passwords do not work with SMTP anymore.
- **Spam**: Emails sent from personal Gmail accounts via scripts may land in Spam initially.

## Limitations

- **Rate Limits**: Gmail limits you to ~500 emails/day.
- **Deliverability**: Harder to guarantee inbox placement compared to specialized services like SendGrid.

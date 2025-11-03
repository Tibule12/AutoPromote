# Email configuration

This project supports multiple email providers behind a single abstraction:

- console (default; logs emails to the console)
- sendgrid (API)
- resend (API)
- mailtrap (SMTP)
- mailgun (API)

Select a provider via environment:

- EMAIL_PROVIDER=console|sendgrid|resend|mailtrap|mailgun
- EMAIL_FROM="AutoPromote <no-reply@yourdomain.com>"
- EMAIL_SENDER_MODE=enabled|disabled (set to disabled to turn off delivery but keep API responses)

Provider-specific env vars:

- SendGrid:
  - SENDGRID_API_KEY=SG.xxxxx

- Resend:
  - RESEND_API_KEY=re_XXXX

- Mailtrap (SMTP sandbox or dedicated):
  - MAILTRAP_HOST=sandbox.smtp.mailtrap.io
  - MAILTRAP_PORT=2525
  - MAILTRAP_USER=<inbox_user>
  - MAILTRAP_PASS=<inbox_pass>

- Mailgun:
  - MAILGUN_API_KEY=key-xxxx
  - MAILGUN_DOMAIN=mg.yourdomain.com

Usage in code

All routes call through `src/services/emailService.js` which exposes:

- sendVerificationEmail({ email, link })
- sendPasswordResetEmail({ email, link })
- sendEmail({ to, subject, html, text, headers })

Troubleshooting

- If you set EMAIL_PROVIDER but lack the provider’s env vars, the service falls back to `console` and logs a warning.
- In non-production or when EXPOSE_RESET_LINK=true, password reset responses include the raw link for quick testing.

Notes

- Mailtrap is ideal for staging/dev inbox previews; SendGrid/Resend are recommended for production.
- Keep EMAIL_FROM verified with your provider to avoid bounces.

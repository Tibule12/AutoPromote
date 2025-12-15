## Production domain and email setup

This guide wires your new domain autopromote.org to the deployed app on Render and authenticates the domain for email sending (SendGrid, Resend, or Mailtrap).

### 1) DNS on Cloudflare (zone: autopromote.org)

Add custom domains inside each Render service first. Render will show the exact target hostname you must CNAME to. Then add these DNS records in Cloudflare DNS:

- Frontend (website)
  - Name: `www`
  - Type: `CNAME`
  - Target: <your Render FRONTEND hostname> (copy from Render, e.g. `your-frontend.onrender.com`)
  - Proxy status: Proxied (orange cloud) is OK

- Backend API
  - Name: `api`
  - Type: `CNAME`
  - Target: <your Render BACKEND hostname> (copy from Render, e.g. `autopromote.onrender.com`)
  - Proxy status: Proxied is OK

- Apex redirect (optional but recommended)
  - Use Cloudflare Rules → Redirect Rules (Bulk Redirects or Single Redirect)
  - Source: `autopromote.org/*`
  - Destination: `https://www.autopromote.org/$1`
  - Status: 301 (permanent)

Notes

- If you prefer the apex domain to host the site directly, you can instead create a CNAME at `@` pointing to your Render frontend hostname. Cloudflare supports CNAME flattening at the apex. The redirect approach is simpler and avoids www/apex duplicates.
- After adding records, go back to Render → Custom Domains and click “Verify” for each service. DNS can take a few minutes to propagate.

### 2) App configuration after DNS

- Frontend (Render static site): set environment variable
  - `REACT_APP_API_URL=https://api.autopromote.org`

- Backend (Render web service): set environment variables
  - `PUBLIC_BASE_URL=https://api.autopromote.org`
  - `EMAIL_PROVIDER=sendgrid` (or `resend` or `mailtrap`)
  - `EMAIL_FROM="AutoPromote <no-reply@autopromote.org>"`
  - `VERIFY_REDIRECT_URL=https://www.autopromote.org/verify`
  - `PASSWORD_RESET_REDIRECT_URL=https://www.autopromote.org/reset`
  - Provider keys (choose one set):
    - SendGrid: `SENDGRID_API_KEY=...`
    - Resend: `RESEND_API_KEY=...`
    - Mailtrap (SMTP): `MAILTRAP_HOST=sandbox.smtp.mailtrap.io`, `MAILTRAP_PORT=2525`, `MAILTRAP_USER=...`, `MAILTRAP_PASS=...`

Cors/authorized domains

- Ensure the backend CORS allow-list includes `https://www.autopromote.org` (and `https://autopromote.org` if the apex serves the app).
- In Firebase Authentication → Settings → Authorized domains: add `www.autopromote.org` and `autopromote.org`.

### 3) Email domain authentication (choose one provider)

All providers will give you DNS records that you must add in Cloudflare. Always copy the exact hostnames/values from the provider dashboard.

- SendGrid
  - Sender Authentication → Authenticate domain
  - Add 3 CNAMEs (DKIM/Return-Path) like `s1._domainkey`, `s2._domainkey`, and `em1234` under your chosen subdomain (or root). Use values SendGrid provides.
  - Optional: Link Branding CNAME (click tracking) — also provided by SendGrid.

- Resend
  - Domains → Add domain `autopromote.org` (or `mail.autopromote.org` as a subdomain if you prefer)
  - Add 2–4 DNS records (DKIM CNAMEs and optional Return-Path). Copy values exactly.

- Mailtrap (Sending)
  - Sending Domains → Add `autopromote.org`
  - Add the DKIM/SPF/CNAME records Mailtrap provides, or use SMTP credentials for sandbox/testing.

After records propagate, click “Verify” in the provider dashboard. Once verified, transactional emails should deliver from `no-reply@autopromote.org`.

### 4) Smoke tests

1. Open `https://www.autopromote.org` in a browser and ensure the app loads.
2. In the browser devtools, confirm API calls go to `https://api.autopromote.org/...` and succeed (200/204).
3. Run a “Forgot Password” or “Send Verification Email” flow and confirm receipt in your inbox. If undelivered, re-check provider auth status and DNS.

### 5) Troubleshooting

- DNS still “Pending” in Render
  - Make sure the Cloudflare record type is CNAME (not A) and the target matches exactly what Render shows.
  - Try toggling the orange cloud (proxy) off temporarily; then re-verify. You can re-enable proxy after verification.

- Emails arrive but with “via” or “sent on behalf of”
  - Verify DKIM and SPF are authenticated and DMARC (TXT at `_dmarc.autopromote.org`) is set, for example:
    - Name: `_dmarc`
    - Type: `TXT`
    - Value: `v=DMARC1; p=none; rua=mailto:postmaster@autopromote.org;`
  - Move DMARC policy to `p=quarantine` or `p=reject` once you confirm deliverability.

---

Reference: frontend config defaults still point to the Render subdomain for safety. Once DNS is live, prefer setting the env var `REACT_APP_API_URL` to `https://api.autopromote.org` in Render rather than changing source defaults.

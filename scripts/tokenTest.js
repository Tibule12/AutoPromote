#!/usr/bin/env node
const fs = require('fs');
const { JWT } = require('google-auth-library');

const saPath = process.argv[2] || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!saPath) {
  console.error('Usage: node scripts/tokenTest.js <path-to-service-account.json>');
  console.error('Or set GOOGLE_APPLICATION_CREDENTIALS and run: node scripts/tokenTest.js');
  process.exit(2);
}

let sa;
try {
  sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
} catch (e) {
  console.error('Failed to read or parse service account JSON at', saPath, e.message || e);
  process.exit(1);
}

const client = new JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform']
});

(async () => {
  try {
    const res = await client.authorize();
    console.log('OK: token obtained. expiry_date (ms since epoch):', res.expiry_date);
    console.log('Access token (first 200 chars):', (res.access_token || '').slice(0, 200));
  } catch (e) {
    console.error('TOKEN ERROR:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();

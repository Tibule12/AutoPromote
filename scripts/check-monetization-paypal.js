/*
Quick diagnostic script to reproduce failing endpoints and print full responses.
Usage:
  node scripts/check-monetization-paypal.js [--api https://api.autopromote.org] [--token <ID_TOKEN>] 

It will request:
  GET /api/monetization/revenue-analytics?timeframe=month
  GET /api/paypal-subscriptions/status

This is non-destructive and prints status, headers and body to stdout.
*/

const fetch = require('node-fetch');
const argv = require('minimist')(process.argv.slice(2));

const API = argv.api || process.env.API_BASE || 'https://api.autopromote.org';
const TOKEN = argv.token || process.env.AUTH_TOKEN || null;

async function doReq(path) {
  const url = API + path;
  const opts = { method: 'GET', headers: { Accept: 'application/json' } };
  if (TOKEN) opts.headers.Authorization = `Bearer ${TOKEN}`;
  try {
    console.log('\n-->', url);
    const res = await fetch(url, opts);
    console.log('Status:', res.status, res.statusText);
    console.log('Headers:');
    res.headers.forEach((v,k)=>console.log(`  ${k}: ${v}`));
    const txt = await res.text();
    // Try to parse JSON
    try {
      const j = JSON.parse(txt);
      console.log('Body (JSON):', JSON.stringify(j, null, 2));
    } catch (_) {
      console.log('Body (text):', txt);
    }
  } catch (err) {
    console.error('Request failed:', err && err.message ? err.message : err);
  }
}

(async function main(){
  console.log('API base:', API);
  if (!TOKEN) console.log('No auth token provided; calls may be unauthenticated.');
  await doReq('/api/monetization/revenue-analytics?timeframe=month');
  await doReq('/api/paypal-subscriptions/status');
})();

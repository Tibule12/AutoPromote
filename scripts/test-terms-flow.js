/*
  Test script: simulate terms acceptance flow against a local AutoPromote server.

  Usage (PowerShell):
    $env:API_BASE = 'http://localhost:5000'; node .\scripts\test-terms-flow.js

  This script uses the test tokens supported by authMiddleware:
    - test-token-for-testUser123 (accepted non-admin test user)

  It performs:
    1) GET /api/billing (expect 403 terms_not_accepted)
    2) POST /api/users/me/accept-terms with { acceptedTermsVersion }
    3) GET /api/billing again (expect success or different response)

  Note: The server must be running locally (default http://localhost:5000).
*/

const fetch = require("node-fetch");

const API_BASE = process.env.API_BASE || "http://localhost:5000";
const TEST_TOKEN = "test-token-for-testUser123";
const REQUIRED_VERSION = process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function callBilling() {
  const url = `${API_BASE}/api/billing`;
  try {
    const res = await fetch(url, { method: "GET", headers: headers(TEST_TOKEN) });
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch (_) {}
    console.log(`[billing GET] status=${res.status} body=`, body);
    return { status: res.status, body };
  } catch (err) {
    console.error("Error calling billing:", err.message);
    throw err;
  }
}

async function acceptTerms() {
  const url = `${API_BASE}/api/users/me/accept-terms`;
  const payload = { acceptedTermsVersion: REQUIRED_VERSION };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(TEST_TOKEN),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    console.log(`[accept POST] status=${res.status} body=`, data);
    return { status: res.status, body: data };
  } catch (err) {
    console.error("Error posting acceptance:", err.message);
    throw err;
  }
}

(async function main() {
  console.log("API base:", API_BASE);
  console.log("1) Call billing (expect 403 if terms not accepted)");
  await callBilling();

  console.log("\n2) POST acceptance to /api/users/me/accept-terms");
  await acceptTerms();

  console.log("\n3) Call billing again (expect success)");
  await callBilling();

  console.log("\nDone. If you see 403 on first call and non-403 on second, flow works.");
})();

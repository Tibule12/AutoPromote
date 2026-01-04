#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

/**
 * Usage:
 * - Set env FIREBASE_ADMIN_SERVICE_ACCOUNT with the JSON string, or
 * - Set FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 with the base64-encoded JSON
 * - Then run: node scripts/write-service-account.js
 * This will write the JSON into test/e2e/tmp/service-account.json
 */

const target =
  process.argv[2] || path.resolve(__dirname, "..", "test", "e2e", "tmp", "service-account.json");
const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || null;
const rawB64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 || null;

if (!raw && !rawB64) {
  console.warn(
    "No FIREBASE_ADMIN_SERVICE_ACCOUNT or FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 exists in env; nothing to write."
  );
  process.exit(0);
}
let json = raw || Buffer.from(rawB64, "base64").toString("utf8");
try {
  // Try to validate JSON
  JSON.parse(json);
} catch (e) {
  console.error("Failed to parse service account JSON from env:", e.message);
  process.exit(1);
}

const dir = path.dirname(target);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(target, json, { encoding: "utf8", mode: 0o600 });
console.log("✅ Wrote service account JSON to", target);
process.exit(0);

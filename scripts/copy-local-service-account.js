#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const src = path.join(repoRoot, "service-account-key.json");
const dstDir = path.join(repoRoot, "test", "e2e", "tmp");
const dst = path.join(dstDir, "service-account.json");

if (!fs.existsSync(src)) {
  console.error(`Source service account not found at: ${src}`);
  console.error("Place your local file named 'service-account-key.json' in the repository root or create the file from your secrets.");
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(src, "utf8");
} catch (e) {
  console.error("Failed to read source service account:", e.message);
  process.exit(1);
}

try {
  JSON.parse(raw);
} catch (e) {
  console.error("Invalid JSON in service-account-key.json:", e.message);
  process.exit(1);
}

try {
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(dst, raw, { encoding: "utf8", mode: 0o600 });
  console.log(`✅ Copied ${src} -> ${dst}`);
  process.exit(0);
} catch (e) {
  console.error("Failed to write service account to tmp:", e.message);
  process.exit(1);
}
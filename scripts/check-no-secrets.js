#!/usr/bin/env node
"use strict";
// Simple repo-wide secret scanner (looks for patterns commonly used by service account JSONs)
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignore = [
  "node_modules",
  ".git",
  "frontend/build",
  "dist",
  "public",
  "node_modules",
  ".env.example",
  "test/e2e",
  "test/e2e/tmp",
  "\\bexample\\b",
  "TROUBLESHOOTING_401.md",
  "REGENERATE_CREDENTIALS.md",
  "FIREBASE_SETUP.md",
  "README.md",
  "SECURITY.md",
  "docs",
];
const patterns = [
  /-----BEGIN PRIVATE KEY-----/i,
  /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/i,
  /\bFIREBASE_SERVICE_ACCOUNT\b/i,
  /\bFIREBASE_PRIVATE_KEY\b/i,
  /"client_email"\s*:\s*"[\w-]+@.*\.iam\.gserviceaccount\.com"/i,
];

function shouldIgnore(p) {
  const normalized = p.replace(/\\\\/g, "/");
  return ignore.some(i => normalized.includes(`/${i}/`));
}

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const full = path.join(dir, e);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (shouldIgnore(full)) continue;
        out.push(...walk(full));
      } else if (stat.isFile()) {
        out.push(full);
      }
    } catch (ex) {
      /* ignore */
    }
  }
  return out;
}

function scanFiles(files) {
  const matches = [];
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, "utf8");
      for (const p of patterns) {
        if (p.test(text)) {
          matches.push({ file: f, pattern: p.toString() });
          break; // don't duplicate same file
        }
      }
    } catch (e) {
      /* ignore unreadable */
    }
  }
  return matches;
}

const files = walk(root);
const results = scanFiles(files);
if (results.length) {
  console.error("\n❌ Potential secrets found in repository (scan results):");
  results.forEach(r => console.error(` - ${r.file} (pattern ${r.pattern})`));
  console.error("\nPlease remove any sensitive content.");
  process.exit(1);
}
console.log("✅ No obvious service account secrets or private key patterns found.");
process.exit(0);

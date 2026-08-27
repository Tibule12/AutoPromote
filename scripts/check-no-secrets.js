#!/usr/bin/env node
"use strict";
// Simple repo-wide secret scanner (looks for patterns commonly used by service account JSONs)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const ignore = [
  "node_modules",
  ".git",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  "frontend/build",
  "dist",
  "tmp",
  "test-results",
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
  "scripts/check-no-secrets.js",
  "RENDER_ENV_SETUP.md",
  "firebase-diagnostics.js",
];
const patterns = [
  /-----BEGIN PRIVATE KEY-----/i,
  /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/i,
  /"client_email"\s*:\s*"[\w-]+@.*\.iam\.gserviceaccount\.com"/i,
];

function shouldIgnore(p) {
  const normalized = path.relative(root, p).replace(/\\/g, "/");
  const wrapped = `/${normalized.replace(/^\/+|\/+$/g, "")}/`;
  return ignore.some(item => {
    const normalizedItem = String(item).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return normalizedItem && wrapped.includes(`/${normalizedItem}/`);
  });
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

function listRepositoryFiles() {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    return output
      .split("\0")
      .filter(Boolean)
      .map(file => path.join(root, file))
      .filter(file => !shouldIgnore(file));
  } catch (error) {
    return walk(root);
  }
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

const files = listRepositoryFiles();
const results = scanFiles(files);
if (results.length) {
  console.error("\n❌ Potential secrets found in repository (scan results):");
  results.forEach(r => console.error(` - ${r.file} (pattern ${r.pattern})`));
  console.error("\nPlease remove any sensitive content.");
  process.exit(1);
}
console.log("✅ No obvious service account secrets or private key patterns found.");
process.exit(0);

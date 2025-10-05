#!/usr/bin/env node
// generateSecret.js - produce a high entropy SESSION_SECRET / general secret material.
// Usage: node scripts/generateSecret.js [length]
// Default length 96. Output printed to stdout only.

const crypto = require('crypto');

const length = parseInt(process.argv[2] || '96', 10);
if (length < 32) {
  console.error('Refusing to generate secret shorter than 32 characters.');
  process.exit(1);
}

// We'll generate length*1.5 raw bytes then base64url and truncate to requested length for high entropy.
const raw = crypto.randomBytes(Math.ceil(length * 1.5));
const b64url = raw.toString('base64')
  .replace(/\+/g,'-')
  .replace(/\//g,'_')
  .replace(/=+$/,'');
const secret = b64url.slice(0, length);

console.log(secret);

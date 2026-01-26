#!/usr/bin/env node
// Replay a captured TikTok chunk upload for diagnostics
// Usage: node scripts/replay-tiktok-capture.js --capture <capture_dir_or_meta.json> [--override-url <url>]

const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--capture' && argv[i + 1]) {
      args.capture = argv[++i];
    } else if (a === '--override-url' && argv[i + 1]) {
      args.overrideUrl = argv[++i];
    }
  }
  return args;
}

(async function main() {
  const args = parseArgs();
  if (!args.capture) {
    console.error('Usage: --capture <capture_dir_or_meta.json> [--override-url <url>]');
    process.exit(2);
  }

  let metaPath = args.capture;
  // If a directory was provided, look for meta.json
  try {
    const stats = fs.statSync(metaPath);
    if (stats.isDirectory()) metaPath = path.join(metaPath, 'meta.json');
  } catch (e) {
    // If not found, assume it's a file
  }

  if (!fs.existsSync(metaPath)) {
    console.error('Capture meta not found at', metaPath);
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const dir = path.dirname(metaPath);

  // find a chunk file in dir
  const files = fs.readdirSync(dir).filter(f => f.startsWith('chunk-') && f.endsWith('.bin'));
  if (!files.length) {
    console.error('No chunk file found in', dir);
    process.exit(1);
  }

  const chunkFile = path.join(dir, files[0]);
  const chunk = fs.readFileSync(chunkFile);

  const uploadUrl = args.overrideUrl || meta.uploadUrl;
  if (!uploadUrl) {
    console.error('No uploadUrl found in meta and no override provided');
    process.exit(1);
  }

  const method = (meta.method || 'PUT').toUpperCase();
  const headers = Object.assign({}, meta.headers || {});

  console.log('Replaying chunk to', uploadUrl, 'method=', method, 'headers=', headers);

  try {
    const res = await fetch(uploadUrl, {
      method,
      headers,
      body: chunk,
    });

    let bodyText = null;
    try {
      bodyText = await res.text();
    } catch (_) {
      bodyText = '<no-body-or-binary>'; 
    }

    const resHeaders = {};
    try {
      if (res.headers && typeof res.headers.forEach === 'function') {
        res.headers.forEach((val, k) => (resHeaders[k] = val));
      } else if (res.headers && typeof res.headers.entries === 'function') {
        for (const [k, v] of res.headers.entries()) resHeaders[k] = v;
      }
    } catch (_) {}

    const result = {
      status: res.status,
      ok: res.ok,
      headers: resHeaders,
      body: bodyText,
    };

    console.log('Replay result:', JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(dir, 'replay-result.json'), JSON.stringify(result, null, 2));
    console.log('Wrote replay-result.json to', dir);
    process.exit(0);
  } catch (e) {
    console.error('Replay failed:', e && (e.message || e));
    process.exit(1);
  }
})();
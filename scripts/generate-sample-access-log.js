#!/usr/bin/env node
/**
 * Generate a synthetic access log with suspicious patterns for evidence.
 * Output: logs/access-YYYY-MM-DD.log
 */
const fs = require("fs");
const path = require("path");

function main() {
  const day = new Date().toISOString().slice(0, 10);
  const logDir = path.join(__dirname, "..", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const filePath = path.join(logDir, `access-${day}.log`);

  const now = Date.now();
  const tenMin = 10 * 60 * 1000;
  const iso = ms => new Date(ms).toISOString();
  const lines = [];
  // Anchor to the start of the current 10-minute bucket to keep all events in one bucket
  const bucketStart = Math.floor(now / tenMin) * tenMin + 1000; // +1s safety
  const base = bucketStart;
  // Analyzer's parseLine expects format with METHOD right after [ACCESS],
  // then URL, then status immediately after URL:
  // [ACCESS] METHOD /path status=### ... ts=ISO ...
  const add = (ms, method, url, status, rest) => {
    lines.push(`[ACCESS] ${method} ${url} status=${status} ts=${iso(ms)} ${rest}`);
  };

  // Brute force pattern: many 401s from same IP within 10 minutes
  add(
    base + 0 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a1" clientIP="10.0.0.5" responseTimeMS=42 responseBytes=123 userAgent="curl"'
  );
  add(
    base + 60 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a2" clientIP="10.0.0.5" responseTimeMS=40 responseBytes=120 userAgent="curl"'
  );
  add(
    base + 4 * 60 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a3" clientIP="10.0.0.5" responseTimeMS=38 responseBytes=118 userAgent="curl"'
  );
  add(
    base + 5 * 60 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a4" clientIP="10.0.0.5" responseTimeMS=39 responseBytes=119 userAgent="curl"'
  );
  add(
    base + 6 * 60 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a5" clientIP="10.0.0.5" responseTimeMS=41 responseBytes=121 userAgent="curl"'
  );
  add(
    base + 7 * 60 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a6" clientIP="10.0.0.5" responseTimeMS=37 responseBytes=117 userAgent="curl"'
  );
  add(
    base + 8 * 60 * 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a7" clientIP="10.0.0.5" responseTimeMS=36 responseBytes=116 userAgent="curl"'
  );
  add(
    base + 9 * 60 * 1000 - 1000,
    "GET",
    "/api/auth/login",
    401,
    'requestID="a8" clientIP="10.0.0.5" responseTimeMS=35 responseBytes=115 userAgent="curl"'
  );

  // Admin probing from a second IP
  add(
    base + 2 * 60 * 1000 + 0,
    "GET",
    "/api/admin/metrics",
    401,
    'requestID="b1" clientIP="10.0.0.9" responseTimeMS=30 responseBytes=110 userAgent="curl"'
  );
  add(
    base + 2 * 60 * 1000 + 1000,
    "GET",
    "/api/admin/metrics",
    403,
    'requestID="b2" clientIP="10.0.0.9" responseTimeMS=28 responseBytes=108 userAgent="curl"'
  );
  add(
    base + 2 * 60 * 1000 + 2000,
    "GET",
    "/api/admin/metrics",
    403,
    'requestID="b3" clientIP="10.0.0.9" responseTimeMS=26 responseBytes=106 userAgent="curl"'
  );

  // 5xx spike sample
  add(
    base + 3 * 60 * 1000 + 0,
    "GET",
    "/api/users",
    500,
    'requestID="c1" clientIP="10.0.0.20" responseTimeMS=75 responseBytes=0 userAgent="curl"'
  );
  add(
    base + 3 * 60 * 1000 + 1000,
    "GET",
    "/api/users",
    502,
    'requestID="c2" clientIP="10.0.0.20" responseTimeMS=80 responseBytes=0 userAgent="curl"'
  );
  add(
    base + 3 * 60 * 1000 + 2000,
    "GET",
    "/api/users",
    503,
    'requestID="c3" clientIP="10.0.0.20" responseTimeMS=82 responseBytes=0 userAgent="curl"'
  );

  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  const size = fs.statSync(filePath).size;
  console.log("Wrote sample access log:", filePath, "bytes=", size);
}

if (require.main === module) {
  main();
}

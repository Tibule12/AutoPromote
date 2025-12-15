#!/usr/bin/env node
/**
 * Security log analyzer for AutoPromote
 *
 * Reads access logs produced when LOG_EVENTS_TO_FILE=true in server.js
 * Detects:
 *  - Brute-force login attempts (many 401s per IP)
 *  - Unauthorized admin probing (/api/admin* with 401/403)
 *  - 5xx spikes (error bursts)
 * Emits:
 *  - Console summary (screenshot-worthy)
 *  - JSON report under logs/security-alerts-YYYYMMDD-HHMMSS.json
 *  - Optional Slack notification via SECURITY_SLACK_WEBHOOK_URL
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

function findLatestAccessLog(logDir) {
  try {
    const files = fs.readdirSync(logDir).filter(f => /^access-\d{4}-\d{2}-\d{2}\.log$/.test(f));
    if (!files.length) return null;
    // Pick the newest by mtime
    const withTime = files
      .map(f => ({
        f,
        t: fs.statSync(path.join(logDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.t - a.t);
    return path.join(logDir, withTime[0].f);
  } catch (e) {
    return null;
  }
}

function parseLine(line) {
  // Example format:
  // [ACCESS] ts=2025-11-07T15:02:10.123Z GET /api/auth/login status=401 requestID="..." clientIP="1.2.3.4" responseTimeMS=20 responseBytes=123 userAgent="Chrome ..."
  if (!line.startsWith("[ACCESS]")) return null;
  const tsMatch = line.match(/ts=([^\s]+)/);
  const methodMatch = line.match(/\]\s+(\w+)\s+/); // after [ACCESS] ts=...
  const urlMatch = line.match(/\s\w+\s+(\S+)\s+status=/);
  const statusMatch = line.match(/status=(\d{3})/);
  const ipMatch = line.match(/clientIP=\"([^\"]*)\"/);
  const uaMatch = line.match(/userAgent=\"([^\"]*)\"/);
  if (!tsMatch || !methodMatch || !urlMatch || !statusMatch) return null;
  return {
    ts: new Date(tsMatch[1]).getTime() || Date.now(),
    method: methodMatch[1],
    url: urlMatch[1],
    status: parseInt(statusMatch[1], 10),
    ip: ipMatch ? ipMatch[1] : "",
    ua: uaMatch ? uaMatch[1] : "",
  };
}

function bucket(ts, windowMs) {
  return Math.floor(ts / windowMs) * windowMs;
}

function analyze(entries) {
  const alerts = [];
  const now = Date.now();
  const tenMin = 10 * 60 * 1000;

  // Brute-force detection: >= 8 x 401s per IP within any 10-min bucket
  const byIpBucket401 = new Map();
  for (const e of entries) {
    if (e.status === 401) {
      const key = `${e.ip}|${bucket(e.ts, tenMin)}`;
      byIpBucket401.set(key, (byIpBucket401.get(key) || 0) + 1);
    }
  }
  const brute = [];
  for (const [k, v] of byIpBucket401.entries()) {
    if (v >= 8) {
      const [ip, b] = k.split("|");
      brute.push({ ip, windowStart: new Date(Number(b)).toISOString(), count: v });
    }
  }
  if (brute.length) {
    alerts.push({
      type: "BRUTE_FORCE_401",
      severity: "medium",
      message: `Detected potential brute-force attempts from ${brute.length} IP(s)`,
      details: brute,
    });
  }

  // Admin probing: /api/admin* with 401/403, >= 3 in 10 minutes per IP
  const byIpBucketAdmin = new Map();
  for (const e of entries) {
    if (/^\/api\/admin/.test(e.url) && (e.status === 401 || e.status === 403)) {
      const key = `${e.ip}|${bucket(e.ts, tenMin)}`;
      byIpBucketAdmin.set(key, (byIpBucketAdmin.get(key) || 0) + 1);
    }
  }
  const probe = [];
  for (const [k, v] of byIpBucketAdmin.entries()) {
    if (v >= 3) {
      const [ip, b] = k.split("|");
      probe.push({ ip, windowStart: new Date(Number(b)).toISOString(), count: v });
    }
  }
  if (probe.length) {
    alerts.push({
      type: "ADMIN_PROBING",
      severity: "high",
      message: `Unauthorized admin probing detected from ${probe.length} IP(s)`,
      details: probe,
    });
  }

  // 5xx spike: overall 5xx rate > 1% OR >= 10 in a 10 minutes bucket
  const total = entries.length || 1;
  const fivexx = entries.filter(e => e.status >= 500).length;
  const rate = (fivexx / total) * 100;
  const byBucket5xx = new Map();
  for (const e of entries) {
    if (e.status >= 500) {
      const key = bucket(e.ts, tenMin);
      byBucket5xx.set(key, (byBucket5xx.get(key) || 0) + 1);
    }
  }
  let spikeBucket = null;
  for (const [k, v] of byBucket5xx.entries()) {
    if (v >= 10) {
      spikeBucket = { at: new Date(Number(k)).toISOString(), count: v };
      break;
    }
  }
  if (rate > 1 || spikeBucket) {
    alerts.push({
      type: "SERVER_ERRORS_SPIKE",
      severity: spikeBucket ? "high" : "medium",
      message:
        `5xx errors: ${fivexx}/${total} (${rate.toFixed(2)}%)` +
        (spikeBucket ? `; spike at ${spikeBucket.at} count=${spikeBucket.count}` : ""),
      details: { totalRequests: total, fivexx },
    });
  }

  return { alerts, stats: { totalRequests: total, fivexx } };
}

function postSlack(webhookUrl, text) {
  return new Promise(resolve => {
    if (!webhookUrl) return resolve(false);
    try {
      const data = JSON.stringify({ text });
      const url = new URL(webhookUrl);
      const opts = {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname + (url.search || ""),
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      };
      const req = https.request(opts, res => {
        res.on("data", () => {});
        res.on("end", () => resolve(true));
      });
      req.on("error", () => resolve(false));
      req.write(data);
      req.end();
    } catch (_) {
      resolve(false);
    }
  });
}

async function main() {
  const logDir = path.join(__dirname, "..", "logs");
  const explicitPath = process.argv[2];
  const file = explicitPath ? path.resolve(explicitPath) : findLatestAccessLog(logDir);
  if (!file || !fs.existsSync(file)) {
    console.error(
      "No access log file found. Ensure LOG_EVENTS_TO_FILE=true and server has handled traffic."
    );
    process.exit(2);
  }
  const raw = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const entries = raw.map(parseLine).filter(Boolean);
  const { alerts, stats } = analyze(entries);

  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  const outDir = logDir;
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (_) {}
  const outPath = path.join(outDir, `security-alerts-${ts}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.basename(file),
    alerts,
    stats,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Pretty console output (for screenshots)
  console.log("\n=== Security Log Analyzer Summary ===");
  console.log("Source file:", file);
  console.log("Total requests:", stats.totalRequests);
  console.log("5xx errors:", stats.fivexx);
  if (alerts.length === 0) {
    console.log("Alerts: none");
  } else {
    console.log("Alerts found:", alerts.length);
    alerts.forEach((a, i) => {
      console.log(` ${i + 1}. [${a.severity}] ${a.type} - ${a.message}`);
    });
  }
  console.log("JSON report:", outPath);

  const webhook = process.env.SECURITY_SLACK_WEBHOOK_URL || "";
  if (webhook && alerts.length) {
    const text =
      `AutoPromote security analyzer\nFile: ${path.basename(file)}\nAlerts: ${alerts.length}\n` +
      alerts.map(a => `• [${a.severity}] ${a.type}: ${a.message}`).join("\n");
    const ok = await postSlack(webhook, text);
    console.log("Slack notification:", ok ? "sent" : "skipped/failed");
  } else {
    console.log("Slack notification: skipped (no webhook or no alerts)");
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error("Analyzer failed:", e.message);
    process.exit(1);
  });
}

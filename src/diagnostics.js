// Lightweight runtime diagnostics and counters (non-persistent)
const ipCounters = new Map();
const authFailures = { no_token: 0, invalid_token_format: 0, verify_error: 0 };

// Increment an auth failure type and optionally record per-IP counters
function incAuthFail(type, ip) {
  if (!authFailures[type]) authFailures[type] = 0;
  authFailures[type]++;
  if (ip) {
    const now = Date.now();
    const entry = ipCounters.get(ip) || { count: 0, lastTs: now };
    // Simple sliding window: increment count and reset if older than window
    if (now - entry.lastTs > 60_000) {
      entry.count = 1;
      entry.lastTs = now;
    } else {
      entry.count = (entry.count || 0) + 1;
      entry.lastTs = now;
    }
    ipCounters.set(ip, entry);
  }
}

function getIpCount(ip) {
  const e = ipCounters.get(ip);
  return e ? e.count : 0;
}

function snapshot() {
  // Return small summary suitable for logs / health endpoints
  const topIps = Array.from(ipCounters.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, v]) => ({ ip, count: v.count, lastTs: v.lastTs }));
  return {
    authFailures: { ...authFailures },
    topIps,
  };
}

function reset() {
  ipCounters.clear();
  authFailures.no_token = 0;
  authFailures.invalid_token_format = 0;
  authFailures.verify_error = 0;
}

module.exports = { incAuthFail, getIpCount, snapshot, reset };

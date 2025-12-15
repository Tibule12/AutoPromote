const express = require("express");
const path = require("path");
const app = express();
const port = process.env.STATIC_SERVER_PORT || 5000;

// Lightweight in-memory rate limiter for test static server
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 200; // max requests per window per IP
const _rateMap = new Map();
app.use((req, res, next) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();
    let info = _rateMap.get(ip) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
    if (now > info.reset) {
      info = { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
    }
    info.count++;
    _rateMap.set(ip, info);
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, RATE_LIMIT_MAX - info.count));
    if (info.count > RATE_LIMIT_MAX) {
      return res.status(429).send("Rate limit exceeded");
    }
  } catch (err) {
    // Fail open for test harness if anything goes wrong
  }
  next();
});

app.use(express.static(path.join(__dirname, "../../../frontend/build")));
// Serve e2e fixtures so we can load standalone HTML test pages
app.use(express.static(path.join(__dirname, "../../fixtures")));
// Fallback to index.html for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../../frontend/build/index.html"));
});
app.listen(port, () => console.log("Static server started on port", port));

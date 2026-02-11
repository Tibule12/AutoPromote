const express = require("express");
const path = require("path");
const app = express();
const port = process.env.STATIC_SERVER_PORT || 5000;
// Avoid starting multiple servers when tests `require` this module repeatedly
let __staticServerReady;
if (global.__STATIC_SERVER_STARTED) {
  console.log("Static server already started; skipping");
  __staticServerReady = Promise.resolve();
} else {
  global.__STATIC_SERVER_STARTED = true;

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
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, "../../../frontend/build/index.html"));
  });

  __staticServerReady = new Promise((resolve, reject) => {
    // Start server and handle errors like EADDRINUSE (can't catch via try/catch)
    const server = app.listen(port);
    server.on("listening", () => {
      const p = server.address().port;
      console.log("Static server started on port", p);
      process.env.E2E_BASE_URL = `http://localhost:${p}`;
      resolve();
    });
    server.on("error", err => {
      if (err && err.code === "EADDRINUSE") {
        console.log("Static server port already in use; attempting to bind to an ephemeral port");
        const fallback = app.listen(0);
        fallback.on("listening", () => {
          const p = fallback.address().port;
          console.log("Static server started on ephemeral port", p);
          process.env.E2E_BASE_URL = `http://localhost:${p}`;
          resolve();
        });
        fallback.on("error", e => {
          console.error("Failed to start static server on fallback port", e);
          reject(e);
        });
      } else {
        reject(err);
      }
    });
  });
}

module.exports = __staticServerReady;

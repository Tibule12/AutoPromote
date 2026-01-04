const express = require("express");
const adminOnly = require("../middlewares/adminOnly");
const router = express.Router();

// Attempt to load metrics module once at startup so deploy issues surface in logs
let getMetrics = () => ({
  /* empty until metrics module loads */
});
try {
  ({ getMetrics } = require("../utils/queryMetrics"));
} catch (e) {
  console.warn("[adminMetricsRoutes] queryMetrics module not found at startup:", e.message);
}

router.get("/query-metrics", require("../authMiddleware"), adminOnly, (req, res) => {
  try {
    // If module was unavailable earlier, try a late load (in case of race / lazy extraction)
    if (!getMetrics || typeof getMetrics !== "function") {
      try {
        ({ getMetrics } = require("../utils/queryMetrics"));
      } catch (_) {
        /* ignore */
      }
    }
    const metricsFn = getMetrics && typeof getMetrics === "function" ? getMetrics : () => ({});
    const metrics = metricsFn();
    const mem = process.memoryUsage();
    res.json({
      ok: true,
      at: Date.now(),
      metrics,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    });
  } catch (e) {
    // Provide clearer error payload while still indicating server error
    res.status(500).json({ ok: false, error: e.message, hint: "metrics_module_load_failed" });
  }
});

module.exports = router;

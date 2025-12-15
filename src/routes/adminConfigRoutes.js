const express = require("express");
const router = express.Router();
const { updateConfig, getConfig } = require("../services/configService");
let authMiddleware;
try {
  authMiddleware = require("../authMiddleware");
} catch (_) {
  authMiddleware = (req, res, next) => next();
}
const adminOnly = require("../middlewares/adminOnly");
const { rateLimiter } = require("../middlewares/globalRateLimiter");

const adminPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_ADMIN_PUBLIC || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "admin_config",
});

// Apply router-level limiter for admin config endpoints
router.use(adminPublicLimiter);
const { db } = require("../firebaseAdmin");
const { validateEnv } = require("../utils/envValidator");
const SENSITIVE_PREFIXES = ["PAYPAL_", "SESSION_SECRET", "JWT_", "DOC_SIGNING_SECRET"];

router.get("/", authMiddleware, adminOnly, async (_req, res) => {
  try {
    const cfg = await getConfig();
    return res.json({ ok: true, config: cfg });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/weight-history", authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const snap = await require("../firebaseAdmin")
      .db.collection("bandit_weight_history")
      .orderBy("at", "desc")
      .limit(limit)
      .get();
    const history = snap.docs.map(d => d.data());
    return res.json({ ok: true, history });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/update", authMiddleware, adminOnly, async (req, res) => {
  try {
    const patch = req.body || {};
    // Whitelist fields to prevent arbitrary doc pollution
    const allowed = [
      "banditWeights",
      "banditExplorationTarget",
      "banditExplorationTolerance",
      "banditExplorationFactor",
      "rewardNormalization", // { method:'zscore'|'percentile', window: N }
      "penaltyScaling", // { suppressed: number, quarantined: number }
      "rollback", // { ctrDropPct, minObservations }
      "alerting", // { webhookUrl, enabledEvents: [] }
    ];
    const filtered = {};
    allowed.forEach(k => {
      if (patch[k] !== undefined) filtered[k] = patch[k];
    });
    if (Object.keys(filtered).length === 0)
      return res.status(400).json({ ok: false, error: "no_valid_fields" });
    const updated = await updateConfig(filtered);
    try {
      await db
        .collection("admin_logs")
        .add({
          type: "config_update",
          by: req.userId || "unknown",
          patch: filtered,
          at: new Date().toISOString(),
        });
    } catch (_) {}
    return res.json({ ok: true, config: updated });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Lightweight environment diagnostics (admin only)
// Provides validation errors/warnings plus masked presence of selected vars.
router.get("/env-status", authMiddleware, adminOnly, async (_req, res) => {
  try {
    const { errors, warnings } = validateEnv({ strict: false });
    // Build a presence map without exposing raw secrets
    const interesting = [
      "ENABLE_BACKGROUND_JOBS",
      "PAYMENTS_ENABLED",
      "PAYPAL_ENABLED",
      "PAYPAL_WEBHOOK_ID",
      "JWT_AUDIENCE",
      "JWT_ISSUER",
      "SESSION_SECRET",
      "RATE_LIMIT_GLOBAL_MAX",
      "ENABLE_DISTRIBUTED_LIMITER",
      "REDIS_URL",
      "REDIS_HOST",
    ];
    const envPresence = {};
    interesting.forEach(k => {
      if (process.env[k] === undefined) {
        envPresence[k] = { present: false };
        return;
      }
      let value = process.env[k];
      const sensitive = SENSITIVE_PREFIXES.some(p => k.startsWith(p));
      if (sensitive && value) {
        // Mask: keep first 4 and last 2 chars if length allows
        if (value.length > 10) value = value.slice(0, 4) + "***" + value.slice(-2);
        else value = "***";
      }
      envPresence[k] = { present: true, value };
    });
    return res.json({
      ok: true,
      errors,
      warnings,
      backgroundJobsEnabled: process.env.ENABLE_BACKGROUND_JOBS === "true",
      env: envPresence,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

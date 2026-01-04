const express = require("express");
const router = express.Router();
const { db } = require("../firebaseAdmin");
const autopilotService = require("../services/autopilotService");
let authMiddleware;
try {
  authMiddleware = require("../authMiddleware");
} catch (_) {
  authMiddleware = (req, res, next) => next();
}
const adminOnly = require("../middlewares/adminOnly");
const { rateLimiter } = require("../middlewares/globalRateLimiter");

const abAdminLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_AB_ADMIN || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "ab_admin",
});

// GET /api/admin/ab_tests/:id - retrieve test
router.get("/:id", authMiddleware, adminOnly, abAdminLimiter, async (req, res) => {
  try {
    const testId = req.params.id;
    if (!testId) return res.status(400).json({ ok: false, error: "missing_test_id" });
    const snap = await db.collection("ab_tests").doc(testId).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, test: snap.data() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/ab_tests/:id/metrics - return per-variant timeseries (daily) for the AB test's content
router.get("/:id/metrics", authMiddleware, adminOnly, abAdminLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
    const days = Math.min(parseInt(req.query.days || "14", 10), 90);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const snap = await db.collection("ab_tests").doc(id).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
    const test = snap.data();
    const contentId = test.contentId || id;
    // Query platform_posts for recent posts for this content
    const postsSnap = await db
      .collection("platform_posts")
      .where("contentId", "==", contentId)
      .orderBy("createdAt", "desc")
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const buckets = {};
    const variantSet = new Set();
    postsSnap.docs.forEach(d => {
      const p = d.data();
      const created =
        p.createdAt && typeof p.createdAt.toDate === "function"
          ? p.createdAt.toDate()
          : new Date(p.createdAt || Date.now());
      if (created < sinceDate) return; // off-window
      const dayKey = created.toISOString().split("T")[0];
      const variant =
        p.usedVariant ||
        (p.rawOutcome && p.rawOutcome.usedVariant) ||
        (typeof p.variantIndex === "number" ? `variant_${p.variantIndex}` : "unknown");
      variantSet.add(variant);
      if (!buckets[dayKey]) buckets[dayKey] = { day: dayKey, totalPosts: 0 };
      buckets[dayKey].totalPosts = (buckets[dayKey].totalPosts || 0) + 1;
      // Add counts for variant-specific fields
      const views = (p.metrics && (p.metrics.views || p.metrics.impressions)) || 0;
      const conversions = (p.metrics && (p.metrics.conversions || p.metrics.clicks || 0)) || 0;
      buckets[dayKey][`${variant}_views`] = (buckets[dayKey][`${variant}_views`] || 0) + views;
      buckets[dayKey][`${variant}_conversions`] =
        (buckets[dayKey][`${variant}_conversions`] || 0) + conversions;
    });
    const sortedDays = Object.keys(buckets).sort();
    const timeseries = sortedDays.map(day => buckets[day]);
    // Include autopilot actions (if present) sorted by date
    const actions = (test.autopilotActions || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(
            a.triggeredAt && a.triggeredAt.toDate ? a.triggeredAt.toDate() : a.triggeredAt || 0
          ) -
          new Date(
            b.triggeredAt && b.triggeredAt.toDate ? b.triggeredAt.toDate() : b.triggeredAt || 0
          )
      );
    return res.json({ ok: true, contentId, timeseries, variants: Array.from(variantSet), actions });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/admin/ab_tests/:id/autopilot - set autopilot settings
router.put("/:id/autopilot", authMiddleware, adminOnly, abAdminLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const {
      enabled,
      confidenceThreshold,
      minSample,
      mode,
      maxBudgetChangePercent,
      allowBudgetIncrease,
      requiresApproval,
    } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
    const updates = {};
    if (typeof enabled === "boolean") updates["autopilot.enabled"] = enabled;
    if (typeof confidenceThreshold === "number")
      updates["autopilot.confidenceThreshold"] = confidenceThreshold;
    if (typeof minSample === "number") updates["autopilot.minSample"] = minSample;
    if (typeof mode === "string") updates["autopilot.mode"] = mode;
    if (typeof maxBudgetChangePercent === "number")
      updates["autopilot.maxBudgetChangePercent"] = maxBudgetChangePercent;
    if (typeof allowBudgetIncrease === "boolean")
      updates["autopilot.allowBudgetIncrease"] = allowBudgetIncrease;
    if (typeof requiresApproval === "boolean")
      updates["autopilot.requiresApproval"] = requiresApproval;
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ ok: false, error: "no_updates" });
    await db.collection("ab_tests").doc(id).update(updates);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/ab_tests/:id/autopilot/preview - simulate autopilot decision (no writes)
router.post(
  "/:id/autopilot/preview",
  authMiddleware,
  adminOnly,
  abAdminLimiter,
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
      const snap = await db.collection("ab_tests").doc(id).get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
      const test = snap.data();
      const decision = autopilotService.decideAutoApply(test);
      // Return decision and raw test doc to enrich client simulators/UI
      return res.json({ ok: true, decision, test });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// POST /api/admin/ab_tests/:id/autopilot/simulate - server-side deterministic simulate (no writes)
router.post(
  "/:id/autopilot/simulate",
  authMiddleware,
  adminOnly,
  abAdminLimiter,
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
      const { samples = 400, seed = 42, budgetPct } = req.body || {};
      const snap = await db.collection("ab_tests").doc(id).get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
      const test = snap.data();
      const decision = autopilotService.decideAutoApply(test);
      // Use deterministic sampling from statistics utility
      const {
        generatePosteriorSamplesForTopVsBaselineDeterministic,
      } = require("../utils/statistics");
      const simSamples = generatePosteriorSamplesForTopVsBaselineDeterministic(
        test.variants || [],
        Number(samples),
        Number(seed)
      );
      const sorted = (simSamples || []).slice().sort((a, b) => a - b);
      const percentile = p => {
        if (!sorted.length) return 0;
        const idx = Math.floor((sorted.length - 1) * p);
        return sorted[idx];
      };
      const p50 = percentile(0.5);
      const p95 = percentile(0.95);
      let budgetSimulation = null;
      if (typeof budgetPct !== "undefined" && decision && decision.winner) {
        const winning = (test.variants || []).find(v => v.id === decision.winner);
        const currentBudget =
          winning &&
          winning.promotionSettings &&
          typeof winning.promotionSettings.budget === "number"
            ? winning.promotionSettings.budget
            : 0;
        const currentViews =
          winning && winning.metrics && typeof winning.metrics.views === "number"
            ? winning.metrics.views
            : 0;
        const pct = Number(budgetPct) || 0;
        const newBudget = currentBudget * (1 + pct / 100);
        const viewsPerBudget =
          currentBudget > 0 ? currentViews / currentBudget : currentViews || 1000;
        const newViews =
          currentBudget > 0
            ? Math.round(viewsPerBudget * newBudget)
            : Math.round(currentViews + newBudget * (viewsPerBudget || 1000));
        const deltaViews = newViews - currentViews;
        const deltaConversions = (decision.incConversionsPer1000Views || 0) * (deltaViews / 1000);
        const deltaRevenue =
          (decision.estimatedRevenueChangePer1000Views || 0) * (deltaViews / 1000);
        budgetSimulation = {
          pct,
          currentBudget,
          newBudget,
          currentViews,
          newViews,
          deltaViews,
          deltaConversions,
          deltaRevenue,
        };
      }
      return res.json({
        ok: true,
        decision,
        simulation: { samples: simSamples, p50, p95 },
        budgetSimulation,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);
// POST /api/admin/ab_tests/:id/autopilot/apply - apply autopilot if conditions met
router.post("/:id/autopilot/apply", authMiddleware, adminOnly, abAdminLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
    const options = req.body || {};
    const result = await autopilotService.applyAuto(id, options);
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/ab_tests/:id/autopilot/rollback - rollback the most recent autopilot action
router.post(
  "/:id/autopilot/rollback",
  authMiddleware,
  adminOnly,
  abAdminLimiter,
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
      const result = await autopilotService.rollbackAuto(id);
      return res.json({ ok: true, result });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// POST /api/admin/ab_tests/:id/autopilot/approve - set approval for autopilot
router.post(
  "/:id/autopilot/approve",
  authMiddleware,
  adminOnly,
  abAdminLimiter,
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
      const user = req.user || {};
      await db
        .collection("ab_tests")
        .doc(id)
        .update({
          "autopilot.approvedBy": user.uid || "admin",
          "autopilot.approvedAt": new Date(),
        });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// POST /api/admin/ab_tests/:id/autopilot/unapprove - clear approval
router.post(
  "/:id/autopilot/unapprove",
  authMiddleware,
  adminOnly,
  abAdminLimiter,
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing_test_id" });
      await db.collection("ab_tests").doc(id).update({
        "autopilot.approvedBy": null,
        "autopilot.approvedAt": null,
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

module.exports = router;

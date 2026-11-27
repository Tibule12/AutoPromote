// usageRoutes.js
// API endpoints for checking usage stats and limits

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { getUserUsageStats } = require("../middlewares/usageLimitMiddleware");

const { SUBSCRIPTION_PLANS, normalizePlanId, resolvePlan } = require("../config/subscriptionPlans");

function formatLimitValue(value, noun) {
  if (value === Infinity) {
    return `Custom ${noun}`;
  }
  return `${value} ${noun}`;
}

function buildPricingTiers() {
  return Object.values(SUBSCRIPTION_PLANS).reduce((tiers, plan) => {
    tiers[plan.id] = {
      name: plan.name,
      price: Number(plan.price) || 0,
      currency: "USD",
      period: "month",
      limits: {
        uploads: plan.features?.uploads,
        promotions: Number(plan.features?.monthlyPromotions) || 0,
        platforms: plan.features?.platformLimit,
        analytics: plan.features?.analytics || "basic",
        support: plan.features?.support || "Self-serve",
      },
      features: [
        formatLimitValue(plan.features?.uploads, "content uploads per month"),
        formatLimitValue(plan.features?.platformLimit, "connected platforms"),
        `${plan.features?.analytics || "Basic"} analytics`,
        `${plan.features?.support || "Self-serve"} support`,
      ],
      popular: plan.id === "pro",
    };
    return tiers;
  }, {});
}

router.get("/processing", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { db } = require("../firebaseAdmin");
    await require('../services/processingTokens/runtime').reconcilePending(userId);
    const [processing, user] = await Promise.all([
      require("../services/processingTokens/runtime").service().status(userId),
      db.collection("users").doc(userId).get(),
    ]);
    const data = user.data() || {};
    const tester = require("../config/testerProgram").getActiveTesterAccess(data);
    const promotion = require("../config/testerProgram").getTesterCreditState(tester);
    res.json({
      success: true,
      processing,
      balances: {
        purchasedCredits: Number(data.credits || 0),
        promotionalCredits: promotion?.remaining ?? null,
      },
    });
  } catch (error) {
    res.status(error.status || 503).json({ error: error.code || "USAGE_UNAVAILABLE" });
  }
});
router.post("/storage/reserve", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const lease = await require("../services/processingTokens/runtime")
      .service()
      .reserveStorage(uid, {
        requestId: req.get("Idempotency-Key"),
        storagePath: req.body.storagePath,
        bytes: req.body.bytes,
        retentionHours: req.body.retentionHours || 24,
      });
    res.json({ success: true, reservation: lease });
  } catch (error) {
    res
      .status(error.status || 400)
      .json({ error: error.code || "STORAGE_RESERVATION_UNAVAILABLE" });
  }
});
router.post("/storage/complete", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid,
      leaseId = req.body.leaseId;
    if (!/^[a-f0-9]{64}$/.test(leaseId || ""))
      return res.status(400).json({ error: "INVALID_RESERVATION" });
    const { db, storage } = require("../firebaseAdmin");
    const lease = (
      await db.collection("processing_storage_reservations").doc(leaseId).get()
    ).data();
    if (!lease || lease.userId !== uid)
      return res.status(404).json({ error: "RESERVATION_NOT_FOUND" });
    const object = storage.bucket().file(lease.storagePath);
    let meta;
    try {
      [meta] = await object.getMetadata();
    } catch (error) {
      if (Number(error.code) !== 404) throw error;
    }
    const result = await require("../services/processingTokens/runtime")
      .service()
      .reconcileStorage(uid, leaseId, {
        exists: Boolean(meta),
        measuredBytes: Number(meta?.size || 0),
        generation: String(meta?.generation || ""),
      });
    res.json({ success: true, reservation: result });
  } catch (error) {
    res
      .status(error.status || 503)
      .json({ error: error.code || "STORAGE_RECONCILIATION_UNAVAILABLE" });
  }
});
router.post("/processing/quote", authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      estimate: require("../services/processingTokens/runtime").service().quote(req.body.operation),
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.code || "QUOTE_UNAVAILABLE" });
  }
});

/**
 * GET /api/usage/stats
 * Get current user's usage statistics
 */
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const stats = await getUserUsageStats(userId);

    res.json({
      success: true,
      userId,
      stats: {
        ...stats,
        percentUsed: stats.limit === Infinity ? 0 : Math.round((stats.used / stats.limit) * 100),
        canUpload: stats.remaining > 0,
        needsUpgrade: false,
      },
    });
  } catch (error) {
    console.error("[usageRoutes] Error getting stats:", error);
    res.status(500).json({ error: "Failed to get usage stats" });
  }
});

/**
 * POST /api/usage/upgrade
 * Upgrade user to premium (placeholder for payment integration)
 */
router.post("/upgrade", authMiddleware, (_req, res) => {
  res
    .status(410)
    .json({
      error: "VERIFIED_PAYMENT_REQUIRED",
      message: "Subscriptions require server-verified payment. Use the billing page.",
      billingUrl: "/pricing",
    });
});

/**
 * GET /api/usage/pricing
 * Get pricing information
 */
router.get("/pricing", async (req, res) => {
  try {
    res.json({
      success: true,
      tiers: buildPricingTiers(),
    });
  } catch (error) {
    console.error("[usageRoutes] Error getting pricing:", error);
    res.status(500).json({ error: "Failed to get pricing" });
  }
});

module.exports = router;

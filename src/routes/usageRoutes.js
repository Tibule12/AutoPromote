// usageRoutes.js
// API endpoints for checking usage stats and limits

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { getUserUsageStats } = require("../middlewares/usageLimitMiddleware");
const { db } = require("../firebaseAdmin");
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
        canUpload: stats.remaining > 0 || stats.isPaid,
        needsUpgrade: !stats.isPaid && stats.remaining === 0,
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

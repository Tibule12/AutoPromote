// usageRoutes.js
// API endpoints for checking usage stats and limits

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { getUserUsageStats } = require("../middlewares/usageLimitMiddleware");
const { db } = require("../firebaseAdmin");
const { SUBSCRIPTION_PLANS, normalizePlanId, resolvePlan } = require("../config/subscriptionPlans");

function formatLimitValue(value, noun) {
  if (value === Infinity || value === "Unlimited" || value === "unlimited") {
    return `Unlimited ${noun}`;
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
        promotions: Number(plan.features?.wolfHuntTasks) || 0,
        platforms: plan.features?.platformLimit,
        analytics: plan.features?.analytics || "basic",
        support: plan.features?.support || "Self-serve",
      },
      features: [
        formatLimitValue(plan.features?.uploads, "content uploads per month"),
        formatLimitValue(plan.features?.platformLimit, "connected platforms"),
        `${Number(plan.features?.wolfHuntTasks) || 0} mission opportunities per month`,
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
router.post("/upgrade", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { tier, paymentMethodId } = req.body;
    const normalizedTier = normalizePlanId(tier);

    // Validate tier
    const validTiers = ["premium", "pro"];
    if (!normalizedTier || !validTiers.includes(normalizedTier)) {
      return res.status(400).json({
        error: "Invalid tier",
        message: "Please select a valid subscription tier: premium or pro",
      });
    }

    const plan = resolvePlan(normalizedTier);
    const now = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // TODO: Integrate with Stripe or payment processor
    // For now, just update the user's subscription status

    const userRef = db.collection("users").doc(userId);
    await userRef.set(
      {
        subscriptionTier: normalizedTier,
        subscriptionStatus: "active",
        subscriptionPeriodEnd: periodEnd,
        subscriptionExpiresAt: periodEnd,
        isPaid: true,
        unlimited: false,
        features: plan.features,
        upgradedAt: now,
        paymentMethod: paymentMethodId ? "stripe" : "manual",
      },
      { merge: true }
    );

    await db.collection("user_billing").doc(userId).set(
      {
        tier: normalizedTier,
        status: "active",
        expiresAt: periodEnd,
        nextBillingDate: periodEnd,
        updatedAt: now,
      },
      { merge: true }
    );

    await db
      .collection("user_subscriptions")
      .doc(userId)
      .set(
        {
          userId,
          tier: normalizedTier,
          tierId: normalizedTier,
          planId: normalizedTier,
          planName: plan.name,
          status: "active",
          amount: Number(plan.price) || 0,
          currency: "USD",
          currentPeriodEnd: periodEnd,
          nextBillingDate: periodEnd,
          updatedAt: now,
        },
        { merge: true }
      );

    // Log subscription event
    await db.collection("subscription_events").add({
      userId,
      type: "upgrade",
      tier: normalizedTier,
      timestamp: now,
      paymentMethodId: paymentMethodId || null,
    });

    res.json({
      success: true,
      message: `Successfully upgraded to ${plan.name}`,
      subscription: {
        tier: normalizedTier,
        tierName: plan.name,
        unlimited: false,
        upgradedAt: now,
      },
    });
  } catch (error) {
    console.error("[usageRoutes] Error upgrading:", error);
    res.status(500).json({ error: "Failed to upgrade subscription" });
  }
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

const express = require("express");
const router = express.Router();

const authMiddleware = require("../authMiddleware");
const { apiLimiter } = require("../validationMiddleware");
const { getCreditBreakdown } = require("../creditSystem");
const { getEffectiveTierSnapshot } = require("../services/billingService");
const {
  SUBSCRIPTION_PLANS,
  getPlanCapabilities,
  normalizePlanId,
} = require("../config/subscriptionPlans");

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /api/user/profile - User subscription/credits profile
router.get("/profile", apiLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;

    // 1. Get credit breakdown
    const credits = await getCreditBreakdown(userId);

    // 2. Get billing tier snapshot
    const tierSnapshot = await getEffectiveTierSnapshot(userId);
    const normalizedPlanId = normalizePlanId(tierSnapshot.tierId);
    const plan = SUBSCRIPTION_PLANS[normalizedPlanId] || SUBSCRIPTION_PLANS.free;
    const capabilities = getPlanCapabilities(normalizedPlanId);

    // 3. Firestore user doc (basic info)

    res.json({
      success: true,
      userId,
      planId: normalizedPlanId,
      planName: plan.name,
      tierName: capabilities.planName || plan.name,
      price: plan.price,
      monthlyCredits: {
        allocation: credits.monthlyAllocation,
        used: credits.monthlyUsed,
        remaining: credits.monthlyRemaining,
      },
      topUpBalance: credits.topUpBalance,
      totalCredits: credits.totalAvailable,
      features: {
        multicam: capabilities.multicam,
        teamSeats: capabilities.teamSeats,
        analyticsExport: capabilities.analytics?.canExport || false,
      },
      subscriptionStatus: tierSnapshot.status || "inactive",
      email: req.user.email,
      // Legacy
      tier: tierSnapshot.tierId,
      balance: credits.totalAvailable,
    });
  } catch (error) {
    console.error("[UserRoutes] Profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      details: error.message,
    });
  }
});

module.exports = router;

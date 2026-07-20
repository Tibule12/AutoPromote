const express = require("express");
const expressRateLimit = require("express-rate-limit");
const router = express.Router();

const authMiddleware = require("../authMiddleware");
const { apiLimiter } = require("../middleware/rateLimiter");
const { getCreditBreakdown } = require("../creditSystem");
const { getEffectiveTierSnapshot } = require("../services/billingService");
const {
  SUBSCRIPTION_PLANS,
  getPlanCapabilities,
  normalizePlanId,
  CREDIT_TOP_UP_PACKS,
} = require("../config/subscriptionPlans");
const { applyTesterCapabilityAllowlist } = require("../config/testerProgram");

// Tool-recognizable route limiter for CodeQL and defense in depth. The
// validation middleware limiter remains in place for the profile endpoint.
const userProfileLimiter = expressRateLimit({
  windowMs: parseInt(process.env.USER_PROFILE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  max: parseInt(process.env.USER_PROFILE_LIMIT_MAX || "120", 10),
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth middleware to all routes
router.use(userProfileLimiter);
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
    const capabilities = applyTesterCapabilityAllowlist(
      getPlanCapabilities(normalizedPlanId),
      tierSnapshot.testerAccess
    );

    // 3. Firestore user doc (basic info)

    res.json({
      success: true,
      userId,
      planId: normalizedPlanId,
      planName: tierSnapshot.testerAccess ? "Founding Tester" : plan.name,
      tierName: tierSnapshot.testerAccess
        ? "Founding Tester"
        : capabilities.planName || plan.name,
      price: tierSnapshot.testerAccess ? 0 : plan.price,
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
      editing: capabilities.editing,
      entitlements: capabilities,
      topUpPacks: CREDIT_TOP_UP_PACKS,
      subscriptionStatus: tierSnapshot.status || "inactive",
      testerAccess: tierSnapshot.testerAccess
        ? {
            programId: tierSnapshot.testerAccess.programId,
            programName: tierSnapshot.testerAccess.programName,
            status: tierSnapshot.testerAccess.status,
            planId: tierSnapshot.testerAccess.planId,
            grantedAt: tierSnapshot.testerAccess.grantedAt,
            expiresAt: tierSnapshot.testerAccess.expiresAt,
            bonusCredits: tierSnapshot.testerAccess.bonusCredits,
            creditAllowance: tierSnapshot.testerAccess.creditAllowance,
            creditsUsed: tierSnapshot.testerAccess.creditsUsed || 0,
            allowedWorkflows: tierSnapshot.testerAccess.allowedWorkflows || [],
            autoRenews: false,
          }
        : null,
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

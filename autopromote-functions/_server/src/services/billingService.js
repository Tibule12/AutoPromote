// billingService.js - Manages creator tiers, upload caps, and billing calculations
// Implements "Engagement-as-Currency" billing model

const { db, admin } = require("../firebaseAdmin");

const TIERS = {
  FREE: {
    id: "free",
    name: "Starter",
    monthly_upload_cap: 3, // Strict limit to force upgrade
    monthly_ai_cap: 3,
    monthly_bot_cap: 2, // TEASER: Allow 2 bot-boosted uploads to get them hooked
    platform_limit: 1, // NEW: Single platform only for free users
    monthly_price: 0,
    allowed_features: {
      organic_upload: true,
      bot_boost: true, // Unlocked for teaser
      repost_boost: false, // Keep locked as Premium upsell
      share_boost: false, // Keep locked as Premium upsell
      global_distribution: false, // Block "Publish Everywhere"
    },
    features: ["organic_upload", "basic_analytics", "teaser_bot_boost"],
  },
  BASIC: {
    id: "basic", // Legacy ID
    name: "Creator",
    monthly_upload_cap: 30,
    monthly_ai_cap: 50,
    monthly_bot_cap: 5,
    platform_limit: 3,
    monthly_price: 29.0,
    allowed_features: {
      organic_upload: true,
      bot_boost: true,
      repost_boost: false,
      share_boost: false,
      global_distribution: true,
    },
    features: ["organic_upload", "basic_analytics", "bot_views", "multi_platform"],
  },
  PREMIUM: {
    id: "premium", // Matches PayPal Plan
    name: "Premium",
    monthly_upload_cap: 15,
    monthly_ai_cap: 20,
    monthly_bot_cap: 10,
    platform_limit: 3,
    monthly_price: 9.99,
    allowed_features: {
      organic_upload: true,
      bot_boost: true,
      repost_boost: false,
      share_boost: false,
      global_distribution: true,
    },
    features: ["organic_upload", "basic_analytics", "bot_views", "multi_platform"],
  },
  PRO: {
    id: "pro",
    name: "Pro",
    monthly_upload_cap: 50,
    monthly_ai_cap: 500,
    monthly_bot_cap: 100,
    platform_limit: Infinity,
    monthly_price: 29.99,
    allowed_features: {
      organic_upload: true,
      bot_boost: true,
      repost_boost: true,
      share_boost: true,
      global_distribution: true,
    },
    features: [
      "organic_upload",
      "advanced_analytics",
      "priority_scheduling",
      "all_bot_tools",
      "global_distribution",
    ],
  },
  ENTERPRISE: {
    id: "enterprise",
    name: "Enterprise",
    monthly_upload_cap: Infinity,
    monthly_ai_cap: 2000,
    monthly_bot_cap: 500,
    platform_limit: Infinity,
    monthly_price: 99.99,
    allowed_features: {
      organic_upload: true,
      bot_boost: true,
      repost_boost: true,
      share_boost: true,
      global_distribution: true,
    },
    features: [
      "organic_upload",
      "advanced_analytics",
      "priority_scheduling",
      "all_bot_tools",
      "global_distribution",
    ],
  },
};

const FEATURE_PRICES = {
  // All prices 0 during "Addiction Phase"
  engagement_blocks: 0.0,
  ai_analysis_credits: 0.1, // COST RECOVERY: 10 cents per detailed breakdown (or free for Pro)
  priority_distribution: 0.0,
  campaign_management: 0.0,
  processing_fee_percent: 0.0,
};

/**
 * Calculate the charge for a specific upload based on user tier and content intent
 */
async function calculateCreatorCharge(userId, intent, featuresSelected = []) {
  // 1. Get User Tier & Usage
  const userRef = db.collection("users").doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};

  const billingDocRef = db.collection("user_billing").doc(userId);
  const billingSnap = await billingDocRef.get();
  const billingData = billingSnap.data() || { tier: "free", uploads_this_month: 0 };

  const userTierId = billingData.tier || "free";
  const userTier = TIERS[userTierId.toUpperCase()] || TIERS.FREE;

  // 2. Check Upload Caps (for Organic/Commercial)
  const used = billingData.uploads_this_month || 0;

  if (used >= userTier.monthly_upload_cap) {
    if (userTierId === "free") {
      // SCARCITY LOOP: Check if user has "Viral Coins" to buy a slot
      const coinBalance = await checkViralCoins(userId);
      const SLOT_COST = 50; // 50 coins for 1 extra slot

      if (coinBalance >= SLOT_COST) {
        // User can "Spend" their earned engagement to unlock a slot
        return {
          requiresPayment: false, // No REAL money
          virtualCost: SLOT_COST,
          currency: "VIRAL_COINS",
          message: `Cap reached used ${SLOT_COST} viral coins to unlock.`,
        };
      }

      // GAMIFICATION TRIGGER: Cap Reached
      // Instead of just blocking, we trigger the "Dojo" response.
      const error = new Error(
        "Upload slots depleted. Enter the Dojo to analyze trends and recharge strategy."
      );
      error.code = "GAMIFIED_CAP_REACHED";
      error.context = {
        uploads_used: used,
        cap: userTier.monthly_upload_cap,
        next_unlock: "24h", // Mock cooldown
        suggested_activity: "trend_analysis_minigame",
      };
      throw error;
    }
  }

  // 3. SUCCESS TRIGGER (The "Hook" Tracker)
  // Check if we should flag this user for future monetization based on value delivered.
  // This runs silently in the background.
  this.assessValueDelivered(userId);

  return { requiresPayment: false, amount: 0, currency: "USD" };
}

/**
 * Tracks value delivered to the user to determine when to "Switch" to billing.
 * E.g., Once they hit 100k views or 5 viral hits, we mark them as 'addicted' (monetizable).
 */
async function assessValueDelivered(userId) {
  try {
    const statsRef = db.collection("user_stats").doc(userId);
    const doc = await statsRef.get();
    if (!doc.exists) return;
    const stats = doc.data();

    // Thresholds for "Addiction" (aka Product Market Fit)
    const VIRAL_THRESHOLD = 100000;
    const SUCCESSFUL_CLAIMS = 5;

    if (stats.total_views > VIRAL_THRESHOLD || (stats.successful_claims || 0) > SUCCESSFUL_CLAIMS) {
      await db.collection("user_billing").doc(userId).set(
        {
          monetization_ready: true,
          value_delivered_tier: "high",
        },
        { merge: true }
      );
      console.log(
        `[Billing] 🎯 User ${userId} has crossed the value threshold. Ready for future monetization.`
      );
    }
  } catch (e) {
    // Ignore metric errors
  }
}

async function checkViralCoins(userId) {
  // Helper to check 'revenueEngine' balance
  // We read directly here to avoid circular dependencies for now
  const ref = db.collection("user_credits").doc(userId);
  const doc = await ref.get();
  return doc.exists ? doc.data().growth_credits || 0 : 0;
}

/**
 * NEW: Checks if a user is allowed to post to X number of platforms simultaneously.
 * Enforces the "Global Distribution" tier limits.
 */
async function checkPlatformLimit(userId, platformCount) {
  const billingDocRef = db.collection("user_billing").doc(userId);
  const billingSnap = await billingDocRef.get();
  const billingData = billingSnap.data() || { tier: "free" };

  const userTierId = (billingData.tier || "free").toUpperCase();
  const userTier = TIERS[userTierId] || TIERS.FREE;

  const limit = userTier.platform_limit || 1;

  if (platformCount > limit) {
    const error = new Error(
      `Your ${userTier.name} plan is limited to ${limit} platform(s) per post.`
    );
    error.code = "PLATFORM_LIMIT_EXCEEDED";
    error.context = {
      limit: limit,
      attempted: platformCount,
      upgrade_required: true,
      suggested_tier: "BASIC",
    };
    throw error;
  }
  return { allowed: true, limit };
}

/**
 * Check if user has exceeded their monthly AI analysis limit
 */
async function checkAILimit(userId) {
  const billingDocRef = db.collection("user_billing").doc(userId);
  const billingSnap = await billingDocRef.get();
  const billingData = billingSnap.data() || { tier: "free", ai_usage_this_month: 0 };

  const userTierId = (billingData.tier || "free").toUpperCase();
  const userTier = TIERS[userTierId] || TIERS.FREE;

  // Cap check
  if ((billingData.ai_usage_this_month || 0) >= (userTier.monthly_ai_cap || 0)) {
    return { allowed: false, limit: userTier.monthly_ai_cap };
  }
  return {
    allowed: true,
    limit: userTier.monthly_ai_cap,
    used: billingData.ai_usage_this_month || 0,
  };
}

async function trackAIUsage(userId) {
  const ref = db.collection("user_billing").doc(userId);
  await ref.set(
    {
      ai_usage_this_month: admin.firestore.FieldValue.increment(1),
      last_ai_usage: new Date(),
    },
    { merge: true }
  );
}

/**
 * Checks if a user is allowed to use a specific Bot feature.
 * Throws an error if they are on a Free plan or have hit their cap.
 */
async function checkBotEntitlement(userId, featureName) {
  // 1. Get User Tier
  const billingDocRef = db.collection("user_billing").doc(userId);
  const billingSnap = await billingDocRef.get();
  const billingData = billingSnap.data() || { tier: "free", bot_actions_used: 0 };

  const userTierId = (billingData.tier || "free").toUpperCase();
  const userTier = TIERS[userTierId] || TIERS.FREE;

  // 2. feature Gating (Strict Boolean)
  // If the tier explicitly disallows this feature (e.g. "repost_boost" is false for starter)
  if (userTier.allowed_features && userTier.allowed_features[featureName] === false) {
    const error = new Error(
      `Feature '${featureName}' requires a ${featureName === "repost_boost" ? "PRO" : "paid"} subscription.`
    );
    error.context = {
      feature: featureName,
      required_tier: featureName === "repost_boost" ? "PRO" : "BASIC",
      current_tier: userTierId,
    };
    throw error;
  }

  // 3. Quota Check (Monthly Bot Actions)
  const used = billingData.bot_actions_used || 0;
  if (used >= userTier.monthly_bot_cap) {
    // Allow "Overdraft" for viral coins? Maybe later.
    const error = new Error(
      `Monthly Bot Action Cap reached (${used}/${userTier.monthly_bot_cap}). Upgrade for more.`
    );
    error.code = "BOT_CAP_REACHED";
    error.context = { used, cap: userTier.monthly_bot_cap };
    throw error;
  }

  return { allowed: true, quota_remaining: userTier.monthly_bot_cap - used };
}

/**
 * Increments the bot usage counter for a user.
 * Call this AFTER successfully scheduling a bot task.
 */
async function trackBotUsage(userId, amount = 1) {
  if (!userId) return;
  const ref = db.collection("user_billing").doc(userId);
  await ref.set(
    {
      bot_actions_used: admin.firestore.FieldValue.increment(amount),
      last_bot_action: new Date(),
    },
    { merge: true }
  );
}

// Bind the helper to the module scope for export if needed, or keep internal.
// We export the main calculator.

module.exports = {
  calculateCreatorCharge,
  checkAILimit,
  checkPlatformLimit, // NEW
  trackAIUsage,
  checkBotEntitlement, // NEW
  trackBotUsage, // NEW
  trackUploadUsage: async (userId, virtualCost = 0) => {
    // Increment usage counter
    const ref = db.collection("user_billing").doc(userId);
    await ref.set(
      {
        uploads_this_month: admin.firestore.FieldValue.increment(1),
        last_upload: new Date(),
      },
      { merge: true }
    );

    // Deduct coins if applicable
    if (virtualCost > 0) {
      const creditRef = db.collection("user_credits").doc(userId);
      await creditRef.update({
        growth_credits: admin.firestore.FieldValue.increment(-virtualCost),
      });
      console.log(`[Billing] Deducted ${virtualCost} coins from ${userId}`);
    }
  },
  // Export new Value Assessor for manual checks
  assessValueDelivered,
};

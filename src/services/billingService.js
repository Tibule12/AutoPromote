// billingService.js - Manages creator tiers, upload caps, and billing calculations
// Implements "Engagement-as-Currency" billing model

const { db, admin } = require("../firebaseAdmin");

const TIERS = {
  FREE: {
    id: "free",
    monthly_upload_cap: 5, // SCARCITY STRATEGY: Low cap to build hunger
    monthly_price: 0,
    features: ["organic_upload", "basic_analytics", "viral_dojo_access"],
  },
  // Future tiers (currently inactive/free in "Beta Mode")
  BASIC: {
    id: "basic",
    monthly_upload_cap: 50,
    monthly_price: 0,
    features: ["organic_upload", "basic_analytics"],
  },
  PRO: {
    id: "pro",
    monthly_upload_cap: Infinity,
    monthly_price: 0,
    features: ["organic_upload", "advanced_analytics", "priority_scheduling", "commercial_tools"],
  },
};

const FEATURE_PRICES = {
  // All prices 0 during "Addiction Phase"
  engagement_blocks: 0.0,
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

// Bind the helper to the module scope for export if needed, or keep internal.
// We export the main calculator.

module.exports = {
  calculateCreatorCharge,
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

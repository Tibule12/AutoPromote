// billingService.js - Manages creator tiers, upload caps, and billing calculations
// Implements "Engagement-as-Currency" billing model

const { db, admin } = require("../firebaseAdmin");

const TIERS = {
  FREE: {
    id: "free",
    monthly_upload_cap: 10,
    monthly_price: 0,
    features: ["organic_upload"],
  },
  BASIC: {
    id: "basic",
    monthly_upload_cap: 50,
    monthly_price: 20,
    features: ["organic_upload", "basic_analytics"],
  },
  PRO: {
    id: "pro",
    monthly_upload_cap: Infinity,
    monthly_price: 50,
    features: ["organic_upload", "advanced_analytics", "priority_scheduling", "commercial_tools"],
  },
};

const FEATURE_PRICES = {
  engagement_blocks: 0.01, // Base price multiplier handled in revenueEngine
  priority_distribution: 5.0, // Flat fee
  campaign_management: 25.0,
  processing_fee_percent: 0.1,
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
  if (billingData.uploads_this_month >= userTier.monthly_upload_cap) {
    if (userTierId === "free") {
      throw new Error("Upload limit reached for Free Tier. Please upgrade to Basic or Pro.");
    } else if (userTierId === "basic") {
      throw new Error("Upload limit reached for Basic Tier. Please upgrade to Pro.");
    }
  }

  // 3. Calculate Charge
  let charge = 0.0;

  // Base Logic
  if (intent === "organic") {
    // Organic is covered by subscription
    charge = 0.0;
  } else if (intent === "commercial") {
    // Commercial might have a la carte feature costs
    if (featuresSelected.includes("priority_distribution")) {
      charge += FEATURE_PRICES.priority_distribution;
    }
  } else if (intent === "sponsored") {
    // Sponsored has higher base fees
    charge += FEATURE_PRICES.campaign_management;
    if (featuresSelected.includes("priority_distribution")) {
      charge += FEATURE_PRICES.priority_distribution;
    }
  }

  return {
    amount: charge,
    currency: "USD",
    requiresPayment: charge > 0,
    tierCheckPassed: true,
  };
}

/**
 * Increment upload counter for user
 */
async function trackUploadUsage(userId) {
  const billingRef = db.collection("user_billing").doc(userId);
  await billingRef.set(
    {
      uploads_this_month: admin.firestore.FieldValue.increment(1),
      last_upload_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Process a direct payment (Stub)
 * In real system: calls Stripe/PayPal
 */
async function processPayment(userId, amount, currency = "USD") {
  if (amount <= 0) return { success: true, transactionId: null };

  // ... Payment Gateway Logic ...
  const transactionId = `tx_${Date.now()}_${userId.substring(0, 5)}`;

  // Log Transaction
  await db.collection("transactions").add({
    userId,
    amount,
    currency,
    type: "upload_fee",
    status: "succeeded",
    transactionId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, transactionId };
}

module.exports = {
  calculateCreatorCharge,
  trackUploadUsage,
  processPayment,
  TIERS,
};

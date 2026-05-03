const { db } = require("./firebaseAdmin");
const { normalizePlanId, resolvePlan } = require("./config/subscriptionPlans");
const { getEffectiveTierSnapshot } = require("./services/billingService");

/**
 * Get the current credit breakdown for a user.
 * Returns { monthlyRemaining, topUpBalance, totalAvailable, monthlyAllocation, monthKey }
 */
const getCreditBreakdown = async (userId) => {
  const monthKey = new Date().toISOString().slice(0, 7);
  const [userSnap, creditLedgerSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("credit_usage")
      .where("userId", "==", userId)
      .where("monthKey", "==", monthKey)
      .get(),
  ]);

  const userData = userSnap.exists ? userSnap.data() : {};
  const tier = normalizePlanId(userData.subscriptionTier || "free");
  const plan = resolvePlan(tier);
  const monthlyAllocation = plan.features.monthlyCredits || 0;

  let monthlyUsed = 0;
  creditLedgerSnap.forEach(doc => {
    monthlyUsed += doc.data().amount || 0;
  });

  const monthlyRemaining = Math.max(0, monthlyAllocation - monthlyUsed);
  const topUpBalance = userData.credits || 0; // purchased top-up credits

  return {
    monthlyRemaining,
    monthlyUsed,
    monthlyAllocation,
    topUpBalance,
    totalAvailable: monthlyRemaining + topUpBalance,
    monthKey,
    tier,
  };
};

/**
 * Deduct credits from a user.
 * Priority: monthly allocation first, then top-up balance.
 * Records a ledger entry for monthly tracking.
 */
const deductCredits = async (userId, amount, operation = "unknown") => {
  const userRef = db.collection("users").doc(userId);
  const monthKey = new Date().toISOString().slice(0, 7);

  try {
    return await db.runTransaction(async transaction => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User not found");
      }

      const userData = userDoc.data();
      const tier = normalizePlanId(userData.subscriptionTier || "free");
      const plan = resolvePlan(tier);
      const monthlyAllocation = plan.features.monthlyCredits || 0;

      // Count monthly usage from ledger (use transaction-safe query)
      const ledgerQuery = db.collection("credit_usage")
        .where("userId", "==", userId)
        .where("monthKey", "==", monthKey);
      const ledgerSnap = await transaction.get(ledgerQuery);

      let monthlyUsed = 0;
      ledgerSnap.forEach(doc => {
        monthlyUsed += doc.data().amount || 0;
      });

      const monthlyRemaining = Math.max(0, monthlyAllocation - monthlyUsed);
      const topUpBalance = userData.credits || 0;
      const totalAvailable = monthlyRemaining + topUpBalance;

      if (totalAvailable < amount) {
        return {
          success: false,
          message: "Not enough credits",
          required: amount,
          remaining: totalAvailable,
          monthlyRemaining,
          topUpBalance,
          tier,
        };
      }

      // Deduct from monthly first, then top-up
      let fromMonthly = Math.min(amount, monthlyRemaining);
      let fromTopUp = amount - fromMonthly;

      // Update top-up balance if used
      if (fromTopUp > 0) {
        transaction.update(userRef, {
          credits: topUpBalance - fromTopUp,
          last_credit_deduction: new Date().toISOString(),
        });
      }

      // Record ledger entry for monthly tracking
      const ledgerRef = db.collection("credit_usage").doc();
      transaction.set(ledgerRef, {
        userId,
        amount,
        fromMonthly,
        fromTopUp,
        operation,
        monthKey,
        createdAt: new Date().toISOString(),
      });

      const newTotal = totalAvailable - amount;

      return {
        success: true,
        remaining: newTotal,
        monthlyRemaining: monthlyRemaining - fromMonthly,
        topUpBalance: topUpBalance - fromTopUp,
        deducted: amount,
        fromMonthly,
        fromTopUp,
        monthKey,
        operation,
        source: fromTopUp > 0 ? "monthly+topup" : "monthly",
      };
    });
  } catch (error) {
    console.error("Credit deduction failed:", error);
    return { success: false, message: error.message };
  }
};

const refundCredits = async (
  userId,
  refund,
  operation = "refund",
  metadata = {}
) => {
  const amount = Math.max(0, Number(refund?.deducted ?? refund?.amount ?? 0) || 0);
  const fromMonthly = Math.max(0, Number(refund?.fromMonthly || 0) || 0);
  const fromTopUp = Math.max(0, Number(refund?.fromTopUp || 0) || 0);
  const monthKey = refund?.monthKey || new Date().toISOString().slice(0, 7);

  if (amount <= 0) {
    return { success: false, message: "No refundable amount provided" };
  }

  const userRef = db.collection("users").doc(userId);

  try {
    return await db.runTransaction(async transaction => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User not found");
      }

      const userData = userDoc.data() || {};
      const topUpBalance = Number(userData.credits || 0) || 0;

      if (fromTopUp > 0) {
        transaction.update(userRef, {
          credits: topUpBalance + fromTopUp,
          last_credit_refund: new Date().toISOString(),
        });
      }

      const ledgerRef = db.collection("credit_usage").doc();
      transaction.set(ledgerRef, {
        userId,
        amount: -amount,
        fromMonthly: -fromMonthly,
        fromTopUp: -fromTopUp,
        operation,
        monthKey,
        createdAt: new Date().toISOString(),
        metadata,
      });

      return {
        success: true,
        refunded: amount,
        fromMonthly,
        fromTopUp,
      };
    });
  } catch (error) {
    console.error("Credit refund failed:", error);
    return { success: false, message: error.message };
  }
};

module.exports = { deductCredits, refundCredits, getCreditBreakdown };

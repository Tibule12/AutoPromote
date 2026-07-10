const { db } = require("./firebaseAdmin");
const crypto = require("crypto");
const { normalizePlanId, resolvePlan } = require("./config/subscriptionPlans");
const { getEffectiveTierSnapshot } = require("./services/billingService");

const LOCAL_TEST_CREDIT_BALANCE = 999999;
const LOCAL_BYPASS_OPERATIONS = new Set([
  "process",
  "render-multicam",
  "clean-audio-sync",
  "/analyze",
  "analyze",
  "find-viral-clips",
  "/render-clip",
  "render-clip",
  "clip-render",
  "promo-summary",
  "smart-promo-summary",
  "audio-extract",
  "transcribe",
  "idea-video-preview",
  "idea-video-render",
]);

const isProductionRuntime = () =>
  process.env.NODE_ENV === "production" ||
  process.env.RENDER === "true" ||
  Boolean(process.env.K_SERVICE) ||
  Boolean(process.env.FUNCTION_TARGET);

const isLocalEditingCreditBypassEnabled = () => {
  if (process.env.DISABLE_VIDEO_EDITOR_CREDITS === "true") return true;
  if (process.env.LOCAL_EDITING_CREDIT_BYPASS === "false") return false;
  if (process.env.LOCAL_EDITING_CREDIT_BYPASS === "true") return !isProductionRuntime();
  return !isProductionRuntime();
};

const shouldBypassEditingCredits = operation =>
  isLocalEditingCreditBypassEnabled() && LOCAL_BYPASS_OPERATIONS.has(String(operation || ""));

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
  const effectiveTier = await getEffectiveTierSnapshot(userId, null, userData).catch(() => ({
    tierId: userData.subscriptionTier || "free",
  }));
  const tier = normalizePlanId(effectiveTier.tierId || userData.subscriptionTier || "free");
  const plan = resolvePlan(tier);
  const monthlyAllocation = plan.features.monthlyCredits || 0;

  let monthlyUsed = 0;
  creditLedgerSnap.forEach(doc => {
    monthlyUsed += doc.data().amount || 0;
  });

  const monthlyRemaining = Math.max(0, monthlyAllocation - monthlyUsed);
  const topUpBalance = userData.credits || 0; // purchased top-up credits
  const localCreditBypass = isLocalEditingCreditBypassEnabled();

  return {
    monthlyRemaining: localCreditBypass ? LOCAL_TEST_CREDIT_BALANCE : monthlyRemaining,
    monthlyUsed,
    monthlyAllocation: localCreditBypass ? LOCAL_TEST_CREDIT_BALANCE : monthlyAllocation,
    topUpBalance,
    totalAvailable: localCreditBypass
      ? LOCAL_TEST_CREDIT_BALANCE
      : monthlyRemaining + topUpBalance,
    monthKey,
    tier,
    localCreditBypass,
  };
};

/**
 * Deduct credits from a user.
 * Priority: monthly allocation first, then top-up balance.
 * Records a ledger entry for monthly tracking.
 */
const deductCredits = async (userId, amount, operation = "unknown", metadata = {}) => {
  if (Number(amount || 0) > 0 && shouldBypassEditingCredits(operation)) {
    console.log(
      `[credits] Local editing credit bypass active for ${operation}. User ${userId}, skipped ${amount} credits.`
    );
    return {
      success: true,
      remaining: LOCAL_TEST_CREDIT_BALANCE,
      monthlyRemaining: LOCAL_TEST_CREDIT_BALANCE,
      topUpBalance: 0,
      deducted: 0,
      fromMonthly: 0,
      fromTopUp: 0,
      billedAmount: amount,
      monthKey: new Date().toISOString().slice(0, 7),
      operation,
      source: "local_editing_credit_bypass",
      skipped: true,
    };
  }

  const userRef = db.collection("users").doc(userId);
  const billingRef = db.collection("user_billing").doc(userId);
  const monthKey = new Date().toISOString().slice(0, 7);
  const idempotencyKey = String(metadata?.idempotencyKey || "").trim();
  const chargeKeyHash = idempotencyKey
    ? crypto.createHash("sha256").update(`${userId}:${idempotencyKey}`).digest("hex")
    : "";
  const chargeRef = chargeKeyHash
    ? db.collection("credit_charges").doc(chargeKeyHash)
    : null;

  try {
    return await db.runTransaction(async transaction => {
      const existingCharge = chargeRef ? await transaction.get(chargeRef) : null;
      if (existingCharge?.exists) {
        const receipt = existingCharge.data()?.receipt || {};
        return { ...receipt, success: true, alreadyCharged: true };
      }

      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User not found");
      }

      const userData = userDoc.data();
      const billingDoc = await transaction.get(billingRef);
      const billingData = billingDoc.exists ? billingDoc.data() || {} : {};
      const tier = normalizePlanId(
        billingData.tierId ||
          billingData.tier ||
          userData.subscriptionTier ||
          (userData.subscriptionStatus === "active" ? "premium" : "free")
      );
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
      const ledgerRef = chargeKeyHash
        ? db.collection("credit_usage").doc(`charge_${chargeKeyHash}`)
        : db.collection("credit_usage").doc();
      transaction.set(ledgerRef, {
        userId,
        amount,
        fromMonthly,
        fromTopUp,
        operation,
        monthKey,
        metadata,
        createdAt: new Date().toISOString(),
      });

      const newTotal = totalAvailable - amount;
      const receipt = {
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
      if (chargeRef) {
        transaction.set(chargeRef, {
          userId,
          operation,
          amount,
          monthKey,
          idempotencyKey,
          receipt,
          createdAt: new Date().toISOString(),
        });
      }

      return receipt;
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
  const idempotencyKey = String(
    metadata?.idempotencyKey ||
      (metadata?.jobId ? `${operation}:${metadata.jobId}` : "")
  ).trim();
  const refundKeyHash = idempotencyKey
    ? crypto.createHash("sha256").update(idempotencyKey).digest("hex")
    : "";

  if (amount <= 0) {
    return { success: false, message: "No refundable amount provided" };
  }

  const userRef = db.collection("users").doc(userId);
  const refundRef = refundKeyHash
    ? db.collection("credit_refunds").doc(refundKeyHash)
    : null;

  try {
    return await db.runTransaction(async transaction => {
      const existingRefund = refundRef ? await transaction.get(refundRef) : null;
      if (existingRefund?.exists) {
        const existing = existingRefund.data() || {};
        return {
          success: true,
          alreadyRefunded: true,
          refunded: Number(existing.amount || amount),
          fromMonthly: Number(existing.fromMonthly || fromMonthly),
          fromTopUp: Number(existing.fromTopUp || fromTopUp),
        };
      }

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

      const ledgerRef = refundKeyHash
        ? db.collection("credit_usage").doc(`refund_${refundKeyHash}`)
        : db.collection("credit_usage").doc();
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

      if (refundRef) {
        transaction.set(refundRef, {
          userId,
          amount,
          fromMonthly,
          fromTopUp,
          operation,
          monthKey,
          idempotencyKey,
          metadata,
          createdAt: new Date().toISOString(),
        });
      }

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

module.exports = {
  deductCredits,
  refundCredits,
  getCreditBreakdown,
  isLocalEditingCreditBypassEnabled,
  shouldBypassEditingCredits,
};

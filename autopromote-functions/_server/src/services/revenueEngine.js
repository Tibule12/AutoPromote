// revenueEngine.js
// AutoPromote Revenue Engine
// Engagement-as-Currency, Surge Pricing, and Greedy Multipliers

const { db, admin } = require("../firebaseAdmin");
const logger = require("../utils/logger");
const { sendTelegramAlert, getUserTelegramConnection } = require("./telegramService");

// Pricing Constants
const BASE_PRICE_PER_UNIT = 0.01; // $0.01 per engagement unit (e.g. share)
const SURGE_THRESHOLD = 500; // units/minute to trigger surge
const RETENTION_FEE_PERCENT = 0.1; // 10% fee on redemption

class RevenueEngine {
  /**
   * Award Growth Credits to a user
   * @param {string} userId
   * @param {number} amount
   * @param {string} source - 'engagement_reward', 'bonus', etc.
   */
  async awardGrowthCredits(userId, amount, source = "engagement_reward") {
    const userCreditsRef = db.collection("user_credits").doc(userId);

    // Transactional update
    await db.runTransaction(async t => {
      const doc = await t.get(userCreditsRef);
      const current = doc.exists ? doc.data().growth_credits || 0 : 0;
      const newBalance = current + amount;

      t.set(
        userCreditsRef,
        {
          growth_credits: newBalance,
          last_awarded_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Log ledger entry
      const ledgerRef = db.collection("credit_ledger").doc();
      t.set(ledgerRef, {
        userId,
        amount,
        type: "credit",
        source,
        balance_after: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Notify user via Telegram (fire and forget)
    if (amount > 1) {
      // Only notify for significant amounts
      try {
        const conn = await getUserTelegramConnection(userId);
        if (conn && conn.meta && conn.meta.chatId) {
          await sendTelegramAlert(
            conn.meta.chatId,
            `🚀 You earned ${amount.toFixed(2)} growth credits! (Source: ${source})`
          );
        }
      } catch (e) {
        // Ignore notification errors
      }
    }

    return amount;
  }

  /**
   * Redeem Growth Credits
   * Applies redemption fee (retention model)
   */
  async redeemGrowthCredits(userId, amountToRedeem) {
    const userCreditsRef = db.collection("user_credits").doc(userId);

    return db.runTransaction(async t => {
      const doc = await t.get(userCreditsRef);
      if (!doc.exists) throw new Error("User has no credit record");

      const current = doc.data().growth_credits || 0;
      if (current < amountToRedeem) {
        throw new Error("Insufficient growth credits");
      }

      const fee = amountToRedeem * RETENTION_FEE_PERCENT;
      const netValue = amountToRedeem - fee;
      const newBalance = current - amountToRedeem;

      t.set(
        userCreditsRef,
        {
          growth_credits: newBalance,
          last_redeem_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Log ledger
      const ledgerRef = db.collection("credit_ledger").doc();
      t.set(ledgerRef, {
        userId,
        amount: -amountToRedeem,
        type: "debit",
        fee,
        net_value: netValue,
        balance_after: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, netValue, fee };
    });
  }

  /**
   * Log an Engagement Unit
   * @param {string} creatorId - User ID of the content creator
   * @param {string} contentId - ID of the content
   * @param {string} type - 'like', 'share', 'click', 'watch_time'
   * @param {number} value - Weighted value (e.g. 1 for like, 5 for share)
   * @param {object} metadata - Optional: { niche: 'fashion', isSponsored: true, brand: 'Nike' }
   */
  async logEngagement(creatorId, contentId, type, value = 1, metadata = {}) {
    const timestamp = admin.firestore.Timestamp.now();
    const batch = db.batch();

    // 1. Log the raw unit (batched/counters would be better in prod, keeping simple for now)
    const logRef = db.collection("engagement_logs").doc();
    batch.set(logRef, {
      creatorId,
      contentId,
      type,
      value,
      timestamp,
      // Metadata from the "TikTok Card" (Brand/Niche info)
      niche: metadata.niche || "general",
      isSponsored: !!metadata.isSponsored,
      brand: metadata.brand || null,
      status: "pending_aggregation",
    });

    // 2. Increment global velocity counter (for surge pricing calculation)
    const velocityRef = db.collection("system_metrics").doc("engagement_velocity");
    batch.set(
      velocityRef,
      {
        count: admin.firestore.FieldValue.increment(value),
        lastUpdated: timestamp,
      },
      { merge: true }
    );

    await batch.commit();
    return { success: true, logId: logRef.id };
  }

  /**
   * Calculate Current Block Price (Greedy Algorithm)
   * Determining the price of an "Engagement Block" based on demand and scarcity.
   * @param {string} niche - 'music', 'fashion', 'tech', etc.
   * @param {number} blockSize - Number of units in the block (e.g. 1000)
   */
  async calculateBlockPrice(niche, blockSize = 1000) {
    // 1. Get current system velocity
    const velocityDoc = await db.collection("system_metrics").doc("engagement_velocity").get();
    const velocity = (velocityDoc.exists ? velocityDoc.data().count : 0) || 0;

    // 2. Base Calculation
    let pricePerUnit = BASE_PRICE_PER_UNIT;

    // 3. Surge Pricing Logic
    // If velocity is high, demand is high -> increase price
    let surgeMultiplier = 1.0;
    if (velocity > SURGE_THRESHOLD) {
      surgeMultiplier = 1.0 + Math.log10(velocity - SURGE_THRESHOLD) * 0.5;
      // Example: 1000 velocity -> ~1.3x multiplier
    }

    // 4. Scarcity / Niche Multiplier
    const NICHE_MULTIPLIERS = {
      music: 2.0,
      fashion: 3.0,
      crypto: 5.0,
      default: 1.0,
    };
    const nicheMultiplier = NICHE_MULTIPLIERS[niche] || NICHE_MULTIPLIERS["default"];

    // 5. Final Calculation
    const totalMultiplier = surgeMultiplier * nicheMultiplier;
    const finalPrice = blockSize * pricePerUnit * totalMultiplier;

    return {
      price: parseFloat(finalPrice.toFixed(2)),
      breakdown: {
        base: blockSize * pricePerUnit,
        surgeMultiplier: parseFloat(surgeMultiplier.toFixed(2)),
        nicheMultiplier,
        pricePerUnitRaw: pricePerUnit,
      },
      currency: "USD",
    };
  }

  /**
   * Create Viral Bounty (The "Billionaire" No-Ad Model)
   * Instead of buying ads (Pay-for-Views), users set a "Bounty" (Pay-for-Performance).
   * 1. Creator sets a Bounty Pool (e.g., $500).
   * 2. "Promoters" (other users) share the content.
   * 3. If the content hits engagement targets, Promoters get paid from the Pool.
   * 4. Platform takes a "Greedy" transaction fee on the payout.
   *
   * @param {string} brandId - The funding user
   * @param {string} niche - Content category
   * @param {number} bountyAmount - Total pool capability
   */
  async createViralBounty(brandId, niche, bountyAmount, paymentMethodId) {
    // 1. Calculate the "Protocol Fee" (The House Take)
    const protocolFee = bountyAmount * 0.2; // 20% Fee
    const netBountyParams = bountyAmount - protocolFee;

    // 2. Lock the Bounty in the "Escrow" (Transaction Log)
    const bountyRef = await db.collection("bounties").add({
      brandId,
      niche,
      totalAmount: bountyAmount,
      netPool: netBountyParams,
      protocolFee,
      currency: "USD",
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      claimedAmount: 0,
      paymentMethodId, // Tokenized payment intent, captured only upon claim
    });

    return {
      success: true,
      bountyId: bountyRef.id,
      message: "Viral Bounty Created. No Ad spend incurred until performance is verified.",
    };
  }

  /**
   * Claim Bounty (Proof-of-Reach)
   * A Promoter claims their share of the bounty based on verified analytics.
   */
  async claimBounty(promoterId, bountyId, proofOfReachMetrics) {
    // 1. Verify "Proof of Reach" (e.g. they actually got 10k views)
    // ... verification logic ...

    // 2. Calculate Payout
    // ... payout logic ...

    return { success: true, payout: 0, currency: "USD" };
  }

  /**
   * [DEPRECATED] Brand Purchase Block Flow
   * Legacy Ad-Buy model. Replaced by createViralBounty for "No Ads" strategy.
   */
  async purchaseBlock(brandId, niche, blockSize, paymentMethodId) {
    return this.createViralBounty(brandId, niche, blockSize, paymentMethodId);
  }

  /**
   * Redeem Growth Credits (Review & Fee Application)
   * Creator wants to cash out their credits.
   */
  async redeemCredits(creatorId, creditsToRedeem) {
    // 1. Check balance
    const userRef = db.collection("users").doc(creatorId);
    // ... fetch balance ...

    // 2. Apply Retention Fee (Greedy Platform Fee)
    const feeAmount = creditsToRedeem * RETENTION_FEE_PERCENT;
    const netPayout = creditsToRedeem - feeAmount;

    // 3. Process Payout
    // ... Payout Logic ...

    return {
      redeemed: creditsToRedeem,
      fee: feeAmount,
      payout: netPayout,
      currency: "USD", // Assuming 1 credit = $1 for simplicity in this draft
    };
  }
}

module.exports = new RevenueEngine();

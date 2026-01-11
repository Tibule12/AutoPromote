const { db, admin } = require("../firebaseAdmin");

class ViralBonusService {
  constructor() {
    // Milestones: views threshold -> reward amount (USD)
    this.MILESTONES = [
      { id: "viral_tier_1", threshold: 30000, reward: 3.0 },
      { id: "viral_tier_2", threshold: 100000, reward: 5.0 }, // +$5 = $8 total
      { id: "viral_tier_3", threshold: 500000, reward: 12.0 }, // +$12 = $20 total
    ];
  }

  /**
   * Check a specific content piece for viral milestones and award bonuses.
   * @param {string} contentId
   * @param {string} userId (optional, will fetch if missing)
   */
  async checkAndAwardBonuses(contentId, userId) {
    try {
      const contentRef = db.collection("content").doc(contentId);

      const result = await db.runTransaction(async t => {
        const contentDoc = await t.get(contentRef);
        if (!contentDoc.exists) return { success: false, error: "Content not found" };

        const data = contentDoc.data();
        const currentViews = data.views || 0;
        const ownerId = userId || data.userId;
        const claimedBonuses = data.claimedBonuses || [];

        const bonusesToAward = [];
        let totalReward = 0;

        // Check each milestone
        for (const milestone of this.MILESTONES) {
          if (currentViews >= milestone.threshold && !claimedBonuses.includes(milestone.id)) {
            bonusesToAward.push(milestone);
            totalReward += milestone.reward;
          }
        }

        if (bonusesToAward.length === 0) {
          return { success: true, awarded: 0, message: "No new milestones reached." };
        }

        // --- 1. Update Content (mark bonuses as claimed) ---
        const newClaimedList = [...claimedBonuses, ...bonusesToAward.map(m => m.id)];
        t.update(contentRef, { claimedBonuses: newClaimedList });

        // --- 2. Update User Wallet (User Credits) ---
        const userCreditsRef = db.collection("user_credits").doc(ownerId);
        const credsDoc = await t.get(userCreditsRef);

        let newBalance = totalReward;
        let currentTransactionHistory = [];

        if (credsDoc.exists) {
          const cData = credsDoc.data();
          newBalance = (cData.balance || 0) + totalReward; // Add to existing balance
          currentTransactionHistory = cData.transactions || [];
        }

        // Add transaction entry
        const newTransactions = [
          ...currentTransactionHistory,
          ...bonusesToAward.map(m => ({
            id: `txn_${Date.now()}_${m.id}`,
            type: "viral_bonus",
            amount: m.reward,
            contentId: contentId,
            description: `Viral Bonus: Reached ${m.threshold.toLocaleString()} views`,
            date: new Date().toISOString(),
          })),
        ];

        t.set(
          userCreditsRef,
          {
            balance: newBalance,
            transactions: newTransactions,
            lastBonusAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // --- 3. Send Notification (Optional but good) ---
        // (We can assume a notification service exists or just write to a notifications collection)
        const notifRef = db.collection("notifications").doc();
        t.set(notifRef, {
          userId: ownerId,
          type: "viral",
          title: "🔥 Viral Bonus Unlocked!",
          message: `Your content reached ${bonusesToAward[bonusesToAward.length - 1].threshold.toLocaleString()} views. You earned $${totalReward.toFixed(2)}!`,
          read: false,
          createdAt: new Date().toISOString(),
        });

        return {
          success: true,
          awarded: totalReward,
          milestones: bonusesToAward.map(m => m.id),
        };
      });

      return result;
    } catch (error) {
      console.error("[ViralBonus] Error checking bonuses:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ViralBonusService();

/* eslint-disable no-console */
// creatorRewardsService.js
// Automatic creator rewards based on content performance

const { admin, db } = require("../firebaseAdmin");

// Reward thresholds and payouts
const PERFORMANCE_TIERS = {
  viral: { minViews: 100000, minEngagement: 0.05, reward: 50.0, badge: "🔥 Viral" },
  trending: { minViews: 50000, minEngagement: 0.04, reward: 25.0, badge: "📈 Trending" },
  popular: { minViews: 10000, minEngagement: 0.03, reward: 10.0, badge: "⭐ Popular" },
  rising: { minViews: 5000, minEngagement: 0.02, reward: 5.0, badge: "🌟 Rising" },
  good: { minViews: 1000, minEngagement: 0.01, reward: 1.0, badge: "👍 Good" },
};

const MILESTONE_BONUSES = {
  1000000: 500.0, // 1M views
  500000: 200.0, // 500K views
  100000: 50.0, // 100K views
  50000: 20.0, // 50K views
  10000: 5.0, // 10K views
};

const MIN_PAYOUT_THRESHOLD = 10.0; // Minimum $10 to claim payout

/**
 * Calculate engagement rate
 */
function calculateEngagementRate(content) {
  const views = content.views || 0;
  if (views === 0) return 0;

  const likes = content.likes || 0;
  const shares = content.shares || 0;
  const comments = content.comments || 0;

  const totalEngagement = likes + shares * 2 + comments * 3; // Weight shares and comments higher
  return totalEngagement / views;
}

/**
 * Determine performance tier based on views and engagement
 */
function getPerformanceTier(views, engagementRate) {
  for (const [tier, config] of Object.entries(PERFORMANCE_TIERS)) {
    if (views >= config.minViews && engagementRate >= config.minEngagement) {
      return { tier, ...config };
    }
  }
  return null;
}

/**
 * Check if content hit a milestone and award bonus
 */
async function checkMilestoneBonus(contentId, userId, currentViews) {
  try {
    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) return null;

    const data = contentDoc.data();
    const lastMilestone = data.lastMilestone || 0;

    // Find highest milestone achieved that hasn't been rewarded yet
    let milestoneHit = null;
    let bonusAmount = 0;

    for (const [milestone, bonus] of Object.entries(MILESTONE_BONUSES).sort(
      (a, b) => parseInt(b[0]) - parseInt(a[0])
    )) {
      const views = parseInt(milestone);
      if (currentViews >= views && lastMilestone < views) {
        milestoneHit = views;
        bonusAmount = bonus;
        break;
      }
    }

    if (milestoneHit) {
      // Update content with milestone
      await contentRef.update({ lastMilestone: milestoneHit });

      // Record milestone bonus earning
      await db.collection("earnings_events").add({
        userId,
        contentId,
        type: "milestone_bonus",
        amount: bonusAmount,
        milestone: milestoneHit,
        createdAt: new Date().toISOString(),
      });

      return { milestone: milestoneHit, bonus: bonusAmount };
    }

    return null;
  } catch (error) {
    console.error("Error checking milestone bonus:", error);
    return null;
  }
}

/**
 * Calculate and award creator rewards for content
 */
async function calculateContentRewards(contentId, userId) {
  try {
    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return { error: "Content not found" };
    }

    const content = contentDoc.data();
    const views = content.views || 0;
    const engagementRate = calculateEngagementRate(content);

    // Check if already rewarded for this tier
    const currentTier = content.rewardTier || null;
    const performanceTier = getPerformanceTier(views, engagementRate);

    if (!performanceTier) {
      return { message: "Content has not reached reward threshold yet" };
    }

    // Only award if reaching new tier (prevent duplicate rewards)
    if (currentTier === performanceTier.tier) {
      return { message: "Already rewarded for this tier", tier: currentTier };
    }

    // Award performance reward
    await db.collection("earnings_events").add({
      userId,
      contentId,
      type: "performance_reward",
      tier: performanceTier.tier,
      amount: performanceTier.reward,
      views,
      engagementRate,
      createdAt: new Date().toISOString(),
    });

    // Update content with reward tier
    await contentRef.update({
      rewardTier: performanceTier.tier,
      rewardBadge: performanceTier.badge,
      rewardedAt: new Date().toISOString(),
    });

    // Check for milestone bonus
    const milestoneBonus = await checkMilestoneBonus(contentId, userId, views);

    // Update user earnings balance
    const userRef = db.collection("users").doc(userId);
    await userRef.set(
      {
        totalEarnings: admin.firestore.FieldValue.increment(
          performanceTier.reward + (milestoneBonus?.bonus || 0)
        ),
        pendingEarnings: admin.firestore.FieldValue.increment(
          performanceTier.reward + (milestoneBonus?.bonus || 0)
        ),
        lastEarningAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return {
      success: true,
      tier: performanceTier.tier,
      badge: performanceTier.badge,
      reward: performanceTier.reward,
      milestoneBonus: milestoneBonus?.bonus || 0,
      milestone: milestoneBonus?.milestone || null,
      totalEarned: performanceTier.reward + (milestoneBonus?.bonus || 0),
    };
  } catch (error) {
    console.error("Error calculating content rewards:", error);
    return { error: error.message };
  }
}

/**
 * Get user's total earnings and breakdown
 */
async function getUserEarnings(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Get earnings events (without orderBy to avoid index requirement)
    let earningsSnap;
    try {
      earningsSnap = await db
        .collection("earnings_events")
        .where("userId", "==", userId)
        .limit(100)
        .get();
    } catch (queryError) {
      console.log("Earnings events query failed, returning default values:", queryError.message);
      // Return default earnings if collection doesn't exist or query fails
      return {
        totalEarnings: userData.totalEarnings || 0,
        pendingEarnings: userData.pendingEarnings || 0,
        paidOut: (userData.totalEarnings || 0) - (userData.pendingEarnings || 0),
        canPayout: (userData.pendingEarnings || 0) >= MIN_PAYOUT_THRESHOLD,
        minThreshold: MIN_PAYOUT_THRESHOLD,
        breakdown: {
          performance: 0,
          milestones: 0,
        },
        recentEvents: [],
      };
    }

    const events = [];
    let totalPerformance = 0;
    let totalMilestone = 0;

    earningsSnap.forEach(doc => {
      const event = { id: doc.id, ...doc.data() };
      events.push(event);

      if (event.type === "performance_reward") {
        totalPerformance += event.amount || 0;
      } else if (event.type === "milestone_bonus") {
        totalMilestone += event.amount || 0;
      }
    });

    // Sort events by createdAt in memory
    events.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    return {
      totalEarnings: userData.totalEarnings || 0,
      pendingEarnings: userData.pendingEarnings || 0,
      paidOut: (userData.totalEarnings || 0) - (userData.pendingEarnings || 0),
      canPayout: (userData.pendingEarnings || 0) >= MIN_PAYOUT_THRESHOLD,
      minThreshold: MIN_PAYOUT_THRESHOLD,
      breakdown: {
        performance: totalPerformance,
        milestones: totalMilestone,
      },
      recentEvents: events.slice(0, 10),
    };
  } catch (error) {
    console.error("Error getting user earnings:", error);
    return { error: error.message };
  }
}

/**
 * Process payout request
 */
async function requestPayout(userId, paymentMethod = "paypal") {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { error: "User not found" };
    }

    const userData = userDoc.data();
    const pendingEarnings = userData.pendingEarnings || 0;

    if (pendingEarnings < MIN_PAYOUT_THRESHOLD) {
      return {
        error: `Minimum payout is $${MIN_PAYOUT_THRESHOLD}. You have $${pendingEarnings.toFixed(2)} pending.`,
      };
    }

    // Fraud/KYC checks: if the operator requires KYC for large payouts, enforce it
    if (process.env.REQUIRE_KYC_FOR_PAYOUTS === "true") {
      const kycThreshold = parseFloat(process.env.PAYOUTS_KYC_THRESHOLD || "500");
      if ((pendingEarnings || 0) >= kycThreshold && !userData.kycVerified) {
        return {
          error: `KYC verification required for payouts >= $${kycThreshold}. Please complete identity verification.`,
        };
      }
    }
    // Create payout record (default PayPal)
    const method = (paymentMethod || "paypal").toLowerCase();
    if (method === "paypal" && !userData.paypalEmail) {
      return {
        error: "PayPal email not configured. Please add your PayPal email in account settings.",
      };
    }
    const payoutRef = await db.collection("payouts").add({
      userId,
      amount: pendingEarnings,
      status: "pending",
      paymentMethod: method,
      payee: method === "paypal" ? { paypalEmail: userData.paypalEmail } : {},
      requestedAt: new Date().toISOString(),
    });

    // Deduct from pending earnings
    await userRef.update({
      pendingEarnings: 0,
      lastPayoutAt: new Date().toISOString(),
    });

    return {
      success: true,
      payoutId: payoutRef.id,
      amount: pendingEarnings,
      status: "pending",
      message: `Payout of $${pendingEarnings.toFixed(2)} requested successfully!`,
    };
  } catch (error) {
    console.error("Error requesting payout:", error);
    return { error: error.message };
  }
}

/**
 * Get top performing creators (leaderboard)
 */
async function getTopCreators(timeRange = "30d") {
  try {
    const now = new Date();
    let startDate = new Date();

    switch (timeRange) {
      case "24h":
        startDate.setHours(now.getHours() - 24);
        break;
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "all":
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get earnings in time range
    const earningsSnap = await db
      .collection("earnings_events")
      .where("createdAt", ">=", startDate.toISOString())
      .get();

    // Aggregate by user
    const userEarnings = {};
    earningsSnap.forEach(doc => {
      const event = doc.data();
      if (!userEarnings[event.userId]) {
        userEarnings[event.userId] = {
          userId: event.userId,
          totalEarned: 0,
          rewardCount: 0,
        };
      }
      userEarnings[event.userId].totalEarned += event.amount || 0;
      userEarnings[event.userId].rewardCount++;
    });

    // Sort and get top 10
    const leaderboard = Object.values(userEarnings)
      .sort((a, b) => b.totalEarned - a.totalEarned)
      .slice(0, 10);

    // Get user details
    for (const entry of leaderboard) {
      const userDoc = await db.collection("users").doc(entry.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        entry.displayName = userData.displayName || userData.email || "Anonymous";
        entry.photoURL = userData.photoURL || null;
      }
    }

    return leaderboard;
  } catch (error) {
    console.error("Error getting top creators:", error);
    return [];
  }
}

module.exports = {
  calculateContentRewards,
  getUserEarnings,
  requestPayout,
  getTopCreators,
  PERFORMANCE_TIERS,
  MILESTONE_BONUSES,
  MIN_PAYOUT_THRESHOLD,
};

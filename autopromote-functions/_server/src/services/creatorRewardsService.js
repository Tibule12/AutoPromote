// creatorRewardsService.js
// Automatic creator rewards based on content performance
// UPDATED: "Pay Per View" logic removed. This service now acts as a placeholder or handles unrelated rewards.

const { admin, db } = require("../firebaseAdmin");

// Reward thresholds and payouts - CLEARED
/*
 * PREVIOUSLY IMPLEMENTED:
 * viral: { minViews: 30000, minEngagement: 0.05, reward: 3.0, badge: '🔥 Viral Bonus' },
 * trending: { minViews: 100000, minEngagement: 0.04, reward: 8.0, badge: '📈 Mega Bonus' },
 */
const PERFORMANCE_TIERS = {};

/*
 * PREVIOUSLY IMPLEMENTED:
 * 1000000: 40.0,
 * 500000: 20.0,
 * 100000: 8.0,
 */
const MILESTONE_BONUSES = {};

const MIN_PAYOUT_THRESHOLD = 999999.0; // Effectively disabled

/**
 * Calculate engagement rate
 */
function calculateEngagementRate(content) {
  return 0; // Disabled
}

/**
 * Determine performance tier based on views and engagement
 */
function getPerformanceTier(views, engagementRate) {
  return null; // Disabled
}

/**
 * Check if content hit a milestone and award bonus
 */
async function checkMilestoneBonus(contentId, userId, currentViews) {
  return null; // Disabled
}

/**
 * Calculate and award creator rewards for content
 * THIS FUNCTION NOW RETURNS 0 REWARDS ALWAYS
 */
async function calculateContentRewards(contentId, userId) {
  // Logic disabled - "Pay Per View" model removed
  return {
    success: true,
    tier: null,
    badge: null,
    reward: 0,
    milestoneBonus: 0,
    milestone: null,
    totalEarned: 0,
    message: "Pay-per-view rewards are currently disabled. Join a Mission to earn rewards."
  };
}

/**
 * Get user's total earnings and breakdown
 */
async function getUserEarnings(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // For now, we still return the values from the DB if they exist (historical data),
    // but the system won't generate NEW earnings from views.
    // However, to stop displaying "fake money", we return 0.
    
    return {
      totalEarnings: 0, // userData.totalEarnings || 0,
      pendingEarnings: 0, // userData.pendingEarnings || 0,
      paidOut: 0,
      canPayout: false,
      minThreshold: MIN_PAYOUT_THRESHOLD,
      breakdown: {
        performance: 0,
        milestones: 0,
      },
      recentEvents: [],
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
  return {
    error: "Payouts for view-based rewards are discontinued. Please check the Missions tab for active opportunities."
  };
}

/**
 * Get top performing creators (leaderboard)
 */
async function getTopCreators(timeRange = "30d") {
  // Return empty list or real engagement leaders without money attached
  // We'll return empty for now to clean up the dashboard
  return [];
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

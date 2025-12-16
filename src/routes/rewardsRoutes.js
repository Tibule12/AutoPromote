// rewardsRoutes.js
// Comprehensive gamification & rewards system

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { audit } = require("../services/auditLogger");
const { rateLimiter } = require("../middlewares/globalRateLimiter");

// Apply rate limiting
const rewardsLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_REWARDS || "200", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "rewards",
});

router.use(rewardsLimiter);

// Points system configuration
const POINTS_CONFIG = {
  // Content actions
  upload: 50,
  post_community: 25,
  ai_clip_generated: 75,

  // Engagement received
  view_received: 1,
  like_received: 5,
  comment_received: 10,
  share_received: 15,

  // Giving engagement
  like_given: 2,
  comment_given: 5,
  share_given: 8,

  // Viral milestones
  reach_1k_views: 500,
  reach_10k_views: 2000,
  reach_50k_views: 10000,
  reach_100k_views: 25000,
  reach_500k_views: 100000,
  reach_1m_views: 250000,

  // Social actions
  follow_user: 10,
  referral_signup: 1000, // Big reward for referrals!
  referral_upgrade: 5000, // HUGE reward if referral upgrades

  // Daily actions
  daily_login: 20,
  daily_streak_bonus: 50, // Per streak day
  weekly_active: 200,

  // Platform growth
  invite_friend: 100,
  share_platform: 50,

  // Subscription tiers get multipliers
  tier_multipliers: {
    free: 1.0,
    premium: 1.5,
    pro: 2.0,
    enterprise: 3.0,
  },
};

// Achievement definitions
const ACHIEVEMENTS = {
  // Getting started
  first_upload: {
    id: "first_upload",
    name: "First Steps",
    description: "Upload your first content",
    icon: "🚀",
    points: 100,
    badge: "bronze",
    requirement: { uploads: 1 },
  },

  first_viral: {
    id: "first_viral",
    name: "Viral Rookie",
    description: "Get 10K views on a post",
    icon: "🔥",
    points: 500,
    badge: "silver",
    requirement: { views_on_single_post: 10000 },
  },

  // Content creator achievements
  prolific_creator: {
    id: "prolific_creator",
    name: "Content Machine",
    description: "Upload 100 pieces of content",
    icon: "⚡",
    points: 2000,
    badge: "gold",
    requirement: { total_uploads: 100 },
  },

  // Engagement achievements
  social_butterfly: {
    id: "social_butterfly",
    name: "Social Butterfly",
    description: "Receive 1000 likes",
    icon: "🦋",
    points: 1500,
    badge: "silver",
    requirement: { total_likes_received: 1000 },
  },

  comment_king: {
    id: "comment_king",
    name: "Conversation Starter",
    description: "Get 500 comments on your content",
    icon: "💬",
    points: 2500,
    badge: "gold",
    requirement: { total_comments_received: 500 },
  },

  // Viral achievements
  mega_viral: {
    id: "mega_viral",
    name: "Mega Viral",
    description: "Get 100K views on a single post",
    icon: "💥",
    points: 10000,
    badge: "platinum",
    requirement: { views_on_single_post: 100000 },
  },

  viral_legend: {
    id: "viral_legend",
    name: "Viral Legend",
    description: "Get 1M views on a single post",
    icon: "👑",
    points: 50000,
    badge: "diamond",
    requirement: { views_on_single_post: 1000000 },
  },

  // Community achievements
  community_pillar: {
    id: "community_pillar",
    name: "Community Pillar",
    description: "Create 100 community posts",
    icon: "🏛️",
    points: 3000,
    badge: "gold",
    requirement: { community_posts: 100 },
  },

  // Streak achievements
  week_warrior: {
    id: "week_warrior",
    name: "Week Warrior",
    description: "Login for 7 days straight",
    icon: "📅",
    points: 500,
    badge: "bronze",
    requirement: { login_streak: 7 },
  },

  month_master: {
    id: "month_master",
    name: "Month Master",
    description: "Login for 30 days straight",
    icon: "🗓️",
    points: 3000,
    badge: "platinum",
    requirement: { login_streak: 30 },
  },

  // Referral achievements
  influencer: {
    id: "influencer",
    name: "Influencer",
    description: "Refer 10 users who sign up",
    icon: "🌟",
    points: 5000,
    badge: "gold",
    requirement: { successful_referrals: 10 },
  },

  viral_recruiter: {
    id: "viral_recruiter",
    name: "Viral Recruiter",
    description: "Refer 100 users who sign up",
    icon: "🚀",
    points: 50000,
    badge: "diamond",
    requirement: { successful_referrals: 100 },
  },
};

// Reward shop items
const REWARD_SHOP = {
  viral_boost_starter: {
    id: "viral_boost_starter",
    name: "Free Viral Boost (10K views)",
    description: "Redeem points for a free viral boost",
    cost: 5000,
    icon: "🚀",
    type: "boost",
    value: { packageId: "free", views: 10000 },
  },

  viral_boost_premium: {
    id: "viral_boost_premium",
    name: "Premium Boost (80K views)",
    description: "Massive viral boost with 80K guaranteed views",
    cost: 15000,
    icon: "💫",
    type: "boost",
    value: { packageId: "premium", views: 80000 },
  },

  featured_placement: {
    id: "featured_placement",
    name: "24h Featured Placement",
    description: "Get featured on homepage for 24 hours",
    cost: 3000,
    icon: "⭐",
    type: "feature",
    value: { duration: 24 },
  },

  ai_credits: {
    id: "ai_credits",
    name: "10 AI Clip Credits",
    description: "Generate 10 AI-powered clips",
    cost: 2000,
    icon: "🤖",
    type: "credits",
    value: { credits: 10 },
  },

  analytics_unlock: {
    id: "analytics_unlock",
    name: "Advanced Analytics (7 days)",
    description: "Unlock advanced analytics dashboard",
    cost: 1500,
    icon: "📊",
    type: "feature",
    value: { duration: 7 },
  },

  badge_showcase: {
    id: "badge_showcase",
    name: "Custom Badge Showcase",
    description: "Highlight your favorite achievement badge",
    cost: 500,
    icon: "🎖️",
    type: "cosmetic",
    value: {},
  },

  profile_theme: {
    id: "profile_theme",
    name: "Premium Profile Theme",
    description: "Unlock exclusive profile design",
    cost: 1000,
    icon: "🎨",
    type: "cosmetic",
    value: {},
  },

  no_watermark_day: {
    id: "no_watermark_day",
    name: "7 Days No Watermark",
    description: "Remove watermark from all content",
    cost: 2500,
    icon: "💧",
    type: "feature",
    value: { duration: 7 },
  },
};

/**
 * GET /api/rewards/profile
 * Get user's reward profile
 */
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Get or create rewards profile
    const profileDoc = await db.collection("user_rewards").doc(userId).get();

    let profile;
    if (!profileDoc.exists) {
      // Create new profile
      profile = {
        userId,
        points: 0,
        totalPointsEarned: 0,
        level: 1,
        xp: 0,
        achievements: [],
        badges: [],
        loginStreak: 0,
        lastLoginDate: new Date().toISOString().split("T")[0],
        referralCount: 0,
        createdAt: new Date().toISOString(),
      };
      await db.collection("user_rewards").doc(userId).set(profile);
    } else {
      profile = profileDoc.data();

      // Update login streak
      const today = new Date().toISOString().split("T")[0];
      const lastLogin = profile.lastLoginDate;

      if (lastLogin !== today) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const isConsecutive = lastLogin === yesterday;

        const newStreak = isConsecutive ? (profile.loginStreak || 0) + 1 : 1;
        const streakBonus = newStreak * POINTS_CONFIG.daily_streak_bonus;

        // Award daily login + streak bonus
        const pointsEarned = POINTS_CONFIG.daily_login + streakBonus;

        await db
          .collection("user_rewards")
          .doc(userId)
          .update({
            points: (profile.points || 0) + pointsEarned,
            totalPointsEarned: (profile.totalPointsEarned || 0) + pointsEarned,
            loginStreak: newStreak,
            lastLoginDate: today,
          });

        profile.points += pointsEarned;
        profile.totalPointsEarned += pointsEarned;
        profile.loginStreak = newStreak;

        // Check for streak achievements
        await checkAchievements(userId, { login_streak: newStreak });
      }
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("[Rewards] Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch reward profile" });
  }
});

/**
 * POST /api/rewards/award
 * Award points to user (internal use)
 */
router.post("/award", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { action, amount, metadata } = req.body;

    if (!userId || !action) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user tier for multiplier
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};
    const tier = userData.subscriptionTier || "free";
    const multiplier = POINTS_CONFIG.tier_multipliers[tier] || 1.0;

    // Calculate points
    const basePoints = amount || POINTS_CONFIG[action] || 0;
    const finalPoints = Math.floor(basePoints * multiplier);

    // Update user rewards
    const profileRef = db.collection("user_rewards").doc(userId);
    const profileDoc = await profileRef.get();

    const currentPoints = profileDoc.exists ? profileDoc.data().points || 0 : 0;
    const currentTotal = profileDoc.exists ? profileDoc.data().totalPointsEarned || 0 : 0;

    await profileRef.set(
      {
        points: currentPoints + finalPoints,
        totalPointsEarned: currentTotal + finalPoints,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Log the reward
    await db.collection("reward_history").add({
      userId,
      action,
      pointsEarned: finalPoints,
      basePoints,
      multiplier,
      tier,
      metadata: metadata || {},
      timestamp: new Date().toISOString(),
    });

    audit.log("rewards.points_awarded", { userId, action, points: finalPoints });

    res.json({
      success: true,
      pointsEarned: finalPoints,
      newBalance: currentPoints + finalPoints,
      multiplier,
    });
  } catch (error) {
    console.error("[Rewards] Award points error:", error);
    res.status(500).json({ error: "Failed to award points" });
  }
});

/**
 * GET /api/rewards/achievements
 * Get available achievements and user progress
 */
router.get("/achievements", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profileDoc = await db.collection("user_rewards").doc(userId).get();
    const profile = profileDoc.data() || { achievements: [] };

    // Get user stats for progress tracking
    const stats = await getUserStats(userId);

    // Map achievements with progress
    const achievementsWithProgress = Object.values(ACHIEVEMENTS).map(achievement => {
      const unlocked = profile.achievements?.includes(achievement.id);
      const progress = calculateAchievementProgress(achievement, stats);

      return {
        ...achievement,
        unlocked,
        progress,
        unlockedAt: unlocked ? profile[`achievement_${achievement.id}_date`] : null,
      };
    });

    res.json({
      success: true,
      achievements: achievementsWithProgress,
      totalUnlocked: profile.achievements?.length || 0,
    });
  } catch (error) {
    console.error("[Rewards] Get achievements error:", error);
    res.status(500).json({ error: "Failed to fetch achievements" });
  }
});

/**
 * GET /api/rewards/shop
 * Get reward shop items
 */
router.get("/shop", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profileDoc = await db.collection("user_rewards").doc(userId).get();
    const profile = profileDoc.data() || { points: 0 };

    const shopItems = Object.values(REWARD_SHOP).map(item => ({
      ...item,
      affordable: profile.points >= item.cost,
      userPoints: profile.points,
    }));

    res.json({
      success: true,
      items: shopItems,
      userPoints: profile.points,
    });
  } catch (error) {
    console.error("[Rewards] Get shop error:", error);
    res.status(500).json({ error: "Failed to fetch shop" });
  }
});

/**
 * POST /api/rewards/redeem
 * Redeem points for reward
 */
router.post("/redeem", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { itemId } = req.body;

    if (!userId || !itemId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const item = REWARD_SHOP[itemId];
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const profileRef = db.collection("user_rewards").doc(userId);
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return res.status(404).json({ error: "Reward profile not found" });
    }

    const profile = profileDoc.data();

    if (profile.points < item.cost) {
      return res.status(400).json({
        error: "Insufficient points",
        required: item.cost,
        available: profile.points,
      });
    }

    // Deduct points
    await profileRef.update({
      points: profile.points - item.cost,
      updatedAt: new Date().toISOString(),
    });

    // Apply reward based on type
    await applyReward(userId, item);

    // Log redemption
    await db.collection("redemption_history").add({
      userId,
      itemId,
      itemName: item.name,
      cost: item.cost,
      timestamp: new Date().toISOString(),
    });

    audit.log("rewards.item_redeemed", { userId, itemId, cost: item.cost });

    res.json({
      success: true,
      message: `${item.name} redeemed successfully!`,
      newBalance: profile.points - item.cost,
      reward: item,
    });
  } catch (error) {
    console.error("[Rewards] Redeem error:", error);
    res.status(500).json({ error: "Failed to redeem item" });
  }
});

/**
 * GET /api/rewards/leaderboard
 * Get top users by points
 */
router.get("/leaderboard", authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type || "points"; // points, uploads, views

    let snapshot;
    if (type === "points") {
      snapshot = await db
        .collection("user_rewards")
        .orderBy("totalPointsEarned", "desc")
        .limit(limit)
        .get();
    }

    const leaderboard = await Promise.all(
      snapshot.docs.map(async (doc, index) => {
        const data = doc.data();
        const userDoc = await db.collection("users").doc(doc.id).get();
        const userData = userDoc.data() || {};

        return {
          rank: index + 1,
          userId: doc.id,
          userName: userData.displayName || "Anonymous",
          userAvatar: userData.photoURL,
          points: data.totalPointsEarned || 0,
          level: data.level || 1,
          badges: data.badges || [],
          tier: userData.subscriptionTier || "free",
        };
      })
    );

    res.json({
      success: true,
      leaderboard,
      type,
    });
  } catch (error) {
    console.error("[Rewards] Leaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

/**
 * POST /api/rewards/referral
 * Track referral signup
 */
router.post("/referral", authMiddleware, async (req, res) => {
  try {
    const newUserId = req.userId || req.user?.uid;
    const { referralCode } = req.body;

    if (!newUserId || !referralCode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find referrer by code
    const referrerSnap = await db
      .collection("users")
      .where("referralCode", "==", referralCode)
      .limit(1)
      .get();

    if (referrerSnap.empty) {
      return res.status(404).json({ error: "Invalid referral code" });
    }

    const referrerId = referrerSnap.docs[0].id;

    // Award points to referrer
    const profileRef = db.collection("user_rewards").doc(referrerId);
    const profileDoc = await profileRef.get();
    const currentPoints = profileDoc.exists ? profileDoc.data().points || 0 : 0;
    const referralCount = profileDoc.exists ? profileDoc.data().referralCount || 0 : 0;

    await profileRef.set(
      {
        points: currentPoints + POINTS_CONFIG.referral_signup,
        totalPointsEarned:
          (profileDoc.data()?.totalPointsEarned || 0) + POINTS_CONFIG.referral_signup,
        referralCount: referralCount + 1,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Track referral
    await db.collection("referrals").add({
      referrerId,
      newUserId,
      pointsAwarded: POINTS_CONFIG.referral_signup,
      timestamp: new Date().toISOString(),
    });

    audit.log("rewards.referral_completed", { referrerId, newUserId });

    res.json({
      success: true,
      message: "Referral tracked successfully",
    });
  } catch (error) {
    console.error("[Rewards] Referral error:", error);
    res.status(500).json({ error: "Failed to track referral" });
  }
});

// Helper functions
async function getUserStats(userId) {
  const [contentSnap, postsSnap, likesSnap, commentsSnap] = await Promise.all([
    db.collection("content").where("userId", "==", userId).get(),
    db.collection("community_posts").where("userId", "==", userId).get(),
    db.collection("community_likes").where("postUserId", "==", userId).get(),
    db.collection("community_comments").where("postUserId", "==", userId).get(),
  ]);

  const profileDoc = await db.collection("user_rewards").doc(userId).get();
  const profile = profileDoc.data() || {};

  return {
    uploads: contentSnap.size,
    community_posts: postsSnap.size,
    total_likes_received: likesSnap.size,
    total_comments_received: commentsSnap.size,
    login_streak: profile.loginStreak || 0,
    successful_referrals: profile.referralCount || 0,
    // Get max views on single post
    views_on_single_post: Math.max(...postsSnap.docs.map(d => d.data().viewsCount || 0), 0),
  };
}

function calculateAchievementProgress(achievement, stats) {
  const req = achievement.requirement;
  const key = Object.keys(req)[0];
  const target = req[key];
  const current = stats[key] || 0;

  return {
    current,
    target,
    percentage: Math.min((current / target) * 100, 100),
  };
}

async function checkAchievements(userId, stats) {
  const profileDoc = await db.collection("user_rewards").doc(userId).get();
  const profile = profileDoc.data() || { achievements: [] };

  for (const achievement of Object.values(ACHIEVEMENTS)) {
    if (profile.achievements?.includes(achievement.id)) continue;

    const progress = calculateAchievementProgress(achievement, stats);
    if (progress.percentage >= 100) {
      // Unlock achievement
      await db
        .collection("user_rewards")
        .doc(userId)
        .update({
          achievements: [...(profile.achievements || []), achievement.id],
          points: (profile.points || 0) + achievement.points,
          totalPointsEarned: (profile.totalPointsEarned || 0) + achievement.points,
          [`achievement_${achievement.id}_date`]: new Date().toISOString(),
        });

      audit.log("rewards.achievement_unlocked", { userId, achievementId: achievement.id });
    }
  }
}

async function applyReward(userId, item) {
  switch (item.type) {
    case "boost":
      // Create viral boost
      await db.collection("viral_boosts").add({
        userId,
        packageId: item.value.packageId,
        targetViews: item.value.views,
        status: "pending",
        source: "reward_shop",
        createdAt: new Date().toISOString(),
      });
      break;

    case "feature":
      // Grant temporary feature access
      await db
        .collection("user_features")
        .doc(userId)
        .set(
          {
            [item.id]: {
              expiresAt: new Date(
                Date.now() + item.value.duration * 24 * 60 * 60 * 1000
              ).toISOString(),
              grantedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      break;

    case "credits":
      // Grant AI credits
      await db
        .collection("users")
        .doc(userId)
        .update({
          aiCredits: db.FieldValue.increment(item.value.credits),
        });
      break;

    case "cosmetic":
      // Unlock cosmetic item
      await db
        .collection("user_cosmetics")
        .doc(userId)
        .set(
          {
            [item.id]: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      break;
  }
}

module.exports = router;

const express = require("express");
const { db } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const router = express.Router();

// Get content analytics
router.get("/content/:id", authMiddleware, async (req, res) => {
  try {
    const contentId = req.params.id;

    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = contentDoc.data();

    // Check if user has permission to view this content's analytics
    if (process.env.DEBUG_AUTH === "true") {
      const logger = require("./utils/logger");
      logger.debug(
        "[analytics] debug: content.userId=%s content.uid=%s req.user=%o",
        content.userId,
        content.uid,
        req.user
      );
    }
    if (content.userId !== req.user.uid && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get analytics data
    const analyticsRef = db.collection("analytics").doc(contentId);
    const analyticsDoc = await analyticsRef.get();
    const analytics = analyticsDoc.exists
      ? analyticsDoc.data()
      : {
          views: 0,
          likes: 0,
          shares: 0,
          revenue: 0,
        };

    res.json({ analytics });
  } catch (error) {
    const logger = require("./utils/logger");
    logger.error("Error getting content analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user analytics overview
router.get("/overview", authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection("content").where("userId", "==", req.user.uid);
    const contentSnapshot = await contentRef.get();

    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalRevenue = 0;

    contentSnapshot.forEach(doc => {
      const content = doc.data();
      totalViews += content.views || 0;
      totalLikes += content.likes || 0;
      totalShares += content.shares || 0;
      totalRevenue += content.revenue || 0;
    });

    res.json({
      overview: {
        totalContent: contentSnapshot.size,
        totalViews,
        totalLikes,
        totalShares,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Error getting analytics overview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user analytics with time range
router.get("/user", authMiddleware, async (req, res) => {
  try {
    const range = req.query.range || "7d";
    const uid = req.user?.uid || req.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    // Parse time range
    const now = new Date();
    let startDate = new Date();
    if (range === "24h") startDate.setHours(now.getHours() - 24);
    else if (range === "7d") startDate.setDate(now.getDate() - 7);
    else if (range === "30d") startDate.setDate(now.getDate() - 30);
    else if (range === "90d") startDate.setDate(now.getDate() - 90);
    else startDate.setDate(now.getDate() - 7); // default to 7d

    // Get user's content in time range
    const contentRef = db
      .collection("content")
      .where("userId", "==", uid)
      .where("createdAt", ">=", startDate.toISOString())
      .orderBy("createdAt", "desc");

    const contentSnapshot = await contentRef.get();

    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalRevenue = 0;
    const contentByPlatform = {};

    contentSnapshot.forEach(doc => {
      const content = doc.data();
      totalViews += content.views || 0;
      totalLikes += content.likes || 0;
      totalShares += content.shares || 0;
      totalRevenue += content.revenue || 0;

      // Aggregate by platform
      const platform = content.platform || "unknown";
      if (!contentByPlatform[platform]) {
        contentByPlatform[platform] = { count: 0, views: 0, likes: 0, revenue: 0 };
      }
      contentByPlatform[platform].count++;
      contentByPlatform[platform].views += content.views || 0;
      contentByPlatform[platform].likes += content.likes || 0;
      contentByPlatform[platform].revenue += content.revenue || 0;
    });

    // --- PLATFORM POSTS AGGREGATION (Cross-posting stats) ---
    // Fetch individual platform posts (Facebook shares, Tweets, etc.) for this user
    try {
      const postsRef = db
        .collection("platform_posts")
        .where("uid", "==", uid)
        .where("createdAt", ">=", startDate) // Firestore timestamp comparison might need a Date object
        .orderBy("createdAt", "desc");

      const postsSnap = await postsRef.get();

      postsSnap.forEach(doc => {
        const p = doc.data();
        if (!p.platform) return;

        const plat = p.platform;
        if (!contentByPlatform[plat]) {
          contentByPlatform[plat] = {
            count: 0,
            views: 0,
            likes: 0,
            revenue: 0,
            comments: 0,
            shares: 0,
          };
        }

        contentByPlatform[plat].count++;

        // Extract metrics (normalized from platformStatsPoller)
        const m = p.metrics || {};

        // Views / Impressions
        const views =
          m.views || m.view_count || m.post_impressions || m.impressions || m.impression_count || 0;
        contentByPlatform[plat].views += parseInt(views || 0, 10);

        // Likes / Upvotes
        const likes = m.likes || m.like_count || m.score || 0; // Reddit uses 'score'
        contentByPlatform[plat].likes += parseInt(likes || 0, 10);

        // Shares / Retweets
        const shares = m.shares || m.share_count || m.retweet_count || 0;
        contentByPlatform[plat].shares += parseInt(shares || 0, 10);

        // Comments / Replies
        const comments =
          m.comments || m.comment_count || m.reply_count || m.post_engaged_users || 0;
        if (!contentByPlatform[plat].comments) contentByPlatform[plat].comments = 0;
        contentByPlatform[plat].comments += parseInt(comments || 0, 10);

        // Add to totals (optional: maybe keep separate to avoiding double counting if content doc also tracks it?
        // Usually content doc tracks Source, this tracks Distribution. Adding them gives total reach.)
        totalViews += parseInt(views || 0, 10);
        totalLikes += parseInt(likes || 0, 10);
        totalShares += parseInt(shares || 0, 10);
      });
    } catch (e) {
      console.warn("[Analytics] Failed to aggregate platform_posts:", e.message);
    }

    // --- REVENUE & REFERRAL TRACKING INJECTION ---
    // Inject current progress towards bonuses so frontend can display "Sales Shark" trackers
    // Using top-level db import

    // 1. Viral Bonus Progress & Content Health Text
    // Logic: Free Tier target is 50k views ("Flaming/Magic").
    // Below that = "We are working on it" (Auto-Promote active).
    let bestContent = { views: 0, nextGoal: 50000, potentialBonus: 0 };
    let performanceStatus = "Initializing";
    let motivationMessage = "Preparing your content for the algorithm.";

    // Find best performer
    let maxViews = 0;
    contentSnapshot.forEach(doc => {
      const v = doc.data().views || 0;
      if (v > maxViews) maxViews = v;
    });

    if (maxViews < 1000) {
      performanceStatus = "Needs Work";
      motivationMessage = "Early stages. We are optimizing hashtags and gathering signals.";
      bestContent = { views: maxViews, nextGoal: 50000, potentialBonus: 0 };
    } else if (maxViews < 50000) {
      performanceStatus = "Growing";
      motivationMessage =
        "We are working on it! Auto-Promote is cycling your content to reach the magic 50k.";
      bestContent = { views: maxViews, nextGoal: 50000, potentialBonus: 0 };
    } else if (maxViews < 100000) {
      performanceStatus = "Flaming & Magic";
      motivationMessage =
        "You hit the magic 50k! Free Tier is maxed out. Upgrade to Subscription to push for 1M+.";
      bestContent = { views: maxViews, nextGoal: 100000, potentialBonus: 0 }; // Removed cash bonus
    } else {
      performanceStatus = "Viral Supernova";
      motivationMessage = "Your content is dominating the feed. The algorithm loves you.";
      bestContent = { views: maxViews, nextGoal: 500000, potentialBonus: 0 }; // Removed cash bonus
    }

    // 2. Referral Progress (Logic from referralGrowthEngine: 10 friends = $5, 20 = $15)
    let referralStats = { total: 0, nextGoal: 10, potentialBonus: 5 };
    let referralCode = "";
    try {
      const [creds, userDoc] = await Promise.all([
        db.collection("user_credits").doc(uid).get(),
        db.collection("users").doc(uid).get(),
      ]);

      if (creds.exists) {
        const count = creds.data().totalReferrals || 0;
        if (count < 10) referralStats = { total: count, nextGoal: 10, potentialBonus: 5 };
        else if (count < 20) referralStats = { total: count, nextGoal: 20, potentialBonus: 15 };
        else referralStats = { total: count, nextGoal: 100, potentialBonus: 50 }; // Made up cap
      }
      if (userDoc.exists) {
        referralCode = userDoc.data().referralCode || "";
      }
    } catch (e) {}

    res.json({
      range,
      totalContent: contentSnapshot.size,
      totalViews,
      totalLikes,
      totalShares,
      totalRevenue,
      byPlatform: contentByPlatform,
      viralityTracker: bestContent,
      performanceStatus,
      motivationMessage,
      referralTracker: referralStats, // New!
      referralCode, // New!
    });
  } catch (error) {
    console.error("Error getting user analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mount platform-specific analytics routes (LinkedIn / Reddit / Pinterest)
try {
  const platformAnalytics = require("./routes/platformAnalyticsRoutes");
  router.use("/", platformAnalytics);
} catch (e) {
  console.warn("platformAnalyticsRoutes mount failed:", e && e.message);
}

module.exports = router;

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

    // --- REVENUE & REFERRAL TRACKING INJECTION ---
    // Inject current progress towards bonuses so frontend can display "Sales Shark" trackers
    const { db } = require("./firebaseAdmin"); // Re-import to be safe or use scope
    
    // 1. Viral Bonus Progress (Logic from creatorRewardsService: 30k = $3, 100k = $8)
    // Find best performing content to show proximity to next tier
    let bestContent = { views: 0, nextGoal: 30000, potentialBonus: 3 };
    contentSnapshot.forEach(doc => {
         const c = doc.data();
         if ((c.views || 0) > bestContent.views) {
             const v = c.views || 0;
             if (v < 30000) bestContent = { views: v, nextGoal: 30000, potentialBonus: 3 };
             else if (v < 100000) bestContent = { views: v, nextGoal: 100000, potentialBonus: 8 };
             else bestContent = { views: v, nextGoal: 500000, potentialBonus: 20 }; // Max tier view
         }
    });

    // 2. Referral Progress (Logic from referralGrowthEngine: 10 friends = $5, 20 = $15)
    let referralStats = { total: 0, nextGoal: 10, potentialBonus: 5 };
    let referralCode = "";
    try {
        const [creds, userDoc] = await Promise.all([
          db.collection("user_credits").doc(uid).get(),
          db.collection("users").doc(uid).get()
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
    } catch(e) {}

    res.json({
      range,
      totalContent: contentSnapshot.size,
      totalViews,
      totalLikes,
      totalShares,
      totalRevenue,
      byPlatform: contentByPlatform,
      viralityTracker: bestContent, // New!
      referralTracker: referralStats, // New!
      referralCode // New!
    });
  } catch (error) {
    console.error("Error getting user analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;

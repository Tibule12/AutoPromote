const express = require("express");
const { db } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const router = express.Router();

function parseTimestamp(value) {
  if (!value) return null;
  if (value.toMillis) return value.toMillis();
  const t = Date.parse(value);
  return isNaN(t) ? null : t;
}

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

    // Override revenue to 0 as pay-per-view is disabled
    if (analytics.revenue) analytics.revenue = 0;

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
    const statsService = require("./services/statsService");
    const overview = await statsService.getUserOverview(req.user.uid);
    res.json({ overview });
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

    // Get user's content (Filtered in memory to avoid missing index issues on createdAt)
    console.log(`[Analytics] Filtering content for user: ${uid} over range: ${range}`);
    const contentRef = db.collection("content").where("userId", "==", uid);

    const contentSnapshot = await contentRef.get();
    console.log(`[Analytics] Found ${contentSnapshot.size} total docs for user.`);

    // In-memory filter & sort
    const filteredDocs = [];
    contentSnapshot.forEach(doc => {
      const data = doc.data();
      let createdTime = 0;
      /* ... logic ... */
      if (data.createdAt) {
        if (typeof data.createdAt.toDate === "function") {
          createdTime = data.createdAt.toDate().getTime();
        } else if (data.createdAt instanceof Date) {
          createdTime = data.createdAt.getTime();
        } else if (typeof data.createdAt === "string") {
          createdTime = new Date(data.createdAt).getTime();
        }
      }

      if (createdTime >= startDate.getTime()) {
        filteredDocs.push(data);
      }
    });
    console.log(
      `[Analytics] ${filteredDocs.length} passed date filter (>= ${startDate.toISOString()})`
    );

    // Emulate existing logic by looping heavily
    // But since subsequent logic iterates `contentSnapshot`, we need to change how we iterate.
    // Let's replace the `contentSnapshot` usage.

    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalRevenue = 0;
    let totalClicks = 0;
    const contentByPlatform = {};

    filteredDocs.forEach(content => {
      // original loop body used 'doc.data()' -> 'content'

      // Handle views from nested stats object if not at top level
      let views = content.views || 0;
      if (!views && content.stats && content.stats.viewCount) {
        views = parseInt(content.stats.viewCount, 10) || 0;
      }

      // Handle likes from nested stats object if not at top level
      let likes = content.likes || 0;
      if (!likes && content.stats && content.stats.likeCount) {
        likes = parseInt(content.stats.likeCount, 10) || 0;
      }

      totalViews += views;
      totalLikes += likes;
      totalShares += content.shares || 0;
      totalRevenue += content.revenue || 0;

      // Smart Platform Aggregation for Multi-Platform Content
      const potentialPlatforms = [
        "youtube",
        "tiktok",
        "instagram",
        "facebook",
        "linkedin",
        "twitter",
      ];
      let handledAsMultiPlatform = false;

      potentialPlatforms.forEach(p => {
        if (content[p] && content[p].stats) {
          handledAsMultiPlatform = true;
          if (!contentByPlatform[p]) {
            contentByPlatform[p] = { count: 0, views: 0, likes: 0, revenue: 0 };
          }

          const pViews = parseInt(content[p].stats.viewCount || 0, 10);
          const pLikes = parseInt(content[p].stats.likeCount || 0, 10);

          contentByPlatform[p].views += pViews;
          contentByPlatform[p].likes += pLikes;
          contentByPlatform[p].count++;
        }
      });

      // Fallback: If no specific platform stats found, attribute to main platform
      if (!handledAsMultiPlatform) {
        const platform = content.platform || "unknown";
        if (!contentByPlatform[platform]) {
          contentByPlatform[platform] = { count: 0, views: 0, likes: 0, revenue: 0 };
        }
        contentByPlatform[platform].count++;
        contentByPlatform[platform].views += views;
        contentByPlatform[platform].likes += likes;
        contentByPlatform[platform].revenue += content.revenue || 0;
      }
    });

    // --- PLATFORM POSTS AGGREGATION (Cross-posting stats) ---
    // Fetch individual platform posts (Facebook shares, Tweets, etc.) for this user
    try {
      // Use simple query to avoid missing index error (FAILED_PRECONDITION)
      // We'll filter and sort by date in memory
      // FIXED: Also fetch failed posts that might have partial metrics or missing status
      // to ensure the dashboard shows at least static/simulated data if available
      const postsRef = db.collection("platform_posts").where("uid", "==", uid).limit(200); // safety cap

      const postsSnap = await postsRef.get();

      const docs = [];
      postsSnap.forEach(d => docs.push(d.data()));

      // Sort desc
      docs.sort((a, b) => {
        const tA = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      });

      let latestSnapshot = null;
      let lastUpdatedAt = null;
      let nextUpdateAt = null;

      docs.forEach(p => {
        if (!p.platform) return;

        // Manual date filter
        if (p.createdAt) {
          const createdTime = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
          if (createdTime < startDate) return;
        }

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

        // Clicks / Link clicks
        const clicks = m.clicks || m.click_count || m.link_clicks || m.post_clicks || 0;
        if (!contentByPlatform[plat].clicks) contentByPlatform[plat].clicks = 0;
        contentByPlatform[plat].clicks += parseInt(clicks || 0, 10);
        totalClicks += parseInt(clicks || 0, 10);

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

        // Track latest analytics snapshot & next scheduled check
        if (Array.isArray(p.analytics_snapshots)) {
          p.analytics_snapshots.forEach(s => {
            if (!s || !s.timestamp) return;
            const ts = parseTimestamp(s.timestamp);
            if (!ts) return;
            if (!lastUpdatedAt || ts > lastUpdatedAt) {
              lastUpdatedAt = ts;
              latestSnapshot = s;
            }
          });
        }
        const nextCheckTs = parseTimestamp(p.next_check_at);
        if (nextCheckTs && (!nextUpdateAt || nextCheckTs < nextUpdateAt)) {
          nextUpdateAt = nextCheckTs;
        }
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

    // Find best performer & latest activity to be honest about "dead" campaigns
    let maxViews = 0;
    let latestUploadDate = 0;

    contentSnapshot.forEach(doc => {
      const d = doc.data();
      const v = d.views || 0;
      if (v > maxViews) maxViews = v;

      const createdAt = d.created_at || d.createdAt;
      if (createdAt) {
        const time = createdAt.toDate
          ? createdAt.toDate().getTime()
          : new Date(createdAt).getTime();
        if (time > latestUploadDate) latestUploadDate = time;
      }
    });

    const daysSinceLatest =
      latestUploadDate > 0 ? (new Date() - latestUploadDate) / (1000 * 60 * 60 * 24) : 0;

    if (maxViews < 1000) {
      if (latestUploadDate > 0 && daysSinceLatest > 5) {
        // Honest Reality Check: Older than 5 days with low views = Failed
        performanceStatus = "Algorithm Limited";
        motivationMessage =
          "Campaign ended below target. External platforms limited organic reach. Use Protocol 7 to Remix & Retry.";
        bestContent = { views: maxViews, nextGoal: 1000, potentialBonus: 0 };
      } else {
        // Still fresh (< 5 days)
        performanceStatus = "Needs Work";
        motivationMessage = "Early stages. We are optimizing hashtags and gathering signals.";
        bestContent = { views: maxViews, nextGoal: 50000, potentialBonus: 0 };
      }
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
      const userDocRef = db.collection("users").doc(uid);
      const userDoc = await userDocRef.get(); // Simplified for speed

      const credsRef = db.collection("user_credits").doc(uid);
      const creds = await credsRef.get();

      if (creds.exists) {
        const count = creds.data().totalReferrals || 0;
        referralStats = {
          total: count,
          nextGoal: count < 10 ? 10 : count < 20 ? 20 : 100,
          potentialBonus: count < 10 ? 5 : count < 20 ? 15 : 50,
        };
      }
      if (userDoc.exists) {
        referralCode = userDoc.data().referralCode || "";
      }
    } catch (e) {}

    // Calculate Top Platform
    let topPlatform = "N/A";
    let maxPlatViews = -1;
    Object.entries(contentByPlatform).forEach(([plat, data]) => {
      if (data.views > maxPlatViews) {
        maxPlatViews = data.views;
        topPlatform = plat;
      }
    });
    if (maxPlatViews === 0 && topPlatform === "unknown") topPlatform = "N/A";

    // Calculate Top Content (Top 5)
    // Create a simplified list from filteredDocs
    const topContent = filteredDocs
      .map(doc => {
        // Need to parse views correctly again as we did in the loop
        let views = doc.views || 0;
        if (!views && doc.stats && doc.stats.viewCount) {
          views = parseInt(doc.stats.viewCount, 10) || 0;
        }
        return {
          title: doc.title || "Untitled",
          views: views,
          clicks: doc.clicks || 0, // Assuming clicks are tracked
          platform: doc.platform,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const latestSnapshotAt = lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : null;
    const nextUpdateAtStr = nextUpdateAt ? new Date(nextUpdateAt).toISOString() : null;

    res.json({
      range,
      totalContent: filteredDocs.length,
      totalViews,
      totalLikes,
      totalShares,
      totalRevenue,
      totalClicks,
      ctr: totalViews > 0 ? parseFloat(((totalClicks / totalViews) * 100).toFixed(2)) : 0,

      // Frontend specific keys
      platformBreakdown: contentByPlatform, // Matches frontend expectation
      byPlatform: contentByPlatform, // Keep for backward compat if any
      topPlatform,
      topContent,

      // Analytics snapshot info
      latestSnapshot,
      lastUpdatedAt: latestSnapshotAt,
      nextUpdateAt: nextUpdateAtStr,

      viralityTracker: bestContent,
      performanceStatus,
      motivationMessage,
      referralTracker: referralStats,
      referralCode,
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

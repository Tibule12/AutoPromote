const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const logger = require("../utils/logger");

const adsPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_ADS_PUBLIC || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "ads_public",
});

// Get all ads for the current user
router.get("/", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const type = req.query.type; // 'platform' or 'external'

    let query = db.collection("ads").where("userId", "==", userId);

    if (type) {
      query = query.where("type", "==", type);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();

    const ads = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      ok: true,
      ads,
      count: ads.length,
    });
  } catch (error) {
    logger.error("Ads.fetchError", { error: error && error.message ? error.message : error });
    res.status(500).json({
      ok: false,
      message: "Failed to fetch ads",
    });
  }
});

// Get a single ad by ID
router.get("/:adId", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { adId } = req.params;

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Check ownership
    if (adData.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    res.json({
      ok: true,
      ad: { id: adDoc.id, ...adData },
    });
  } catch (error) {
    console.error("Error fetching ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch ad",
    });
  }
});

// Create a new ad
router.post("/", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const {
      type,
      adType,
      title,
      description,
      imageUrl,
      videoUrl,
      targetUrl,
      callToAction,
      budget,
      duration,
      targeting,
      externalPlatform,
    } = req.body;

    // Validation
    if (!title || !description) {
      return res.status(400).json({
        ok: false,
        message: "Title and description are required",
      });
    }

    if (!budget || budget < 1) {
      return res.status(400).json({
        ok: false,
        message: "Budget must be at least $1",
      });
    }

    if (!duration || duration < 1) {
      return res.status(400).json({
        ok: false,
        message: "Duration must be at least 1 day",
      });
    }

    // Calculate estimated reach based on budget
    const estimatedImpressions = Math.floor(budget * 1000); // $1 = 1000 impressions
    const estimatedClicks = Math.floor(estimatedImpressions * 0.02); // 2% CTR estimate

    const adData = {
      userId,
      type: type || "platform",
      adType: adType || "sponsored_content",
      title,
      description,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      targetUrl: targetUrl || null,
      callToAction: callToAction || "Learn More",
      budget,
      spent: 0,
      duration,
      targeting: targeting || {
        platforms: [],
        demographics: {
          ageMin: 18,
          ageMax: 65,
          locations: [],
          interests: [],
        },
      },
      externalPlatform: externalPlatform || null,
      status: "draft",
      impressions: 0,
      clicks: 0,
      conversions: 0,
      estimatedImpressions,
      estimatedClicks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startDate: null,
      endDate: null,
    };

    const adRef = await db.collection("ads").add(adData);

    // Create initial analytics record
    await db.collection("ad_analytics").doc(adRef.id).set({
      adId: adRef.id,
      userId,
      dailyStats: [],
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalSpent: 0,
      lastUpdated: new Date().toISOString(),
    });

    res.status(201).json({
      ok: true,
      message: "Ad created successfully",
      ad: { id: adRef.id, ...adData },
    });
  } catch (error) {
    console.error("Error creating ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to create ad",
    });
  }
});

// Launch an ad
router.post("/:adId/launch", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { adId } = req.params;

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Check ownership
    if (adData.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    // Check if ad is already active
    if (adData.status === "active") {
      return res.status(400).json({
        ok: false,
        message: "Ad is already active",
      });
    }

    // Get user's subscription to check limits
    const userDoc = await db.collection("users").doc(userId).get();
    // eslint-disable-next-line no-unused-vars -- may be referenced in future validations
    const _userData = userDoc.data() || {};

    // Check if user has enough budget (basic validation)
    // In production, integrate with payment system

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + adData.duration);

    await db.collection("ads").doc(adId).update({
      status: "active",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // If external platform ad, create external ad campaign
    if (adData.type === "external") {
      // TODO: Integrate with external platform APIs (Facebook, Google, etc.)
      // For now, just log it
      logger.info("Ads.createExternal", { platform: adData.externalPlatform, userId });
    }

    res.json({
      ok: true,
      message: "Ad launched successfully",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  } catch (error) {
    console.error("Error launching ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to launch ad",
    });
  }
});

// Pause an ad
router.post("/:adId/pause", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { adId } = req.params;

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Check ownership
    if (adData.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    await db.collection("ads").doc(adId).update({
      status: "paused",
      updatedAt: new Date().toISOString(),
    });

    res.json({
      ok: true,
      message: "Ad paused successfully",
    });
  } catch (error) {
    console.error("Error pausing ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to pause ad",
    });
  }
});

// Resume a paused ad
router.post("/:adId/resume", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { adId } = req.params;

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Check ownership
    if (adData.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (adData.status !== "paused") {
      return res.status(400).json({
        ok: false,
        message: "Ad is not paused",
      });
    }

    await db.collection("ads").doc(adId).update({
      status: "active",
      updatedAt: new Date().toISOString(),
    });

    res.json({
      ok: true,
      message: "Ad resumed successfully",
    });
  } catch (error) {
    console.error("Error resuming ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to resume ad",
    });
  }
});

// Delete an ad
router.delete("/:adId", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { adId } = req.params;

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Check ownership
    if (adData.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    // Can't delete active ads
    if (adData.status === "active") {
      return res.status(400).json({
        ok: false,
        message: "Cannot delete an active ad. Please pause it first.",
      });
    }

    await db.collection("ads").doc(adId).delete();

    res.json({
      ok: true,
      message: "Ad deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to delete ad",
    });
  }
});

// Get ad analytics
router.get("/:adId/analytics", authMiddleware, adsPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { adId } = req.params;

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Check ownership
    if (adData.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    const analyticsDoc = await db.collection("ad_analytics").doc(adId).get();

    const analytics = analyticsDoc.exists
      ? analyticsDoc.data()
      : {
          adId,
          userId,
          dailyStats: [],
          totalImpressions: 0,
          totalClicks: 0,
          totalConversions: 0,
          totalSpent: 0,
        };

    res.json({
      ok: true,
      analytics,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch analytics",
    });
  }
});

// Record ad impression (internal use for platform ads)
router.post("/:adId/impression", async (req, res) => {
  try {
    const { adId } = req.params;
    void (req.body && req.body.viewerId);

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    if (adData.status !== "active") {
      return res.status(400).json({
        ok: false,
        message: "Ad is not active",
      });
    }

    // Increment impression count
    await db
      .collection("ads")
      .doc(adId)
      .update({
        impressions: (adData.impressions || 0) + 1,
        updatedAt: new Date().toISOString(),
      });

    // Update analytics
    const today = new Date().toISOString().split("T")[0];
    const analyticsRef = db.collection("ad_analytics").doc(adId);
    const analyticsDoc = await analyticsRef.get();

    if (analyticsDoc.exists) {
      const analytics = analyticsDoc.data();
      const dailyStats = analytics.dailyStats || [];
      const todayIndex = dailyStats.findIndex(stat => stat.date === today);

      if (todayIndex >= 0) {
        dailyStats[todayIndex].impressions += 1;
      } else {
        dailyStats.push({
          date: today,
          impressions: 1,
          clicks: 0,
          conversions: 0,
          spent: 0,
        });
      }

      await analyticsRef.update({
        dailyStats,
        totalImpressions: (analytics.totalImpressions || 0) + 1,
        lastUpdated: new Date().toISOString(),
      });
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error("Ads.recordImpressionError", {
      error: error && error.message ? error.message : error,
    });
    res.status(500).json({
      ok: false,
      message: "Failed to record impression",
    });
  }
});

// Record ad click (internal use for platform ads)
router.post("/:adId/click", async (req, res) => {
  try {
    const { adId } = req.params;
    void (req.body && req.body.viewerId);

    const adDoc = await db.collection("ads").doc(adId).get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    if (adData.status !== "active") {
      return res.status(400).json({
        ok: false,
        message: "Ad is not active",
      });
    }

    // Increment click count
    await db
      .collection("ads")
      .doc(adId)
      .update({
        clicks: (adData.clicks || 0) + 1,
        updatedAt: new Date().toISOString(),
      });

    // Update analytics
    const today = new Date().toISOString().split("T")[0];
    const analyticsRef = db.collection("ad_analytics").doc(adId);
    const analyticsDoc = await analyticsRef.get();

    if (analyticsDoc.exists) {
      const analytics = analyticsDoc.data();
      const dailyStats = analytics.dailyStats || [];
      const todayIndex = dailyStats.findIndex(stat => stat.date === today);

      if (todayIndex >= 0) {
        dailyStats[todayIndex].clicks += 1;
      } else {
        dailyStats.push({
          date: today,
          impressions: 0,
          clicks: 1,
          conversions: 0,
          spent: 0,
        });
      }

      await analyticsRef.update({
        dailyStats,
        totalClicks: (analytics.totalClicks || 0) + 1,
        lastUpdated: new Date().toISOString(),
      });
    }

    res.json({ ok: true, targetUrl: adData.targetUrl });
  } catch (error) {
    logger.error("Ads.recordClickError", { error: error && error.message ? error.message : error });
    res.status(500).json({
      ok: false,
      message: "Failed to record click",
    });
  }
});

module.exports = router;

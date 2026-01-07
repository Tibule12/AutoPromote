/* eslint-disable no-console */
const express = require("express");
const { admin, db, auth, storage } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const router = express.Router();
const { rateLimiter } = require("./middlewares/globalRateLimiter");

const adminPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_ADMIN_PUBLIC || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "admin_public",
});

// Apply router-level limiter so static analysis and runtime both show explicit throttling
router.use(adminPublicLimiter);

// Middleware to check admin role
const adminOnly = async (req, res, next) => {
  try {
    // Check if the user data from auth middleware has admin role
    if (req.user && (req.user.role === "admin" || req.user.isAdmin === true)) {
      return next();
    }

    // Double-check with Firebase Auth custom claims as fallback
    try {
      const userRecord = await auth.getUser(req.userId);
      const customClaims = userRecord.customClaims || {};

      if (customClaims.admin === true) {
        // Don't log entire user or claims to avoid leaking sensitive details to logs
        console.log("User has admin claim in Firebase Auth for uid:", req.userId || "unknown");
        return next();
      }
    } catch (authError) {
      console.error("Error checking Firebase Auth claims:", authError);
    }

    // If we get here, the user is not an admin
    // Log only the userId (avoid printing full user object which may contain sensitive fields)
    console.log(
      "Access denied - not admin. User id:",
      req.userId || (req.user && req.user.uid) || "unknown"
    );
    return res.status(403).json({ error: "Access denied. Admin only." });
  } catch (error) {
    console.error("Error in admin middleware:", error);
    res.status(403).json({ error: "Access denied" });
  }
};

// Approve user content
router.post("/content/:id/approve", authMiddleware, adminOnly, async (req, res) => {
  try {
    const contentId = req.params.id;
    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    await contentRef.update({
      status: "approved",
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await contentRef.get();
    res.json({ message: "Content approved", content: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    console.error("Error approving content:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Decline user content
router.post("/content/:id/decline", authMiddleware, adminOnly, async (req, res) => {
  try {
    const contentId = req.params.id;
    const contentRef = db.collection("content").doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    await contentRef.update({
      status: "declined",
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await contentRef.get();
    res.json({ message: "Content declined", content: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    console.error("Error declining content:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get platform overview (admin dashboard)
router.get("/overview", authMiddleware, adminOnly, async (req, res) => {
  try {
    // Get all users
    const usersSnapshot = await db.collection("users").get();
    const totalUsers = usersSnapshot.size;

    const usersWithStats = await Promise.all(
      usersSnapshot.docs.map(async userDoc => {
        const userData = userDoc.data();
        const contentSnapshot = await db
          .collection("content")
          .where("userId", "==", userDoc.id)
          .get();

        const contentStats = contentSnapshot.docs.reduce(
          (stats, doc) => {
            const content = doc.data();
            return {
              content_count: stats.content_count + 1,
              total_views: stats.total_views + (content.views || 0),
              total_revenue: stats.total_revenue + (content.revenue || 0),
            };
          },
          { content_count: 0, total_views: 0, total_revenue: 0 }
        );

        return {
          id: userDoc.id,
          ...userData,
          ...contentStats,
        };
      })
    );

    res.json({
      total_users: totalUsers,
      users: usersWithStats,
    });
  } catch (error) {
    console.error("Error getting overview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all content with user details
router.get("/content", authMiddleware, adminOnly, async (req, res) => {
  try {
    const contentSnapshot = await db.collection("content").orderBy("createdAt", "desc").get();

    const contentWithUsers = await Promise.all(
      contentSnapshot.docs.map(async doc => {
        const content = doc.data();
        const userDoc = await db.collection("users").doc(content.userId).get();
        const userData = userDoc.data();

        return {
          id: doc.id,
          ...content,
          user: userData
            ? {
                id: userDoc.id,
                name: userData.name,
                email: userData.email,
              }
            : null,
        };
      })
    );

    res.json({ content: contentWithUsers });
  } catch (error) {
    console.error("Error getting content:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user role
router.put("/users/:id/role", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    await userRef.update({
      role,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await userRef.get();
    res.json({
      message: "User role updated successfully",
      user: {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      },
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List users (basic fields) - admin only
router.get("/users", authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "100", 10);
    const snapshot = await db.collection("users").limit(limit).get();
    const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, users });
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Set or clear KYC verification flag for a user
router.put("/users/:id/kyc", authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const { kycVerified } = req.body;
    if (typeof kycVerified === "undefined")
      return res.status(400).json({ error: "kycVerified boolean required" });

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    await userRef.update({ kycVerified: !!kycVerified, updatedAt: new Date().toISOString() });

    await db.collection("admin_audit").add({
      action: "kyc_toggled",
      adminId: req.user.uid,
      targetId: userId,
      kycVerified: !!kycVerified,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = await userRef.get();
    res.json({ success: true, user: { id: updated.id, ...updated.data() } });
  } catch (error) {
    console.error("Error toggling kyc:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Grant or revoke AfterDark access flag on a user
router.post("/users/:id/afterdark-access", authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const { granted } = req.body;
    if (typeof granted === "undefined")
      return res.status(400).json({ error: "granted boolean required" });

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const flags = Object.assign({}, userDoc.data().flags || {}, { afterDarkAccess: !!granted });
    await userRef.update({ flags, updatedAt: new Date().toISOString() });

    await db.collection("admin_audit").add({
      action: "afterdark_access_toggled",
      adminId: req.user.uid,
      targetId: userId,
      granted: !!granted,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = await userRef.get();
    res.json({ success: true, user: { id: updated.id, ...updated.data() } });
  } catch (error) {
    console.error("Error toggling AfterDark access:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Suspend user
router.post("/users/:id/suspend", authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    await userRef.update({
      suspended: true,
      suspendedBy: req.user.uid,
      suspendedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.collection("audit_logs").add({
      action: "suspend_user",
      adminId: req.user.uid,
      targetId: userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "User suspended" });
  } catch (error) {
    console.error("Error suspending user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Unsuspend user
router.post("/users/:id/unsuspend", authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    await userRef.update({
      suspended: false,
      unsuspendedBy: req.user.uid,
      unsuspendedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.collection("audit_logs").add({
      action: "unsuspend_user",
      adminId: req.user.uid,
      targetId: userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "User unsuspended" });
  } catch (error) {
    console.error("Error unsuspending user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin upgrade user subscription (set plan)
router.post("/users/:id/upgrade", authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: "planId required" });

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    // Update user subscriptions - write to both users and user_subscriptions collections
    const planName = planId; // For basic set; real implementations map planId to human name
    await userRef.update({
      subscriptionTier: planId,
      subscriptionStatus: "active",
      updatedAt: new Date().toISOString(),
    });

    await db
      .collection("user_subscriptions")
      .doc(userId)
      .set({
        userId,
        planId,
        planName,
        status: "active",
        amount: 0,
        currency: "USD",
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    await db.collection("audit_logs").add({
      action: "upgrade_user_subscription",
      adminId: req.user.uid,
      targetId: userId,
      details: { planId },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "User subscription upgraded" });
  } catch (error) {
    console.error("Error upgrading user subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /subscriptions - list all user subscriptions for admin
router.get("/subscriptions", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { tier, status, limit = 100 } = req.query;
    let query = db.collection("user_subscriptions");

    if (tier) query = query.where("planId", "==", tier);
    if (status) query = query.where("status", "==", status);

    const snapshot = await query.orderBy("createdAt", "desc").limit(parseInt(limit)).get();
    const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, subscriptions });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Admin-only OpenAI usage/charge stats
router.get("/openai/usage", authMiddleware, adminOnly, async (req, res) => {
  try {
    // Attempt to pull usage stats if present
    const usageSnapshot = await db
      .collection("openai_usage")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();
    const usage = usageSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Aggregate cost
    const totalCost = usage.reduce((sum, u) => sum + (u.cost || 0), 0);

    // Include a top-level `configured` flag so frontends can easily detect
    // whether OpenAI is configured in the runtime environment.
    res.json({
      success: true,
      configured: !!process.env.OPENAI_API_KEY,
      usage: { totalCost, daily: usage },
    });
  } catch (error) {
    console.error("Error fetching OpenAI usage:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Delete user
router.delete("/users/:id", authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete user's content and associated files
    const contentSnapshot = await db.collection("content").where("userId", "==", userId).get();

    const batch = db.batch();
    const bucket = storage.bucket();

    // Delete content documents and associated files
    for (const doc of contentSnapshot.docs) {
      const content = doc.data();
      if (content.fileUrl) {
        try {
          const fileName = content.fileUrl.split("/").pop();
          await bucket.file(fileName).delete();
        } catch (error) {
          console.warn("Error deleting file:", error);
        }
      }
      batch.delete(doc.ref);
    }

    // Delete the user document
    batch.delete(userRef);

    // Execute the batch
    await batch.commit();

    // Delete the user from Firebase Auth
    await auth.deleteUser(userId);

    res.json({ message: "User and associated content deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get platform analytics
router.get("/analytics", authMiddleware, adminOnly, async (req, res) => {
  // Make period available to try/catch
  let period = req.query && req.query.period ? req.query.period : "7d";
  try {
    let days = 7;

    if (period === "30d") days = 30;
    if (period === "90d") days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startTimestamp = startDate.toISOString();

    // Get user growth
    const usersSnapshot = await db
      .collection("users")
      .where("createdAt", ">=", startTimestamp)
      .orderBy("createdAt")
      .get();

    // Get content growth
    const contentSnapshot = await db
      .collection("content")
      .where("createdAt", ">=", startTimestamp)
      .orderBy("createdAt")
      .get();

    // Process growth data
    const userGrowthByDate = {};
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const date = new Date(userData.createdAt).toISOString().split("T")[0];
      userGrowthByDate[date] = (userGrowthByDate[date] || 0) + 1;
    });

    const contentStatsByDate = {};
    contentSnapshot.forEach(doc => {
      const content = doc.data();
      const date = new Date(content.createdAt).toISOString().split("T")[0];
      if (!contentStatsByDate[date]) {
        contentStatsByDate[date] = { content: 0, views: 0, revenue: 0 };
      }
      contentStatsByDate[date].content++;
      contentStatsByDate[date].views += content.views || 0;
      contentStatsByDate[date].revenue += content.revenue || 0;
    });

    res.json({
      period,
      user_growth: Object.entries(userGrowthByDate).map(([date, count]) => ({ date, count })),
      content_growth: Object.entries(contentStatsByDate).map(([date, stats]) => ({
        date,
        ...stats,
      })),
    });
  } catch (error) {
    console.error("Error getting analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get variant anomalies (placeholder implementation)
router.get("/variants/anomalies", authMiddleware, adminOnly, async (req, res) => {
  try {
    // TODO: Replace with actual anomaly detection logic
    res.json({
      anomalies: [],
      message: "Variant anomalies endpoint is live. No anomalies detected.",
    });
  } catch (error) {
    console.error("Error fetching variant anomalies:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== ADS MANAGEMENT ENDPOINTS ====================

// Update ad status (admin only)
router.patch("/ads/:adId/status", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { adId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["draft", "active", "paused", "completed", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid status. Must be one of: draft, active, paused, completed, rejected",
      });
    }

    const adRef = db.collection("ads").doc(adId);
    const adDoc = await adRef.get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    await adRef.update({
      status,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: req.userId,
    });

    // Log admin action
    await db.collection("admin_audit").add({
      adminId: req.userId,
      action: "ad_status_update",
      targetType: "ad",
      targetId: adId,
      details: { oldStatus: adDoc.data().status, newStatus: status },
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });

    res.json({
      ok: true,
      message: "Ad status updated successfully",
      adId,
      newStatus: status,
    });
  } catch (error) {
    console.error("Error updating ad status:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to update ad status",
    });
  }
});

// Delete ad (admin only)
router.delete("/ads/:adId", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { adId } = req.params;

    const adRef = db.collection("ads").doc(adId);
    const adDoc = await adRef.get();

    if (!adDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "Ad not found",
      });
    }

    const adData = adDoc.data();

    // Delete the ad
    await adRef.delete();

    // Delete associated analytics
    const analyticsRef = db.collection("ad_analytics").doc(adId);
    const analyticsDoc = await analyticsRef.get();
    if (analyticsDoc.exists) {
      await analyticsRef.delete();
    }

    // Log admin action
    await db.collection("admin_audit").add({
      adminId: req.userId,
      action: "ad_deleted",
      targetType: "ad",
      targetId: adId,
      details: {
        title: adData.title,
        userId: adData.userId,
        type: adData.type,
        status: adData.status,
      },
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });

    res.json({
      ok: true,
      message: "Ad deleted successfully",
      adId,
    });
  } catch (error) {
    console.error("Error deleting ad:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to delete ad",
    });
  }
});

// Get all ads (admin only - for dashboard)
router.get("/ads", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { type, status, platform, limit = 1000 } = req.query;

    let query = db.collection("ads");

    // Apply filters
    if (type && type !== "all") {
      query = query.where("type", "==", type);
    }
    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }
    if (platform && platform !== "all") {
      query = query.where("externalPlatform", "==", platform);
    }

    const snapshot = await query.orderBy("createdAt", "desc").limit(parseInt(limit)).get();

    const ads = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Calculate statistics
    const totalAds = ads.length;
    const activeAds = ads.filter(ad => ad.status === "active").length;
    const totalImpressions = ads.reduce((sum, ad) => sum + (ad.impressions || 0), 0);
    const totalClicks = ads.reduce((sum, ad) => sum + (ad.clicks || 0), 0);
    const totalSpent = ads.reduce((sum, ad) => sum + (ad.spent || 0), 0);

    res.json({
      ok: true,
      ads,
      stats: {
        totalAds,
        activeAds,
        totalImpressions,
        totalClicks,
        totalSpent,
        avgCTR: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching all ads:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch ads",
    });
  }
});

// Get ad performance report (admin only)
router.get("/ads/report", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = db.collection("ads");

    if (startDate) {
      query = query.where("createdAt", ">=", startDate);
    }
    if (endDate) {
      query = query.where("createdAt", "<=", endDate);
    }

    const snapshot = await query.get();
    const ads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Aggregate data by platform
    const platformStats = {};
    ads.forEach(ad => {
      const platform = ad.type === "external" ? ad.externalPlatform : "platform";
      if (!platformStats[platform]) {
        platformStats[platform] = {
          count: 0,
          impressions: 0,
          clicks: 0,
          spent: 0,
          conversions: 0,
        };
      }
      platformStats[platform].count++;
      platformStats[platform].impressions += ad.impressions || 0;
      platformStats[platform].clicks += ad.clicks || 0;
      platformStats[platform].spent += ad.spent || 0;
      platformStats[platform].conversions += ad.conversions || 0;
    });

    res.json({
      ok: true,
      totalAds: ads.length,
      dateRange: { startDate, endDate },
      platformStats,
      topPerformingAds: ads
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 10)
        .map(ad => ({
          id: ad.id,
          title: ad.title,
          type: ad.type,
          platform: ad.externalPlatform || "platform",
          impressions: ad.impressions || 0,
          clicks: ad.clicks || 0,
          ctr: ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : 0,
        })),
    });
  } catch (error) {
    console.error("Error generating ad report:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to generate report",
    });
  }
});

module.exports = router;

const express = require("express");
const { db } = require("./firebaseAdmin");
const authMiddleware = require("./authMiddleware");
const { rateLimiter } = require("./middlewares/globalRateLimiter");
const router = express.Router();
let codeqlLimiter;
try {
  codeqlLimiter = require("./middlewares/codeqlRateLimit");
} catch (_) {
  codeqlLimiter = null;
}
if (codeqlLimiter && codeqlLimiter.writes) {
  router.use(codeqlLimiter.writes);
}

// Lightweight per-route limiters to address missing-rate-limiting findings.
// These use the in-memory fallback. For production, replace with a shared store (Redis).
const writeLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_USER_WRITES || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "user_writes",
});
const publicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "public",
});

// Get current user (profile defaults)
router.get("/me", authMiddleware, writeLimiter, async (req, res) => {
  try {
    const ref = db.collection("users").doc(req.userId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "User not found" });
    const data = snap.data();
    res.json({
      user: {
        id: snap.id,
        name: data.name || "",
        email: data.email || "",
        timezone: data.timezone || "UTC",
        schedulingDefaults: data.schedulingDefaults || {
          windows: [], // e.g., [{ days:[1-5], start:'19:00', end:'21:00' }]
          frequency: "once",
          platforms: ["youtube", "tiktok", "instagram"],
        },
        notifications: data.notifications || {
          email: { uploadSuccess: true, scheduleCreated: true, weeklyDigest: false },
        },
        role: data.role || "user",
        isAdmin: data.isAdmin || false,
      },
    });
  } catch (err) {
    console.error("Error getting /me:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update current user (profile defaults)
router.put("/me", authMiddleware, writeLimiter, async (req, res) => {
  try {
    const {
      name,
      timezone,
      schedulingDefaults,
      notifications,
      defaultPlatforms,
      defaultFrequency,
    } = req.body;
    const ref = db.collection("users").doc(req.userId);
    // Get current user data to check admin status
    const currentSnap = await ref.get();
    const currentData = currentSnap.exists ? currentSnap.data() : {};
    const updates = {
      ...(name !== undefined ? { name } : {}),
      ...(timezone ? { timezone } : {}),
      ...(schedulingDefaults ? { schedulingDefaults } : {}),
      ...(notifications ? { notifications } : {}),
      updatedAt: new Date(),
    };
    // For backward compatibility fields
    if (defaultPlatforms || defaultFrequency) {
      updates.schedulingDefaults = updates.schedulingDefaults || {};
      if (defaultPlatforms) updates.schedulingDefaults.platforms = defaultPlatforms;
      if (defaultFrequency) updates.schedulingDefaults.frequency = defaultFrequency;
    }
    // Prevent downgrading admin role or isAdmin
    if (currentData.role === "admin" || currentData.isAdmin === true) {
      updates.role = "admin";
      updates.isAdmin = true;
    }
    await ref.set(updates, { merge: true });
    const snap = await ref.get();
    res.json({ user: { id: snap.id, ...snap.data() } });
  } catch (err) {
    console.error("Error updating /me:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user profile
router.get("/profile", authMiddleware, publicLimiter, async (req, res) => {
  try {
    // Try to get user from users collection
    const userDoc = await db.collection("users").doc(req.userId).get();
    let user = null;
    if (userDoc.exists) {
      user = {
        id: userDoc.id,
        ...userDoc.data(),
        role: userDoc.data().role || "user",
        isAdmin: userDoc.data().isAdmin || false,
      };
    } else {
      // If not found, try admins collection
      const adminDoc = await db.collection("admins").doc(req.userId).get();
      if (adminDoc.exists) {
        user = {
          id: adminDoc.id,
          ...adminDoc.data(),
          role: "admin",
          isAdmin: true,
        };
      }
    }
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user profile
router.put("/profile", authMiddleware, writeLimiter, async (req, res) => {
  try {
    const { name, email } = req.body;

    const userRef = db.collection("users").doc(req.userId);
    await userRef.update({
      name,
      email,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await userRef.get();
    const user = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };

    res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user statistics
router.get("/stats", authMiddleware, publicLimiter, async (req, res) => {
  try {
    // Get content data
    const contentSnapshot = await db.collection("content").where("userId", "==", req.userId).get();

    const contentCount = contentSnapshot.size;
    let totalViews = 0;
    let totalRevenue = 0;

    contentSnapshot.forEach(doc => {
      const data = doc.data();
      totalViews += data.views || 0;
      totalRevenue += data.revenue || 0;
    });

    res.json({
      contentCount,
      totalViews,
      totalRevenue,
      averageViewsPerContent: contentCount ? Math.round(totalViews / contentCount) : 0,
    });
  } catch (error) {
    console.error("Error getting user stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Revenue / growth progress (content count vs eligibility threshold)
router.get("/progress", authMiddleware, publicLimiter, async (req, res) => {
  try {
    const MIN_CONTENT_FOR_REVENUE = parseInt(process.env.MIN_CONTENT_FOR_REVENUE || "100", 10);
    // Use cached contentCount on user doc if present, else compute lightweight count query
    const userRef = db.collection("users").doc(req.userId);
    const userSnap = await userRef.get();
    let contentCount =
      userSnap.exists && typeof userSnap.data().contentCount === "number"
        ? userSnap.data().contentCount
        : null;
    if (contentCount === null) {
      const cntSnap = await db
        .collection("content")
        .where("user_id", "==", req.userId)
        .select()
        .get();
      contentCount = cntSnap.size;
      // update cache (best effort)
      try {
        await userRef.set({ contentCount }, { merge: true });
      } catch (_) {}
    }
    const remaining = Math.max(0, MIN_CONTENT_FOR_REVENUE - contentCount);
    const revenueEligible = contentCount >= MIN_CONTENT_FOR_REVENUE;
    res.json({
      revenueEligible,
      contentCount,
      requiredForRevenue: MIN_CONTENT_FOR_REVENUE,
      remaining,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get recent notifications for current user
router.get("/notifications", authMiddleware, publicLimiter, async (req, res) => {
  try {
    const snapshot = await db
      .collection("notifications")
      .where("user_id", "==", req.userId)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
    const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ notifications });
  } catch (err) {
    console.error("Error getting notifications:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /me/accept-terms - record that the current user accepted required terms
router.post("/me/accept-terms", authMiddleware, writeLimiter, async (req, res) => {
  try {
    const { acceptedTermsVersion } = req.body || {};
    const version =
      acceptedTermsVersion || process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0";
    if (!version) return res.status(400).json({ error: "acceptedTermsVersion required" });
    const ref = db.collection("users").doc(req.userId);
    await ref.set(
      { lastAcceptedTerms: { version, acceptedAt: new Date().toISOString() } },
      { merge: true }
    );
    return res.json({ ok: true, accepted: { version } });
  } catch (e) {
    console.error("Error accepting terms:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Get all users (admin only)
router.get("/", authMiddleware, writeLimiter, async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }

    const usersSnapshot = await db.collection("users").orderBy("createdAt", "desc").get();

    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ users });
  } catch (error) {
    console.error("Error getting all users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user's connected platforms
router.get("/connections", authMiddleware, publicLimiter, async (req, res) => {
  try {
    const connectionsRef = db.collection("users").doc(req.userId).collection("connections");
    const snapshot = await connectionsRef.get();
    const connections = {};
    snapshot.forEach(doc => {
      connections[doc.id] = doc.data();
    });
    return res.json({ ok: true, connections });
  } catch (e) {
    console.error("Error fetching connections:", e);
    return res.status(500).json({ ok: false, error: "Failed to fetch connections" });
  }
});

module.exports = router;

// Plan endpoints (after exports intentionally for clarity if imported earlier)
// Get available plans (public)
router.get("/plans", async (req, res) => {
  try {
    const { getPlans } = require("./services/planService");
    return res.json({ ok: true, plans: getPlans() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Get my plan
router.get("/me/plan", authMiddleware, async (req, res) => {
  try {
    const snap = await db.collection("users").doc(req.userId).get();
    const plan =
      snap.exists && snap.data().plan ? snap.data().plan : { tier: "free", assignedAt: null };
    return res.json({ ok: true, plan });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Assign / change my plan (temporary pseudo billing)
router.post("/me/plan", authMiddleware, async (req, res) => {
  try {
    const { tier } = req.body || {};
    if (!tier) return res.status(400).json({ ok: false, error: "tier required" });
    const { getPlans } = require("./services/planService");
    const plans = getPlans();
    const found = plans.find(p => p.tier === tier);
    if (!found) return res.status(400).json({ ok: false, error: "unknown tier" });
    const ref = db.collection("users").doc(req.userId);
    await ref.set(
      {
        plan: {
          tier,
          assignedAt: new Date().toISOString(),
          pricing: { monthly: found.monthly || null },
        },
      },
      { merge: true }
    );
    return res.json({ ok: true, plan: { tier, assignedAt: new Date().toISOString() } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

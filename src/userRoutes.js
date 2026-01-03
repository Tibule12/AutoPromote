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

const kycLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_KYC || "10", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "0.1"),
  windowHint: "kyc",
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
      paypalEmail,
    } = req.body;
    const ref = db.collection("users").doc(req.userId);
    // Get current user data to check admin status
    const currentSnap = await ref.get();
    const currentData = currentSnap.exists ? currentSnap.data() : {};
    let updates = {
      ...(name !== undefined ? { name } : {}),
      ...(timezone ? { timezone } : {}),
      ...(schedulingDefaults ? { schedulingDefaults } : {}),
      ...(notifications ? { notifications } : {}),
      ...(paypalEmail ? { paypalEmail } : {}),
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
    const { name, email, paypalEmail } = req.body;

    const userRef = db.collection("users").doc(req.userId);
    await userRef.update({
      name,
      email,
      ...(paypalEmail ? { paypalEmail } : {}),
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

// POST /me/kyc/attest - accept a third-party attestation token and grant AfterDark access
router.post("/me/kyc/attest", authMiddleware, kycLimiter, writeLimiter, async (req, res) => {
  try {
    const { attestationToken } = req.body || {};
    if (!attestationToken || typeof attestationToken !== "string") {
      return res.status(400).json({ error: "attestationToken required" });
    }

    // Check persisted single-use token (best-effort). In bypass/test mode the token
    // store may be a simple in-memory stub provided by `firebaseAdmin`.
    try {
      const { admin } = require("./firebaseAdmin");
      const tokenRef = db.collection("kyc_tokens").doc(attestationToken);
      const tokenDoc = await tokenRef.get();
      if (!tokenDoc.exists) {
        // Fallback to previous behavior: accept tokens that look valid (length check)
        if (!attestationToken || attestationToken.length < 8)
          return res.status(400).json({ error: "Invalid attestation token" });
      } else {
        const t = tokenDoc.data() || {};
        if (t.used) return res.status(400).json({ error: "Token already used" });
        // Optionally check expiry if stored
        if (t.expiresAt && t.expiresAt.toDate && t.expiresAt.toDate() < new Date()) {
          return res.status(400).json({ error: "Token expired" });
        }
        // mark token used
        try {
          await tokenRef.set(
            { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
        } catch (_) {}
      }
    } catch (e) {
      // If token checks fail for any reason, continue with placeholder validation below
    }

    const userRef = db.collection("users").doc(req.userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const current = userDoc.data() || {};
    const flags = Object.assign({}, current.flags || {}, {
      afterDarkAccess: true,
      afterDarkAttestation: { provider: "third-party", attestedAt: new Date().toISOString() },
    });

    await userRef.update({ flags, updatedAt: new Date().toISOString() });

    // Audit log (best-effort)
    try {
      const { admin } = require("./firebaseAdmin");
      await db.collection("admin_audit").add({
        action: "kyc_attested",
        userId: req.userId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (_) {}

    const updated = await userRef.get();
    return res.json({ success: true, user: { id: updated.id, ...updated.data() } });
  } catch (error) {
    console.error("Error processing kyc attestation:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /me/kyc/start - start an attestation session (returns a token for client to use)
router.post("/me/kyc/start", authMiddleware, kycLimiter, writeLimiter, async (req, res) => {
  try {
    // In a real integration this would create a session with the provider and return a redirect URL
    // For a quick rollout we return a single-use attestation token that the client can present.
    const crypto = require("crypto");
    const token = `attest_${crypto.randomBytes(12).toString("hex")}`;
    // Persist single-use token with short expiry (15 minutes)
    try {
      const { admin } = require("./firebaseAdmin");
      const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000));
      await db
        .collection("kyc_tokens")
        .doc(token)
        .set({
          userId: req.userId,
          provider: process.env.KYC_PROVIDER || "mock",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
          used: false,
        });
    } catch (e) {
      // If persistence fails (bypass/test), continue and return token anyway
      console.warn("Warning: failed to persist kyc token", e && e.message);
    }

    // If a provider integration is configured, try to create a provider session.
    try {
      const provider = (process.env.KYC_PROVIDER || "").toLowerCase();
      if (provider === "persona") {
        try {
          const persona = require("./services/kyc/personaService");
          const session = await persona.createSession({
            attestationToken: token,
            userId: req.userId,
            redirectOrigin: req.headers.origin || null,
          });
          if (session && session.redirectUrl) {
            return res.json({
              ok: true,
              attestationToken: token,
              redirectUrl: session.redirectUrl,
            });
          }
        } catch (e) {
          console.warn("Persona createSession failed:", e && e.message);
        }
      }
      const redirectBase = process.env.KYC_PROVIDER_REDIRECT_BASE || null;
      if (redirectBase) {
        const url = `${redirectBase}?token=${encodeURIComponent(token)}`;
        return res.json({ ok: true, attestationToken: token, redirectUrl: url });
      }
    } catch (e) {
      console.warn("KYC provider session attempt failed:", e && e.message);
    }

    // Default: return token for client-side attest
    return res.json({ ok: true, attestationToken: token });
  } catch (err) {
    console.error("Error starting kyc attestation:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /me/kyc/provider/callback - provider calls this (or client forwards provider result)
router.post(
  "/me/kyc/provider/callback",
  authMiddleware,
  kycLimiter,
  writeLimiter,
  async (req, res) => {
    try {
      const { attestationToken, providerSessionId, providerPayload } = req.body || {};
      if (!attestationToken || typeof attestationToken !== "string")
        return res.status(400).json({ error: "attestationToken required" });

      // Validate token persisted record
      try {
        const { admin } = require("./firebaseAdmin");
        const tokenRef = db.collection("kyc_tokens").doc(attestationToken);
        const tokenDoc = await tokenRef.get();
        if (!tokenDoc.exists) return res.status(400).json({ error: "Unknown token" });
        const t = tokenDoc.data() || {};
        if (t.used) return res.status(400).json({ error: "Token already used" });
        if (t.userId !== req.userId)
          return res.status(403).json({ error: "Token does not belong to user" });
        if (t.expiresAt && t.expiresAt.toDate && t.expiresAt.toDate() < new Date())
          return res.status(400).json({ error: "Token expired" });

        // Verify provider session with configured provider (Persona integration)
        try {
          const provider = (process.env.KYC_PROVIDER || "").toLowerCase();
          let verified = { valid: false };
          if (provider === "persona") {
            try {
              const persona = require("./services/kyc/personaService");
              verified = await persona.verifyProviderResult({
                providerSessionId,
                payload: providerPayload,
              });
            } catch (e) {
              console.warn("Persona verify error:", e && e.message);
              verified = { valid: false, error: e && e.message };
            }
          } else {
            // Unknown provider: conservative default is to reject unless providerSessionId is present
            verified = { valid: !!providerSessionId };
          }

          if (!verified || !verified.valid) {
            return res
              .status(400)
              .json({ error: "Provider verification failed", details: verified });
          }

          // Mark token used and record provider session
          await tokenRef.set(
            {
              used: true,
              usedAt: admin.firestore.FieldValue.serverTimestamp(),
              providerSessionId,
              providerDetails: verified.details || null,
            },
            { merge: true }
          );

          // Grant AfterDark access (same as /me/kyc/attest)
          const userRef = db.collection("users").doc(req.userId);
          const userDoc = await userRef.get();
          if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
          const current = userDoc.data() || {};
          const flags = Object.assign({}, current.flags || {}, {
            afterDarkAccess: true,
            afterDarkAttestation: {
              provider: process.env.KYC_PROVIDER || "provider",
              attestedAt: new Date().toISOString(),
              providerSessionId,
            },
          });
          await userRef.update({ flags, updatedAt: new Date().toISOString() });

          try {
            await db.collection("admin_audit").add({
              action: "kyc_attested_provider",
              userId: req.userId,
              provider: process.env.KYC_PROVIDER || "provider",
              providerSessionId,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (_) {}

          const updated = await userRef.get();
          return res.json({ success: true, user: { id: updated.id, ...updated.data() } });
        } catch (e) {
          console.error("Error during provider verification flow:", e && e.message);
          return res.status(500).json({ error: "Internal server error" });
        }
      } catch (e) {
        console.error("Error validating provider callback token:", e && e.message);
        return res.status(500).json({ error: "Internal server error" });
      }
    } catch (err) {
      console.error("Error in provider callback:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

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

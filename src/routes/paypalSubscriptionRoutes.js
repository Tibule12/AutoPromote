// paypalSubscriptionRoutes.js
// PayPal subscription management for community monetization

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { audit } = require("../services/auditLogger");
const { rateLimiter } = require("../middlewares/globalRateLimiter");

// PayPal SDK + helpers
const paypalClient = require("../paypalClient");
let paypal;
try {
  paypal = require("@paypal/paypal-server-sdk");
} catch (e) {
  paypal = null;
}

// Apply rate limiting
const paypalLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PAYMENTS || "100", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "paypal_subscriptions",
});

router.use(paypalLimiter);

// Polyfill/require fetch for server-side REST fallback
let fetchFn = typeof fetch === "function" ? fetch : null;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

const { safeFetch } = require("../utils/ssrfGuard");

async function getAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
    throw new Error("paypal_creds_missing");
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const base =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  if (!fetchFn) throw new Error("fetch_unavailable");
  const res = await safeFetch(base + "/v1/oauth2/token", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    requireHttps: true,
    allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
  });
  if (!res.ok) throw new Error("token_http_" + res.status);
  const json = await res.json();
  return json.access_token;
}

async function createSubscriptionViaRest({ planId, userData, returnUrl, cancelUrl, customId }) {
  const access = await getAccessToken();
  const base =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const body = {
    plan_id: planId,
    subscriber: {
      name: {
        given_name: ((userData && (userData.displayName || userData.name)) || "User").split(" ")[0],
        surname: ((userData && (userData.displayName || userData.name)) || "").split(" ")[1] || "",
      },
      email_address: (userData && userData.email) || undefined,
    },
    application_context: {
      brand_name: "AutoPromote",
      locale: "en-US",
      shipping_preference: "NO_SHIPPING",
      user_action: "SUBSCRIBE_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
    custom_id: customId,
  };

  const res = await safeFetch(base + "/v1/billing/subscriptions", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    requireHttps: true,
    allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
  });
  const json = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error("subscription_create_http_" + res.status + " " + (json && json.name));
  return json;
}

// Subscription plans configuration
// Mirrors billingService logic somewhat, but ensures UI visibility
const SUBSCRIPTION_PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    features: {
      uploads: 5,
      platformLimit: 1, // Single platform
      wolfHuntTasks: 5, // Daily tasks limit (earn credits)
      analytics: "Basic",
      support: "Community",
    },
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: 9.99,
    paypalPlanId: process.env.PAYPAL_PREMIUM_PLAN_ID,
    features: {
      uploads: 15,
      platformLimit: 3, // Multi-platform
      wolfHuntTasks: 20, // Unlocks more daily earning
      analytics: "Advanced",
      support: "Priority",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 29.99,
    paypalPlanId: process.env.PAYPAL_PRO_PLAN_ID,
    features: {
      uploads: 50,
      platformLimit: "Unlimited", // Global distribution
      wolfHuntTasks: 100, // Serious earning potential
      analytics: "Enterprise",
      support: "Priority",
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 99.99,
    paypalPlanId: process.env.PAYPAL_ENTERPRISE_PLAN_ID,
    features: {
      uploads: 200,
      platformLimit: "Unlimited",
      wolfHuntTasks: 500, // Maximum earning capacity
      analytics: "Enterprise",
      support: "Dedicated",
    },
  },
};

/**
 * GET /api/paypal-subscriptions/plans
 * Get available subscription plans
 */
router.get("/plans", async (req, res) => {
  try {
    res.json({
      success: true,
      plans: Object.values(SUBSCRIPTION_PLANS),
      currency: "USD",
    });
  } catch (error) {
    console.error("[PayPal] Get plans error:", error);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

/**
 * POST /api/paypal-subscriptions/create-subscription
 * Create a PayPal subscription
 */
router.post("/create-subscription", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { planId, returnUrl, cancelUrl } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan || planId === "free") {
      return res.status(400).json({ error: "Invalid plan selection" });
    }

    if (!plan.paypalPlanId) {
      return res.status(500).json({
        error: "PayPal plan not configured",
        message: "Please contact support to set up this plan",
      });
    }

    // Get user data
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};

    // Create PayPal subscription - prefer SDK, fall back to REST if SDK missing
    if (paypal && paypal.subscriptions && paypal.subscriptions.SubscriptionsCreateRequest) {
      const request = new paypal.subscriptions.SubscriptionsCreateRequest();
      request.requestBody({
        plan_id: plan.paypalPlanId,
        subscriber: {
          name: {
            given_name: userData.displayName?.split(" ")[0] || "User",
            surname: userData.displayName?.split(" ")[1] || "",
          },
          email_address: userData.email || req.user?.email,
        },
        application_context: {
          brand_name: "AutoPromote",
          locale: "en-US",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          payment_method: {
            payer_selected: "PAYPAL",
            payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
          },
          return_url: returnUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
          cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
        },
        custom_id: userId,
      });

      const client = paypalClient.client();
      const subscription = await client.execute(request);

      // Store subscription intent in Firestore
      await db.collection("subscription_intents").doc(subscription.result.id).set({
        userId,
        planId,
        paypalSubscriptionId: subscription.result.id,
        status: "pending",
        amount: plan.price,
        createdAt: new Date().toISOString(),
      });

      audit.log("paypal.subscription.created", {
        userId,
        planId,
        subscriptionId: subscription.result.id,
      });

      // Get approval URL
      const approvalLink = subscription.result.links.find(link => link.rel === "approve");

      res.json({
        success: true,
        used: "sdk",
        subscriptionId: subscription.result.id,
        approvalUrl: approvalLink?.href,
        planId,
        amount: plan.price,
      });
    } else {
      // REST fallback
      try {
        console.warn("[PayPal] SDK subscriptions API missing; using REST fallback");
        const rest = await createSubscriptionViaRest({
          planId: plan.paypalPlanId,
          userData,
          returnUrl: returnUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
          cancelUrl: cancelUrl || `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
          customId: userId,
        });
        const subscriptionId = rest && (rest.id || rest.subscription_id);
        await db.collection("subscription_intents").doc(subscriptionId).set({
          userId,
          planId,
          paypalSubscriptionId: subscriptionId,
          status: "pending",
          amount: plan.price,
          createdAt: new Date().toISOString(),
        });
        audit.log("paypal.subscription.created", { userId, planId, subscriptionId });
        const approvalLink =
          (rest && rest.links && rest.links.find(l => l.rel === "approve")) || null;
        return res.json({
          success: true,
          used: "rest",
          subscriptionId,
          approvalUrl: approvalLink?.href,
          planId,
          amount: plan.price,
        });
      } catch (e) {
        console.error("[PayPal] Create subscription REST fallback error:", e);
        audit.log("paypal.subscription.error", {
          userId: req.userId,
          error: e.message || String(e),
        });
        return res.status(500).json({ error: "Failed to create subscription" });
      }
    }
  } catch (error) {
    console.error("[PayPal] Create subscription error:", error);
    audit.log("paypal.subscription.error", {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to create subscription" });
  }
});

/**
 * POST /api/paypal-subscriptions/activate
 * Activate subscription after PayPal approval
 */
router.post("/activate", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { subscriptionId } = req.body;

    if (!userId || !subscriptionId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get subscription intent
    const intentDoc = await db.collection("subscription_intents").doc(subscriptionId).get();
    if (!intentDoc.exists) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const intent = intentDoc.data();
    if (intent.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get subscription details from PayPal - use SDK if available else REST fallback
    let paypalSub = null;
    if (paypal && paypal.subscriptions && paypal.subscriptions.SubscriptionsGetRequest) {
      const client = paypalClient.client();
      const request = new paypal.subscriptions.SubscriptionsGetRequest(subscriptionId);
      const subscription = await client.execute(request);
      paypalSub = subscription.result;
    } else {
      console.warn("[PayPal] SDK SubscriptionsGetRequest missing; using REST fallback");
      const access = await getAccessToken();
      const base =
        process.env.PAYPAL_MODE === "live"
          ? "https://api-m.paypal.com"
          : "https://api-m.sandbox.paypal.com";
      const res = await safeFetch(base + `/v1/billing/subscriptions/${subscriptionId}`, fetchFn, {
        fetchOptions: { method: "GET", headers: { Authorization: `Bearer ${access}` } },
        requireHttps: true,
        allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
      });
      paypalSub = await res.json().catch(() => null);
    }

    if (!paypalSub || (paypalSub.status !== "ACTIVE" && paypalSub.status !== "APPROVED")) {
      return res.status(400).json({
        error: "Subscription not active",
        status: paypalSub && paypalSub.status,
      });
    }

    const plan = SUBSCRIPTION_PLANS[intent.planId];

    // Update user subscription in Firestore
    await db
      .collection("users")
      .doc(userId)
      .update({
        subscriptionTier: intent.planId,
        subscriptionStatus: "active",
        paypalSubscriptionId: subscriptionId,
        subscriptionStartedAt: new Date().toISOString(),
        subscriptionPeriodStart: new Date().toISOString(),
        subscriptionPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isPaid: true,
        unlimited: plan.features.uploads === "unlimited",
        features: plan.features,
        updatedAt: new Date().toISOString(),
      });

    // Create subscription record
    await db
      .collection("user_subscriptions")
      .doc(userId)
      .set({
        userId,
        planId: intent.planId,
        planName: plan.name,
        paypalSubscriptionId: subscriptionId,
        status: "active",
        amount: plan.price,
        currency: "USD",
        billingCycle: "monthly",
        startDate: new Date().toISOString(),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        features: plan.features,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    // Update intent status
    await db.collection("subscription_intents").doc(subscriptionId).update({
      status: "activated",
      activatedAt: new Date().toISOString(),
    });

    // Log subscription event
    await db.collection("subscription_events").add({
      userId,
      type: "subscription_activated",
      planId: intent.planId,
      paypalSubscriptionId: subscriptionId,
      amount: plan.price,
      timestamp: new Date().toISOString(),
    });

    audit.log("paypal.subscription.activated", {
      userId,
      planId: intent.planId,
      subscriptionId,
    });

    res.json({
      success: true,
      message: `Successfully subscribed to ${plan.name}`,
      subscription: {
        planId: intent.planId,
        planName: plan.name,
        status: "active",
        features: plan.features,
      },
    });
  } catch (error) {
    console.error("[PayPal] Activate subscription error:", error);
    res.status(500).json({ error: "Failed to activate subscription" });
  }
});

/**
 * POST /api/paypal-subscriptions/cancel
 * Cancel PayPal subscription
 */
router.post("/cancel", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get current subscription
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.paypalSubscriptionId) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Cancel in PayPal
    const client = paypalClient.client();
    const request = new paypal.subscriptions.SubscriptionsCancelRequest(
      userData.paypalSubscriptionId
    );
    request.requestBody({
      reason: reason || "User requested cancellation",
    });

    await client.execute(request);

    // Update user record
    await db.collection("users").doc(userId).update({
      subscriptionStatus: "cancelled",
      subscriptionCancelledAt: new Date().toISOString(),
      // Keep features until period end
      subscriptionExpiresAt: userData.subscriptionPeriodEnd,
      updatedAt: new Date().toISOString(),
    });

    // Update subscription record
    await db.collection("user_subscriptions").doc(userId).update({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelReason: reason,
      expiresAt: userData.subscriptionPeriodEnd,
      updatedAt: new Date().toISOString(),
    });

    // Log cancellation
    await db.collection("subscription_events").add({
      userId,
      type: "subscription_cancelled",
      planId: userData.subscriptionTier,
      paypalSubscriptionId: userData.paypalSubscriptionId,
      reason,
      timestamp: new Date().toISOString(),
    });

    audit.log("paypal.subscription.cancelled", {
      userId,
      subscriptionId: userData.paypalSubscriptionId,
      reason,
    });

    res.json({
      success: true,
      message: "Subscription cancelled. You'll retain access until the end of your billing period.",
      expiresAt: userData.subscriptionPeriodEnd,
    });
  } catch (error) {
    console.error("[PayPal] Cancel subscription error:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

/**
 * GET /api/paypal-subscriptions/status
 * Get current subscription status
 */
router.get("/status", async (req, res) => {
  try {
    // Attempt to read user from request (set by authMiddleware) or verify id token if provided
    let userId = req.userId || (req.user && req.user.uid) || null;
    if (!userId) {
      // Try Authorization Bearer token verification
      try {
        const admin = require("../firebaseAdmin").admin;
        const authHeader =
          (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const idToken = authHeader.slice(7).trim();
          if (idToken) {
            try {
              const decoded = await admin.auth().verifyIdToken(idToken);
              userId = decoded && decoded.uid;
            } catch (vtErr) {
              // invalid token, proceed as unauthenticated
            }
          }
        }
      } catch (e) {
        // ignore admin verification errors
      }
    }

    // If still no user, return default free subscription so frontend doesn't 404
    if (!userId) {
      return res.json({
        success: true,
        subscription: {
          planId: "free",
          planName: "Free",
          status: "active",
          features: SUBSCRIPTION_PLANS.free.features,
        },
      });
    }

    // Get user subscription
    let subDoc;
    try {
      subDoc = await db.collection("user_subscriptions").doc(userId).get();
    } catch (dbError) {
      console.error("[PayPal] Database error:", dbError);
      // Return free plan if DB error
      return res.json({
        success: true,
        subscription: {
          planId: "free",
          planName: "Free",
          status: "active",
          features: SUBSCRIPTION_PLANS.free.features,
        },
      });
    }

    if (!subDoc.exists) {
      return res.json({
        success: true,
        subscription: {
          planId: "free",
          planName: "Free",
          status: "active",
          features: SUBSCRIPTION_PLANS.free.features,
        },
      });
    }

    const subscription = subDoc.data();

    // Sync with PayPal if active
    if (subscription.paypalSubscriptionId && subscription.status === "active") {
      try {
        const client = paypalClient.client();
        const request = new paypal.subscriptions.SubscriptionsGetRequest(
          subscription.paypalSubscriptionId
        );
        const paypalSub = await client.execute(request);

        // Update status if changed
        if (paypalSub.result.status !== subscription.status.toUpperCase()) {
          await db.collection("user_subscriptions").doc(userId).update({
            status: paypalSub.result.status.toLowerCase(),
            updatedAt: new Date().toISOString(),
          });
          subscription.status = paypalSub.result.status.toLowerCase();
        }
      } catch (syncError) {
        console.error("[PayPal] Status sync error:", syncError);
        // Continue with local data
      }
    }

    res.json({
      success: true,
      subscription: {
        planId: subscription.planId,
        planName: subscription.planName,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        nextBillingDate: subscription.nextBillingDate,
        features: subscription.features,
        cancelledAt: subscription.cancelledAt,
        expiresAt: subscription.expiresAt,
      },
    });
  } catch (error) {
    console.error("[PayPal] Get status error:", error);
    res.status(500).json({ error: "Failed to fetch subscription status" });
  }
});

/**
 * GET /api/paypal-subscriptions/usage
 * Get usage stats for current billing period
 */
router.get("/usage", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user data
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};

    const tier = userData.subscriptionTier || "free";
    const plan = SUBSCRIPTION_PLANS[tier];

    // Calculate period start
    const periodStart = userData.subscriptionPeriodStart
      ? new Date(userData.subscriptionPeriodStart)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get usage counts (with error handling for missing indexes/collections)
    let uploadsSnap, postsSnap, boostsSnap;
    try {
      uploadsSnap = await db.collection("content").where("userId", "==", userId).get();
    } catch (e) {
      console.log("[PayPal] Content query error:", e.message);
      uploadsSnap = { size: 0 };
    }

    try {
      postsSnap = await db.collection("community_posts").where("userId", "==", userId).get();
    } catch (e) {
      console.log("[PayPal] Posts query error:", e.message);
      postsSnap = { size: 0 };
    }

    try {
      boostsSnap = await db.collection("viral_boosts").where("userId", "==", userId).get();
    } catch (e) {
      console.log("[PayPal] Boosts query error:", e.message);
      boostsSnap = { size: 0 };
    }

    const usage = {
      uploads: {
        used: uploadsSnap.size,
        limit: plan.features.uploads === "unlimited" ? null : plan.features.uploads,
        unlimited: plan.features.uploads === "unlimited",
      },
      communityPosts: {
        used: postsSnap.size,
        limit: plan.features.communityPosts === "unlimited" ? null : plan.features.communityPosts,
        unlimited: plan.features.communityPosts === "unlimited",
      },
      viralBoosts: {
        used: boostsSnap.size,
        limit: plan.features.viralBoost === "unlimited" ? null : plan.features.viralBoost,
        unlimited: plan.features.viralBoost === "unlimited",
      },
      periodStart: periodStart.toISOString(),
      periodEnd: userData.subscriptionPeriodEnd,
    };

    res.json({
      success: true,
      tier,
      usage,
      features: plan.features,
    });
  } catch (error) {
    console.error("[PayPal] Get usage error:", error);
    res.status(500).json({ error: "Failed to fetch usage stats" });
  }
});

/* ADMIN ROUTES */
router.get("/admin/active-subscriptions", authMiddleware, async (req, res) => {
  try {
    const userRole = req.user.role;
    const isAdmin = req.user.isAdmin === true || userRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
    }

    // Fetch active subscribers
    // Note: This requires a composite index on [subscriptionStatus, subscriptionCreated]
    // If index is missing, we might need to do client-side filtering or just query by status
    const snapshot = await db
      .collection("users")
      .where("subscriptionStatus", "==", "active")
      .limit(100)
      .get();

    const subs = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      subs.push({
        userId: doc.id,
        email: d.email || "No Email",
        name: d.name || d.displayName || "Unknown",
        plan: d.subscriptionTier || "free",
        status: d.subscriptionStatus,
        provider: d.subscriptionProvider || "paypal",
        amount: d.subscriptionPrice || 0,
        nextBilling: d.subscriptionPeriodEnd,
        subscriptionId: d.subscriptionId,
      });
    });

    res.json({ subscriptions: subs });
  } catch (err) {
    console.error("Admin subscription fetch error:", err);
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

router.post("/admin/cancel-subscription", authMiddleware, async (req, res) => {
  try {
    const userRole = req.user.role;
    const isAdmin = req.user.isAdmin === true || userRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
    }

    const { userId, reason } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Get user data to find subscription ID
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userData = userDoc.data();
    const subscriptionId = userData.paypalSubscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({ error: "User has no active subscription ID" });
    }

    // Cancel in PayPal
    // We reuse the logic from the user-facing cancel route
    if (paypal && paypal.subscriptions && paypal.subscriptions.SubscriptionsCancelRequest) {
      const client = paypalClient.client();
      const request = new paypal.subscriptions.SubscriptionsCancelRequest(subscriptionId);
      request.requestBody({
        reason: reason || "Admin cancelled subscription",
      });
      await client.execute(request);
    } else {
      // REST fallback
      const access = await getAccessToken();
      const base =
        process.env.PAYPAL_MODE === "live"
          ? "https://api-m.paypal.com"
          : "https://api-m.sandbox.paypal.com";

      await safeFetch(base + `/v1/billing/subscriptions/${subscriptionId}/cancel`, fetchFn, {
        fetchOptions: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: reason || "Admin cancelled subscription" }),
        },
        requireHttps: true,
        allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
      });
    }

    // Update user record
    await db.collection("users").doc(userId).update({
      subscriptionStatus: "cancelled",
      subscriptionCancelledAt: new Date().toISOString(),
      // We don't change expiration because they paid for the month
      updatedAt: new Date().toISOString(),
    });

    // Update subscription record
    await db
      .collection("user_subscriptions")
      .doc(userId)
      .update({
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: reason || "Admin action",
        updatedAt: new Date().toISOString(),
      });

    // Log cancellation
    await db.collection("subscription_events").add({
      userId,
      type: "subscription_cancelled_by_admin",
      adminId: req.user.uid,
      paypalSubscriptionId: subscriptionId,
      reason: reason || "Admin action",
      timestamp: new Date().toISOString(),
    });

    audit.log("paypal.subscription.cancelled_admin", {
      userId,
      adminId: req.user.uid,
      subscriptionId,
      reason,
    });

    res.json({ success: true, message: "Subscription cancelled successfully" });
  } catch (error) {
    console.error("[PayPal Admin] Cancel subscription error:", error);
    res.status(500).json({ error: "Failed to cancel subscription: " + error.message });
  }
});

router.post("/admin/refund-last-payment", authMiddleware, async (req, res) => {
  try {
    const userRole = req.user.role;
    const isAdmin = req.user.isAdmin === true || userRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
    }

    const { userId, reason } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Get user data
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userData = userDoc.data();
    const subscriptionId = userData.paypalSubscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({ error: "User has no active subscription ID" });
    }

    // Get access token
    const access = await getAccessToken();
    const base =
      process.env.PAYPAL_MODE === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    // 1. Get transactions for subscription (last 30 days)
    const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    // PayPal API requires startTime/endTime for transaction list
    const transactionsUrl = `/v1/billing/subscriptions/${subscriptionId}/transactions?start_time=${startTime}&end_time=${endTime}`;

    const txRes = await safeFetch(base + transactionsUrl, fetchFn, {
      fetchOptions: {
        method: "GET",
        headers: { Authorization: `Bearer ${access}` },
      },
      requireHttps: true,
      allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
    });

    if (!txRes.ok) {
      console.error("PayPal transactions fetch failed:", await txRes.text());
      return res
        .status(500)
        .json({ error: "Failed to fetch subscription transactions from PayPal" });
    }

    const txData = await txRes.json();
    const transactions = txData.transactions || [];

    // Find last COMPLETED payment
    const lastPayment = transactions
      .filter(t => t.status === "COMPLETED")
      .sort((a, b) => new Date(b.time) - new Date(a.time))[0];

    if (!lastPayment) {
      return res
        .status(404)
        .json({ error: "No completed payments found in the last 30 days to refund" });
    }

    const captureId = lastPayment.id; // Usually the capture ID for completed payments

    // 2. Refund the capture
    const refundUrl = `/v2/payments/captures/${captureId}/refund`;
    const refundRes = await safeFetch(base + refundUrl, fetchFn, {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note_to_payer: reason || "Refunded by admin" }),
      },
      requireHttps: true,
      allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
    });

    const refundJson = await refundRes.json().catch(() => null);

    if (!refundRes.ok) {
      console.error("PayPal refund failed:", refundJson);
      return res
        .status(500)
        .json({ error: "PayPal refund failed: " + (refundJson?.message || refundRes.statusText) });
    }

    // Log the refund
    await db.collection("subscription_refunds").add({
      userId,
      subscriptionId,
      captureId,
      refundId: refundJson.id,
      amount: refundJson.amount?.value, // Assuming 100% refund
      currency: refundJson.amount?.currency_code,
      adminId: req.user.uid,
      reason: reason || "Admin refund",
      timestamp: new Date().toISOString(),
    });

    audit.log("paypal.subscription.refunded", {
      userId,
      adminId: req.user.uid,
      amount: refundJson.amount?.value,
      refundId: refundJson.id,
    });

    res.json({
      success: true,
      message: `Refunded $${refundJson.amount?.value} successfully`,
      refundId: refundJson.id,
    });
  } catch (error) {
    console.error("[PayPal Admin] Refund error:", error);
    res.status(500).json({ error: "Refund failed: " + error.message });
  }
});

module.exports = router;

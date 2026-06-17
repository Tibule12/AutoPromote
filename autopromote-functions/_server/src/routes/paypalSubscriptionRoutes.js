// paypalSubscriptionRoutes.js
// PayPal subscription management for AutoPromote paid plans

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { audit } = require("../services/auditLogger");
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const {
  SUBSCRIPTION_PLANS,
  normalizePlanId,
  resolvePlan,
  getPlanCapabilities,
  CREDIT_COSTS,
  CREDIT_TOP_UP_PACKS,
} = require("../config/subscriptionPlans");
const {
  getEffectiveTierSnapshot,
  getPlatformPostMonthlyQuota,
} = require("../services/billingService");

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

const HIDDEN_PUBLIC_PLAN_FEATURES = new Set(["wolfHuntTasks", "teamSeats"]);

function buildPublicPlan(plan) {
  const features = Object.fromEntries(
    Object.entries(plan.features || {}).filter(([key]) => !HIDDEN_PUBLIC_PLAN_FEATURES.has(key))
  );
  const capabilities = { ...getPlanCapabilities(plan.id) };
  delete capabilities.missions;
  delete capabilities.teamSeats;

  return {
    ...plan,
    features,
    paypalPlanId: plan.paypalPlanIdEnv ? process.env[plan.paypalPlanIdEnv] : undefined,
    capabilities,
  };
}

function findInternalPlanIdByPayPalPlanId(paypalPlanId) {
  if (!paypalPlanId) return null;
  const match = Object.values(SUBSCRIPTION_PLANS).find(plan => {
    const configuredId = plan.paypalPlanIdEnv ? process.env[plan.paypalPlanIdEnv] : null;
    return configuredId && configuredId === paypalPlanId;
  });
  return match ? match.id : null;
}

function getPlatformPostQuota(planId, plan) {
  return (
    (getPlatformPostMonthlyQuota &&
      typeof getPlatformPostMonthlyQuota === "function" &&
      getPlatformPostMonthlyQuota(planId, plan)) ||
    (plan && plan.features && plan.features.wolfHuntTasks) ||
    0
  );
}

function extractPayPalNextBillingDate(paypalSub) {
  return (
    paypalSub?.billing_info?.next_billing_time ||
    paypalSub?.billing_info?.cycle_executions?.find(cycle => cycle?.next_billing_time)
      ?.next_billing_time ||
    paypalSub?.billing_info?.last_payment?.next_billing_time ||
    paypalSub?.next_billing_time ||
    null
  );
}

function extractPayPalStartDate(paypalSub) {
  return paypalSub?.start_time || paypalSub?.create_time || new Date().toISOString();
}

function extractPayPalPlanFixedPrice(paypalPlan) {
  const cycles = Array.isArray(paypalPlan?.billing_cycles) ? paypalPlan.billing_cycles : [];
  const regularCycle =
    cycles.find(cycle => String(cycle?.tenure_type || "").toUpperCase() === "REGULAR") || cycles[0];
  const rawValue = regularCycle?.pricing_scheme?.fixed_price?.value;
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function isPayPalMissingResource(value) {
  if (!value) return false;
  if (value.__missing === true) return true;
  const message = String(value.message || value.name || value.issue || "");
  return (
    value.status === 404 ||
    value.statusCode === 404 ||
    /INVALID_RESOURCE_ID|RESOURCE_NOT_FOUND|404/.test(message)
  );
}

function inferMonthlyPeriodStart(nextBillingDate, fallback) {
  if (!nextBillingDate) return fallback || null;
  const nextDate = new Date(nextBillingDate);
  if (Number.isNaN(nextDate.getTime())) return fallback || null;
  const periodStart = new Date(nextDate);
  periodStart.setMonth(periodStart.getMonth() - 1);
  return periodStart.toISOString();
}

async function refreshPersistedSubscriptionFromPayPal({ userId, subscriptionId, paypalSub }) {
  if (!userId || !subscriptionId || !paypalSub) return null;

  const nowIso = new Date().toISOString();
  const resolvedPlanId =
    findInternalPlanIdByPayPalPlanId(paypalSub.plan_id) ||
    normalizePlanId(paypalSub?.custom_id_plan || "free");

  const existingSubDoc = await db.collection("user_subscriptions").doc(userId).get();
  const existingSub = existingSubDoc.exists ? existingSubDoc.data() || {} : {};
  const existingUserDoc = await db.collection("users").doc(userId).get();
  const existingUser = existingUserDoc.exists ? existingUserDoc.data() || {} : {};

  const planId =
    resolvedPlanId !== "free"
      ? resolvedPlanId
      : normalizePlanId(existingSub.planId || existingUser.subscriptionTier || "free");
  const plan = resolvePlan(planId);
  const nextBillingDate =
    extractPayPalNextBillingDate(paypalSub) ||
    existingSub.nextBillingDate ||
    existingUser.subscriptionPeriodEnd ||
    null;
  const startDate =
    existingSub.startDate ||
    existingUser.subscriptionStartedAt ||
    extractPayPalStartDate(paypalSub);
  const subscriptionPeriodStart =
    inferMonthlyPeriodStart(nextBillingDate, existingUser.subscriptionPeriodStart) || startDate;
  const normalizedStatus = String(paypalSub.status || existingSub.status || "active").toLowerCase();
  const amount =
    Number(paypalSub?.billing_info?.last_payment?.amount?.value) ||
    Number(existingSub.amount) ||
    Number(plan.price) ||
    0;
  const currency =
    paypalSub?.billing_info?.last_payment?.amount?.currency_code || existingSub.currency || "USD";

  await db
    .collection("users")
    .doc(userId)
    .set(
      {
        subscriptionTier: planId,
        subscriptionStatus: normalizedStatus,
        paypalSubscriptionId: subscriptionId,
        subscriptionStartedAt: startDate,
        subscriptionPeriodStart,
        subscriptionPeriodEnd: nextBillingDate,
        subscriptionExpiresAt: normalizedStatus === "cancelled" ? nextBillingDate : null,
        isPaid: normalizedStatus === "active" || normalizedStatus === "approved",
        unlimited: plan.features.uploads === Infinity,
        features: plan.features,
        updatedAt: nowIso,
      },
      { merge: true }
    );

  await db.collection("user_billing").doc(userId).set(
    {
      tier: planId,
      status: normalizedStatus,
      paypalSubscriptionId: subscriptionId,
      nextBillingDate,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  await db.collection("user_subscriptions").doc(userId).set(
    {
      userId,
      planId,
      planName: plan.name,
      paypalSubscriptionId: subscriptionId,
      status: normalizedStatus,
      amount,
      currency,
      billingCycle: "monthly",
      startDate,
      nextBillingDate,
      periodStart: subscriptionPeriodStart,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  return {
    planId,
    planName: plan.name,
    status: normalizedStatus,
    nextBillingDate,
    amount,
    currency,
    paypalSubscriptionId: subscriptionId,
  };
}

async function fetchPayPalPlanDetails(paypalPlanId) {
  if (!paypalPlanId) return null;

  const access = await getAccessToken();
  const base =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const res = await safeFetch(base + `/v1/billing/plans/${paypalPlanId}`, fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: { Authorization: `Bearer ${access}` },
    },
    requireHttps: true,
    allowHosts: ["api-m.paypal.com", "api-m.sandbox.paypal.com"],
  });
  if (res.status === 404) {
    return { __missing: true, id: paypalPlanId, status: 404 };
  }
  if (!res.ok) {
    throw new Error(`paypal_plan_http_${res.status}`);
  }
  return await res.json().catch(() => null);
}

async function validateConfiguredPayPalPlan(normalizedPlanId, paypalPlanId) {
  const internalPlan = resolvePlan(normalizedPlanId);
  const paypalPlan = await fetchPayPalPlanDetails(paypalPlanId);

  if (!paypalPlan || isPayPalMissingResource(paypalPlan)) {
    return {
      ok: false,
      code: "PAYPAL_PLAN_NOT_FOUND",
      message: `${internalPlan.name} PayPal plan is missing or unavailable in PayPal.`,
    };
  }

  if (String(paypalPlan.status || "").toUpperCase() !== "ACTIVE") {
    return {
      ok: false,
      code: "PAYPAL_PLAN_INACTIVE",
      message: `${internalPlan.name} PayPal plan is not active.`,
    };
  }

  const livePrice = extractPayPalPlanFixedPrice(paypalPlan);
  const expectedPrice = Number(internalPlan.price);
  if (
    Number.isFinite(livePrice) &&
    Number.isFinite(expectedPrice) &&
    Math.abs(livePrice - expectedPrice) > 0.001
  ) {
    return {
      ok: false,
      code: "PAYPAL_PLAN_PRICE_MISMATCH",
      message: `${internalPlan.name} PayPal plan is charging ${livePrice.toFixed(2)} but the app expects ${expectedPrice.toFixed(2)}.`,
      expectedPrice,
      livePrice,
    };
  }

  return {
    ok: true,
    expectedPrice,
    livePrice,
    paypalPlanId,
  };
}

async function markSubscriptionExternalMissing(userId, subscriptionId) {
  if (!userId || !subscriptionId) return;

  const nowIso = new Date().toISOString();
  await db.collection("users").doc(userId).set(
    {
      paypalSubscriptionId: null,
      subscriptionStatus: "external_missing",
      subscriptionPeriodEnd: null,
      updatedAt: nowIso,
      subscriptionExternalIssue: "INVALID_RESOURCE_ID",
      subscriptionExternalIssueAt: nowIso,
    },
    { merge: true }
  );

  await db.collection("user_billing").doc(userId).set(
    {
      paypalSubscriptionId: null,
      status: "external_missing",
      nextBillingDate: null,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  await db.collection("user_subscriptions").doc(userId).set(
    {
      paypalSubscriptionId: null,
      status: "external_missing",
      nextBillingDate: null,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  await db.collection("subscription_events").add({
    userId,
    type: "subscription_external_missing",
    paypalSubscriptionId: subscriptionId,
    timestamp: nowIso,
  });
}

function buildSubscriptionStatusPayload(snapshot, subscription = {}) {
  const effectivePlan = resolvePlan(snapshot.tierId || "free");
  const rawStatus = String(
    subscription.status ||
      snapshot.userData?.subscriptionStatus ||
      snapshot.billingData?.status ||
      "active"
  ).toLowerCase();

  return {
    planId: snapshot.tierId,
    planName: effectivePlan.name,
    status: snapshot.tierId === "free" ? "active" : rawStatus,
    rawStatus,
    effectiveTier: snapshot.tierId,
    billingTier: normalizePlanId(snapshot.billingData?.tier || "free"),
    userTier: normalizePlanId(
      snapshot.userData?.subscriptionTier || snapshot.userData?.subscription?.planId || "free"
    ),
    amount: subscription.amount || effectivePlan.price || 0,
    currency: subscription.currency || "USD",
    nextBillingDate:
      snapshot.tierId === "free"
        ? null
        : subscription.nextBillingDate || snapshot.userData?.subscriptionPeriodEnd || null,
    capabilities: getPlanCapabilities(snapshot.tierId),
    features: effectivePlan.features,
    cancelledAt: subscription.cancelledAt || snapshot.userData?.subscriptionCancelledAt || null,
    expiresAt:
      snapshot.tierId === "free"
        ? null
        : subscription.expiresAt ||
          snapshot.userData?.subscriptionExpiresAt ||
          snapshot.userData?.subscriptionPeriodEnd ||
          null,
    subscriptionId:
      subscription.paypalSubscriptionId || snapshot.userData?.paypalSubscriptionId || null,
  };
}

async function fetchPayPalSubscriptionDetails(subscriptionId) {
  if (!subscriptionId) return null;

  if (paypal && paypal.subscriptions && paypal.subscriptions.SubscriptionsGetRequest) {
    try {
      const client = paypalClient.client();
      const request = new paypal.subscriptions.SubscriptionsGetRequest(subscriptionId);
      const subscription = await client.execute(request);
      return subscription.result;
    } catch (error) {
      if (isPayPalMissingResource(error)) {
        return { __missing: true, id: subscriptionId, status: 404 };
      }
      throw error;
    }
  }

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
  if (res.status === 404) {
    return { __missing: true, id: subscriptionId, status: 404 };
  }
  if (!res.ok) {
    throw new Error(`paypal_subscription_http_${res.status}`);
  }
  return await res.json().catch(() => null);
}

async function persistActivatedSubscription({ userId, subscriptionId, planId, paypalSub, intent }) {
  const normalizedPlanId = normalizePlanId(planId);
  const plan = resolvePlan(normalizedPlanId);
  const nowIso = new Date().toISOString();
  const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .collection("users")
    .doc(userId)
    .set(
      {
        subscriptionTier: normalizedPlanId,
        subscriptionStatus: "active",
        paypalSubscriptionId: subscriptionId,
        subscriptionStartedAt: nowIso,
        subscriptionPeriodStart: nowIso,
        subscriptionPeriodEnd: nextBillingDate,
        isPaid: true,
        unlimited: plan.features.uploads === Infinity,
        features: plan.features,
        updatedAt: nowIso,
      },
      { merge: true }
    );

  await db.collection("user_billing").doc(userId).set(
    {
      tier: normalizedPlanId,
      status: "active",
      paypalSubscriptionId: subscriptionId,
      nextBillingDate,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  await db
    .collection("user_subscriptions")
    .doc(userId)
    .set(
      {
        userId,
        planId: normalizedPlanId,
        planName: plan.name,
        paypalSubscriptionId: subscriptionId,
        status: "active",
        amount: plan.price,
        currency: paypalSub?.billing_info?.last_payment?.amount?.currency_code || "USD",
        billingCycle: "monthly",
        startDate: nowIso,
        nextBillingDate,
        features: plan.features,
        createdAt: intent?.createdAt || nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );

  await db
    .collection("subscription_intents")
    .doc(subscriptionId)
    .set(
      {
        userId,
        planId: normalizedPlanId,
        paypalSubscriptionId: subscriptionId,
        status: "activated",
        activatedAt: nowIso,
        amount: plan.price,
        source: intent?.source || "paypal_reconcile",
      },
      { merge: true }
    );

  await db.collection("subscription_events").add({
    userId,
    type: "subscription_activated",
    planId: normalizedPlanId,
    paypalSubscriptionId: subscriptionId,
    amount: plan.price,
    timestamp: nowIso,
    source: intent?.source || "paypal_reconcile",
  });

  audit.log("paypal.subscription.activated", {
    userId,
    planId: normalizedPlanId,
    subscriptionId,
    source: intent?.source || "paypal_reconcile",
  });

  return {
    planId: normalizedPlanId,
    planName: plan.name,
    status: "active",
    features: plan.features,
  };
}

async function reconcileMissedPayPalActivation(userId) {
  if (!userId) return null;

  const intentSnapshot = await db
    .collection("subscription_intents")
    .where("userId", "==", userId)
    .get();
  if (intentSnapshot.empty) return null;

  const candidateIntents = intentSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(intent => ["pending", "approved"].includes(String(intent.status || "").toLowerCase()))
    .sort((left, right) =>
      String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
    );

  for (const intent of candidateIntents) {
    const subscriptionId = intent.paypalSubscriptionId || intent.id;
    if (!subscriptionId) continue;

    try {
      const paypalSub = await fetchPayPalSubscriptionDetails(subscriptionId);
      if (isPayPalMissingResource(paypalSub)) {
        await db.collection("subscription_intents").doc(subscriptionId).set(
          {
            status: "external_missing",
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        continue;
      }
      if (
        !paypalSub ||
        !["ACTIVE", "APPROVED"].includes(String(paypalSub.status || "").toUpperCase())
      ) {
        continue;
      }
      if (paypalSub.custom_id && paypalSub.custom_id !== userId) {
        continue;
      }

      const derivedPlanId =
        normalizePlanId(intent.planId) || findInternalPlanIdByPayPalPlanId(paypalSub.plan_id);
      if (!derivedPlanId || derivedPlanId === "free") {
        continue;
      }

      return await persistActivatedSubscription({
        userId,
        subscriptionId,
        planId: derivedPlanId,
        paypalSub,
        intent,
      });
    } catch (error) {
      console.error("[PayPal] Reconcile missed activation error:", error);
    }
  }

  return null;
}

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

/**
 * GET /api/paypal-subscriptions/plans
 * Get available subscription plans
 */
router.get("/plans", async (req, res) => {
  try {
    const plans = Object.values(SUBSCRIPTION_PLANS).map(buildPublicPlan);
    res.json({
      success: true,
      plans,
      currency: "USD",
      creditTopUpPacks: CREDIT_TOP_UP_PACKS,
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

    const normalizedPlanId = normalizePlanId(planId);
    const plan = resolvePlan(normalizedPlanId);
    const paypalPlanId = plan.paypalPlanIdEnv ? process.env[plan.paypalPlanIdEnv] : undefined;
    if (!plan || normalizedPlanId === "free") {
      return res.status(400).json({ error: "Invalid plan selection" });
    }

    if (!paypalPlanId) {
      return res.status(500).json({
        error: "PayPal plan not configured",
        message: "Please contact support to set up this plan",
      });
    }

    const planValidation = await validateConfiguredPayPalPlan(normalizedPlanId, paypalPlanId);
    if (!planValidation.ok) {
      return res.status(503).json({
        error: planValidation.code,
        message: planValidation.message,
        expectedPrice: planValidation.expectedPrice,
        livePrice: planValidation.livePrice,
      });
    }

    // Get user data
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};

    // Create PayPal subscription - prefer SDK, fall back to REST if SDK missing
    if (paypal && paypal.subscriptions && paypal.subscriptions.SubscriptionsCreateRequest) {
      const request = new paypal.subscriptions.SubscriptionsCreateRequest();
      request.requestBody({
        plan_id: paypalPlanId,
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
        planId: normalizedPlanId,
        paypalSubscriptionId: subscription.result.id,
        status: "pending",
        amount: plan.price,
        createdAt: new Date().toISOString(),
      });

      audit.log("paypal.subscription.created", {
        userId,
        planId: normalizedPlanId,
        subscriptionId: subscription.result.id,
      });

      // Get approval URL
      const approvalLink = subscription.result.links.find(link => link.rel === "approve");

      res.json({
        success: true,
        used: "sdk",
        subscriptionId: subscription.result.id,
        approvalUrl: approvalLink?.href,
        planId: normalizedPlanId,
        amount: plan.price,
      });
    } else {
      // REST fallback
      try {
        console.warn("[PayPal] SDK subscriptions API missing; using REST fallback");
        const rest = await createSubscriptionViaRest({
          planId: paypalPlanId,
          userData,
          returnUrl: returnUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
          cancelUrl: cancelUrl || `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
          customId: userId,
        });
        const subscriptionId = rest && (rest.id || rest.subscription_id);
        await db.collection("subscription_intents").doc(subscriptionId).set({
          userId,
          planId: normalizedPlanId,
          paypalSubscriptionId: subscriptionId,
          status: "pending",
          amount: plan.price,
          createdAt: new Date().toISOString(),
        });
        audit.log("paypal.subscription.created", {
          userId,
          planId: normalizedPlanId,
          subscriptionId,
        });
        const approvalLink =
          (rest && rest.links && rest.links.find(l => l.rel === "approve")) || null;
        return res.json({
          success: true,
          used: "rest",
          subscriptionId,
          approvalUrl: approvalLink?.href,
          planId: normalizedPlanId,
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
    const { subscriptionId, planId: requestedPlanId } = req.body;

    if (!userId || !subscriptionId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const intentDoc = await db.collection("subscription_intents").doc(subscriptionId).get();
    const intent = intentDoc.exists ? intentDoc.data() : null;
    if (intent && intent.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const paypalSub = await fetchPayPalSubscriptionDetails(subscriptionId);

    if (!paypalSub || (paypalSub.status !== "ACTIVE" && paypalSub.status !== "APPROVED")) {
      return res.status(400).json({
        error: "Subscription not active",
        status: paypalSub && paypalSub.status,
      });
    }

    if (paypalSub.custom_id && paypalSub.custom_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const derivedPlanId =
      findInternalPlanIdByPayPalPlanId(paypalSub.plan_id) || normalizePlanId(requestedPlanId);
    const planId = normalizePlanId(intent?.planId || derivedPlanId);
    if (!planId || planId === "free") {
      return res.status(400).json({ error: "Subscription plan not recognized" });
    }

    if (!intentDoc.exists) {
      await db
        .collection("subscription_intents")
        .doc(subscriptionId)
        .set({
          userId,
          planId,
          paypalSubscriptionId: subscriptionId,
          status: "approved",
          amount: resolvePlan(planId).price,
          createdAt: new Date().toISOString(),
          source: "paypal_sdk",
        });
    }

    const activatedSubscription = await persistActivatedSubscription({
      userId,
      subscriptionId,
      planId,
      paypalSub,
      intent,
    });

    res.json({
      success: true,
      message: `Successfully subscribed to ${activatedSubscription.planName}`,
      subscription: activatedSubscription,
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
      subscriptionTier: "free",
      subscriptionStatus: "cancelled",
      subscriptionCancelledAt: new Date().toISOString(),
      subscriptionExpiresAt: new Date().toISOString(),
      subscriptionPeriodEnd: new Date().toISOString(),
      isPaid: false,
      unlimited: false,
      features: SUBSCRIPTION_PLANS.free.features,
      updatedAt: new Date().toISOString(),
    });

    await db.collection("user_billing").doc(userId).set(
      {
        tier: "free",
        status: "cancelled",
        expiresAt: new Date().toISOString(),
        nextBillingDate: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Update subscription record
    await db.collection("user_subscriptions").doc(userId).update({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelReason: reason,
      expiresAt: new Date().toISOString(),
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
      message: "Subscription cancelled and downgraded immediately to Free.",
      expiresAt: new Date().toISOString(),
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
        subscription: buildSubscriptionStatusPayload({
          tierId: "free",
          userData: {},
          billingData: { tier: "free" },
        }),
      });
    }

    await reconcileMissedPayPalActivation(userId);

    // Get user subscription
    let subDoc;
    try {
      subDoc = await db.collection("user_subscriptions").doc(userId).get();
    } catch (dbError) {
      console.error("[PayPal] Database error:", dbError);
      // Return free plan if DB error
      const snapshot = await getEffectiveTierSnapshot(userId);
      return res.json({ success: true, subscription: buildSubscriptionStatusPayload(snapshot) });
    }

    const subscription = subDoc.exists ? subDoc.data() : {};
    let snapshot = await getEffectiveTierSnapshot(userId);

    // Sync with PayPal if active
    if (subscription.paypalSubscriptionId && subscription.status === "active") {
      try {
        const paypalSub = await fetchPayPalSubscriptionDetails(subscription.paypalSubscriptionId);
        if (isPayPalMissingResource(paypalSub)) {
          await markSubscriptionExternalMissing(userId, subscription.paypalSubscriptionId);
          Object.assign(subscription, {
            paypalSubscriptionId: null,
            status: "external_missing",
            nextBillingDate: null,
          });
        } else if (paypalSub) {
          const remoteStatus = String(paypalSub.status || "").toLowerCase();
          const remoteNextBillingDate = extractPayPalNextBillingDate(paypalSub);
          const localNextBillingDate =
            subscription.nextBillingDate || snapshot.userData?.subscriptionPeriodEnd || null;
          const needsDateRefresh =
            remoteNextBillingDate && remoteNextBillingDate !== localNextBillingDate;
          const needsStatusRefresh =
            remoteStatus && remoteStatus !== String(subscription.status || "").toLowerCase();

          if (needsDateRefresh || needsStatusRefresh) {
            const refreshed = await refreshPersistedSubscriptionFromPayPal({
              userId,
              subscriptionId: subscription.paypalSubscriptionId,
              paypalSub,
            });
            Object.assign(subscription, refreshed || {});
          }
        }
      } catch (syncError) {
        console.error("[PayPal] Status sync error:", syncError);
        // Continue with local data
      }
    }

    snapshot = await getEffectiveTierSnapshot(userId);
    res.json({
      success: true,
      subscription: buildSubscriptionStatusPayload(snapshot, subscription),
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
    const userData = userDoc.exists ? userDoc.data() || {} : {};

    const effectiveTier = await getEffectiveTierSnapshot(userId, null, userData).catch(() => ({
      tierId: userData.subscriptionTier || "free",
    }));
    const tier = normalizePlanId(effectiveTier.tierId || userData.subscriptionTier || "free");
    const plan = resolvePlan(tier);

    // Calculate period start
    const periodStart = userData.subscriptionPeriodStart
      ? new Date(userData.subscriptionPeriodStart)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const toDate = value => {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value.toDate === "function") return value.toDate();
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const countDocsSince = (snapshots, startDate) => {
      const seen = new Set();
      snapshots.forEach(snapshot => {
        if (!snapshot || !snapshot.docs) return;
        snapshot.docs.forEach(doc => {
          const data = doc.data() || {};
          const ts =
            toDate(data.created_at) ||
            toDate(data.createdAt) ||
            toDate(data.timestamp) ||
            toDate(data.updatedAt);
          if (ts && ts >= startDate) seen.add(doc.id);
        });
      });
      return seen.size;
    };

    // Get usage counts (with error handling for missing indexes/collections)
    let uploadsByUserIdSnap, uploadsByLegacySnap, postsSnap, boostsSnap, platformTaskSnap;
    try {
      [uploadsByUserIdSnap, uploadsByLegacySnap] = await Promise.all([
        db.collection("content").where("userId", "==", userId).get(),
        db.collection("content").where("user_id", "==", userId).get(),
      ]);
    } catch (e) {
      console.log("[PayPal] Content query error:", e.message);
      uploadsByUserIdSnap = { docs: [] };
      uploadsByLegacySnap = { docs: [] };
    }

    try {
      postsSnap = await db.collection("community_posts").where("userId", "==", userId).get();
    } catch (e) {
      console.log("[PayPal] Posts query error:", e.message);
      postsSnap = { docs: [] };
    }

    try {
      boostsSnap = await db.collection("viral_boosts").where("userId", "==", userId).get();
    } catch (e) {
      console.log("[PayPal] Boosts query error:", e.message);
      boostsSnap = { docs: [] };
    }

    try {
      platformTaskSnap = await db
        .collection("promotion_tasks")
        .where("uid", "==", userId)
        .where("createdAt", ">=", periodStart.toISOString())
        .where("type", "==", "platform_post")
        .limit(1000)
        .get();
    } catch (e) {
      console.log("[PayPal] Platform publish usage query error:", e.message);
      platformTaskSnap = { docs: [] };
    }

    const uploadLimit = plan.features.uploads;
    const communityPostLimit = plan.features.communityPosts;
    const missionOpportunityLimit = plan.features.wolfHuntTasks;
    const platformPostLimit = getPlatformPostQuota(tier, plan);
    const isUnlimited = value =>
      value === Infinity || value === "unlimited" || value === "Unlimited";

    const uploadsUsed = countDocsSince([uploadsByUserIdSnap, uploadsByLegacySnap], periodStart);
    const postsUsed = countDocsSince([postsSnap], periodStart);
    const boostsUsed = countDocsSince([boostsSnap], periodStart);
    const publishingByPlatform = {};
    let publishingUsed = 0;
    (platformTaskSnap.docs || []).forEach(doc => {
      const data = doc.data() || {};
      const status = String(data.status || "").toLowerCase();
      if (!["queued", "processing", "completed"].includes(status)) return;
      publishingUsed += 1;
      const platformName = String(data.platform || "unknown").toLowerCase();
      publishingByPlatform[platformName] = (publishingByPlatform[platformName] || 0) + 1;
    });

    // Credit usage for the current month
    const monthlyCreditsAllocation = plan.features.monthlyCredits || 0;
    let monthlyCreditsUsed = 0;
    try {
      const creditLedgerSnap = await db
        .collection("credit_usage")
        .where("userId", "==", userId)
        .where("monthKey", "==", new Date().toISOString().slice(0, 7))
        .get();
      creditLedgerSnap.forEach(doc => {
        monthlyCreditsUsed += doc.data().amount || 0;
      });
    } catch (e) {
      console.log("[PayPal] Credit usage query error:", e.message);
    }

    const topUpBalance = userData.credits || 0;

    const usage = {
      uploads: {
        used: uploadsUsed,
        limit: isUnlimited(uploadLimit) ? null : uploadLimit,
        unlimited: isUnlimited(uploadLimit),
      },
      communityPosts: {
        used: postsUsed,
        limit: isUnlimited(communityPostLimit) ? null : communityPostLimit,
        unlimited: isUnlimited(communityPostLimit),
      },
      missionOpportunities: {
        used: boostsUsed,
        limit: isUnlimited(missionOpportunityLimit) ? null : missionOpportunityLimit,
        unlimited: isUnlimited(missionOpportunityLimit),
      },
      viralBoosts: {
        used: boostsUsed,
        limit: isUnlimited(missionOpportunityLimit) ? null : missionOpportunityLimit,
        unlimited: isUnlimited(missionOpportunityLimit),
      },
      publishing: {
        used: publishingUsed,
        limit: isUnlimited(platformPostLimit) ? null : platformPostLimit,
        remaining: isUnlimited(platformPostLimit)
          ? null
          : Math.max(0, Number(platformPostLimit || 0) - publishingUsed),
        unlimited: isUnlimited(platformPostLimit),
        byPlatform: publishingByPlatform,
      },
      credits: {
        monthlyAllocation: monthlyCreditsAllocation,
        monthlyUsed: monthlyCreditsUsed,
        monthlyRemaining: Math.max(0, monthlyCreditsAllocation - monthlyCreditsUsed),
        topUpBalance,
        totalAvailable: Math.max(0, monthlyCreditsAllocation - monthlyCreditsUsed) + topUpBalance,
      },
      featureCosts: {
        ideaVideoPreview: CREDIT_COSTS["idea-video-preview"] || 0,
        ideaVideoRender: CREDIT_COSTS["idea-video-render"] || 0,
        camCombinerRender: CREDIT_COSTS["render-multicam"] || 0,
        cleanAudioSync: CREDIT_COSTS["clean-audio-sync"] || 0,
        findViralClips: CREDIT_COSTS.analyze || CREDIT_COSTS["find-viral-clips"] || 0,
        finalClipRender: CREDIT_COSTS["render-clip"] || 0,
        smartPromo: CREDIT_COSTS["promo-summary"] || CREDIT_COSTS["smart-promo-summary"] || 0,
        videoProcessing: CREDIT_COSTS.process || 0,
        transcription: CREDIT_COSTS.transcribe || CREDIT_COSTS["audio-extract"] || 0,
      },
      periodStart: periodStart.toISOString(),
      periodEnd: userData.subscriptionPeriodEnd,
    };

    res.json({
      success: true,
      tier,
      usage,
      features: plan.features,
      creditCosts: CREDIT_COSTS,
      topUpPacks: CREDIT_TOP_UP_PACKS,
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
      subscriptionTier: "free",
      subscriptionStatus: "cancelled",
      subscriptionCancelledAt: new Date().toISOString(),
      subscriptionExpiresAt: new Date().toISOString(),
      subscriptionPeriodEnd: new Date().toISOString(),
      isPaid: false,
      unlimited: false,
      features: SUBSCRIPTION_PLANS.free.features,
      updatedAt: new Date().toISOString(),
    });

    await db.collection("user_billing").doc(userId).set(
      {
        tier: "free",
        status: "cancelled",
        expiresAt: new Date().toISOString(),
        nextBillingDate: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Update subscription record
    await db
      .collection("user_subscriptions")
      .doc(userId)
      .update({
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: reason || "Admin action",
        expiresAt: new Date().toISOString(),
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

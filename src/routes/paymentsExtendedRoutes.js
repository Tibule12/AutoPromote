const express = require("express");
const router = express.Router();
const { createOrder, captureOrder } = require("../services/paypal");
const { issueToken } = require("../services/liveTokens");
const { db, admin } = require("../firebaseAdmin");
const { publish } = require("../services/tipPubsub");
let authMiddleware;
try {
  authMiddleware = require("../authMiddleware");
} catch (_) {
  authMiddleware = (r, s, n) => n();
}
const adminOnly = require("../middlewares/adminOnly");
const { computeUserBalance } = require("../services/payments/balanceService");
const { audit } = require("../services/auditLogger");
const { recordUsage } = require("../services/usageLedgerService");
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const { PayFastProvider } = require("../services/payments/payfastProvider");
// Initialize provider instance
const payfastProvider = new PayFastProvider();

// Packages definition - mirroring frontend
const PACKAGES = {
  pack_small: { credits: 50, price: "4.99" },
  pack_medium: { credits: 150, price: "12.99" },
  pack_large: { credits: 500, price: "39.99" },
};

function resolveFrontendUrl(baseUrl, requestedUrl, fallbackPath) {
  const fallback = new URL(fallbackPath, baseUrl).toString();
  if (!requestedUrl || typeof requestedUrl !== "string") return fallback;

  try {
    if (/^https?:\/\//i.test(requestedUrl)) {
      const candidate = new URL(requestedUrl);
      if (candidate.origin === new URL(baseUrl).origin) {
        return candidate.toString();
      }
      return fallback;
    }

    if (requestedUrl.startsWith("/")) {
      return new URL(requestedUrl, baseUrl).toString();
    }

    if (requestedUrl.startsWith("?")) {
      return new URL(`${fallbackPath}${requestedUrl}`, baseUrl).toString();
    }
  } catch (_) {
    return fallback;
  }

  return fallback;
}

function normalizeCreditAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

async function getSyncedCreditBalance(userId) {
  const creditsRef = db.collection("user_credits").doc(userId);
  const userRef = db.collection("users").doc(userId);
  const [creditsDoc, userDoc] = await Promise.all([creditsRef.get(), userRef.get()]);

  const storedBalance = creditsDoc.exists ? normalizeCreditAmount(creditsDoc.data().balance) : 0;
  const legacyBalance = userDoc.exists ? normalizeCreditAmount(userDoc.data().credits) : 0;
  const resolvedBalance = Math.max(storedBalance, legacyBalance);

  if (resolvedBalance > storedBalance) {
    const currentTotalEarned = creditsDoc.exists
      ? normalizeCreditAmount(creditsDoc.data().totalEarned)
      : 0;
    await creditsRef.set(
      {
        balance: resolvedBalance,
        totalEarned: Math.max(currentTotalEarned, resolvedBalance),
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  return resolvedBalance;
}

// --- PAYPL ROUTES ---

router.post("/credits/create-order", authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.body;
    const pack = PACKAGES[packageId];
    if (!pack) return res.status(400).json({ error: "Invalid package ID" });

    // Using createOrder from ../services/paypal which expects { amount, currency }
    // or we might need to update that service to support custom purchase units if it doesn't.
    // Let's assume we can pass the raw structure if the service supports it, or just amount/currency.
    // Looking at ../services/paypal usage in existing /paypal/create-order, it takes { amount, currency }.
    // Let's rely on that for now, or check service implementation.
    // The service implementation likely constructs the body.

    // To be safe and minimal:
    const tempOrder = await createOrder({
      amount: pack.price,
      currency: "USD",
      intent: "CAPTURE",
    });

    return res.json(tempOrder);
  } catch (error) {
    console.error("Create Credits Order Error:", error);
    res.status(500).json({ error: "Failed to create order", details: error.message });
  }
});

router.post("/credits/capture-order", authMiddleware, async (req, res) => {
  try {
    const { orderID, packageId } = req.body;
    const userId = (req.user && req.user.uid) || req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const pack = PACKAGES[packageId];
    if (!pack) {
      return res.status(400).json({ error: "Package unknown" });
    }

    const receiptRef = db.collection("transactions").doc(`paypal_${orderID}`);
    const existingReceipt = await receiptRef.get();
    if (existingReceipt.exists) {
      const balance = await getSyncedCreditBalance(userId);
      return res.json({
        success: true,
        newCredits: 0,
        balance,
        alreadyProcessed: true,
      });
    }

    const captureData = await captureOrder(orderID);

    if (captureData.status === "COMPLETED") {
      let responsePayload = null;
      const processedAt = new Date().toISOString();

      await db.runTransaction(async t => {
        const receiptDoc = await t.get(receiptRef);
        const creditsRef = db.collection("user_credits").doc(userId);
        const userRef = db.collection("users").doc(userId);
        const creditsDoc = await t.get(creditsRef);
        const userDoc = await t.get(userRef);

        const currentCredits = Math.max(
          creditsDoc.exists ? normalizeCreditAmount(creditsDoc.data().balance) : 0,
          userDoc.exists ? normalizeCreditAmount(userDoc.data().credits) : 0
        );

        if (receiptDoc.exists) {
          responsePayload = {
            success: true,
            newCredits: 0,
            balance: currentCredits,
            alreadyProcessed: true,
          };
          return;
        }

        const updatedCredits = currentCredits + pack.credits;
        const updateData = {
          balance: updatedCredits,
          totalEarned:
            Math.max(
              creditsDoc.exists ? normalizeCreditAmount(creditsDoc.data().totalEarned) : 0,
              currentCredits
            ) + pack.credits,
          lastUpdated: processedAt,
        };

        if (admin && admin.firestore && admin.firestore.FieldValue) {
          updateData.transactions = admin.firestore.FieldValue.arrayUnion({
            type: "credit_purchase",
            amount: pack.price,
            currency: "USD",
            creditsAdded: pack.credits,
            provider: "PAYPAL",
            orderId: orderID,
            timestamp: processedAt,
          });
        }

        t.set(creditsRef, updateData, { merge: true });

        // Also keep the older 'users' record in sync for legacy use.
        t.set(
          userRef,
          {
            credits: updatedCredits,
            lastPurchaseDate: processedAt,
          },
          { merge: true }
        );

        t.set(
          receiptRef,
          {
            userId,
            type: "CREDIT_PURCHASE",
            amount: pack.price,
            currency: "USD",
            creditsAdded: pack.credits,
            provider: "PAYPAL",
            orderId: orderID,
            status: "COMPLETED",
            timestamp: processedAt,
            balanceAfter: updatedCredits,
          },
          { merge: true }
        );

        responsePayload = {
          success: true,
          newCredits: pack.credits,
          balance: updatedCredits,
          alreadyProcessed: false,
        };
      });

      return res.json(responsePayload || { success: true, newCredits: 0, balance: 0 });
    } else {
      return res.status(400).json({ error: "Order not completed", details: captureData });
    }
  } catch (error) {
    console.error("Capture Credits Order Error:", error);
    res.status(500).json({ error: "Failed to capture order" });
  }
});

// --- PAYFAST ROUTES ---

// Helper: Convert USD price to ZAR (Demo rate for MVP)
const USD_TO_ZAR = 18.5;

router.post("/payfast/init", authMiddleware, async (req, res) => {
  try {
    const { packageId, returnUrl, cancelUrl, returnPath, cancelPath } = req.body || {};
    const pack = PACKAGES[packageId];
    if (!pack) return res.status(400).json({ error: "Invalid package ID" });

    // Convert fixed USD price to ZAR
    const zarAmount = (parseFloat(pack.price) * USD_TO_ZAR).toFixed(2);
    const userId = (req.user && req.user.uid) || req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const m_payment_id = `pf_${packageId}_${userId}_${Date.now()}`;

    // Create PayFast "Order" (really just signature & params)
    // In production, APP_BASE_URL should be set to your public frontend URL (e.g. https://www.autopromote.org)
    const baseUrl =
      process.env.APP_BASE_URL ||
      req.get("origin") ||
      req.headers.origin ||
      "https://www.autopromote.org";
    const apiUrl = process.env.APP_API_URL || "https://api.autopromote.org";
    const safeReturnUrl = resolveFrontendUrl(
      baseUrl,
      returnUrl || returnPath,
      `/marketplace?payment=success&pkg=${packageId}`
    );
    const safeCancelUrl = resolveFrontendUrl(
      baseUrl,
      cancelUrl || cancelPath,
      "/marketplace?payment=cancelled"
    );

    const result = await payfastProvider.createOrder({
      amount: zarAmount,
      currency: "ZAR",
      returnUrl: safeReturnUrl,
      cancelUrl: safeCancelUrl,
      // PayFast expects an ITN/notify URL that is publicly reachable.
      notifyUrl: `${apiUrl}/api/payments/payfast/notify`,
      metadata: {
        m_payment_id,
        item_name: `Credits: ${pack.credits} (${packageId})`,
        custom_str1: userId,
        custom_str2: packageId,
        email_address: req.user?.email || null,
      },
    });

    if (!result.success) {
      console.error("PayFast init failed (provider):", result.error, result);
      return res.status(500).json({
        error: "PayFast init failed",
        details: result.error || "unknown",
        debug: process.env.PAYFAST_DEBUG === "true" ? result : undefined,
      });
    }

    // Log the PayFast redirect payload (helps debug 403 signature / payload mismatch)
    console.info("[PayFast] init payload:", {
      redirectUrl: result.order?.redirectUrl,
      params: result.order?.params,
    });

    // Return the form data (URL + inputs) so frontend can auto-submit
    res.json(result.order);
  } catch (error) {
    console.error("PayFast Init Error:", error);
    res.status(500).json({
      error: "Failed to init PayFast payment",
      details: error && error.message ? error.message : String(error),
      stack: process.env.PAYFAST_DEBUG === "true" ? error.stack : undefined,
    });
  }
});

// PayFast ITN (Instant Transaction Notification)
// THIS MUST BE PUBLIC (no auth middleware)
router.post("/payfast/notify", async (req, res) => {
  try {
    // 1. Verify Signature
    const verification = await payfastProvider.verifyNotification(req);
    if (!verification.verified) {
      console.warn("PayFast ITN validation failed", verification);
      // Still return 200 so PayFast doesn't retry forever, but maybe log security alert
      return res.status(200).send("Signature mismatch");
    }

    const data = verification.data;
    if (data.payment_status !== "COMPLETE") {
      console.log("PayFast payment not complete:", data.payment_status);
      return res.status(200).send("Not complete");
    }

    // 2. Extract User & Package from metadata or custom strings
    // We saved userId in custom_str1, packageId in custom_str2
    const userId = data.custom_str1;
    const packageId = data.custom_str2;
    const pack = PACKAGES[packageId];

    if (!userId || !pack) {
      console.error("PayFast ITN missing context:", { userId, packageId });
      return res.status(200).send("Context missing");
    }

    // 3. Credit User (Idempotent check required in real prod, but simplistic here)
    const m_payment_id = data.m_payment_id;

    // Check if we already processed this payment ID
    const txnRef = db.collection("transactions").doc(m_payment_id);
    const txnDoc = await txnRef.get();

    if (txnDoc.exists) {
      console.log("PayFast payment already processed:", m_payment_id);
      return res.status(200).send("Already processed");
    }

    // New transaction
    await db.runTransaction(async t => {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await t.get(userRef);
      const currentCredits = userDoc.exists ? userDoc.data().credits || 0 : 0;

      t.set(
        userRef,
        {
          credits: currentCredits + pack.credits,
          lastPurchaseDate: new Date().toISOString(),
        },
        { merge: true }
      );

      // Keep the user_credits collection in sync so balance endpoints show the updated amount.
      const creditsRef = db.collection("user_credits").doc(userId);
      const creditsDoc = await t.get(creditsRef);
      const currentBalance = creditsDoc.exists ? creditsDoc.data().balance || 0 : 0;
      const updatedBalance = currentBalance + pack.credits;

      const creditsUpdate = {
        balance: updatedBalance,
        totalEarned: (creditsDoc.exists ? creditsDoc.data().totalEarned || 0 : 0) + pack.credits,
        lastUpdated: new Date().toISOString(),
      };

      if (admin && admin.firestore && admin.firestore.FieldValue) {
        creditsUpdate.transactions = admin.firestore.FieldValue.arrayUnion({
          type: "credit_purchase",
          amount: data.amount_gross,
          currency: "ZAR",
          creditsAdded: pack.credits,
          provider: "PAYFAST",
          pf_payment_id: data.pf_payment_id,
          timestamp: new Date().toISOString(),
        });
      }

      t.set(creditsRef, creditsUpdate, { merge: true });

      t.set(txnRef, {
        userId,
        type: "CREDIT_PURCHASE",
        amount: data.amount_gross,
        currency: "ZAR",
        creditsAdded: pack.credits,
        provider: "PAYFAST",
        pf_payment_id: data.pf_payment_id,
        status: "COMPLETED", // Explicit
        timestamp: new Date().toISOString(),
      });
    });

    console.log(`PayFast success: Credited ${pack.credits} to ${userId}`);
    res.status(200).send("OK");
  } catch (error) {
    console.error("PayFast ITN Error:", error);
    res.status(500).send("Server Error");
  }
});

// Return PayPal client id and currency for frontend SDK
router.get("/paypal/config", (req, res) => {
  return res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    currency: process.env.PAYPAL_CURRENCY || "USD",
  });
});

// Create an order server-side
router.post("/paypal/create-order", async (req, res) => {
  try {
    const { amount = "1.00", currency = process.env.PAYPAL_CURRENCY || "USD" } = req.body || {};
    const order = await createOrder({ amount, currency });
    // extract approve link if present
    const approve = (order && order.links && order.links.find(l => l.rel === "approve")) || null;
    return res.json({
      ok: true,
      order,
      orderId: order && order.id,
      approve: approve && approve.href,
    });
  } catch (e) {
    console.error("paypal create-order error:", e && e.message);
    return res.status(500).json({ error: "create_order_failed", reason: e.message });
  }
});

// SSE endpoint for live tip stream
router.get("/tips/stream/:liveId", (req, res) => {
  try {
    const liveId = req.params.liveId;
    // set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders && res.flushHeaders();
    // send initial comment
    res.write(": connected\n\n");
    const { subscribe, unsubscribe } = require("../services/tipPubsub");
    subscribe(liveId, res);
    req.on("close", () => {
      try {
        unsubscribe(liveId, res);
      } catch (_) {}
    });
  } catch (e) {
    console.error("tips stream error:", e && e.message);
    try {
      res.status(500).end();
    } catch (_) {}
  }
});

// Capture an order and issue a short-lived view token
router.post("/paypal/capture", async (req, res) => {
  try {
    const { orderId, liveId } = req.body || {};
    if (!orderId || !liveId) return res.status(400).json({ error: "orderId and liveId required" });
    const cap = await captureOrder(orderId);
    // basic success check
    const status = cap && cap.status;
    if (status !== "COMPLETED" && status !== "COMPLETED") {
      // still return the capture object for diagnostics
      return res.status(400).json({ error: "capture_not_completed", capture: cap });
    }
    // persist a tip record
    try {
      const pu = (cap.purchase_units && cap.purchase_units[0]) || {};
      const payments = (pu.payments && pu.payments.captures) || [];
      const captureInfo = payments[0] || {};
      const amount =
        (captureInfo.amount && captureInfo.amount.value) || (pu.amount && pu.amount.value) || null;
      const currency =
        (captureInfo.amount && captureInfo.amount.currency_code) ||
        (pu.amount && pu.amount.currency_code) ||
        process.env.PAYPAL_CURRENCY ||
        "USD";
      const payer =
        (cap.payer &&
          cap.payer.name &&
          `${cap.payer.name.given_name || ""} ${cap.payer.name.surname || ""}`.trim()) ||
        (cap.payer && cap.payer.email_address) ||
        null;
      const numericAmount = amount ? parseFloat(String(amount)) : null;
      const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || "0.10");
      const platformCut =
        numericAmount != null ? Math.round(numericAmount * platformFeeRate * 100) / 100 : null;
      const streamerAmount =
        numericAmount != null && platformCut != null
          ? Math.round((numericAmount - platformCut) * 100) / 100
          : null;
      const tipDoc = {
        orderId: orderId,
        liveId,
        amount: numericAmount,
        currency: currency || null,
        payer: payer || null,
        platformFeeRate,
        platformCut: platformCut,
        streamerAmount: streamerAmount,
        payoutStatus: "pending",
        rawCapture: cap,
        createdAt: admin.firestore.FieldValue.serverTimestamp
          ? admin.firestore.FieldValue.serverTimestamp()
          : new Date(),
      };
      await db.collection("tips").add(tipDoc);
      // issue a single-use short-lived token for viewing
      const ttl = parseInt(process.env.PAYMENT_VIEW_TTL_SECONDS || "14400", 10); // default 4 hours
      const token = await issueToken({ liveId, streamerId: null, maxUses: 1, ttlSeconds: ttl });
      const base = process.env.APP_BASE_URL || "";
      const url = base
        ? `${base.replace(/\/$/, "")}/live/${encodeURIComponent(liveId)}?token=${encodeURIComponent(token)}`
        : `/live/${encodeURIComponent(liveId)}?token=${encodeURIComponent(token)}`;
      // publish tip event to subscribers for this live
      try {
        publish(liveId, {
          type: "tip",
          amount: amount || null,
          currency: currency || null,
          payer: payer || null,
          time: new Date().toISOString(),
        });
      } catch (_) {}
      return res.json({ ok: true, token, url, capture: cap });
    } catch (persistErr) {
      console.error("persist tip error:", persistErr && persistErr.message);
      return res.status(500).json({ error: "capture_persist_failed", reason: persistErr.message });
    }
  } catch (e) {
    console.error("paypal capture error:", e && e.message);
    return res.status(500).json({ error: "capture_failed", reason: e.message });
  }
});

// Capture PayPal order for strategy credits
router.post("/paypal/capture-ad-credits", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const userId = req.userId || req.user?.uid;

    if (!orderId) return res.status(400).json({ error: "orderId required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const cap = await captureOrder(orderId);
    if (cap.status !== "COMPLETED") {
      return res.status(400).json({ error: "capture_not_completed", capture: cap });
    }

    const pu = (cap.purchase_units && cap.purchase_units[0]) || {};
    const amountVal =
      (pu.payments &&
        pu.payments.captures &&
        pu.payments.captures[0] &&
        pu.payments.captures[0].amount &&
        pu.payments.captures[0].amount.value) ||
      (pu.amount && pu.amount.value) ||
      "0";
    const amount = parseFloat(amountVal);

    if (amount <= 0) return res.status(400).json({ error: "invalid_amount" });

    // 1. Add credits to user
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          adCredits: admin.firestore.FieldValue.increment(amount),
        },
        { merge: true }
      );

    // 2. Record in ledger
    await recordUsage({
      type: "ad_credit_purchase",
      userId,
      amount,
      currency: "USD",
      meta: { orderId, provider: "paypal" },
    });

    return res.json({ ok: true, amount, creditsAdded: amount });
  } catch (e) {
    console.error("ad credit capture error:", e);
    return res.status(500).json({ error: "capture_failed", reason: e.message });
  }
});

// Apply a light router-level limiter for payments endpoints to satisfy static analysis
const paymentsExtendedPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PAYMENTS_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "payments_public",
});
router.use((req, res, next) => paymentsExtendedPublicLimiter(req, res, next));

// GET /api/payments/balance
router.get("/balance", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ ok: false, error: "auth_required" });
    const bal = await computeUserBalance(req.userId);
    audit.log("balance.viewed", {
      userId: req.userId,
      provisional: bal.provisional,
      available: bal.available,
    });
    return res.json({ ok: true, balance: bal, requestId: req.requestId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/payments/plans (static or env-driven)
router.get("/plans", async (_req, res) => {
  const plans = [
    { id: "free", priceId: null, monthly: 0, quota: process.env.FREE_PLAN_QUOTA || "50" },
    { id: "pro", monthly: 29, quota: process.env.PRO_PLAN_QUOTA || "500" },
    { id: "scale", monthly: 99, quota: process.env.SCALE_PLAN_QUOTA || "5000" },
  ];
  return res.json({ ok: true, plans });
});

// Admin financial overview
router.get("/admin/overview", authMiddleware, adminOnly, async (_req, res) => {
  try {
    const sinceMs = Date.now() - 30 * 86400000;
    const ledgerSnap = await db
      .collection("usage_ledger")
      .orderBy("createdAt", "desc")
      .limit(8000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    let subscription = 0,
      overage = 0;
    const users = new Set();
    ledgerSnap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= sinceMs) {
        if (v.type === "subscription_fee") subscription += v.amount || 0;
        if (v.type === "overage") overage += v.amount || 0;
        if (v.userId) users.add(v.userId);
      }
    });
    const payoutSnap = await db
      .collection("payouts")
      .orderBy("createdAt", "desc")
      .limit(2000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    let payouts30 = 0;
    payoutSnap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= sinceMs && v.status === "succeeded") payouts30 += v.amount || 0;
    });
    audit.log("admin.overview.viewed", {
      userId: _req.userId || null,
      subscription,
      overage,
      payouts30,
    });
    return res.json({
      ok: true,
      windowDays: 30,
      revenue: { subscription, overage },
      payouts: { succeeded: payouts30 },
      activeUsers: users.size,
      requestId: _req.requestId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Admin: reconcile tips and compute payout-ready fields
router.post("/paypal/reconcile-tips", authMiddleware, adminOnly, async (_req, res) => {
  try {
    const snap = await db
      .collection("tips")
      .where("payoutStatus", "==", "pending")
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    let updated = 0;
    for (const d of snap.docs) {
      const data = d.data() || {};
      const amt =
        typeof data.amount === "number" ? data.amount : parseFloat(String(data.amount || "0")) || 0;
      const rate = parseFloat(process.env.PLATFORM_FEE_RATE || "0.10");
      const platformCut = Math.round(amt * rate * 100) / 100;
      const streamerAmount = Math.round((amt - platformCut) * 100) / 100;
      await d.ref.set(
        {
          platformFeeRate: rate,
          platformCut,
          streamerAmount,
          payoutStatus: "ready_for_payout",
          reconciledAt: admin.firestore.FieldValue.serverTimestamp
            ? admin.firestore.FieldValue.serverTimestamp()
            : new Date(),
        },
        { merge: true }
      );
      updated++;
    }
    return res.json({ ok: true, updated });
  } catch (e) {
    console.error("reconcile tips error:", e && e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

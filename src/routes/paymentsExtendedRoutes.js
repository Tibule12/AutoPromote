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
const { rateLimiter } = require("../middlewares/globalRateLimiter");

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

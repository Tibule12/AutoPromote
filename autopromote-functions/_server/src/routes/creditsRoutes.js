const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db, admin } = require("../firebaseAdmin");
const { createOrder } = require("../services/paypal");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const crypto = require("crypto");

const creditsRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit creation of orders to prevent spam
  standardHeaders: true,
  legacyHeaders: false,
});

// Create PayPal order for ad credits
router.post("/create-order", authMiddleware, creditsRateLimiter, async (req, res) => {
  try {
    const { amount = 1.0, currency = "USD" } = req.body || {};
    if (typeof amount !== "number" || amount <= 0)
      return res.status(400).json({ ok: false, error: "invalid_amount" });

    const internalId = crypto.randomBytes(12).toString("hex");
    const order = await createOrder({ amount, currency, internalId, userId: req.userId });

    // Persist a payment draft with metadata type=ad_credits
    try {
      await db
        .collection("payments")
        .doc(order.id)
        .set(
          {
            provider: "paypal",
            providerOrderId: order.id,
            status: order.status || "created",
            amount: Number(amount),
            currency,
            userId: req.userId,
            metadata: { type: "ad_credits", amount, userId: req.userId },
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
    } catch (_) {}

    return res.json({
      ok: true,
      orderId: order.id,
      approve: (order.links || []).find(l => l.rel === "approve")?.href || null,
    });
  } catch (e) {
    console.error("[credits] create-order error:", e && e.message);
    return res.status(500).json({ ok: false, error: "create_order_failed", reason: e.message });
  }
});

module.exports = router;

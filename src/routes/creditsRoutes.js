const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db, admin } = require("../firebaseAdmin");
const { createOrder } = require("../services/paypal");

const router = express.Router();
const crypto = require("crypto");

// Create PayPal order for strategy credits
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount = 1.0, currency = "USD", type = "strategy_credits" } = req.body || {};
    if (typeof amount !== "number" || amount <= 0)
      return res.status(400).json({ ok: false, error: "invalid_amount" });

    // Validate type - backward compatible with ad_credits
    const validTypes = ["ad_credits", "strategy_credits", "ai_credits", "ai_subscription"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: "invalid_purchase_type" });
    }

    const internalId = crypto.randomBytes(12).toString("hex");
    const order = await createOrder({ amount, currency, internalId, userId: req.userId });

    // Persist a payment draft with metadata type=type
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
            metadata: { type, amount, userId: req.userId },
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

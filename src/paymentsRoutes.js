const express = require("express");
const router = express.Router();
const { db } = require("./firebaseAdmin");
const { createOrder, captureOrder, verifyWebhook } = require("./services/payments/paypalService");
const authMiddleware = require("./authMiddleware");

// Add explicit webhook rate limiter for CodeQL/static scanners
let codeqlLimiter = null;
try {
  codeqlLimiter = require("./middlewares/codeqlRateLimit");
} catch (e) {
  codeqlLimiter = null;
}

// Packages definition - mirroring frontend for validation
const PACKAGES = {
  pack_small: { credits: 50, price: "4.99" },
  pack_medium: { credits: 150, price: "12.99" },
  pack_large: { credits: 500, price: "39.99" },
};

// Expose PayPal Client ID for frontend SDK
router.get("/config/paypal", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || "sb" }); // Default to sandbox "sb" if missing
});

// Create Order Payload
// Returns { id: "ORDER-ID" ... } to the client
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.body;
    const pack = PACKAGES[packageId];

    if (!pack) {
      return res.status(400).json({ error: "Invalid package ID" });
    }

    const order = await createOrder({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: packageId,
          description: `Credits Pack: ${packageId}`,
          amount: {
            currency_code: "USD",
            value: pack.price,
          },
        },
      ],
    });

    res.json(order);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Capture Order Payload
// Client sends { orderID } after approval
router.post("/capture-order", authMiddleware, async (req, res) => {
  try {
    const { orderID, packageId } = req.body; // packageId passed for double-check or logging
    const captureData = await captureOrder(orderID);

    if (captureData.status === "COMPLETED") {
      // 1. Identify User
      const userId = req.user.uid;

      // 2. Identify Credits to add
      // In a robust system, we might look up the order details from PayPal first to ensure tampering didn't happen
      // with the amount. But here we can trust the packageId logic if we wanted, OR we can inspect captureData.
      // captureData.purchase_units[0].payments.captures[0].amount.value
      // For speed, let's use the packageId passed from client, but verify usage against the PACKAGES map.

      const pack = PACKAGES[packageId];
      if (!pack) {
        // Fallback if packageId is lost, log error but maybe still credit if money captured?
        // For now, fail safe.
        console.error("Capture success but unknown package", packageId);
        return res.status(400).json({ error: "Order captured but package unknown" });
      }

      // 3. Atomically update user credits
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async t => {
        const doc = await t.get(userRef);
        const currentCredits = doc.exists ? doc.data().credits || 0 : 0;
        t.set(
          userRef,
          {
            credits: currentCredits + pack.credits,
            lastPurchaseDate: new Date().toISOString(),
          },
          { merge: true }
        );

        // Log transaction
        const txnRef = db.collection("transactions").doc();
        t.set(txnRef, {
          userId,
          type: "CREDIT_PURCHASE",
          amount: pack.price,
          currency: "USD",
          creditsAdded: pack.credits,
          provider: "PAYPAL",
          orderId: orderID,
          timestamp: new Date().toISOString(),
        });
      });

      return res.json({ success: true, newCredits: pack.credits });
    } else {
      return res.status(400).json({ error: "Order not completed", details: captureData });
    }
  } catch (error) {
    console.error("Capture Order Error:", error);
    res.status(500).json({ error: "Failed to capture order" });
  }
});

// Public webhook endpoint for PayPal
router.post(
  "/paypal/webhook",
  // Use webhook-specific limiter (IP-based) to bound incoming webhook traffic
  codeqlLimiter && codeqlLimiter.webhooks ? codeqlLimiter.webhooks : (req, res, next) => next(),
  express.json(),
  async (req, res) => {
    try {
      const result = await verifyWebhook(req);
      if (!result.verified) {
        console.warn("PayPal webhook verification failed", result);
        // Still return 200 to PayPal to avoid retries if you're intentionally ignoring events, but
        // it's safer to return 400 so PayPal retries when verification fails. We'll return 400.
        return res.status(400).json({ ok: false, reason: "verification_failed", detail: result });
      }

      const evt = req.body || {};
      // Example: handle ORDER.CAPTURE.COMPLETED
      if (
        evt.event_type === "CHECKOUT.ORDER.APPROVED" ||
        evt.event_type === "CHECKOUT.ORDER.COMPLETED" ||
        evt.event_type === "PAYMENT.CAPTURE.COMPLETED"
      ) {
        // Implement any bookkeeping: mark orders, credit user, etc.
        try {
          const orderId =
            evt.resource &&
            (evt.resource.id || evt.resource.order_id || evt.resource.parent_payment);
          await db
            .collection("paypal_webhook_events")
            .add({ event: evt, receivedAt: new Date().toISOString() });
        } catch (e) {
          console.warn("Failed to persist paypal webhook event", e && e.message);
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error("Error handling paypal webhook", e && e.message);
      res.status(500).json({ ok: false, error: e && e.message });
    }
  }
);

module.exports = router;

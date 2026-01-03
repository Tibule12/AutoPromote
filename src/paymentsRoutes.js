const express = require("express");
const router = express.Router();
const { db } = require("./firebaseAdmin");
const { verifyWebhook } = require("./services/payments/paypalService");
// authMiddleware not needed here; webhook is public endpoint

// Public webhook endpoint for PayPal
router.post("/paypal/webhook", express.json(), async (req, res) => {
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
          evt.resource && (evt.resource.id || evt.resource.order_id || evt.resource.parent_payment);
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
});

module.exports = router;

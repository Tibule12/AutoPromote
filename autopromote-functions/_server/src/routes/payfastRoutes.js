const express = require("express");
const router = express.Router();
const { providers } = require("../services/payments");
const { db, admin } = require("../firebaseAdmin");
const { fulfillPayment } = require("../services/payments/fulfillmentService");
let codeqlLimiter = null;
try {
  codeqlLimiter = require("../middlewares/codeqlRateLimit");
} catch (e) {
  codeqlLimiter = null;
}

// Create order for PayFast (frontend may POST then redirect)
router.post("/create-order", async (req, res) => {
  try {
    if (!providers || !providers.payfast)
      return res.status(501).json({ ok: false, error: "payfast_disabled" });
    const { amount, currency, returnUrl, metadata } = req.body || {};
    const result = await providers.payfast.createOrder({ amount, currency, returnUrl, metadata });
    return res.json(result);
  } catch (e) {
    console.error("PayFast create-order error:", e && e.message);
    return res.status(500).json({ ok: false, error: e && e.message });
  }
});

// Server helper: return an auto-submitting HTML form for PayFast checkout
router.post("/checkout-form", async (req, res) => {
  try {
    if (!providers || !providers.payfast)
      return res.status(501).json({ ok: false, error: "payfast_disabled" });
    const { amount, currency, returnUrl, cancelUrl, notifyUrl, metadata } = req.body || {};
    const result = await providers.payfast.createOrder({
      amount,
      currency,
      returnUrl,
      cancelUrl,
      notifyUrl,
      metadata,
    });
    if (!result || !result.success)
      return res.status(500).json({ ok: false, error: result && result.error });

    const { redirectUrl, params } = result.order;

    // Build HTML form that auto-submits to PayFast
    const inputs = Object.entries(params)
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}"/>`
      )
      .join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting to PayFast</title></head><body><form id="pf" action="${redirectUrl}" method="post">${inputs}</form><script>document.getElementById('pf').submit();</script></body></html>`;
    res.set("Content-Type", "text/html");
    return res.send(html);
  } catch (e) {
    console.error("PayFast checkout-form error:", e && e.message);
    return res.status(500).json({ ok: false, error: e && e.message });
  }
});

// Webhook / IPN endpoint
router.post(
  "/webhook",
  codeqlLimiter && codeqlLimiter.webhooks ? codeqlLimiter.webhooks : (req, res, next) => next(),
  express.urlencoded({ extended: false, parameterLimit: 1000 }),
  async (req, res) => {
    try {
      if (!providers || !providers.payfast) return res.status(501).end();
      const ver = await providers.payfast.verifyNotification(req);
      if (!ver || !ver.verified) {
        console.warn("PayFast webhook failed verification");
        // Persist failed ipn for debugging
        try {
          await db
            .collection("payments")
            .add({
              provider: "payfast",
              raw: req.body || {},
              verified: false,
              createdAt: new Date().toISOString(),
            });
        } catch (_) {}
        return res.status(400).json({ ok: false, verified: false });
      }

      // Verified IPN: update payment record and emit minimal fulfillment action
      try {
        const data = ver.data || {};
        const m_payment_id = data.m_payment_id || data.pf_payment_id || null;
        const docId = m_payment_id || `payfast_${Date.now()}`;
        const status =
          data.payment_status || data.payment_status === undefined
            ? String(data.payment_status || "").toUpperCase() === "COMPLETE"
              ? "completed"
              : String(data.payment_status || "").toLowerCase()
            : "completed";

        const paymentRef = db.collection("payments").doc(docId);
        await paymentRef.set(
          {
            provider: "payfast",
            m_payment_id: data.m_payment_id || null,
            pf_payment_id: data.pf_payment_id || null,
            status,
            raw: data,
            verified: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // Delegate application-specific fulfillment to shared service
        try {
          await fulfillPayment(docId, data);
        } catch (fulfillErr) {
          console.error("PayFast webhook fulfillment error:", fulfillErr && fulfillErr.message);
        }
      } catch (e) {
        console.error("PayFast webhook processing error:", e && e.message);
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("PayFast webhook error:", e && e.message);
      return res.status(500).json({ ok: false, error: e && e.message });
    }
  }
);

module.exports = router;

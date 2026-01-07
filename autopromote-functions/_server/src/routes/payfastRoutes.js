const express = require("express");
const router = express.Router();
const { providers } = require("../services/payments");
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
        return res.status(400).json({ ok: false, verified: false });
      }
      // Persist or emit event as needed by app (left to implementation)
      return res.json({ ok: true });
    } catch (e) {
      console.error("PayFast webhook error:", e && e.message);
      return res.status(500).json({ ok: false, error: e && e.message });
    }
  }
);

module.exports = router;

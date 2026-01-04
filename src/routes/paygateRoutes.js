const express = require("express");
const router = express.Router();
const { providers } = require("../services/payments");
let codeqlLimiter = null;
try {
  codeqlLimiter = require("../middlewares/codeqlRateLimit");
} catch (e) {
  codeqlLimiter = null;
}

// Create order for PayGate
router.post("/create-order", async (req, res) => {
  try {
    if (!providers || !providers.paygate)
      return res.status(501).json({ ok: false, error: "paygate_disabled" });
    const { amount, currency, returnUrl, metadata } = req.body || {};
    const result = await providers.paygate.createOrder({ amount, currency, returnUrl, metadata });
    return res.json(result);
  } catch (e) {
    console.error("PayGate create-order error:", e && e.message);
    return res.status(500).json({ ok: false, error: e && e.message });
  }
});

// Webhook / notification endpoint
router.post(
  "/webhook",
  codeqlLimiter && codeqlLimiter.webhooks ? codeqlLimiter.webhooks : (req, res, next) => next(),
  express.urlencoded({ extended: false, parameterLimit: 1000 }),
  async (req, res) => {
    try {
      if (!providers || !providers.paygate) return res.status(501).end();
      const ver = await providers.paygate.verifyNotification(req);
      if (!ver || !ver.verified) return res.status(400).json({ ok: false, verified: false });
      // Persist event or enqueue for processing
      return res.json({ ok: true });
    } catch (e) {
      console.error("PayGate webhook error:", e && e.message);
      return res.status(500).json({ ok: false, error: e && e.message });
    }
  }
);

module.exports = router;

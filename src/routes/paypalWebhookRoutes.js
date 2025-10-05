const express = require('express');
const router = express.Router();
// Placeholder: capture raw body
router.post('/webhook', express.json({ limit:'1mb' }), async (req,res) => {
  try {
    // In future: verify signature headers.
    const event = req.body || {};
    // Store raw for inspection
    try { const { db } = require('../firebaseAdmin'); await db.collection('webhook_logs').add({ provider:'paypal', event, receivedAt: new Date().toISOString() }); } catch(_){}
    return res.json({ received:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});
module.exports = router;

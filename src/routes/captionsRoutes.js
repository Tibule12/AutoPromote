const express = require('express');
const router = express.Router();
const { createCaptions } = require('../services/captionsService');
const { db } = require('../firebaseAdmin');

// POST /api/content/:id/captions
router.post('/content/:id/captions', async (req,res) => {
  const userId = req.user && req.user.uid;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { transcript, format, burnIn } = req.body || {};
  try {
    const result = await createCaptions({ contentId: req.params.id, userId, transcript, format, burnIn });
    res.json({ ok:true, ...result });
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/content/:id/captions
router.get('/content/:id/captions', async (req,res) => {
  const userId = req.user && req.user.uid;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const snap = await contentRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const data = snap.data();
    if (data.user_id && data.user_id !== userId) return res.status(403).json({ error: 'forbidden' });
    res.json({ captions: data.captions || null });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

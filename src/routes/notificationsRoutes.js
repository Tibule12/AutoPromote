const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { db } = require('../firebaseAdmin');

// List notifications (recent)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const snap = await db.collection('notifications')
      .where('user_id','==', req.userId)
      .orderBy('created_at','desc')
      .limit(50)
      .get();
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return res.json({ ok: true, notifications: items });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

// Mark read (bulk)
router.post('/read', authMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0,100) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: 'no_ids' });
    const batch = db.batch();
    ids.forEach(id => batch.update(db.collection('notifications').doc(id), { read: true, readAt: new Date().toISOString() }));
    await batch.commit();
    return res.json({ ok: true, updated: ids.length });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;

const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const { audit } = require('../services/auditLogger');
const router = express.Router();

// GET /api/profile/defaults - fetch current user's scheduling/profile defaults
router.get('/defaults', authMiddleware, async (req,res)=>{
  try {
    if (!req.userId) return res.status(401).json({ ok:false, error:'auth_required' });
    const doc = await db.collection('user_defaults').doc(req.userId).get();
    return res.json({ ok:true, defaults: doc.exists ? doc.data() : {} });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/profile/defaults - set or merge defaults
router.post('/defaults', authMiddleware, async (req,res)=>{
  try {
    if (!req.userId) return res.status(401).json({ ok:false, error:'auth_required' });
    const allowed = ['timezone','preferredPlatforms','postingWindow','maxDailyUploads','variantStrategy'];
    const input = req.body || {};
    const update = { updatedAt: new Date().toISOString() };
    allowed.forEach(k => { if (k in input) update[k] = input[k]; });
    await db.collection('user_defaults').doc(req.userId).set(update, { merge:true });
    audit.log('profile.defaults.updated', { userId: req.userId, keys: Object.keys(update).filter(k=>k!=='updatedAt') });
    return res.json({ ok:true, updated: update });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;

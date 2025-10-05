const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const { audit } = require('../services/auditLogger');
const router = express.Router();

function validateDefaults(input) {
  const errors = [];
  if (input.timezone && typeof input.timezone !== 'string') errors.push('timezone must be string');
  if (input.variantStrategy && !['rotation','bandit'].includes(input.variantStrategy)) errors.push('variantStrategy invalid');
  if (input.maxDailyUploads !== undefined) {
    if (typeof input.maxDailyUploads !== 'number' || input.maxDailyUploads < 1 || input.maxDailyUploads > 1000) errors.push('maxDailyUploads out_of_range');
  }
  if (input.postingWindow) {
    const pw = input.postingWindow;
    if (typeof pw !== 'object') errors.push('postingWindow must be object');
    if (pw.start && !/^\d{2}:\d{2}$/.test(pw.start)) errors.push('postingWindow.start HH:MM');
    if (pw.end && !/^\d{2}:\d{2}$/.test(pw.end)) errors.push('postingWindow.end HH:MM');
  }
  return errors;
}

// GET /api/profile/defaults - fetch current user's scheduling/profile defaults
router.get('/defaults', authMiddleware, async (req,res)=>{
  try {
    if (!req.userId) return res.status(401).json({ ok:false, error:'auth_required' });
    if (process.env.TEST_OFFLINE === 'true') return res.json({ ok:true, defaults:{ mock:true }});
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
    const errs = validateDefaults(input);
    if (errs.length) return res.status(400).json({ ok:false, error:'validation_failed', details: errs });
    const update = { updatedAt: new Date().toISOString() };
    allowed.forEach(k => { if (k in input) update[k] = input[k]; });
    if (process.env.TEST_OFFLINE === 'true') {
      return res.json({ ok:true, updated: update, offline:true });
    }
    await db.collection('user_defaults').doc(req.userId).set(update, { merge:true });
    try { const { primeUserDefaults } = require('../services/userDefaultsCache'); primeUserDefaults(req.userId, update); } catch(_){ }
    audit.log('profile.defaults.updated', { userId: req.userId, keys: Object.keys(update).filter(k=>k!=='updatedAt') });
    return res.json({ ok:true, updated: update });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
// Append schedule preview route (mounted separately if needed)
router.post('/preview-schedule', authMiddleware, async (req,res)=>{
  try {
    if (!req.userId) return res.status(401).json({ ok:false, error:'auth_required' });
    const defaultsSnap = await db.collection('user_defaults').doc(req.userId).get();
    const defaults = defaultsSnap.exists ? defaultsSnap.data() : {};
    const now = new Date();
    let schedule = null;
    if (defaults.postingWindow && defaults.postingWindow.start) {
      const [h,m] = defaults.postingWindow.start.split(':').map(n=>parseInt(n,10));
      const cand = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h||15, m||0,0,0));
      if (cand < now) cand.setUTCDate(cand.getUTCDate()+1);
      schedule = { when: cand.toISOString(), frequency: 'once', timezone: defaults.postingWindow.timezone || defaults.timezone || 'UTC' };
    }
    return res.json({ ok:true, schedule, variantStrategy: defaults.variantStrategy || null });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

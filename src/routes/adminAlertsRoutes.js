const express = require('express');
const router = express.Router();
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const adminOnly = require('../middlewares/adminOnly');
const { db } = require('../firebaseAdmin');

// GET /api/admin/alerts/recent?limit=50&type=exploration_drift
router.get('/recent', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const limit = Math.min(parseInt(req.query.limit || '50',10), 200);
    const filterType = req.query.type;
    const snap = await db.collection('events').orderBy('at','desc').limit(400).get();
    const out=[];
    snap.forEach(d => {
      if (out.length >= limit) return;
      const v = d.data();
      if (v.eventType === 'alert' || ['exploration_drift','variant_diversity_low','bandit_manual_rollback','bandit_auto_rollback','email_delivery_failure'].includes(v.type)) {
        if (filterType && v.type !== filterType) return;
        out.push(v);
      }
    });
    return res.json({ ok:true, count: out.length, alerts: out });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/admin/alerts/stats - counts per type over last N hours
router.get('/stats', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const hours = Math.min(parseInt(req.query.hours || '24',10), 168);
    const sinceIso = new Date(Date.now() - hours*3600000).toISOString();
    const snap = await db.collection('events').where('at','>=', sinceIso).orderBy('at','desc').limit(1000).get();
    const counts={};
    snap.forEach(d=>{ const v=d.data(); const t=v.type; if(!t) return; if(!(t in counts)) counts[t]=0; counts[t]++; });
    return res.json({ ok:true, hours, counts });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;

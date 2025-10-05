const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const adminOnly = require('../middlewares/adminOnly');
const router = express.Router();

// GET /api/admin/variants/strategy-stats
router.get('/strategy-stats', authMiddleware, adminOnly, async (_req,res)=>{
  try {
    const snap = await db.collection('content').orderBy('created_at','desc').limit(1000).get();
    const counts = { rotation:0, bandit:0, unspecified:0 };
    snap.forEach(d=>{
      const v = d.data().variant_strategy;
      if (!v) counts.unspecified++; else if (String(v).toLowerCase()==='bandit') counts.bandit++; else counts.rotation++;
    });
    return res.json({ ok:true, sample: snap.size, counts });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;

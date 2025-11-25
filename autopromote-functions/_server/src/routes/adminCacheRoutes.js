const express = require('express');
const router = express.Router();
const { getCacheStats } = require('../services/userDefaultsCache');

let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
// Simple admin guard: require custom claim admin=true if available
function requireAdmin(req,res,next) {
  if (req.user && (req.user.isAdmin || (req.user.claims && req.user.claims.admin))) return next();
  if (req.user && req.user.admin === true) return next();
  return res.status(403).json({ ok:false, error:'admin_required' });
}

router.get('/user-defaults', authMiddleware, requireAdmin, (req,res) => {
  try { return res.json({ ok:true, cache: getCacheStats() }); } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
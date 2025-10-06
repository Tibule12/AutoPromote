const express = require('express');
const admin = require('firebase-admin');
const authMiddleware = require('../authMiddleware');
const router = express.Router();

// Simple admin guard (reuse existing user object)
function requireAdmin(req,res,next){
  if (!req.user || !(req.user.isAdmin || req.user.role === 'admin')) {
    return res.status(403).json({ error:'admin_only' });
  }
  next();
}

// GET /api/admin/email-verification/unverified?limit=50&nextPageToken=XXX
router.get('/email-verification/unverified', authMiddleware, requireAdmin, async (req,res)=>{
  try {
    const limit = Math.min(parseInt(req.query.limit||'50',10), 1000);
    const nextPageToken = req.query.nextPageToken || undefined;
    const list = await admin.auth().listUsers(limit, nextPageToken);
    const unverified = list.users.filter(u => !u.emailVerified && !!u.email).map(u => ({ uid: u.uid, email: u.email, created: u.metadata.creationTime }));
    res.json({ ok:true, count: unverified.length, users: unverified, nextPageToken: list.pageToken || null });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/admin/email-verification/bulk-resend { limit?:number, dryRun?:boolean }
router.post('/email-verification/bulk-resend', authMiddleware, requireAdmin, async (req,res)=>{
  try {
    const { dryRun = true } = req.body || {};
    const maxSend = Math.min(parseInt(req.body.limit || '100',10), 500);
    const list = await admin.auth().listUsers(1000);
    const candidates = list.users.filter(u => !u.emailVerified && !!u.email).slice(0, maxSend);
    const results = [];
    let sent = 0;
    for (const u of candidates) {
      try {
        const link = await admin.auth().generateEmailVerificationLink(u.email, { url: process.env.VERIFY_REDIRECT_URL || 'https://example.com/verified' });
        if (!dryRun) {
          const { sendVerificationEmail } = require('../services/emailService');
          await sendVerificationEmail({ email: u.email, link });
          sent++;
        }
        results.push({ email: u.email, uid: u.uid, status: dryRun ? 'preview' : 'sent' });
      } catch(e){ results.push({ email: u.email, uid: u.uid, status:'error', error: e.message }); }
    }
    res.json({ ok:true, dryRun, attempted: candidates.length, sent: dryRun ? 0 : sent, results });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
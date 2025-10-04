const express = require('express');
const router = express.Router();
const { db } = require('../firebaseAdmin');
const authMiddleware = require('../authMiddleware');
const adminOnly = require('../middlewares/adminOnly');
const { encryptToken, hasEncryption } = require('../services/secretVault');

// Heuristic scan for plaintext tokens.
router.get('/plaintext-token-scan', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const snap = await db.collection('users').limit(500).get();
    const findings = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      Object.entries(data).forEach(([k,v]) => {
        if (typeof v === 'string' && /token/i.test(k) && !k.startsWith('encrypted_')) {
          // crude heuristic: if appears base64 (=/+ chars) and length >40 treat as maybe encrypted; else flag
          const base64ish = /^[A-Za-z0-9+/=]+$/.test(v) && v.length > 40;
          if (!base64ish) findings.push({ userId: doc.id, field: k, length: v.length });
        }
      });
    });
    return res.json({ ok: true, usersScanned: snap.size, plaintextFindings: findings, encryptionEnabled: hasEncryption() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Attempt migration: for each finding encrypt into encrypted_<field> if not present.
router.post('/encrypt-migrate', authMiddleware, adminOnly, async (_req, res) => {
  if (!hasEncryption()) return res.status(400).json({ ok: false, error: 'encryption_key_missing' });
  try {
    const snap = await db.collection('users').limit(500).get();
    let migrated = 0;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const updates = {};
      Object.entries(data).forEach(([k,v]) => {
        if (typeof v === 'string' && /token/i.test(k) && !k.startsWith('encrypted_')) {
          const encField = `encrypted_${k}`;
            if (!data[encField]) {
              updates[encField] = encryptToken(v);
              // Optionally blank original? keep for now to avoid data loss until verified
            }
        }
      });
      if (Object.keys(updates).length) {
        await db.collection('users').doc(doc.id).set(updates, { merge: true });
        migrated++;
      }
    }
    return res.json({ ok: true, usersProcessed: snap.size, usersMigrated: migrated });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// List current system locks (debug/admin observability)
router.get('/locks', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const snap = await db.collection('system_locks').limit(100).get();
    const locks = [];
    const now = Date.now();
    snap.forEach(d => { const v = d.data(); locks.push({ id: d.id, owner: v.owner, expiresAt: v.expiresAt, msRemaining: v.expiresAt - now, updatedAt: v.updatedAt }); });
    return res.json({ ok: true, locks });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;

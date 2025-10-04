// shortlinkService.js - create short codes mapping to (contentId, platform, variantIndex, taskId)
const { db, admin } = require('../firebaseAdmin');
const crypto = require('crypto');

async function createShortlink({ contentId, platform, variantIndex = null, taskId = null }) {
  const code = crypto.randomBytes(4).toString('hex');
  await db.collection('shortlinks').doc(code).set({
    contentId, platform, variantIndex, taskId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return code;
}

async function resolveShortlink(code) {
  const snap = await db.collection('shortlinks').doc(code).get();
  if (!snap.exists) return null;
  return snap.data();
}

module.exports = { createShortlink, resolveShortlink };
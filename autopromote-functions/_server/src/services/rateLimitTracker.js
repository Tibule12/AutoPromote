// rateLimitTracker.js
// Maintains per-platform rate limit cooldown windows in Firestore (system/rate_limits doc)
const { db, admin } = require("../firebaseAdmin");

const DOC_ID = "rate_limits";

async function noteRateLimit(platform, windowMs) {
  const until = Date.now() + windowMs;
  await db
    .collection("system")
    .doc(DOC_ID)
    .set(
      {
        [platform]: { until, notedAt: admin.firestore.FieldValue.serverTimestamp() },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return until;
}

async function getCooldown(platform) {
  const snap = await db.collection("system").doc(DOC_ID).get();
  if (!snap.exists) return 0;
  const data = snap.data();
  const entry = data[platform];
  if (!entry || !entry.until) return 0;
  return entry.until > Date.now() ? entry.until : 0;
}

module.exports = { noteRateLimit, getCooldown };

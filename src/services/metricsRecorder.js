// metricsRecorder.js - lightweight counter aggregation (best-effort, no strong consistency)
const { db, admin } = require("../firebaseAdmin");

async function incrCounter(key, amount = 1) {
  try {
    const ref = db.collection("system_counters").doc(key);
    await ref.set(
      { value: admin.firestore.FieldValue.increment(amount), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) {
    // Swallow errors; metrics must not break core flow
    console.warn("[metricsRecorder] increment failed", key, e.message);
  }
}

module.exports = { incrCounter };

// statusRecorder.js - track last run / success / error metadata for background workers
const { db } = require("../firebaseAdmin");

async function recordRun(worker, data = {}) {
  return setStatus(worker, data);
}

async function setStatus(worker, data = {}) {
  try {
    const ref = db.collection("system_status").doc(worker);
    const payload = {
      lastRun: new Date().toISOString(),
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await ref.set(payload, { merge: true });
  } catch (e) {
    console.warn("[statusRecorder] setStatus failed", worker, e.message);
  }
}

async function getAllStatus(limit = 50) {
  const snap = await db.collection("system_status").limit(limit).get();
  const out = {};
  snap.forEach(d => (out[d.id] = d.data()));
  return out;
}

module.exports = { recordRun, getAllStatus, setStatus };

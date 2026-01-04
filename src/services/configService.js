// configService.js - global dynamic configuration with Firestore caching
const { db } = require("../firebaseAdmin");

let cache = { data: null, fetchedAt: 0 };
const TTL_MS = 60000; // 60s cache
const DOC_PATH = { collection: "system_config", id: "global" };

async function getConfig(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.fetchedAt < TTL_MS) return cache.data;
  try {
    const ref = db.collection(DOC_PATH.collection).doc(DOC_PATH.id);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    cache = { data, fetchedAt: now };
    return data;
  } catch (e) {
    return cache.data || {};
  }
}

async function updateConfig(patch) {
  const ref = db.collection(DOC_PATH.collection).doc(DOC_PATH.id);
  await ref.set(patch, { merge: true });
  cache.fetchedAt = 0; // bust cache
  return getConfig(true);
}

module.exports = { getConfig, updateConfig };

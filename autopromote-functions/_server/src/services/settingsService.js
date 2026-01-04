// settingsService.js
// Provides cached retrieval of dynamic settings from Firestore: system/settings
const { db } = require("../firebaseAdmin");
let cache = null;
let cacheAt = 0;
const TTL_MS = 60000; // 60s cache

async function getSettings() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const snap = await db.collection("system").doc("settings").get();
    cache = snap.exists ? snap.data() : {};
    cacheAt = Date.now();
  } catch (_) {
    cache = {};
    cacheAt = Date.now();
  }
  return cache;
}

function resolvePlatformCooldownHours(platform, settings) {
  return (
    (settings.platformCooldownHours && settings.platformCooldownHours[platform]) ||
    settings.platformCooldownHoursDefault ||
    24
  ); // hours
}

module.exports = { getSettings, resolvePlatformCooldownHours };

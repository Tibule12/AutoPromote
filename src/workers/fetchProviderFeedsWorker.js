/* Worker to fetch provider feeds and upsert into sounds collection
 * Usage: node src/workers/fetchProviderFeedsWorker.js
 */
const providers = {
  spotify: require("../services/providers/spotifyProvider"),
  tiktok: require("../services/providers/tiktokProvider"),
};
const { upsertProviderSound } = require("../services/soundService");

async function run({ db, providersToFetch = Object.keys(providers), options = {} } = {}) {
  if (!db) {
    const firebaseAdmin = require("../firebaseAdmin");
    db = firebaseAdmin.db;
  }

  const results = [];
  for (const p of providersToFetch) {
    const adapter = providers[p];
    if (!adapter) continue;
    try {
      const feed = await adapter.fetchTrending(options[p] || options);
      const res = [];
      for (const item of feed) {
        const r = await upsertProviderSound(db, p, item);
        res.push(r);
      }
      results.push({ provider: p, addedOrUpdated: res.length });
    } catch (err) {
      console.error("fetchProviderFeedsWorker: failed for", p, err && err.message);
      results.push({ provider: p, error: err && err.message });
    }
  }
  return results;
}

if (require.main === module) {
  (async () => {
    try {
      const r = await run();
      console.log("fetchProviderFeedsWorker finished", r);
      process.exit(0);
    } catch (err) {
      console.error("fetchProviderFeedsWorker failed", err);
      process.exit(1);
    }
  })();
}

module.exports = { run };

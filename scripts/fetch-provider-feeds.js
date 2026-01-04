#!/usr/bin/env node
// Simple script to fetch trending feeds from providers and import into Firestore
const { importFromProvider } = require('../src/services/soundService');
const providers = {
  spotify: require('../src/services/providers/spotifyProvider'),
  tiktok: require('../src/services/providers/tiktokProvider'),
};

async function run() {
  const firebaseAdmin = require('../src/firebaseAdmin');
  const db = firebaseAdmin.db;
  for (const [k, provider] of Object.entries(providers)) {
    try {
      console.log('Fetching provider', k);
      // pass provider-specific auth config
      const options = {};
      if (k === 'spotify') {
        options.clientId = process.env.SPOTIFY_CLIENT_ID;
        options.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
      }
      if (k === 'tiktok') {
        options.apiKey = process.env.TIKTOK_API_KEY; // placeholder
      }
      const feed = await provider.fetchTrending({ limit: 20, ...options });
      console.log(`Imported ${feed.length} items from ${k}`);
      if (feed.length > 0) {
        const added = await importFromProvider(db, k, feed);
        console.log(`Added ${added.length} sounds for provider ${k}`);
      }
    } catch (err) {
      console.error('fetch-provider-feeds error for', k, err && err.message);
    }
  }
}

if (require.main === module) run().catch(err => { console.error(err); process.exit(1); });

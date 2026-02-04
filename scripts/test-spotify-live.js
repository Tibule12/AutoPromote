
require('dotenv').config();

// Bootstrap params like server.js to handle credentials
try {
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const svcRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
      : null);
  if (svcRaw && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const parsed = JSON.parse(svcRaw);
      if (parsed && parsed.private_key && typeof parsed.private_key === "string")
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      const tmpPath = path.join(os.tmpdir(), `autopromote-service-account-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), { mode: 0o600 });
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
      if (!process.env.FIREBASE_PROJECT_ID && parsed && parsed.project_id) {
        process.env.FIREBASE_PROJECT_ID = parsed.project_id;
      }
      console.log("[Setup] Wrote service account JSON to", tmpPath);
    } catch (e) {
      console.warn("[Setup] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON/BASE64:", e.message);
    }
  }
} catch (e) {
  /* ignore bootstrap failures */
}

const { db, admin } = require('../src/firebaseAdmin');
const { searchTracks, getTracksBatch } = require('../src/services/spotifyService');

async function findUserWithSpotify() {
  console.log('Searching for a user with Spotify connection...');
  
  // Strategy 1: Check known admin email
  try {
    const adminUser = await admin.auth().getUserByEmail('admin123@gmail.com');
    if (adminUser) {
      console.log(`Checking admin user: ${adminUser.uid}`);
      const snap = await db.collection('users').doc(adminUser.uid).collection('connections').doc('spotify').get();
      if (snap.exists && snap.data().tokens) {
        console.log('Found Spotify connection on admin user!');
        return adminUser.uid;
      }
    }
  } catch (e) {
    console.log('Admin user lookup failed or not found:', e.message);
  }

  // Strategy 2: Heuristic Scan
  const usersSnap = await db.collection('users').limit(50).get();
  
  for (const doc of usersSnap.docs) {
    const spotifySnap = await doc.ref.collection('connections').doc('spotify').get();
    if (spotifySnap.exists) {
      const data = spotifySnap.data();
      if (data.tokens && data.tokens.access_token) {
        console.log(`Found connected user: ${doc.id}`);
        return doc.id;
      }
    }
  }
  return null;
}

async function runTest() {
  try {
    const specifiedUid = process.argv[2];
    let uid = specifiedUid;

    if (!uid) {
      uid = await findUserWithSpotify();
    }

    if (!uid) {
      console.error('No user found with Spotify connection. Please provide a UID as an argument effectively provided in the prompt or ensure a user is connected.');
      console.log('Usage: node scripts/test-spotify-live.js <UID>');
      process.exit(1);
    }

    console.log(`Testing with UID: ${uid}`);

    // Test 1: Search
    console.log('\n--- Test 1: Search Tracks "The Weeknd" ---');
    try {
      const searchRes = await searchTracks({ uid, query: 'The Weeknd', limit: 3 });
      console.log(`Found ${searchRes.tracks.length} tracks.`);
      if (searchRes.tracks.length > 0) {
        console.log('First track:', searchRes.tracks[0].name, '-', searchRes.tracks[0].artists.join(', '));
        
        // Test 2: Batch Metrics (using the found track)
        const trackId = searchRes.tracks[0].id;
        console.log(`\n--- Test 2: Batch Metrics for ${trackId} ---`);
        const metrics = await getTracksBatch({ uid, trackIds: [trackId] });
        console.log('Metrics:', metrics);
      }
    } catch (e) {
      console.error('Search failed:', e.message);
    }

  } catch (error) {
    console.error('Test execution error:', error);
  } finally {
    process.exit(0); // Force exit to close firebase connections
  }
}

runTest();

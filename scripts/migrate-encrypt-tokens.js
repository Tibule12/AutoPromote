#!/usr/bin/env node
// migrate-encrypt-tokens.js
// Simple migration script to convert plaintext stored tokens into encrypted tokenJson
// Usage: node scripts/migrate-encrypt-tokens.js --apply --limit=100

const admin = require("../firebaseAdmin").admin;
const db = require("../firebaseAdmin").db;
const { encryptToken, hasEncryption } = require("../src/services/secretVault");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitArg = args.find(a => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 100;

async function migrateUserConnections(limit = 100) {
  console.log("[migrate] scanning user connections for plaintext tokens");
  // Scan users collection document snapshots to find connection docs
  const usersSnap = await db.collection("users").limit(500).get();
  let updates = 0;
  let scanned = 0;
  let changed = 0;
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    try {
      const conns = await db.collection("users").doc(uid).collection("connections").get();
      for (const c of conns.docs) {
        scanned++;
        const data = c.data() || {};
        // If tokens is object and not yet encrypted
        if (
          data.tokens &&
          typeof data.tokens === "object" &&
          !data.hasEncryption &&
          hasEncryption()
        ) {
          const tokenJson = JSON.stringify(data.tokens);
          console.log(`[migrate] user ${uid} connection ${c.id} — would encrypt tokens`);
          if (apply) {
            await c.ref.set(
              { tokens: encryptToken(tokenJson), hasEncryption: true },
              { merge: true }
            );
            updates++;
            changed++;
          }
        }
      }
    } catch (e) {
      console.warn("[migrate] user scan error", uid, e.message);
    }
    if (scanned >= limit) break;
  }
  return { scanned, changed, updates };
}

async function migrateCollectionTokens(collectionName, limit = 100) {
  console.log("[migrate] scanning collection", collectionName);
  const q = db.collection(collectionName).limit(limit);
  const snap = await q.get();
  let scanned = 0,
    changed = 0;
  snap.docs.forEach(doc => {
    scanned++;
  });
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.tokenJson) continue; // already in new format
    // If old style store (access_token or token fields), encrypt them as tokenJson
    const candidate = {};
    if (data.access_token || data.refresh_token || data.accessToken || data.refreshToken) {
      if (data.access_token) candidate.access_token = data.access_token;
      if (data.refresh_token) candidate.refresh_token = data.refresh_token;
      if (data.accessToken) candidate.access_token = data.accessToken;
      if (data.refreshToken) candidate.refresh_token = data.refreshToken;
      // if other fields, include minimal ones
      if (data.scope) candidate.scope = data.scope;
      if (data.expires_in) candidate.expires_in = data.expires_in;
      console.log(`[migrate] ${collectionName}/${doc.id} — will encrypt token fields`);
      if (apply && hasEncryption()) {
        await doc.ref.set(
          {
            tokenJson: encryptToken(JSON.stringify(candidate)),
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        changed++;
      }
    }
  }
  return { scanned, changed };
}

async function run() {
  try {
    console.log("[migrate] Dry-run mode:", !apply);
    console.log("[migrate] Using encryption key available:", !!hasEncryption());
    const cands = [
      "youtube_tokens",
      "spotify_tokens",
      "twitter_tokens",
      "discord_tokens",
      "pinterest_tokens",
      "reddit_tokens",
      "instagram_tokens",
      "snapchat_tokens",
      "linkedin_tokens",
      "facebook_tokens",
      "tiktok_tokens",
    ];
    for (const coll of cands) {
      const res = await migrateCollectionTokens(coll, limit);
      console.log(`[migrate] scanned ${res.scanned} docs in ${coll}, changed ${res.changed}`);
    }
    const userRes = await migrateUserConnections(limit);
    console.log("[migrate] user connections scan done", userRes);
    console.log("[migrate] Finished");
  } catch (e) {
    console.error("[migrate] error", e && e.message, e);
    process.exit(1);
  }
}

run();

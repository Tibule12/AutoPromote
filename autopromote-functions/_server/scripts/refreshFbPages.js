/*
  refreshFbPages.js

  Usage:
    set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json
    node refreshFbPages.js <uid>

  This script reads the Firestore document users/{uid}/connections/facebook,
  attempts to obtain a usable user access token (decrypting if necessary),
  calls Facebook Graph `/me/accounts` to list Pages, then writes back the
  `pages` array and `ig_business_account_id` (if found) into the same doc.

  NOTE: Run this only from a trusted environment. It requires FB_CLIENT_SECRET
  in env when appsecret_proof is needed.
*/

const { admin, db } = require("../firebaseAdmin");
const fetch = require("node-fetch");
const crypto = require("crypto");

const FB_CLIENT_SECRET = process.env.FB_CLIENT_SECRET;

function appsecretProofFor(token) {
  try {
    if (!FB_CLIENT_SECRET || !token) return null;
    return crypto
      .createHmac("sha256", String(FB_CLIENT_SECRET))
      .update(String(token))
      .digest("hex");
  } catch (e) {
    return null;
  }
}

async function getTokenFromDoc(data) {
  // If we have encrypted token, try to use secretVault
  if (data.encrypted_user_access_token) {
    try {
      const { decryptToken, hasEncryption } = require("../services/secretVault");
      if (hasEncryption() && decryptToken) {
        return decryptToken(data.encrypted_user_access_token);
      }
    } catch (e) {
      // fallthrough
    }
  }
  return data.user_access_token || null;
}

async function refresh(uid) {
  if (!uid) throw new Error("Missing uid arg");
  console.log("Refreshing Facebook pages for uid=", uid);
  const snap = await db.collection("users").doc(uid).collection("connections").doc("facebook").get();
  if (!snap.exists) {
    console.error("No facebook connection doc for user", uid);
    return;
  }
  const data = snap.data();
  const token = await getTokenFromDoc(data);
  if (!token) {
    console.error("No user access token found in doc. Cannot call Graph API.");
    console.error("Doc snapshot:", JSON.stringify(data, null, 2));
    return;
  }

  const proof = appsecretProofFor(token);
  const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(token)}${proof ? `&appsecret_proof=${proof}` : ""}`;
  console.log("Calling Graph /me/accounts...");
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    console.error("Graph returned error:", JSON.stringify(json, null, 2));
    return;
  }
  const pages = Array.isArray(json.data) ? json.data : [];
  console.log(`Found ${pages.length} pages`);

  // Try to find IG business account on any page
  let igBusinessId = data.ig_business_account_id || null;
  for (const p of pages) {
    if (igBusinessId) break;
    try {
      const pageToken = p.access_token;
      if (!pageToken) continue;
      const proofP = appsecretProofFor(pageToken);
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(p.id)}?fields=instagram_business_account&access_token=${encodeURIComponent(pageToken)}${proofP ? `&appsecret_proof=${proofP}` : ""}`
      );
      const igJson = await igRes.json();
      if (igJson && igJson.instagram_business_account && igJson.instagram_business_account.id) {
        igBusinessId = igJson.instagram_business_account.id;
        console.log(`Found IG Business ${igBusinessId} on page ${p.id}`);
        break;
      }
    } catch (e) {
      console.warn("IG check failed for page", p.id, e.message || e);
    }
  }

  // Prepare safe pages (strip access_token before writing)
  const safePages = (pages || []).map(p => ({ id: p.id, name: p.name || null, access_token: p.access_token || null }));

  // Update doc
  await snap.ref.set(
    {
      pages: safePages,
      ig_business_account_id: igBusinessId || null,
      obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log("Updated Firestore document for user", uid);
}

if (require.main === module) {
  const uid = process.argv[2];
  refresh(uid).catch(e => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

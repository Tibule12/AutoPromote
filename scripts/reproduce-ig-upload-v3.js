require('dotenv').config();
const { db } = require('../src/firebaseAdmin');
const { decryptToken } = require('../src/services/secretVault');
const fetch = require('node-fetch');

const UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";
// From inspector output:
const IG_USER_ID = "17841465790840731"; 
const VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/autopromote-cc6d3.firebasestorage.app/o/uploads%2Fvideos%2F1770717676666_Reviewer%20Login.mp4?alt=media&token=50d27e22-e81e-4aa6-91e8-f77bf4b5b6a2";
const CAPTION = "Test Caption #AutoPromote";

async function run() {
    console.log("1. Finding Page Token...");
    const connSnap = await db.doc(`users/${UID}/connections/facebook`).get();
    if (!connSnap.exists) throw new Error("No connection");
    
    // Manual Logic mirroring what we just pushed
    const d = connSnap.data();
    const p = d.pages.find(pg => pg.instagram_business_account && pg.instagram_business_account.id === IG_USER_ID);
    
    if (!p) throw new Error("No matching page for IG ID");
    
    let token = p.access_token;
    if (!token && p.encrypted_access_token) {
        token = decryptToken(p.encrypted_access_token);
    }
    
    console.log(`Token obtained: ${token ? token.substring(0, 15) : 'null'}...`);
    
    // 2. Create Media Container
    console.log("2. Creating Media Container (REELS)...");
    const containerUrl = `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`;
    
    const params = new URLSearchParams();
    params.append("access_token", token);
    params.append("media_type", "REELS"); // Try explicit REELS
    params.append("video_url", VIDEO_URL);
    params.append("caption", CAPTION);
    
    const cRes = await fetch(containerUrl, { method: "POST", body: params });
    const cJson = await cRes.json();
    
    console.log("Container Response:", JSON.stringify(cJson, null, 2));

    if (cJson.error) {
         if (cJson.error.message.includes("Invalid parameter")) {
             console.log("Trying VIDEO instead of REELS...");
             const params2 = new URLSearchParams();
             params2.append("access_token", token);
             params2.append("media_type", "VIDEO");
             params2.append("video_url", VIDEO_URL);
             params2.append("caption", CAPTION);
             
             const cRes2 = await fetch(containerUrl, { method: "POST", body: params2 });
             const cJson2 = await cRes2.json();
             console.log("Container Response (Retry):", JSON.stringify(cJson2, null, 2));
         }
    }
    
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

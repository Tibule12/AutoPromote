require('dotenv').config();
const { db } = require('../src/firebaseAdmin');
const { decryptToken } = require('../src/services/secretVault');
const fetch = require('node-fetch'); // Using the one from node_modules

const UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";
const PAGE_ID = "123974150805178";
const VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/autopromote-cc6d3.firebasestorage.app/o/uploads%2Fvideos%2F1770715130033_TikTok%20Login%20Demo.mp4?alt=media&token=99512752-952f-4c80-a72f-c32a171fb54c"; // From content
const TITLE = "Hey META";
const DESCRIPTION = "Hey META (Description)";

async function run() {
    console.log("Reading connection...");
    const snap = await db.doc(`users/${UID}/connections/facebook`).get();
    if (!snap.exists) throw new Error("No connection");
    
    const data = snap.data();
    const page = data.pages.find(p => p.id === PAGE_ID);
    if (!page) throw new Error("Page not found");
    
    let token = page.access_token;
    if (!token && page.encrypted_access_token) {
        console.log("Decrypting token...");
        token = decryptToken(page.encrypted_access_token);
    }
    
    if (!token) throw new Error("No token");
    console.log(`Using token: ${token.substring(0, 15)}...`);

    // Ensure it is a page token (Exchange check logic)
    console.log("Verifying token type...");
    const checkRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${process.env.FB_CLIENT_ID}|${process.env.FB_CLIENT_SECRET}`);
    const checkData = await checkRes.json();
    console.log("Token Type:", checkData.data?.type);

    console.log("Attempting Video Post...");
    const endpoint = `https://graph.facebook.com/v19.0/${PAGE_ID}/videos`;
    
    const params = new URLSearchParams();
    params.append("access_token", token);
    params.append("file_url", VIDEO_URL);
    params.append("title", TITLE);
    params.append("description", DESCRIPTION);
    
    const res = await fetch(endpoint, {
        method: "POST",
        body: params
    });
    
    const json = await res.text();
    console.log("--- RESPONSE ---");
    console.log(json);
    
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

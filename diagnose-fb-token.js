
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');
const { decryptToken } = require('./src/services/secretVault');
const fetch = require('node-fetch');

const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';
const APP_ID = process.env.FB_CLIENT_ID;
const APP_SECRET = process.env.FB_CLIENT_SECRET;

async function diagnose() {
    console.log("Reading DB...");
    const doc = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
    if (!doc.exists) return console.log("No doc");
    
    const data = doc.data();
    const userToken = decryptToken(data.encrypted_user_access_token);
    
    if (!userToken || userToken === data.encrypted_user_access_token) {
        console.log("Failed to decrypt user token");
        return;
    }

    console.log("User Token (first 10):", userToken.substring(0, 10) + "...");

    // 1. Debug Token
    console.log("\n--- Debug Token Endpoint ---");
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${userToken}&access_token=${APP_ID}|${APP_SECRET}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();
    console.log(JSON.stringify(debugData, null, 2));

    // 2. Me Accounts (Raw)
    console.log("\n--- Me/Accounts Endpoint ---");
    const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`;
    const accRes = await fetch(accountsUrl);
    const accData = await accRes.json();
    console.log(JSON.stringify(accData, null, 2));
}

diagnose().catch(console.error);


const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { google } = require('googleapis');
const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');
const { tokensFromDoc } = require('./src/services/connectionTokenUtils');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function verifyRefresh() {
    console.log("🔍 Verifying YouTube Token Refresh...");
    
    // 1. Get Refresh Token
    const snap = await db.collection("users").doc(TARGET_UID).collection("connections").doc("youtube").get();
    const data = snap.data();
    const tokens = tokensFromDoc(data);
    
    if (!tokens || !tokens.refresh_token) {
        console.error("❌ No refresh token available to test.");
        return;
    }

    // 2. Setup Client
    const client = new google.auth.OAuth2(
        process.env.YT_CLIENT_ID,
        process.env.YT_CLIENT_SECRET,
        process.env.YT_REDIRECT_URI
    );

    client.setCredentials({
        refresh_token: tokens.refresh_token
    });

    // 3. Attempt Refresh
    try {
        console.log("🔄 Attempting to refresh access token...");
        const { credentials } = await client.refreshAccessToken(); // This explicitly calls for a refresh
        console.log("✅ Refresh SUCCESS!");
        console.log("   New Access Token:", credentials.access_token.substring(0, 10) + "...");
    } catch (e) {
        console.error("❌ Refresh FAILED:", e.message);
        console.error(e.response ? e.response.data : "No response data");
    }
}

verifyRefresh();

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Manually load if dotenv fails
if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("Loading .env manually fallback...");
    // Attempt to read from .env file if it exists
    const fs = require('fs');
    if(fs.existsSync('.env')) {
        const envConfig = require('dotenv').parse(fs.readFileSync('.env'));
        for (const k in envConfig) {
            process.env[k] = envConfig[k];
        }
    }
}

// Bootstrap
try { require('./src/bootstrap'); } catch(e) {}

const admin = require('firebase-admin');
const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS ? require(process.env.GOOGLE_APPLICATION_CREDENTIALS) : {};
if (!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
const db = admin.firestore();

async function checkUserClips() {
    console.log("Checking clips query...");
    const userId = "test-user-123"; // Use the user we just created a clip for

    try {
        const snapshot = await db.collection("content")
            .where("userId", "==", userId)
            .where("sourceType", "==", "ai_clip")
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();
        
        console.log(`Found ${snapshot.size} clips for user ${userId}`);
        snapshot.forEach(doc => console.log(`- ${doc.id}: ${doc.data().url}`));
        
    } catch (error) {
        console.error("Query Failed:", error.message);
        if(error.code === 9) { // FAILED_PRECONDITION
            console.error("Likely missing Firestore Index. Creating link might be in error message:");
            console.error(error);
        }
    }
}

checkUserClips();
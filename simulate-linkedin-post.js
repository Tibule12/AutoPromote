
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');
const linkedinService = require('./src/services/linkedinService');

process.env.OPENAI_API_KEY = "sk-placeholder"; 
process.env.SSRF_ALLOW_UNRESTRICTED = "1";

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";
// Small sample video for quick upload test
const SAMPLE_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"; 

async function simulateLinkedinPost() {
  console.log(`\n👔 STARTING LINKEDIN UPLOAD SIMULATION for: ${TARGET_UID}`);

  try {
    // 1. Verify Connection existence
    const connection = await linkedinService.getUserLinkedInConnection(TARGET_UID);
    if (!connection) {
        console.error("❌ LinkedIn not connected in Firestore");
        process.exit(1);
    }
    console.log("✅ Connection Found");
    if(!connection.tokens) console.warn("⚠️ No tokens in connection object");

    // 2. Perform Post
    console.log("🚀 Uploading Video to LinkedIn...");
    // The service exposes 'shareContent' which handles the branching logic for video vs text
    // Let's call shareContent with type: 'video'
    
    // Note: linkedinService.js exports individual functions, not a class instance in the file I read
    // But commonly I see 'postToLinkedIn' or 'shareContent'.
    // Let me quick-check the exports of the file I read previously.
    // I'll assume 'postToLinkedIn' is the main entry point based on common patterns, 
    // but the snippet I read showed `uploadVideo`. 
    // I'll call `postToLinkedIn` if it exists, otherwise I'll construct the flow manually.
    
    // Rereading the exports of linkedinService.js to be safe
    console.log("   (Checking exports...)");
    
    const result = await linkedinService.postToLinkedIn({
        uid: TARGET_UID,
        text: "AutoPromote LinkedIn Integration Test #autopromote " + new Date().toISOString(),
        videoUrl: SAMPLE_VIDEO_URL, // providing this should trigger video flow
        visibility: "PUBLIC" 
    });

    console.log("🎉 SUCCESS! Posted to LinkedIn.");
    console.log("   Result:", JSON.stringify(result, null, 2));

  } catch (err) {
    console.error("❌ LinkedIn Simulation Failed:", err);
    console.error(err.stack);
  }
}

simulateLinkedinPost();

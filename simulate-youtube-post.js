
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');
const { tokensFromDoc } = require('./src/services/connectionTokenUtils'); // Import this

// IMPORTANT: Mock the environment for services if needed
process.env.OPENAI_API_KEY = "sk-placeholder"; 
process.env.NO_VIRAL_OPTIMIZATION = "1";
process.env.FIREBASE_ADMIN_BYPASS = "0"; 
process.env.SSRF_ALLOW_UNRESTRICTED = "1";

const youtubeService = require('./src/services/youtubeService');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";
const SAMPLE_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

async function simulateYoutubePost() {
  console.log(`\n🎬 STARTING YOUTUBE UPLOAD SIMULATION for: ${TARGET_UID}`);

  // Debug Env
  console.log("Checking Environment Variables:");
  console.log("YT_CLIENT_ID:", process.env.YT_CLIENT_ID ? "✅ Present" : "❌ Missing");
  console.log("TWITTER_TOKEN_ENCRYPTION_KEY:", process.env.TWITTER_TOKEN_ENCRYPTION_KEY ? "✅ Present" : "❌ Missing");

  try {
    // DIAGNOSTIC STEP
    console.log("🔍 Diagnosing Firestore Token Decryption...");
    const snap = await db.collection("users").doc(TARGET_UID).collection("connections").doc("youtube").get();
    if (snap.exists) {
        const data = snap.data();
        const tokens = tokensFromDoc(data);
        console.log("   Doc Data Keys:", Object.keys(data));
        console.log("   Decrypted Tokens:", tokens ? Object.keys(tokens) : "NULL");
        if (tokens) {
            console.log("   Has Access Token:", !!tokens.access_token);
            console.log("   Has Refresh Token:", !!tokens.refresh_token);
        }
    } else {
        console.log("   ❌ User/YouTube connection doc missing.");
    }

    const contentData = {
        title: "Youtube Viral Test " + Date.now(),
        type: "video",
        url: SAMPLE_VIDEO_URL,
        description: "Automated test upload for YouTube Integration #autopromote",
        user_id: TARGET_UID,
        created_at: new Date(),
        target_platforms: ['youtube'],
        status: 'approved',
        views: 0,
        clicks: 0
    };

    console.log("💾 Saving content to Firestore...");
    const contentRef = await db.collection('content').add(contentData);
    const contentId = contentRef.id;
    console.log(`   ✅ Content Created: ${contentId}`);

    console.log("\n🚀 Distributing to YouTube...");
    
    try {
        const result = await youtubeService.uploadVideo({
            uid: TARGET_UID,
            contentId: contentId,
            fileUrl: SAMPLE_VIDEO_URL,
            title: contentData.title,
            description: contentData.description,
            mimeType: "video/mp4",
            optimizeMetadata: false // Skip AI optimization for test
        });

        console.log("   ✅ YouTube Service Result:", JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log("   🎉 SUCCESS! Video Posted to YouTube.");
            console.log("   🔗 Link:", result.url || result.videoId);
        } else {
             console.log("   ⚠️ Upload reported failure.");
             console.log("   Error Details:", result.error);
        }

    } catch (distError) {
        console.error("   ❌ Distribution Failed:", distError.message);
        // console.error(distError.stack);
    }

  } catch (error) {
    console.error("❌ Fatal Error:", error);
  }
}

simulateYoutubePost();

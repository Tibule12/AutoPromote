
require('dotenv').config();
const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');

// IMPORTANT: Mock the environment for services if needed
process.env.OPENAI_API_KEY = "sk-placeholder"; 
process.env.NO_VIRAL_OPTIMIZATION = "1";
process.env.FIREBASE_ADMIN_BYPASS = "0"; // Ensure we don't bypass real logic
process.env.TIKTOK_FORCE_FILE_UPLOAD = "0"; // Allow Pull from URL
process.env.SSRF_ALLOW_UNRESTRICTED = "1"; // Disable SSRF for testing external URLs

const revenueEngine = require('./src/services/revenueEngine');
const tiktokService = require('./src/services/tiktokService');
// const smartDistributionEngine = require('./src/services/smartDistributionEngine');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";
const SAMPLE_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

async function simulatePost() {
  console.log(`\n🎬 STARTING TIKTOK UPLOAD SIMULATION (PUBLIC & PROMOTED) for: ${TARGET_UID}`);

  try {
    // 1. Create Data Payload with PROMOTION flags
    const contentData = {
        title: "Viral Test Video (Public) " + Date.now(),
        type: "video",
        url: SAMPLE_VIDEO_URL,
        description: "🔥 This is a LIVE TEST of AutoPromote Viral Engine! 🚀 #autopromote #viral #fyp #publictest",
        user_id: TARGET_UID,
        created_at: new Date(),
        target_platforms: ['tiktok'],
        status: 'approved', // Auto-approve for public posting
        views: 0,
        clicks: 0,
        viral_optimized: true, // FLAG: Enable optimization in DB
        auto_promote: {
            enabled: true,
            budget: 100,
            frequency: 'hourly'
        }
    };

    // 2. Save to DB
    console.log("💾 Saving content to Firestore...");
    const contentRef = await db.collection('content').add(contentData);
    const contentId = contentRef.id;
    console.log(`   ✅ Content Created: ${contentId}`);

    // 3. Create Viral Bounty (Higher Amount for "Promotion")
    console.log("\n💰 Creating Viral Bounty ($100)...");
    try {
        const bountyResult = await revenueEngine.createViralBounty(
            TARGET_UID, 
            "tech", 
            100, 
            "tok_bypass" // Bypass Stripe
        );
        
        if (bountyResult.success) {
            console.log(`   ✅ Bounty Active: ${bountyResult.bountyId}`);
            await contentRef.update({
                viral_bounty_id: bountyResult.bountyId,
                has_bounty: true,
                bounty_active: true,
                bounty_pool: 100
            });
        }
    } catch (e) {
        console.error("   ⚠️ Bounty creation failed (non-fatal):", e.message);
    }

    // 4. Distribute to TikTok via Service (PUBLIC)
    console.log("\n🚀 Distributing to TikTok (PUBLIC_TO_EVERYONE)...");
    
    try {
        const result = await tiktokService.uploadTikTokVideo({
            contentId: contentId,
            uid: TARGET_UID,
            payload: {
                url: SAMPLE_VIDEO_URL,
                title: contentData.title + " #fyp #viral", // Add hashtags to title/message
                privacy: 'PUBLIC_TO_EVERYONE' // PUBLIC THIS TIME
            },
            reason: 'approved' // Signal that this is an approved public post
        });

        console.log("   ✅ TikTok Service Result:", JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log("   🎉 SUCCESS! Video Posted PUBLICLY to TikTok.");
            console.log("   🔗 https://www.tiktok.com/@tibulethulz/video/" + (result.publishId?.split('.').pop() || ""));
        } else {
             console.log("   ⚠️ Upload reported failure.");
        }

    } catch (distError) {
        console.error("   ❌ Distribution Failed:", distError.message);
    }

  } catch (error) {
    console.error("❌ Fatal Error:", error);
  }
}

simulatePost();

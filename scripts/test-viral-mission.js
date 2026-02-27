// Force bypass to use in-memory DB for safe testing
process.env.FIREBASE_ADMIN_BYPASS = '1';

const viralMissionControl = require('../src/services/viralMissionControl');

(async () => {
    console.log("\n--- VIRAL MISSION CONTROL TEST ---");
    console.log("Simulating: User uploads a new TikTok video...");

    const dummyContent = {
        userId: "user_test_123",
        url: "https://www.tiktok.com/@user/video/1234567890",
        platform: "tiktok",
        type: "view",
        targetAmount: 500 // simulate a medium-sized viral push
    };

    try {
        console.log(`[Test] 📡 Sending signal to Mission Control for: ${dummyContent.url}`);
        
        // Execute the mission launch
        const result = await viralMissionControl.launchOperation(
            dummyContent.userId, 
            dummyContent
        );

        console.log("\n[Test] ✅ MISSION LAUNCH SUCCESSFUL");
        console.log("[Test] Details:", result);

    } catch (error) {
        console.error("\n[Test] ❌ MISSION FAILED:", error);
    }
})();

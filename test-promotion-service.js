const promotionService = require("./promotionService");
const admin = require("firebase-admin");

async function testPromotionService() {
  try {
    console.log("Testing promotion scheduling...");

    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const serviceAccount = require("./serviceAccountKey.json");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://autopromote-cc6d3.firebaseio.com",
      });
    }

    const firestore = admin.firestore();

    // Create test content first
    const testContent = {
      title: "Test Content",
      type: "video",
      url: "https://example.com/test-video",
      userId: "test-user",
      createdAt: new Date().toISOString(),
    };

    const contentRef = await firestore.collection("content").add(testContent);
    const contentId = contentRef.id;
    console.log("📊 Scheduling promotion for content ID:", contentId);

    // Test scheduling a promotion
    const scheduleData = {
      platform: "youtube",
      schedule_type: "specific",
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      frequency: "once",
      is_active: true,
      budget: 100,
      target_metrics: {
        views: 1000,
        engagement_rate: 0.1,
      },
    };

    console.log("📋 Schedule data:", scheduleData);

    const schedule = await promotionService.schedulePromotion(contentId, scheduleData);
    console.log("✅ Promotion scheduled successfully:", schedule);

    // Test getting active promotions
    const activePromotions = await promotionService.getActivePromotions();
    console.log("✅ Active promotions retrieved:", activePromotions.length);

    // Test analytics
    const analytics = await promotionService.getPromotionAnalytics(schedule.id);
    console.log("✅ Analytics retrieved successfully:", analytics);

    return true;
  } catch (error) {
    console.error("❌ Promotion service test failed:", error);
    throw error;
  }
}

testPromotionService()
  .then(() => console.log("All promotion tests completed successfully!"))
  .catch(console.error);

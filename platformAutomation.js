// platformAutomation.js
// This script automates promotion execution and revenue generation for all due promotions.

const promotionService = require("./promotionService");

async function runPlatformAutomation() {
  try {
    // 1. Process completed promotions and schedule next recurrences
    await promotionService.processCompletedPromotions();

    // 2. Get all active promotions that are due to run (startTime <= now, isActive)
    const now = new Date().toISOString();
    const activePromotions = await promotionService.getActivePromotions();

    for (const promo of activePromotions) {
      // Only execute if startTime is in the past and endTime is in the future (or not set)
      if (promo.startTime <= now && (!promo.endTime || promo.endTime >= now)) {
        try {
          console.log(
            `\n🚀 Executing promotion: ${promo.id} for content: ${promo.contentId} on platform: ${promo.platform}`
          );
          const result = await promotionService.executePromotion(promo.id);
          console.log("✅ Promotion executed:", result);
        } catch (err) {
          console.error("❌ Error executing promotion:", err);
        }
      }
    }

    console.log("\n🎉 Platform automation run complete!");
  } catch (error) {
    console.error("❌ Platform automation error:", error);
  }
}

// Run immediately if called directly
if (require.main === module) {
  runPlatformAutomation();
}

module.exports = runPlatformAutomation;

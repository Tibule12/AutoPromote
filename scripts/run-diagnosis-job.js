require("dotenv").config();
const { runDuePolicies } = require("../src/services/contentRecoveryService");
const connectDB = require("../db");

// Optional: Analytics Polling if available
let platformStatsPoller;
try {
  platformStatsPoller = require("../src/services/platformStatsPoller");
} catch (e) { console.warn("Optional platformStatsPoller not found"); }

let youtubeStatsPoller;
try {
  youtubeStatsPoller = require("../src/services/youtubeStatsPoller");
} catch (e) { console.warn("Optional youtubeStatsPoller not found"); }

async function main() {
  console.log("⏱️  Starting Content Diagnosis Automation Job...");
  
  // 1. Initialize Database
  const isConnected = await connectDB();
  if (!isConnected) {
    console.error("❌ Failed to connect to database. Exiting.");
    process.exit(1);
  }

  try {
    // 2. Run Analytics Polling (Batch)
    // We run a few batches to ensure we cover recent content. 
    // Cron runs hourly, so we want to process enough to keep up.
    if (platformStatsPoller && platformStatsPoller.pollPlatformPostMetricsBatch) {
      console.log("   --> Polling Platform Analytics...");
      // Run larger batch since we only run hourly
      const batchSize = 50; 
      const res = await platformStatsPoller.pollPlatformPostMetricsBatch({ batchSize });
      console.log(`   --> Platform Analytics: Processed ${res.processed || 0} posts`);
    }

    if (youtubeStatsPoller && youtubeStatsPoller.pollYouTubeStatsBatch) {
      console.log("   --> Polling YouTube Analytics...");
      const res = await youtubeStatsPoller.pollYouTubeStatsBatch({ batchSize: 20 });
      console.log(`   --> YouTube Analytics: Processed ${res.processed || 0} videos`);
    }

    // 3. Run the Policy Logic
    const result = await runDuePolicies({
      actorUid: "scheduler-cron-job", // Identifying the source
      // Limits are enforced by ENV vars (DIAGNOSIS_MAX_CONTENTS_PER_RUN) 
      // but we can pass a safety override here if we want.
    });

    // 3. Log Results for Cloudwatch/Render Logs
    console.log("✅ Diagnosis Run Complete:");
    console.log(`   - Processed: ${result.processedCount}`);
    console.log(`   - Automation Triggered: ${result.automation.triggered}`);
    console.log(`   - Actions Taken: ${result.processed.filter(p => p.actions?.length > 0).length}`);
    
    if (result.automation.skippedReason) {
      console.log(`   ⚠️ Automation Skipped: ${result.automation.skippedReason}`);
    }

    process.exit(0);

  } catch (error) {
    console.error("🔥 Critical Error in Diagnosis Job:", error);
    process.exit(1);
  }
}

main();

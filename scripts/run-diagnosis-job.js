require("dotenv").config();

async function main() {
  if (process.env.ENABLE_CONTENT_DIAGNOSIS_CRON !== "true") {
    console.error(
      "Content Diagnosis disabled: ENABLE_CONTENT_DIAGNOSIS_CRON must be true. No analytics or diagnosis work ran."
    );
    process.exitCode = 1;
    return;
  }
  const { runDuePolicies } = require("../src/services/contentRecoveryService");
  const connectDB = require("../db");
  let platformStatsPoller, youtubeStatsPoller;
  try {
    platformStatsPoller = require("../src/services/platformStatsPoller");
  } catch (error) {
    console.warn("Platform analytics poller unavailable:", error.message);
  }
  try {
    youtubeStatsPoller = require("../src/services/youtubeStatsPoller");
  } catch (error) {
    console.warn("YouTube analytics poller unavailable:", error.message);
  }
  console.log(
    JSON.stringify({
      event: "content_diagnosis_run",
      status: "started",
      revision: process.env.RENDER_GIT_COMMIT || "local",
      at: new Date().toISOString(),
    })
  );
  console.log("⏱️  Starting Content Diagnosis Automation Job...");

  // 1. Initialize Database
  const isConnected = await connectDB();
  if (!isConnected) {
    console.error("❌ Failed to connect to database. Exiting.");
    process.exit(1);
  }

  try {
    // 2. Run Analytics Polling (Batch)
    // STRATEGY: "Drain the Queue"
    // Since we run hourly, we want to process ALL items that are due,
    // effectively clearing the backlog until we run out of time (safety limit).
    const MAX_RUNTIME_MS = 10 * 60 * 1000; // 10 minutes max runtime for analytics
    const startTime = Date.now();

    if (platformStatsPoller && platformStatsPoller.pollPlatformPostMetricsBatch) {
      console.log("   --> Polling Platform Analytics...");
      let totalProcessed = 0;
      let batchCount = 0;

      while (Date.now() - startTime < MAX_RUNTIME_MS) {
        // Fetch in chunks of 50
        const res = await platformStatsPoller.pollPlatformPostMetricsBatch({ batchSize: 50 });
        const count = res.processed || 0;
        totalProcessed += count;
        batchCount++;

        // If we processed fewer than asked, the queue is likely empty
        if (count < 50) break;

        console.log(`       Batch ${batchCount}: processed ${count} posts...`);
      }
      console.log(`   --> Platform Analytics: Total Processed ${totalProcessed} posts`);
    }

    if (youtubeStatsPoller && youtubeStatsPoller.pollYouTubeStatsBatch) {
      console.log("   --> Polling YouTube Analytics...");
      let totalProcessed = 0;

      // Give YouTube the remaining time budget
      while (Date.now() - startTime < MAX_RUNTIME_MS) {
        const res = await youtubeStatsPoller.pollYouTubeStatsBatch({ batchSize: 20 });
        const count = res.processed || 0;
        totalProcessed += count;

        if (count < 20) break;
      }
      console.log(`   --> YouTube Analytics: Total Processed ${totalProcessed} videos`);
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
    console.log(`   - Recovery blocked: ${result.blocked === true ? result.blockReason : "no"}`);
    console.log(
      `   - Actions Taken: ${result.processed.filter(p => p.actions?.length > 0).length}`
    );

    console.log(
      JSON.stringify({
        event: "content_diagnosis_run",
        status: result.blocked ? "analytics_completed_recovery_blocked" : "completed",
        blockReason: result.blockReason || null,
        processed: result.processedCount,
        revision: process.env.RENDER_GIT_COMMIT || "local",
        at: new Date().toISOString(),
      })
    );

    process.exit(0);
  } catch (error) {
    console.error("🔥 Critical Error in Diagnosis Job:", error);
    process.exit(1);
  }
}

if (require.main === module)
  main().catch(error => {
    console.error("Diagnosis job failed:", error.message);
    process.exitCode = 1;
  });
module.exports = { main };

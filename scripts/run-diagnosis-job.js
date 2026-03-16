require("dotenv").config();
const { runDuePolicies } = require("../src/services/contentRecoveryService");
const connectDB = require("../db");

async function main() {
  console.log("⏱️  Starting Content Diagnosis Automation Job...");
  
  // DEBUG: Check environment variables
  console.log("🔍 Debugging Environment:");
  console.log(`   - FIREBASE_SERVICE_ACCOUNT_JSON present? ${!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON}`);
  console.log(`   - FIREBASE_SERVICE_ACCOUNT_BASE64 present? ${!!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64}`);
  console.log(`   - FIREBASE_SERVICE_ACCOUNT present? ${!!process.env.FIREBASE_SERVICE_ACCOUNT}`);
  
  // 1. Initialize Database
  const isConnected = await connectDB();
  if (!isConnected) {
    console.error("❌ Failed to connect to database. Exiting.");
    process.exit(1);
  }

  try {
    // 2. Run the Policy Logic
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

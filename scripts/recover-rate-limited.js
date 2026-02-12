const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "..", "service-account-key.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Service account key not found at:", serviceAccountPath);
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function recoverRateLimited() {
  console.log("🔍 Finding failed facebook jobs due to rate limits...");
  
  // Find failed jobs
  // We scan recent failures (last 24h)
  const snapshot = await db.collection("promotion_schedules")
    .where("status", "==", "failed")
    .where("platform", "==", "facebook")
    .limit(100)
    .get();

  if (snapshot.empty) {
    console.log("No failed facebook jobs found.");
    return;
  }

  let count = 0;
  const batch = db.batch();
  const now = Date.now();
  let delayOffset = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const errorMsg = data.error || data.result?.error || "";
    
    // Check if error is relevant
    if (errorMsg.includes("limit how often") || errorMsg.includes("368")) {
      
      // Reschedule them staggering 5 minutes apart to slowly drain queue
      // starting 30 mins from now
      const futureTime = new Date(now + (30 * 60 * 1000) + delayOffset).toISOString();
      delayOffset += 5 * 60 * 1000; // Add 5 mins for each subsequent job

      console.log(`♻️ Recovering ${doc.id} -> New time: ${futureTime}`);
      
      batch.update(doc.ref, {
        status: "pending",
        isActive: true, // Re-enable
        startTime: futureTime,
        lastRecoveryReason: "manual_rate_limit_fix"
      });
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`✅ Recovered and staggered ${count} rate-limited jobs.`);
  } else {
    console.log("Found failed jobs, but none matched the rate limit error signature.");
  }
}

recoverRateLimited().then(() => process.exit(0));

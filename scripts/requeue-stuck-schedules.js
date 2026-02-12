const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin with service account
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

async function requeueStuckSchedules() {
  console.log("🔍 Checking for stuck 'processing' schedules...");
  try {
    const batchSize = 100;
    // Find all schedules with status 'processing'
    // Note: If you have many, you might need to paginate, but let's assume < 100 for now or do a few batches.
    const snapshot = await db.collection("promotion_schedules")
      .where("status", "==", "processing")
      .limit(batchSize)
      .get();

    if (snapshot.empty) {
      console.log("✅ No stuck schedules found.");
      return;
    }

    console.log(`⚠️ Found ${snapshot.size} stuck schedules. Resetting them to 'pending'...`);

    const batch = db.batch();
    let count = 0;

    snapshot.forEach(doc => {
      // Reset status to 'pending' (or delete it) so they are picked up again
      // Update updatedAt so we know when we reset them
      batch.update(doc.ref, { 
        status: admin.firestore.FieldValue.delete(), // Removing status effectively makes it "not processing" and "not executed"
        lastResetAt: new Date().toISOString(),
        previousStatus: "processing" // Audit trail
      });
      count++;
    });

    await batch.commit();
    console.log(`✅ Successfully requeued ${count} schedules.`);
    
  } catch (error) {
    console.error("❌ Error requeueing schedules:", error);
  } finally {
    // Determine if we need to exit or if this is part of a larger process
    // For a standalone script, we exit.
    process.exit(0);
  }
}

requeueStuckSchedules();

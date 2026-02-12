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

async function clearFailedSchedules() {
  console.log("🧹 Clearing failed Instagram and TikTok schedules...");

  const platforms = ["instagram", "tiktok"];
  let totalDeleted = 0;
  
  for (const platform of platforms) {
    const snapshot = await db.collection("promotion_schedules")
      .where("platform", "==", platform)
      .where("status", "==", "failed")
      .get();

    if (snapshot.empty) {
      console.log(`No failed schedules found for ${platform}.`);
      continue;
    }

    console.log(`Found ${snapshot.size} failed schedules for ${platform}. Deleting...`);

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`✅ Deleted ${snapshot.size} ${platform} schedules.`);
    totalDeleted += snapshot.size;
  }
  
  console.log(`\n✨ Total cleared: ${totalDeleted}`);
}

clearFailedSchedules().then(() => process.exit(0));

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

async function checkOtherPlatforms() {
  console.log("🔍 Checking Instagram and TikTok schedules...");

  const platforms = ["instagram", "tiktok"];
  
  for (const platform of platforms) {
    console.log(`\n--- ${platform.toUpperCase()} ---`);
    
    // Check recent attempts - REMOVED orderBy to avoid index error
    const snapshot = await db.collection("promotion_schedules")
      .where("platform", "==", platform)
      .limit(10)
      .get();

    if (snapshot.empty) {
      console.log(`No recent schedules found for ${platform}.`);
      continue;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Time: ${data.startTime}`);
      if (data.error) console.log(`Error: ${data.error}`);
      if (data.result) console.log(`Result: ${JSON.stringify(data.result).substring(0, 100)}...`);
      console.log("-");
    });
  }
}

checkOtherPlatforms().then(() => process.exit(0));

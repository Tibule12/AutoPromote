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

async function checkSchedules() {
  console.log("Checking promotion_schedules collection...");
  try {
    const now = new Date().toISOString();
    console.log("Current time (ISO):", now);

    // Get all schedules (limit to last 20 created to avoid flood)
    const snapshot = await db.collection("promotion_schedules")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    if (snapshot.empty) {
      console.log("No promotion schedules found.");
      return;
    }

    console.log(`Found ${snapshot.size} recent schedules:`);
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log("---");
      console.log(`ID: ${doc.id}`);
      console.log(`Platform: ${data.platform}`);
      console.log(`Status: ${data.status}`);
      console.log(`IsActive: ${data.isActive}`);
      console.log(`StartTime: ${data.startTime}`);
      console.log(`EndTime: ${data.endTime}`);
      console.log(`Created At: ${data.createdAt}`);
      
      const isDue = data.startTime <= now;
      console.log(`Is Due? ${isDue}`);
      
      if (data.status === 'error' || data.error) {
        console.log(`Error:`, data.error || data.result);
      }
    });

  } catch (error) {
    console.error("Error checking schedules:", error);
  }
}

checkSchedules();

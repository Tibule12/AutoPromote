require("dotenv").config();
const { db, admin } = require("./firebaseAdmin");

async function testFirestore() {
  try {
    console.log("🔄 Testing Firestore connection...");

    // Get the service account details
    const app = admin.app();
    console.log("📝 Project ID:", app.options.projectId);
    console.log("📝 Service Account:", app.options.credential.projectId);

    // Try to list all collections
    console.log("📚 Listing collections...");
    const collections = await db.listCollections();
    for (const collection of collections) {
      console.log(" - Collection:", collection.id);
    }

    console.log("✅ Firestore connection test completed");
  } catch (error) {
    console.error("❌ Error testing Firestore:", error);
    if (error.code === "permission-denied") {
      console.error("💡 Please ensure the service account has the following permissions:");
      console.error(" - Cloud Firestore Admin");
      console.error(" - Firebase Admin SDK Administrator Service Agent");
    }
  }
}

testFirestore();

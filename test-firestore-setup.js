require("dotenv").config();
const { admin } = require("./firebaseAdmin");

async function testFirestoreSetup() {
  try {
    console.log("🔄 Testing Firestore setup...");

    // Get project info
    const project = await admin.app().options;
    console.log("📋 Project Configuration:");
    console.log(" - Project ID:", project.projectId);
    console.log(" - Database URL:", project.databaseURL);
    console.log(" - Storage Bucket:", project.storageBucket);

    // Check auth directly
    console.log("\n🔐 Testing Auth...");
    const auth = admin.auth();
    await auth.listUsers(1);
    console.log("✅ Auth is working");

    // Try a different way to access Firestore
    console.log("\n📚 Testing Firestore access...");
    const db = admin.firestore();
    const docRef = db.collection("test").doc("setup-test");

    console.log("Creating test document...");
    await docRef.set({
      test: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("✅ Successfully wrote to Firestore");
  } catch (error) {
    console.error("❌ Error:", error);

    if (error.code === "permission-denied") {
      console.error("\n💡 Permission denied. Make sure:");
      console.error("1. You have created the Firestore database in the Firebase Console");
      console.error("2. The service account has the necessary permissions");
      console.error("3. You have proper security rules set up");
    } else if (error.code === "not-found") {
      console.error("\n💡 Database not found. Make sure:");
      console.error("1. You have created the Firestore database in the Firebase Console");
      console.error("2. The database is in the correct region");
      console.error("3. The service account has access to the project");
    }
  }
}

testFirestoreSetup();

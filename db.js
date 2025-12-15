const { db } = require("./firebaseAdmin");

const connectDB = async () => {
  console.log("🔗 Testing Firebase connection...");

  try {
    // Test connection by trying to get a document
    const testDoc = await db.collection("_test_connection").doc("test").get();
    console.log("✅ Firebase connection successful");
    return true;
  } catch (error) {
    console.error("❌ Firebase connection test failed:");
    console.error(`   Error: ${error.message}`);
    console.error("💡 Please check:");
    console.error("   - FIREBASE_SERVICE_ACCOUNT in your .env file");
    console.error("   - Your Firebase project is active and accessible");
    console.error("   - Your network connection");
    console.error("⚠️  Proceeding anyway, but database operations may fail");
    return false;
  }
};

module.exports = connectDB;

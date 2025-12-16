const { auth, db, storage } = require("./firebaseAdmin");

async function validateFirebaseSetup() {
  try {
    console.log("🔍 Starting Firebase validation...\n");

    // Test Firestore
    console.log("1️⃣ Testing Firestore Connection...");
    try {
      const testRef = db.collection("_test_").doc("_test_");
      await testRef.set({ test: true });
      await testRef.delete();
      console.log("✅ Firestore connection successful\n");
    } catch (error) {
      console.error("❌ Firestore connection failed:", error);
      return;
    }

    // Test Authentication
    console.log("2️⃣ Testing Firebase Auth...");
    try {
      // List users (limited to 1) to test auth access
      await auth.listUsers(1);
      console.log("✅ Firebase Auth connection successful\n");
    } catch (error) {
      console.error("❌ Firebase Auth connection failed:", error);
      return;
    }

    // Test Storage
    console.log("3️⃣ Testing Firebase Storage...");
    try {
      const bucket = storage.bucket();
      const file = bucket.file("_test_/test.txt");
      await file.save("test");
      await file.delete();
      console.log("✅ Firebase Storage connection successful\n");
    } catch (error) {
      console.error("❌ Firebase Storage connection failed:", error);
      return;
    }

    // Test Security Rules
    console.log("4️⃣ Testing Security Rules...");
    try {
      // Attempt to read from a protected collection without auth
      const protectedRef = db.collection("users").limit(1);
      await protectedRef.get();
      console.warn("⚠️ Warning: Security rules might be too permissive\n");
    } catch (error) {
      if (error.code === "permission-denied") {
        console.log("✅ Security rules are properly configured\n");
      } else {
        console.error("❌ Unexpected error testing security rules:", error);
        return;
      }
    }

    // All tests passed
    console.log("✨ All Firebase services validated successfully!\n");
    console.log("Next steps:");
    console.log("1. Start the backend server: npm run dev");
    console.log("2. Start the frontend: cd frontend && npm start");
    console.log("3. Test user registration and login");
    console.log("4. Test content upload and management");
  } catch (error) {
    console.error("❌ Validation failed:", error);
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateFirebaseSetup();
}

module.exports = validateFirebaseSetup;

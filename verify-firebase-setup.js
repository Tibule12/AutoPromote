const { auth, db } = require("./firebaseAdmin");

async function verifySetup() {
  try {
    console.log("🔍 Verifying Firebase setup...");

    // Test Firebase Auth
    console.log("\n1️⃣ Testing Firebase Auth...");
    const testUser = await auth.getUserByEmail("test@example.com");
    console.log("✅ Firebase Auth is working");
    console.log("Test user found:", testUser.uid);

    // Test Firestore
    console.log("\n2️⃣ Testing Firestore...");
    const userDoc = await db.collection("users").doc(testUser.uid).get();
    console.log("✅ Firestore is working");
    console.log("User data:", userDoc.data());

    // Test custom claims
    console.log("\n3️⃣ Testing Custom Claims...");
    const adminUser = await auth.getUserByEmail("admin@example.com");
    console.log("✅ Admin user found:", adminUser.uid);
    const claims = await auth.getUser(adminUser.uid);
    console.log("Admin claims:", claims.customClaims);

    console.log("\n✅ All Firebase services are configured and working correctly!");
  } catch (error) {
    console.error("\n❌ Error verifying setup:", error);
  }
}

verifySetup()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

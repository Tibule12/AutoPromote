const { auth, db } = require("./firebaseAdmin");

async function createTestUser() {
  try {
    console.log("Creating test user...");

    const email = "test@example.com";
    const password = process.env.TEST_PASSWORD || "Test123!";

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: "Test User",
      emailVerified: true,
    });

    // Store additional user data in Firestore
    await db.collection("users").doc(userRecord.uid).set({
      name: "Test User",
      email: userRecord.email,
      role: "user",
      createdAt: new Date().toISOString(),
    });

    console.log("✅ Test user created successfully");
    console.log("Email:", email);
    console.log("Password: <REDACTED>");
    console.log("User ID:", userRecord.uid);

    // Create an admin user
    const adminEmail = "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin123!";

    const adminRecord = await auth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: "Admin User",
      emailVerified: true,
    });

    // Set custom claims for admin
    await auth.setCustomUserClaims(adminRecord.uid, { role: "admin" });

    // Store admin data in Firestore
    await db.collection("users").doc(adminRecord.uid).set({
      name: "Admin User",
      email: adminRecord.email,
      role: "admin",
      createdAt: new Date().toISOString(),
    });

    console.log("\n✅ Admin user created successfully");
    console.log("Email:", adminEmail);
    console.log("Password: <REDACTED>");
    console.log("User ID:", adminRecord.uid);
  } catch (error) {
    console.error("Error creating test users:", error);
  }
}

createTestUser()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

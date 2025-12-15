const { auth, db } = require("./firebaseAdmin");

async function createSpecificAdmin() {
  try {
    const email = "admin123@gmail.com";
    const password = "AdminAuto123";
    const displayName = "Admin User";

    console.log("Creating admin user:", email);

    // First check if user exists
    try {
      const userRecord = await auth.getUserByEmail(email);
      console.log("Admin user already exists:", userRecord.uid);

      // Update admin claims
      await auth.setCustomUserClaims(userRecord.uid, {
        admin: true,
        role: "admin",
      });
      console.log("Admin claims updated");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Create new admin user
        const userRecord = await auth.createUser({
          email: email,
          password: password,
          emailVerified: true,
          displayName: displayName,
        });

        // Set admin claims
        await auth.setCustomUserClaims(userRecord.uid, {
          admin: true,
          role: "admin",
        });
        console.log("New admin user created:", userRecord.uid);

        // Create Firestore user document
        await db.collection("users").doc(userRecord.uid).set({
          email: email,
          name: displayName,
          role: "admin",
          isAdmin: true,
          createdAt: new Date().toISOString(),
        });
        console.log("Admin user document created in Firestore");
      } else {
        throw error;
      }
    }

    console.log("✅ Admin user setup complete!");
    console.log("📧 Email:", email);
    console.log("🔒 Password:", password);
    console.log("👤 Role: Admin");
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

// Execute the function when this script is run directly
if (require.main === module) {
  console.log("🚀 Creating specific admin user...");
  createSpecificAdmin()
    .then(() => {
      console.log("✅ Admin user creation completed successfully");
      process.exit(0);
    })
    .catch(err => {
      console.error("❌ Fatal error:", err);
      process.exit(1);
    });
} else {
  // Export for use in other modules
  module.exports = { createSpecificAdmin };
}

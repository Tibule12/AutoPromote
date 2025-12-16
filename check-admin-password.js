const { auth } = require("./firebaseAdmin");

async function checkAdminPassword() {
  try {
    const email = "admin123@gmail.com";

    console.log("Checking admin user:", email);

    // Get user record
    const userRecord = await auth.getUserByEmail(email);
    console.log("User found:", userRecord.uid);
    console.log("Display name:", userRecord.displayName);
    console.log("Email verified:", userRecord.emailVerified);
    console.log("Disabled:", userRecord.disabled);

    // Update password to AdminAuto123
    console.log("Updating password to AdminAuto123...");
    await auth.updateUser(userRecord.uid, {
      password: "AdminAuto123",
    });

    console.log("✅ Password updated successfully!");
    console.log("📧 Email:", email);
    console.log("🔒 Password:", "AdminAuto123");

    // Verify admin claims
    const updatedUser = await auth.getUser(userRecord.uid);
    console.log("Admin claims:", updatedUser.customClaims);
  } catch (error) {
    console.error("❌ Error:", error);
    if (error.code === "auth/user-not-found") {
      console.log("User not found, creating new admin user...");

      // Create new user
      const userRecord = await auth.createUser({
        email: "admin123@gmail.com",
        password: "AdminAuto123",
        displayName: "Admin User",
        emailVerified: true,
      });

      // Set admin claims
      await auth.setCustomUserClaims(userRecord.uid, {
        admin: true,
        role: "admin",
      });

      console.log("✅ New admin user created!");
      console.log("📧 Email:", "admin123@gmail.com");
      console.log("🔒 Password:", "AdminAuto123");
    }
  }
}

if (require.main === module) {
  console.log("🔍 Checking admin user...");
  checkAdminPassword()
    .then(() => {
      console.log("✅ Admin check completed");
      process.exit(0);
    })
    .catch(err => {
      console.error("❌ Fatal error:", err);
      process.exit(1);
    });
}

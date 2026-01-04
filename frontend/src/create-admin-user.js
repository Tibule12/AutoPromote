const admin = require("./firebaseAdmin");

async function createAdminUser() {
  try {
    // First check if user exists
    const email = "admin12@gmail.com";
    try {
      const userRecord = await admin.auth.getUserByEmail(email);
      console.log("Admin user already exists:", userRecord.uid);

      // Update admin claims if needed
      await admin.auth.setCustomUserClaims(userRecord.uid, { admin: true });
      console.log("Admin claims updated");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Create new admin user
        const userRecord = await admin.auth.createUser({
          email: email,
          password: "Admin12345", // Change this immediately after creation
          emailVerified: true,
        });

        // Set admin claims
        await admin.auth.setCustomUserClaims(userRecord.uid, { admin: true });
        console.log("New admin user created:", userRecord.uid);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("Error managing admin user:", error);
  }
}

createAdminUser().then(() => process.exit());

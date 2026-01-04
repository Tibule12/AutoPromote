const { auth } = require("./firebaseAdmin");

async function createAdminUser() {
  try {
    // First check if user exists
    const email = "admin@autopromote.com";
    try {
      const userRecord = await auth.getUserByEmail(email);
      console.log("Admin user already exists:", userRecord.uid);

      // Update admin claims if needed
      await auth.setCustomUserClaims(userRecord.uid, { admin: true, role: "admin" });
      console.log("Admin claims updated");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Create new admin user
        const adminPassword = process.env.ADMIN_PASSWORD || "AdminPass123!";
        const userRecord = await auth.createUser({
          email: email,
          password: adminPassword, // Change this immediately after creation or set ADMIN_PASSWORD in your env
          emailVerified: true,
          displayName: "Admin User",
        });

        // Set admin claims
        await auth.setCustomUserClaims(userRecord.uid, { admin: true, role: "admin" });
        console.log("New admin user created:", userRecord.uid);

        // Also create Firestore user document
        try {
          const { db } = require("./firebaseAdmin");
          await db.collection("users").doc(userRecord.uid).set({
            email: email,
            name: "Admin User",
            role: "admin",
            isAdmin: true,
            createdAt: new Date().toISOString(),
          });
          console.log("Admin user document created in Firestore");
        } catch (dbError) {
          console.error("Error creating Firestore document:", dbError);
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("Error managing admin user:", error);
  }
}

// Execute the function when this script is run directly
if (require.main === module) {
  console.log("Creating admin user...");
  createAdminUser()
    .then(() => {
      console.log("Admin user setup complete");
      process.exit();
    })
    .catch(err => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
} else {
  // Export for use in other modules
  module.exports = { createAdminUser };
}

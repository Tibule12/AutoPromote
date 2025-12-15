const { auth } = require("./firebaseAdmin");

async function createCustomAdminUser() {
  try {
    // Use a custom email that you control
    const email = "admin@autopromote.com";
    const password = "AutoAdmin@2025";

    try {
      // Check if user already exists
      try {
        const existingUser = await auth.getUserByEmail(email);
        console.log("Custom admin already exists:", existingUser.uid);

        // Update admin claims
        await auth.setCustomUserClaims(existingUser.uid, { admin: true });
        console.log("Admin claims updated for custom admin user");

        // Reset password
        await auth.updateUser(existingUser.uid, {
          password: password,
          emailVerified: true,
        });
        console.log("Password updated for custom admin user");
      } catch (userError) {
        if (userError.code === "auth/user-not-found") {
          // Create new admin user
          const userRecord = await auth.createUser({
            email: email,
            password: password,
            emailVerified: true,
            displayName: "AutoPromote Admin",
          });

          // Set admin claims
          await auth.setCustomUserClaims(userRecord.uid, { admin: true });
          console.log("Custom admin user created successfully:");
          console.log("User ID:", userRecord.uid);
          console.log("Email:", email);
          console.log("Password:", password);
          console.log(
            "IMPORTANT: Save these credentials and change the password after first login"
          );
        } else {
          throw userError;
        }
      }
    } catch (error) {
      console.error("Error creating/updating custom admin user:", error);
    }
  } catch (error) {
    console.error("Fatal error in custom admin user creation:", error);
  }
}

createCustomAdminUser().then(() => process.exit());

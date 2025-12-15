const { auth } = require("./firebaseAdmin");

async function createNewAdminUser() {
  try {
    // New admin user details
    const email = "newadmin@example.com";
    const password = "SecureAdmin@123";

    try {
      // Check if user already exists
      try {
        const existingUser = await auth.getUserByEmail(email);
        console.log("User already exists with this email:", existingUser.uid);

        // Update admin claims
        await auth.setCustomUserClaims(existingUser.uid, { admin: true });
        console.log("Admin claims updated for existing user");

        // Reset password if needed
        await auth.updateUser(existingUser.uid, {
          password: password,
          emailVerified: true,
        });
        console.log("Password updated for user");
      } catch (userError) {
        if (userError.code === "auth/user-not-found") {
          // Create new admin user
          const userRecord = await auth.createUser({
            email: email,
            password: password,
            emailVerified: true,
            displayName: "System Administrator",
          });

          // Set admin claims
          await auth.setCustomUserClaims(userRecord.uid, { admin: true });
          console.log("New admin user created successfully with ID:", userRecord.uid);
          console.log("Email:", email);
          console.log("Password:", password);
          console.log(
            "IMPORTANT: Please save these credentials and change the password after first login"
          );
        } else {
          throw userError;
        }
      }
    } catch (error) {
      console.error("Error creating/updating admin user:", error);
    }
  } catch (error) {
    console.error("Fatal error in admin user creation:", error);
  }
}

// Also create a secondary admin user as backup
async function createBackupAdminUser() {
  try {
    const email = "admin_backup@example.com";
    const password = "BackupAdmin@456";

    try {
      const existingUser = await auth.getUserByEmail(email);
      console.log("Backup admin already exists:", existingUser.uid);
      await auth.setCustomUserClaims(existingUser.uid, { admin: true });
      console.log("Admin claims updated for backup admin");
    } catch (userError) {
      if (userError.code === "auth/user-not-found") {
        const userRecord = await auth.createUser({
          email: email,
          password: password,
          emailVerified: true,
          displayName: "Backup Administrator",
        });

        await auth.setCustomUserClaims(userRecord.uid, { admin: true });
        console.log("Backup admin user created with ID:", userRecord.uid);
        console.log("Email:", email);
        console.log("Password:", password);
      } else {
        throw userError;
      }
    }
  } catch (error) {
    console.error("Error creating backup admin:", error);
  }
}

async function run() {
  await createNewAdminUser();
  await createBackupAdminUser();
  console.log("Admin user creation process completed");
}

run().then(() => process.exit());

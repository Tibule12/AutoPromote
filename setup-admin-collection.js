const { db, auth } = require("./firebaseAdmin");

/**
 * This script creates a dedicated 'admins' collection in Firestore for admin users
 * and ensures the admin user has proper authentication with admin privileges.
 */
async function setupAdminCollection() {
  try {
    console.log("Setting up dedicated admin collection in Firestore...");

    // 1. Define admin user credentials
    const adminEmail = "admin123@gmail.com";
    const adminPassword = "Admin12345";
    const adminName = "System Administrator";

    // 2. Create or update admin user in Firebase Authentication
    let adminUid;
    try {
      // Check if admin user already exists in Authentication
      const userRecord = await auth.getUserByEmail(adminEmail);
      adminUid = userRecord.uid;
      console.log(`Admin user already exists in Authentication with UID: ${adminUid}`);

      // Update admin claims
      await auth.setCustomUserClaims(adminUid, {
        admin: true,
        role: "admin",
        accessLevel: "super",
      });
      console.log("Updated admin custom claims");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Create new admin user in Authentication
        const newUser = await auth.createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: adminName,
          emailVerified: true,
        });

        adminUid = newUser.uid;
        console.log(`Created new admin user in Authentication with UID: ${adminUid}`);

        // Set admin claims
        await auth.setCustomUserClaims(adminUid, {
          admin: true,
          role: "admin",
          accessLevel: "super",
        });
        console.log("Set admin custom claims");
      } else {
        throw error;
      }
    }

    // 3. Create admins collection if it doesn't exist
    // (In Firestore, collections are created implicitly when the first document is added)

    // 4. Add or update admin document in admins collection
    const adminData = {
      uid: adminUid,
      email: adminEmail,
      name: adminName,
      role: "admin",
      isAdmin: true,
      accessLevel: "super",
      permissions: [
        "manage_users",
        "manage_content",
        "manage_promotions",
        "view_analytics",
        "manage_settings",
      ],
      lastLogin: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("admins").doc(adminUid).set(adminData, { merge: true });
    console.log("Admin document created/updated in admins collection");

    // 5. Create admin_settings collection with default settings
    const settingsData = {
      dashboardLayout: "default",
      defaultView: "overview",
      notificationsEnabled: true,
      emailNotifications: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("admin_settings").doc("default").set(settingsData);
    console.log("Default admin settings created");

    // 6. Create admin_logs collection for auditing
    await db.collection("admin_logs").doc("setup").set({
      action: "admin_setup",
      performedBy: "system",
      timestamp: new Date().toISOString(),
      details: "Initial admin collections setup",
    });
    console.log("Admin logs collection created");

    console.log("\nAdmin collection setup completed successfully!");
    console.log("Admin login credentials:");
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log("\nIMPORTANT: Change this password immediately after first login!");
  } catch (error) {
    console.error("Error setting up admin collection:", error);
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupAdminCollection()
    .then(() => {
      console.log("Setup process complete");
      process.exit(0);
    })
    .catch(error => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
} else {
  // Export for use in other modules
  module.exports = { setupAdminCollection };
}

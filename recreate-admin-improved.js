// recreate-admin-improved.js
// Script to recreate the admin user with proper credentials
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Initialize Firebase Admin if not already initialized
try {
  admin.app();
  console.log("Firebase Admin already initialized");
} catch (error) {
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://autopromote-cc6d3.firebaseio.com",
  });
  console.log("Firebase Admin initialized");
}

// Admin user details
const adminEmail = "admin123@gmail.com";
const adminPassword = "admin123456";
const adminName = "Admin User";

async function recreateAdmin() {
  let existingUid = null;

  // Step 1: Check if the admin user exists and delete if necessary
  console.log(`\nStep 1: Checking if admin user exists: ${adminEmail}`);
  try {
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    existingUid = userRecord.uid;
    console.log(`Admin user exists with UID: ${existingUid}`);

    // Delete from Firestore first
    console.log("Deleting admin from Firestore collections...");
    try {
      await admin.firestore().collection("admins").doc(existingUid).delete();
      console.log("- Deleted from admins collection");
    } catch (err) {
      console.log("- No admin record to delete in admins collection");
    }

    try {
      await admin.firestore().collection("users").doc(existingUid).delete();
      console.log("- Deleted from users collection");
    } catch (err) {
      console.log("- No admin record to delete in users collection");
    }

    // Then delete from Auth
    console.log(`Deleting admin from Firebase Auth...`);
    await admin.auth().deleteUser(existingUid);
    console.log(`Admin user deleted from Firebase Auth`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      console.log("Admin user does not exist in Firebase Auth");
    } else {
      console.error("Error checking admin user:", error.message);
      throw error;
    }
  }

  // Wait a moment to ensure Firebase updates
  console.log("Waiting for Firebase to update...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Create the new admin user
  console.log(`\nStep 2: Creating new admin user: ${adminEmail}`);
  try {
    const userRecord = await admin.auth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: adminName,
      emailVerified: true,
    });

    const uid = userRecord.uid;
    console.log(`Admin user created with UID: ${uid}`);

    // Step 3: Set custom claims
    console.log(`\nStep 3: Setting admin custom claims for user: ${uid}`);
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log("Admin custom claims set successfully");

    // Step 4: Create Firestore records
    console.log(`\nStep 4: Creating Firestore records for admin user: ${uid}`);

    // Create admin in admins collection
    await admin.firestore().collection("admins").doc(uid).set({
      email: adminEmail,
      name: adminName,
      role: "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Admin record created in admins collection");

    // Create user in users collection
    await admin.firestore().collection("users").doc(uid).set({
      email: adminEmail,
      displayName: adminName,
      role: "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Admin record created in users collection");

    // Step 5: Verify the setup
    console.log(`\nStep 5: Verifying admin user setup`);
    // Get the user and check claims
    const updatedUser = await admin.auth().getUser(uid);
    console.log("User verified in Auth:", updatedUser.uid);
    console.log("Admin claims:", updatedUser.customClaims);

    // Check Firestore records
    const adminDoc = await admin.firestore().collection("admins").doc(uid).get();
    console.log("Admin record in Firestore exists:", adminDoc.exists);

    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    console.log("User record in Firestore exists:", userDoc.exists);

    console.log(`\n✅ Admin user setup completed successfully`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);

    // Save credentials to file for reference
    const credentials = `Admin User Credentials:\nEmail: ${adminEmail}\nPassword: ${adminPassword}\nUID: ${uid}\nCreated: ${new Date().toISOString()}\n`;
    fs.appendFileSync(path.join(__dirname, "admin_credentials.txt"), credentials);
    console.log("Credentials saved to admin_credentials.txt");

    return uid;
  } catch (error) {
    console.error("Error creating admin user:", error);
    throw error;
  }
}

// Run the script
recreateAdmin()
  .then(uid => {
    console.log(`\nAdmin recreation completed successfully. UID: ${uid}`);
    setTimeout(() => process.exit(0), 2000);
  })
  .catch(error => {
    console.error("Admin recreation failed:", error);
    process.exit(1);
  });

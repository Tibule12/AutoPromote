// check-firebase-setup.js
const admin = require("firebase-admin");

try {
  // Initialize admin SDK with service account
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin SDK initialized successfully");
  console.log("Project ID:", serviceAccount.project_id);

  // Function to check Firebase Authentication setup
  async function checkAuth() {
    try {
      // Check if we can list users (this tests auth permissions)
      console.log("\nTesting Firebase Authentication...");
      const result = await admin.auth().listUsers(1);
      console.log("✅ Authentication is working - was able to list users");

      if (result.users.length > 0) {
        console.log("Sample user:", {
          uid: result.users[0].uid,
          email: result.users[0].email,
          verified: result.users[0].emailVerified,
        });
      } else {
        console.log("No users found in your Firebase project");
      }

      return true;
    } catch (error) {
      console.error("❌ Authentication check failed:", error.message);
      if (error.code === "auth/invalid-credential") {
        console.log("Your service account may not have proper permissions to use Firebase Auth");
      }
      return false;
    }
  }

  // Function to check Firestore setup
  async function checkFirestore() {
    try {
      console.log("\nTesting Firestore...");
      const db = admin.firestore();

      // Try to access a collection
      const snapshot = await db.collection("users").limit(1).get();
      console.log("✅ Firestore is working - was able to query users collection");
      console.log("Found", snapshot.size, "users in the collection");

      return true;
    } catch (error) {
      console.error("❌ Firestore check failed:", error.message);
      return false;
    }
  }

  // Run checks
  async function runChecks() {
    console.log("=============================================");
    console.log("FIREBASE SETUP VERIFICATION");
    console.log("=============================================");

    const authWorking = await checkAuth();
    const firestoreWorking = await checkFirestore();

    console.log("\n=============================================");
    console.log("VERIFICATION RESULTS:");
    console.log("=============================================");
    console.log("Firebase Authentication:", authWorking ? "✅ WORKING" : "❌ NOT WORKING");
    console.log("Firestore Database:", firestoreWorking ? "✅ WORKING" : "❌ NOT WORKING");

    if (!authWorking) {
      console.log("\nTROUBLESHOOTING AUTHENTICATION:");
      console.log("1. Check if Authentication is enabled in your Firebase Console");
      console.log(
        "   - Go to: https://console.firebase.google.com/project/" +
          serviceAccount.project_id +
          "/authentication/users"
      );
      console.log("   - Make sure Email/Password provider is enabled");
      console.log("2. Verify your service account has proper permissions");
      console.log("3. Try recreating the service account key");
    }

    if (!firestoreWorking) {
      console.log("\nTROUBLESHOOTING FIRESTORE:");
      console.log("1. Check if Firestore is enabled in your Firebase Console");
      console.log(
        "   - Go to: https://console.firebase.google.com/project/" +
          serviceAccount.project_id +
          "/firestore"
      );
      console.log("2. Make sure you've created the necessary collections");
    }

    return authWorking && firestoreWorking;
  }

  // Run all checks
  runChecks()
    .then(allWorking => {
      if (allWorking) {
        console.log("\n✅ All Firebase services are working correctly!");
        console.log("If you're still having authentication issues in your app, check:");
        console.log("1. Your client API key (it might be for a different project)");
        console.log("2. Make sure Email/Password sign-in is enabled in the Firebase Console");
        console.log("3. Verify your frontend code is correctly initializing Firebase");
      } else {
        console.log("\n⚠️ Some Firebase services are not working correctly");
        console.log("Please follow the troubleshooting steps above");
      }
    })
    .catch(error => {
      console.error("Error running checks:", error);
    });
} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK:", error);
}

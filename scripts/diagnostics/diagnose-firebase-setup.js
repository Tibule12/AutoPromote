const { db, auth, admin } = require("./firebaseAdmin");

async function diagnoseFirebaseSetup() {
  let firestoreError = null;
  try {
    console.log("🔍 Diagnosing Firebase Setup...\n");

    // 1. Check Firebase Admin initialization
    console.log("1. Firebase Admin Status:");
    console.log("   - Apps initialized:", admin.apps.length);
    console.log("   - Project ID:", admin.app().options.projectId);
    console.log("   - Database URL:", admin.app().options.databaseURL);
    console.log("   ✅ Firebase Admin initialized successfully\n");

    // 2. Test Firestore connection
    console.log("2. Testing Firestore Connection:");
    try {
      // Try to get a reference to the root collection
      const collections = await db.listCollections();
      console.log("   - Collections found:", collections.length);
      console.log(
        "   - Collection names:",
        collections.map(col => col.id)
      );
      console.log("   ✅ Firestore connection successful\n");
    } catch (err) {
      firestoreError = err;
      console.log("   ❌ Firestore connection failed");
      console.log("   Error code:", firestoreError.code);
      console.log("   Error message:", firestoreError.message);
      console.log(
        "   This indicates the Firestore database may not exist or permissions are insufficient\n"
      );

      // Try to create a test document to see if we can write
      console.log("3. Testing Firestore write permissions:");
      try {
        const testDoc = await db.collection("test").doc("diagnostic").set({
          timestamp: new Date().toISOString(),
          message: "Diagnostic test document",
        });
        console.log("   ✅ Firestore write successful");
        console.log("   Test document created at: test/diagnostic\n");
      } catch (writeError) {
        console.log("   ❌ Firestore write failed");
        console.log("   Error code:", writeError.code);
        console.log("   Error message:", writeError.message);
        console.log("   This indicates insufficient permissions or database not initialized\n");
      }
    }

    // 3. Test Auth service
    console.log("4. Testing Firebase Auth:");
    try {
      // Try to list users (this will fail if no users exist, but should not give permission error)
      const listUsersResult = await auth.listUsers(1);
      console.log("   - Users found:", listUsersResult.users.length);
      console.log("   ✅ Firebase Auth connection successful\n");
    } catch (authError) {
      console.log("   ❌ Firebase Auth connection failed");
      console.log("   Error code:", authError.code);
      console.log("   Error message:", authError.message);
      console.log("   This may indicate insufficient Auth permissions\n");
    }

    // 4. Summary and recommendations
    console.log("📋 DIAGNOSTIC SUMMARY:");
    console.log("======================");

    if (firestoreError) {
      console.log("❌ ISSUE FOUND: Firestore database appears to be missing or inaccessible");
      console.log("   RECOMMENDATIONS:");
      console.log("   1. Go to Firebase Console: https://console.firebase.google.com/");
      console.log("   2. Select project: autopromote-464de");
      console.log("   3. Navigate to Firestore Database");
      console.log("   4. Create a Firestore database if it doesn't exist");
      console.log('   5. Choose "Start in test mode" or configure security rules');
      console.log("   6. Ensure the service account has Firestore permissions");
    } else {
      console.log("✅ Firebase setup appears to be working correctly");
      console.log("   You can proceed with creating collections and user documents");
    }
  } catch (error) {
    console.error("❌ Diagnostic failed with error:", error);
    console.error("Stack trace:", error.stack);
  } finally {
    process.exit(0);
  }
}

diagnoseFirebaseSetup();

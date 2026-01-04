const { db, auth, admin } = require("./firebaseAdmin");

async function testFirestoreConnection() {
  try {
    console.log("🔍 Testing basic Firestore connection...\n");

    // 1. Check if Firebase Admin is initialized
    console.log("1. Firebase Admin Status:");
    console.log("   - Apps initialized:", admin.apps.length);
    console.log("   - Project ID:", admin.app().options.projectId);
    console.log("   ✅ Firebase Admin initialized\n");

    // 2. Try to get Firestore instance
    console.log("2. Firestore Instance:");
    console.log("   - Firestore object exists:", !!db);
    console.log("   - Firestore type:", typeof db);
    console.log("   ✅ Firestore instance created\n");

    // 3. Try to access the root of Firestore (this should work even with restrictive rules)
    console.log("3. Testing Firestore root access:");
    try {
      // This should work if Firestore exists and service account has basic access
      const rootRef = db.collection("_root_test_");
      console.log("   ✅ Can create collection reference");
    } catch (error) {
      console.log("   ❌ Cannot create collection reference");
      console.log("   Error:", error.message);
    }

    // 4. Try to list collections (this might fail with restrictive rules)
    console.log("\n4. Testing collection listing:");
    try {
      const collections = await db.listCollections();
      console.log("   ✅ Can list collections");
      console.log("   Collections found:", collections.length);
      if (collections.length > 0) {
        console.log(
          "   Collection names:",
          collections.map(col => col.id)
        );
      }
    } catch (error) {
      console.log("   ❌ Cannot list collections");
      console.log("   Error code:", error.code);
      console.log("   Error message:", error.message);

      if (error.code === "PERMISSION_DENIED") {
        console.log("   📋 This indicates Firestore rules are blocking access");
      } else if (error.code === "NOT_FOUND") {
        console.log("   📋 This indicates the Firestore database may not exist");
      }
    }

    // 5. Try to read from admin collection (which we know exists from the link)
    console.log("\n5. Testing admin collection access:");
    try {
      const adminDoc = await db.collection("admin").doc("WjeGjo77sFdJqz5pBU4V").get();
      if (adminDoc.exists) {
        console.log("   ✅ Can read admin collection");
        console.log("   Admin data keys:", Object.keys(adminDoc.data()));
      } else {
        console.log("   ❌ Admin document not found");
      }
    } catch (error) {
      console.log("   ❌ Cannot access admin collection");
      console.log("   Error code:", error.code);
      console.log("   Error message:", error.message);
    }
  } catch (error) {
    console.error("❌ Connection test failed:", error);
  } finally {
    process.exit(0);
  }
}

testFirestoreConnection();

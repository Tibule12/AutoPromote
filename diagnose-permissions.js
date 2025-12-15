const { db, auth, admin } = require("./firebaseAdmin");

async function diagnosePermissions() {
  try {
    console.log("🔍 Diagnosing Firestore Permissions...\n");

    // 1. Check Firebase Admin initialization
    console.log("1. Firebase Admin Status:");
    console.log("   - Apps initialized:", admin.apps.length);
    console.log("   - Project ID:", admin.app().options.projectId);
    console.log("   ✅ Firebase Admin initialized\n");

    // 2. Check service account details
    console.log("2. Service Account Details:");
    const serviceAccount = require("./serviceAccountKey.json");
    console.log("   - Project ID:", serviceAccount.project_id);
    console.log("   - Client Email:", serviceAccount.client_email);
    console.log("   - Private Key exists:", !!serviceAccount.private_key);
    console.log("   ✅ Service account credentials loaded\n");

    // 3. Try to list collections (this will fail if permissions are wrong)
    console.log("3. Testing collection listing:");
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
        console.log("   📋 SOLUTION: Firestore rules are blocking access");
        console.log(
          "   Go to: https://console.firebase.google.com/project/autopromote-464de/firestore/rules"
        );
        console.log("   Make sure rules are:");
        console.log("   ```");
        console.log("   rules_version = '2';");
        console.log("   service cloud.firestore {");
        console.log("     match /databases/{database}/documents {");
        console.log("       match /{document=**} {");
        console.log("         allow read, write: if true;");
        console.log("       }");
        console.log("     }");
        console.log("   }");
        console.log("   ```");
        console.log('   Then click "Publish"');
      } else if (error.code === "NOT_FOUND") {
        console.log("   📋 SOLUTION: Service account lacks IAM permissions");
        console.log("   Go to: https://console.cloud.google.com/iam-admin/iam");
        console.log("   Find: firebase-adminsdk-fbsvc@autopromote-464de.iam.gserviceaccount.com");
        console.log("   Add role: Cloud Datastore User");
      }
    }

    // 4. Try to access the admin collection that we know exists
    console.log("\n4. Testing admin collection access:");
    try {
      const adminDoc = await db.collection("admin").doc("WjeGjo77sFdJqz5pBU4V").get();
      if (adminDoc.exists) {
        console.log("   ✅ Can access admin collection");
        console.log("   Admin data keys:", Object.keys(adminDoc.data()));
      } else {
        console.log("   ❌ Admin document not found");
      }
    } catch (error) {
      console.log("   ❌ Cannot access admin collection");
      console.log("   Error code:", error.code);
      console.log("   Error message:", error.message);
    }

    // 5. Try to create a test document
    console.log("\n5. Testing document creation:");
    try {
      const testRef = db.collection("permissions_test").doc("test_doc");
      await testRef.set({
        timestamp: new Date().toISOString(),
        message: "Testing service account permissions",
      });
      console.log("   ✅ Can create documents");

      // Clean up
      await testRef.delete();
      console.log("   ✅ Can delete documents");
    } catch (error) {
      console.log("   ❌ Cannot create/delete documents");
      console.log("   Error code:", error.code);
      console.log("   Error message:", error.message);
    }
  } catch (error) {
    console.error("❌ Diagnosis failed:", error);
  } finally {
    process.exit(0);
  }
}

diagnosePermissions();

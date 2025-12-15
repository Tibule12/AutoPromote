const { db, auth, admin } = require("./firebaseAdmin");

async function testFirestoreWrite() {
  try {
    console.log("🔍 Testing Firestore write operations...\n");

    // 1. Try to create a simple test document
    console.log("1. Testing document creation:");
    try {
      const testDocRef = db.collection("test_collection").doc("test_doc");
      await testDocRef.set({
        message: "Test document created successfully",
        timestamp: new Date().toISOString(),
        test: true,
      });
      console.log("   ✅ Document created successfully");
      console.log("   Document path: test_collection/test_doc");

      // Try to read it back
      const doc = await testDocRef.get();
      if (doc.exists) {
        console.log("   ✅ Document read successfully");
        console.log("   Data:", JSON.stringify(doc.data(), null, 2));
      }

      // Clean up
      await testDocRef.delete();
      console.log("   ✅ Document deleted successfully");
    } catch (error) {
      console.log("   ❌ Document operation failed");
      console.log("   Error code:", error.code);
      console.log("   Error message:", error.message);

      if (error.code === "PERMISSION_DENIED") {
        console.log("   📋 SOLUTION: Firestore rules are blocking writes");
        console.log(
          "   Go to: https://console.firebase.google.com/project/autopromote-cc6d3/firestore/rules"
        );
        console.log("   Update rules to:");
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
      }
    }

    // 2. Try to access the admin collection that we know exists
    console.log("\n2. Testing admin collection access:");
    try {
      const adminDoc = await db.collection("admin").doc("WjeGjo77sFdJqz5pBU4V").get();
      if (adminDoc.exists) {
        console.log("   ✅ Admin document accessed successfully");
        console.log("   Admin data keys:", Object.keys(adminDoc.data()));
      } else {
        console.log("   ❌ Admin document not found");
      }
    } catch (error) {
      console.log("   ❌ Admin collection access failed");
      console.log("   Error code:", error.code);
      console.log("   Error message:", error.message);
    }
  } catch (error) {
    console.error("❌ Write test failed:", error);
  } finally {
    process.exit(0);
  }
}

testFirestoreWrite();

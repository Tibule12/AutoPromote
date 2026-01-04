require("dotenv").config();
const { db } = require("./firebaseAdmin");

async function testRead() {
  try {
    console.log("🔄 Testing Firestore write and read...");

    // First create a test document
    const testData = {
      message: "Hello Firestore",
      timestamp: new Date(),
    };

    console.log("📝 Creating test document...");
    await db.collection("test").doc("test-doc").set(testData);
    console.log("✅ Test document created successfully");

    // Now try to read it back
    console.log("🔄 Reading test document...");
    const docRef = await db.collection("test").doc("test-doc").get();

    if (docRef.exists) {
      console.log("📊 Document data:", docRef.data());
      console.log("✅ Firestore read successful");
    } else {
      console.log("❌ Document does not exist");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testRead();

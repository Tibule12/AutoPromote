const { db } = require("./firebaseAdmin");

async function testFirestore() {
  try {
    console.log("Testing Firestore connection...");

    // Write a test document
    const testDocRef = db.collection("testCollection").doc("testDoc");
    await testDocRef.set({
      message: "Hello, Firestore!",
      timestamp: new Date(),
    });
    console.log("Document written successfully.");

    // Read the test document
    const doc = await testDocRef.get();
    if (doc.exists) {
      console.log("Document read successfully:", doc.data());
    } else {
      console.error("Document not found after write.");
    }

    // Delete the test document
    await testDocRef.delete();
    console.log("Document deleted successfully.");

    console.log("Firestore test completed successfully.");
  } catch (error) {
    console.error("Error during Firestore test:", error);
  }
}

testFirestore();

const { db } = require("./firebaseAdmin");

async function testCollections() {
  try {
    console.log("Testing Firestore collections...");

    // Check if content collection exists
    const contentSnapshot = await db.collection("content").limit(1).get();
    console.log(`Content collection exists: ${!contentSnapshot.empty}`);
    console.log(`Content documents count: ${contentSnapshot.size}`);

    // Check if users collection exists
    const usersSnapshot = await db.collection("users").limit(1).get();
    console.log(`Users collection exists: ${!usersSnapshot.empty}`);
    console.log(`Users documents count: ${usersSnapshot.size}`);

    // Check if admins collection exists
    const adminsSnapshot = await db.collection("admins").limit(1).get();
    console.log(`Admins collection exists: ${!adminsSnapshot.empty}`);
    console.log(`Admins documents count: ${adminsSnapshot.size}`);

    // List all collections
    const collections = await db.listCollections();
    console.log("All collections:");
    collections.forEach(collection => {
      console.log(`- ${collection.id}`);
    });
  } catch (error) {
    console.error("Error testing collections:", error);
  }
}

testCollections();

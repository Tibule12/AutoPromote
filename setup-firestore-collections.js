const { db } = require("./firebaseAdmin");

async function setupCollections() {
  try {
    // Create test user document
    await db.collection("users").doc("testuser123").set({
      id: "testuser123",
      name: "Test User",
      email: "test@example.com",
      role: "user",
      createdAt: new Date().toISOString(),
    });

    console.log("Created test user document");

    // Create test content document
    const contentDoc = await db.collection("content").add({
      userId: "testuser123",
      title: "Test Content",
      type: "article",
      url: "https://example.com/test-article",
      description: "This is a test article",
      createdAt: new Date().toISOString(),
    });

    console.log("Created test content document");

    // Create test analytics document
    await db.collection("analytics").add({
      userId: "testuser123",
      contentId: contentDoc.id,
      views: 0,
      clicks: 0,
      createdAt: new Date().toISOString(),
    });

    console.log("Created test analytics document");

    // Create test promotion document
    await db.collection("promotions").add({
      contentId: contentDoc.id,
      userId: "testuser123",
      status: "scheduled",
      platform: "twitter",
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      createdAt: new Date().toISOString(),
    });

    console.log("Created test promotion document");

    console.log("Successfully created all collections and test documents");
  } catch (error) {
    console.error("Error setting up collections:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

setupCollections();

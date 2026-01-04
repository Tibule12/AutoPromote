const { db } = require("./firebaseAdmin");

async function createTestContent() {
  console.log("🔧 Creating test content in Firestore...");

  try {
    // Create a test content document
    const testContent = {
      id: "test-content-1",
      title: "Test Video",
      type: "video",
      description: "This is a test video for content analysis",
      duration: 180,
      quality: "HD",
      tags: ["test", "video", "analysis"],
      userId: "test-user-id",
      url: "https://example.com/test-video",
      status: "active",
      views: 0,
      clicks: 0,
      revenue: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("content").doc("test-content-1").set(testContent);
    console.log("✅ Test content created successfully");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

createTestContent();

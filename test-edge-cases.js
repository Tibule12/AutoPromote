const { admin, db } = require("./firebaseAdmin");

async function testEdgeCases() {
  try {
    // Test 1: Content with existing landingPageUrl should skip generation
    console.log("Test 1: Content with existing landingPageUrl");
    const contentId1 = `test-existing-${Date.now()}`;
    const contentRef1 = db.collection("content").doc(contentId1);

    await contentRef1.set({
      title: "Test Existing",
      type: "video",
      url: "https://example.com/video.mp4",
      user_id: "test-user-id",
      status: "approved",
      landingPageUrl: "https://existing.example.com",
    });

    await contentRef1.update({
      landingPageRequestedAt: admin.firestore.Timestamp.now(),
    });

    console.log("Set landingPageRequestedAt for content with existing URL");

    // Test 2: Content without landingPageRequestedAt initially, then set it
    console.log("Test 2: Content without initial landingPageRequestedAt");
    const contentId2 = `test-no-initial-${Date.now()}`;
    const contentRef2 = db.collection("content").doc(contentId2);

    await contentRef2.set({
      title: "Test No Initial",
      type: "video",
      url: "https://example.com/video2.mp4",
      user_id: "test-user-id",
      status: "approved",
    });

    await contentRef2.update({
      landingPageRequestedAt: admin.firestore.Timestamp.now(),
    });

    console.log("Set landingPageRequestedAt for content without initial field");

    // Wait for processing
    console.log("Waiting 10 seconds for functions to process...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check results
    const doc1 = await contentRef1.get();
    const doc2 = await contentRef2.get();

    console.log(
      "Test 1 result - existing URL should remain unchanged:",
      doc1.data().landingPageUrl === "https://existing.example.com"
    );
    console.log("Test 2 result - new URL generated:", !!doc2.data().landingPageUrl);
  } catch (error) {
    console.error("Error in edge cases test:", error);
  }
}

testEdgeCases();

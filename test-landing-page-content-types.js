const { admin, db } = require("./firebaseAdmin");

async function testContentTypes() {
  try {
    const contentTypes = [
      { type: "image", url: "https://example.com/image.jpg" },
      { type: "audio", url: "https://example.com/audio.mp3" },
    ];

    for (const content of contentTypes) {
      const contentId = `test-${content.type}-${Date.now()}`;
      const contentRef = db.collection("content").doc(contentId);

      console.log(`Creating ${content.type} content: ${contentId}`);
      await contentRef.set({
        title: `Test ${content.type}`,
        type: content.type,
        url: content.url,
        user_id: "test-user-id",
        status: "approved",
      });

      await contentRef.update({
        landingPageRequestedAt: admin.firestore.Timestamp.now(),
      });

      console.log(`Set landingPageRequestedAt for ${content.type}`);
    }

    console.log("Waiting 10 seconds for functions to process...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check results
    for (const content of contentTypes) {
      const contentId = `test-${content.type}-${Date.now()}`;
      const doc = await db.collection("content").doc(contentId).get();
      if (doc.exists && doc.data().landingPageUrl) {
        console.log(`${content.type} landing page generated: ${doc.data().landingPageUrl}`);
      } else {
        console.log(`${content.type} landing page not generated`);
      }
    }
  } catch (error) {
    console.error("Error in content types test:", error);
  }
}

testContentTypes();

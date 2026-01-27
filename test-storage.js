const { storage } = require("./firebaseAdmin");

async function testStorage() {
  try {
    const bucket = storage.bucket();

    // Test uploading a simple text file
    const testFileName = "test.txt";
    const testFileContent = "This is a test file for Firebase Storage";

    const file = bucket.file(testFileName);
    const { saveFileSafely } = require('./src/utils/storageGuard');
    await saveFileSafely(file, testFileContent, {
      contentType: "text/plain",
      metadata: {
        createdAt: new Date().toISOString(),
        testing: true,
      },
    });

    console.log("✅ File uploaded successfully");

    // Test file exists
    const [exists] = await file.exists();
    console.log("✅ File exists:", exists);

    // Get file metadata
    const [metadata] = await file.getMetadata();
    console.log("✅ File metadata:", metadata);

    // Download file
    const [content] = await file.download();
    console.log("✅ File content:", content.toString());

    // Clean up - delete the test file
    await file.delete();
    console.log("✅ File deleted successfully");
  } catch (error) {
    console.error("❌ Error testing storage:", error);
  }
}

testStorage()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

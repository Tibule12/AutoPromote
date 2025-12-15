const fetch = require("node-fetch");

async function testUploadEndpoint() {
  console.log("Testing content upload endpoint...");

  // Test payload that matches what frontend sends
  const testPayload = {
    title: "Test Video",
    type: "video",
    url: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/test-video.mp4?alt=media&token=test-token",
    description: "Test description",
  };

  console.log("Test payload:", JSON.stringify(testPayload, null, 2));

  try {
    // Test local endpoint
    console.log("\nTesting local endpoint...");
    const localResponse = await fetch("http://localhost:5000/api/content/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        Accept: "application/json",
      },
      body: JSON.stringify(testPayload),
    });

    console.log("Local response status:", localResponse.status);
    const localText = await localResponse.text();
    console.log("Local response body:", localText);

    // Test remote endpoint
    console.log("\nTesting remote endpoint...");
    const remoteResponse = await fetch("https://autopromote.onrender.com/api/content/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        Accept: "application/json",
      },
      body: JSON.stringify(testPayload),
    });

    console.log("Remote response status:", remoteResponse.status);
    const remoteText = await remoteResponse.text();
    console.log("Remote response body:", remoteText);
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testUploadEndpoint();

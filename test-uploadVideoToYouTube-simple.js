// test-uploadVideoToYouTube-simple.js
// Simple test script to call the uploadVideoToYouTube Firebase Function via HTTP POST
// No Firebase Admin SDK or credentials required

const fetch = require("node-fetch");

// Replace with your test data
const testData = {
  channelId: "YOUR_YOUTUBE_CHANNEL_ID", // Must match a document in youtube_tokens
  title: "Test Video Upload",
  description: "This is a test upload from the AutoPromote test script.",
  videoUrl: "https://YOUR_FIREBASE_STORAGE_URL/video.mp4", // Publicly accessible video URL
  mimeType: "video/mp4",
};

async function main() {
  try {
    // Call the Firebase Function via HTTP POST
    const functionUrl =
      "https://us-central1-autopromote-cc6d3.cloudfunctions.net/uploadVideoToYouTube";
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });
    const result = await response.json();
    console.log("Function response:", result);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main();

// test-uploadVideoToYouTube.js
// Test script to call the uploadVideoToYouTube Firebase Function

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFunctions, httpsCallable } = require("firebase/functions");
const { getAuth } = require("firebase-admin/auth");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: applicationDefault(),
});

// Replace with your Firebase project config
const firebaseConfig = {
  projectId: "autopromote-cc6d3",
};

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
    // Get a Firebase Auth token (simulate as admin)
    const customToken = await admin.auth().createCustomToken("test-user");
    const idToken = customToken; // For callable functions, you can use admin privileges

    // Call the Firebase Function via HTTP
    const functionUrl =
      "https://us-central1-autopromote-cc6d3.cloudfunctions.net/uploadVideoToYouTube";
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
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

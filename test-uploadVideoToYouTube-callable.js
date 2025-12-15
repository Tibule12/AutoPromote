// test-uploadVideoToYouTube-callable.js
// Node.js script to call the uploadVideoToYouTube Firebase Callable Function using Firebase client SDK

const { initializeApp } = require("firebase/app");
const { getFunctions, httpsCallable } = require("firebase/functions");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
require("dotenv").config();

// Load Firebase config from environment variables or .env file
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Replace with your test user credentials
const TEST_EMAIL = "tmtshwelo21@gmail.com";
const TEST_PASSWORD = "REDACTED_FOR_GITHUB"; // <-- Replace with your actual password

// Replace with your test data
const testData = {
  channelId: "YOUR_YOUTUBE_CHANNEL_ID",
  title: "Test Video Upload",
  description: "This is a test upload from the AutoPromote test script.",
  videoUrl: "https://YOUR_FIREBASE_STORAGE_URL/video.mp4",
  mimeType: "video/mp4",
};

async function main() {
  try {
    // Initialize Firebase app
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const functions = getFunctions(app, "us-central1");

    // Sign in test user
    await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    console.log("Signed in as test user:", TEST_EMAIL);

    // Get the ID token for the signed-in user
    const user = auth.currentUser;
    if (!user) throw new Error("No user signed in");
    const idToken = await user.getIdToken();

    // Manually call the callable function endpoint with the ID token in the header
    const fetch = require("node-fetch");
    const functionUrl =
      "https://us-central1-autopromote-cc6d3.cloudfunctions.net/uploadVideoToYouTube";
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: testData }), // Callable expects { data: ... }
    });
    const result = await response.json();
    console.log("Function response:", result);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main();

// quick-login-test.js
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

// Firebase configuration - read from environment variables to avoid hard-coded keys in repo
function getClientFirebaseConfig() {
  const keys = [
    "REACT_APP_FIREBASE_API_KEY",
    "REACT_APP_FIREBASE_AUTH_DOMAIN",
    "REACT_APP_FIREBASE_PROJECT_ID",
    "REACT_APP_FIREBASE_STORAGE_BUCKET",
    "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
    "REACT_APP_FIREBASE_APP_ID",
  ];
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error("Missing required Firebase client env vars:", missing.join(", "));
    process.exit(1);
  }
  return {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
  };
}

// Initialize Firebase
const app = initializeApp(getClientFirebaseConfig());
const auth = getAuth(app);

async function tryLogin() {
  try {
    console.log("Attempting to log in...");

    // Try admin login
    try {
      console.log("\nTesting admin login:");
      const adminCredential = await signInWithEmailAndPassword(
        auth,
        "admin123@gmail.com",
        "Admin12345"
      );
      console.log("✅ Admin login successful!");
      console.log("Admin:", adminCredential.user.email, adminCredential.user.uid);
    } catch (error) {
      console.log("❌ Admin login failed:", error.code);
      console.log("Error details:", error.message);
    }

    // Try user login
    try {
      console.log("\nTesting user login:");
      const userCredential = await signInWithEmailAndPassword(auth, "test@example.com", "Test123!");
      console.log("✅ User login successful!");
      console.log("User:", userCredential.user.email, userCredential.user.uid);
    } catch (error) {
      console.log("❌ User login failed:", error.code);
      console.log("Error details:", error.message);
    }
  } catch (error) {
    console.error("General error:", error);
  }
}

tryLogin();

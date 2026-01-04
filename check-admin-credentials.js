const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

// Firebase configuration - read from env vars (REACT_APP_... for build-time in CRA)
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

async function checkAdminCredentials() {
  console.log("🔍 Checking admin credentials...\n");

  const adminCredentials = [
    { email: "admin123@gmail.com", password: "AdminAuto123" },
    { email: "testadmin@example.com", password: "admin123" },
    { email: "admin@autopromote.com", password: "admin123" },
    { email: "admin@example.com", password: "admin123" },
    { email: "testadmin@gmail.com", password: "admin123" },
  ];

  for (const creds of adminCredentials) {
    try {
      console.log(`Testing: ${creds.email}`);
      const userCredential = await signInWithEmailAndPassword(auth, creds.email, creds.password);
      console.log(`✅ SUCCESS: ${creds.email} - UID: ${userCredential.user.uid}`);

      // Get ID token to check custom claims
      const idTokenResult = await userCredential.user.getIdTokenResult();
      console.log(`Admin claim: ${idTokenResult.claims.admin || false}`);
      console.log(`Role: ${idTokenResult.claims.role || "none"}\n`);

      return creds; // Return working credentials
    } catch (error) {
      console.log(`❌ FAILED: ${creds.email} - ${error.message}\n`);
    }
  }

  console.log("No working admin credentials found.");
  return null;
}

async function checkExistingUsers() {
  console.log("🔍 Checking existing users in Firebase Auth...\n");

  // This would require admin SDK to list users
  // For now, let's just check if we can find any working credentials
  const workingCreds = await checkAdminCredentials();

  if (workingCreds) {
    console.log("✅ Found working admin credentials:", workingCreds);
  } else {
    console.log("❌ No working admin credentials found. You may need to create an admin user.");
  }
}

checkExistingUsers().catch(console.error);

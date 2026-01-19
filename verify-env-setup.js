const fs = require("fs");
const path = require("path");

console.log("🔍 Verifying Environment Setup...\n");

// Check if .env file exists
const envPath = path.join(__dirname, ".env");
const envExamplePath = path.join(__dirname, ".env.example");

if (!fs.existsSync(envPath)) {
  console.log("❌ .env file not found!");
  console.log("📝 Please create a .env file in the root directory");
  process.exit(1);
}

console.log("✅ .env file exists");

// Check if .env.example exists
if (fs.existsSync(envExamplePath)) {
  console.log("✅ .env.example file exists");
} else {
  console.log("⚠️  .env.example file not found");
}

// Check required Firebase environment variables
const requiredVars = [
  "FIREBASE_PRIVATE_KEY_JSON",
  "REACT_APP_FIREBASE_API_KEY",
  "REACT_APP_FIREBASE_AUTH_DOMAIN",
  "REACT_APP_FIREBASE_PROJECT_ID",
  "REACT_APP_FIREBASE_STORAGE_BUCKET",
  "JWT_SECRET",
];

console.log("\n🔧 Checking required environment variables:");

let missingVars = [];
requiredVars.forEach(varName => {
    if (process.env[varName]) {
    console.log("✅", varName + ": Set");
  } else {
    console.log("❌", varName + ": Missing");
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log("\n❌ Missing environment variables:");
  missingVars.forEach(varName => {
    console.log("   -", varName);
  });
  console.log("\n📝 Please add these variables to your .env file");
} else {
  console.log("\n✅ All required environment variables are set!");
}

// Check Firebase service account key
if (process.env.FIREBASE_PRIVATE_KEY_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_PRIVATE_KEY_JSON);
    console.log("\n🔑 Firebase Service Account:");
    console.log("   Project ID:", serviceAccount.project_id);
    console.log("   Client Email:", serviceAccount.client_email);
    console.log("✅ Service account key is valid JSON");
  } catch (error) {
    console.log("\n❌ Firebase Service Account: Invalid JSON format");
  }
}

console.log("\n📋 Next Steps:");
console.log("1. Ensure your .env file contains all required variables");
console.log("2. Restart your server after updating .env");
console.log("3. Test Firebase connection with: node test-firebase-connection.js");
console.log("4. Test Firestore setup with: node test-firestore-collections.js");

// checkDatabaseConnectionDebug.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Check for service account key file
try {
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  console.log("Checking service account key...");

  if (fs.existsSync(serviceAccountPath)) {
    console.log("✅ Service account key file exists");

    // Read file contents
    const serviceAccountData = fs.readFileSync(serviceAccountPath, "utf8");
    if (!serviceAccountData || serviceAccountData.trim() === "") {
      throw new Error("Service account key file is empty");
    }

    // Check if it's valid JSON
    try {
      const serviceAccount = JSON.parse(serviceAccountData);

      // Check required fields
      const requiredFields = [
        "type",
        "project_id",
        "private_key_id",
        "private_key",
        "client_email",
      ];
      const missingFields = requiredFields.filter(field => !serviceAccount[field]);

      if (missingFields.length > 0) {
        throw new Error(
          `Service account key is missing required fields: ${missingFields.join(", ")}`
        );
      }

      console.log("✅ Service account key format is valid");
      console.log(`Project ID: ${serviceAccount.project_id}`);

      // Initialize Firebase
      console.log("Initializing Firebase Admin SDK...");
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("✅ Firebase Admin initialized successfully");
      } else {
        console.log("✅ Firebase Admin already initialized");
      }
    } catch (parseError) {
      throw new Error(`Service account key is not valid JSON: ${parseError.message}`);
    }
  } else {
    throw new Error("Service account key file not found");
  }
} catch (error) {
  console.error(`❌ Service account setup error: ${error.message}`);
  process.exit(1);
}

const db = admin.firestore();

// Simple connection test
async function testConnection() {
  console.log("\nTesting Firestore connection...");
  try {
    // Attempt to list collections (less intrusive than writing)
    await db.listCollections();
    console.log("✅ Connection successful! Firestore is accessible.");
    return true;
  } catch (error) {
    console.error("❌ Connection failed:", error.message);
    if (error.code === 7 || error.code === 16) {
      console.error("\nThis appears to be an authentication issue. Check that:");
      console.error("1. Your service account has the correct permissions");
      console.error("2. The project ID in the service account matches your Firestore project");
      console.error("3. The private key has not expired or been revoked");
    }
    return false;
  }
}

// Run the test
testConnection()
  .then(success => {
    if (success) {
      console.log("\n✅ Basic connectivity check passed. You can now run the full test suite.");
      process.exit(0);
    } else {
      console.log("\n❌ Basic connectivity check failed. Fix connection issues before proceeding.");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });

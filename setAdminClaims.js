const admin = require("firebase-admin");

// Initialize Firebase Admin SDK using local service account file
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = "nKHRSh0eZGYRVtrIGPC35vtfMWz1"; // Your admin user's UID

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true, role: "admin" })
  .then(() => {
    console.log("Custom claims set for admin user!");
    process.exit(0);
  })
  .catch(error => {
    console.error("Error setting custom claims:", error);
    process.exit(1);
  });

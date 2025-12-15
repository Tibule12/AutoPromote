const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "autopromote-cc6d3",
});

const db = admin.firestore();

db.collection("testCollection")
  .doc("testDoc")
  .set({ hello: "world" })
  .then(() => {
    console.log("Write successful!");
    process.exit(0);
  })
  .catch(err => {
    console.error("Write failed:", err);
    process.exit(1);
  });

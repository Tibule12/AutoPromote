// updateContentStatus.js
// Usage: node updateContentStatus.js <contentId> <newStatus>
// Example: node updateContentStatus.js JnrmvMvPu4GA5Y7lZXh2 approved

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Update path if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function updateContentStatus(contentId, newStatus) {
  const contentRef = db.collection("content").doc(contentId);
  const doc = await contentRef.get();
  if (!doc.exists) {
    console.log(`Content with ID ${contentId} does not exist.`);
    return;
  }
  await contentRef.update({ status: newStatus });
  console.log(`Status for content ${contentId} updated to '${newStatus}'.`);
}

const [, , contentId, newStatus] = process.argv;
if (!contentId || !newStatus) {
  console.log("Usage: node updateContentStatus.js <contentId> <newStatus>");
  process.exit(1);
}

updateContentStatus(contentId, newStatus).catch(console.error);

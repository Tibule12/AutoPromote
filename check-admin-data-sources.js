const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkCollections() {
  console.log("Checking 'content' collection...");
  const contentSnap = await db.collection("content").get();
  console.log(`Found ${contentSnap.size} documents in 'content'.`);
  contentSnap.forEach(doc => {
      console.log(` - ${doc.id}: ${JSON.stringify(doc.data())}`);
  });

  console.log("\nChecking 'platform_posts' collection...");
  const postsSnap = await db.collection("platform_posts").get();
  console.log(`Found ${postsSnap.size} documents in 'platform_posts'.`);
  postsSnap.forEach(doc => {
      console.log(` - ${doc.id}: Title="${doc.data().title}", Views=${doc.data().metrics?.views}, Platform=${doc.data().platform}`);
  });

  console.log("\nChecking 'analytics' collection...");
  const analyticsSnap = await db.collection("analytics").get();
  console.log(`Found ${analyticsSnap.size} documents in 'analytics'.`);
}

checkCollections().catch(console.error);

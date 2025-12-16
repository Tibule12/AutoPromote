// checkAutoPromoteStatus.js
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.applicationDefault(), // or use cert if needed
  databaseURL: "https://autopromote-cc6d3.firebaseio.com",
});

const db = admin.firestore();
const uid = "bf04dPKELvVMivWoUyLsAVyw2sg2"; // Replace with your UID if needed

async function checkStatus() {
  // 1. Content uploads
  const contentSnap = await db.collection("content").where("user_id", "==", uid).get();
  console.log(`Content uploaded: ${contentSnap.size}`);
  contentSnap.forEach(doc => console.log("  -", doc.id, doc.data().title));

  // 2. Promotion schedules
  const scheduleSnap = await db.collection("promotion_schedules").where("user_id", "==", uid).get();
  console.log(`Promotion schedules: ${scheduleSnap.size}`);
  scheduleSnap.forEach(doc =>
    console.log("  -", doc.id, doc.data().platform, doc.data().startTime)
  );

  // 3. Promotion tasks
  const taskSnap = await db.collection("promotion_tasks").where("uid", "==", uid).get();
  console.log(`Promotion tasks: ${taskSnap.size}`);
  taskSnap.forEach(doc =>
    console.log("  -", doc.id, doc.data().type, doc.data().platform || "youtube", doc.data().status)
  );

  // 4. YouTube uploads
  const ytSnap = await db.collection("youtube_uploads").where("uid", "==", uid).get();
  console.log(`YouTube uploads: ${ytSnap.size}`);
  ytSnap.forEach(doc => console.log("  -", doc.id, doc.data().videoId, doc.data().publishedAt));
}

checkStatus().then(() => process.exit());

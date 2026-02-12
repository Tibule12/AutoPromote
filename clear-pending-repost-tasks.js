const { resolve } = require("path");
require("dotenv").config({ path: resolve(__dirname, ".env") });
const { db } = require("./src/firebaseAdmin");

async function clearPendingReposts() {
  console.log("Scanning for pending 'decay_repost' tasks...");
  
  const snap = await db.collection("promotion_tasks")
    .where("reason", "==", "decay_repost")
    .where("status", "in", ["queued", "processing"])
    .get();

  if (snap.empty) {
    console.log("No pending repost tasks found.");
    process.exit(0);
  }

  console.log(`Found ${snap.size} pending repost tasks. Deleting...`);

  const batch = db.batch();
  let count = 0;
  
  snap.docs.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });

  await batch.commit();
  console.log(`Successfully deleted ${count} pending tasks.`);
  process.exit(0);
}

clearPendingReposts().catch(console.error);

// replayDeadLetterTasks.js - moves tasks from dead_letter_tasks back into promotion_tasks after verification
const { db } = require("../src/firebaseAdmin");
const { attachSignature, verifySignature } = require("../src/utils/docSigner");

(async function () {
  console.log("== Dead Letter Replay ==");
  const snap = await db.collection("dead_letter_tasks").limit(200).get();
  if (snap.empty) {
    console.log("No dead letter tasks.");
    return;
  }
  let replayed = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    // only replay if reason signature mismatch OR transient
    if (data.reason && !/signature/i.test(data.reason) && !/timeout|transient/i.test(data.reason)) {
      skipped++;
      continue;
    }
    const task = {
      ...data.originalTask,
      replayedAt: new Date().toISOString(),
      replaySource: "replay_script",
    };
    // ensure signature attached
    const signed = task._sig && verifySignature(task) ? task : attachSignature(task);
    await db.collection("promotion_tasks").add(signed);
    await doc.ref.delete();
    replayed++;
  }
  console.log("Replayed tasks:", replayed, "Skipped:", skipped);
})();

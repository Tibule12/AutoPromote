#!/usr/bin/env node
const { db } = require("../firebaseAdmin");

const collectionName = process.argv[2] || "auditLogs";
const limit = parseInt(process.argv[3], 10) || 20;
(async () => {
  try {
    console.log("Peeking collection:", collectionName, "limit:", limit);
    const snap = await db.collection(collectionName).limit(limit).get();
    console.log("Found documents:", snap.size);
    let i = 0;
    snap.forEach(doc => {
      i++;
      console.log("\n--- doc", i, "id=", doc.id, "---");
      console.log(JSON.stringify(doc.data(), null, 2));
    });
    process.exit(0);
  } catch (e) {
    console.error("peekCollection failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();

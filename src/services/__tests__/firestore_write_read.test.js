const { db, admin } = require("../../firebaseAdmin");

test("firestore basic write/read", async () => {
  await db.collection("system").doc("global_counters").set({ __test_write: 1 }, { merge: true });
  await db
    .collection("system")
    .doc("global_counters")
    .set({ lock_takeover_attempt_total: admin.firestore.FieldValue.increment(1) }, { merge: true });
  const snap = await db.collection("system").doc("global_counters").get();
  // removed debug console.log to satisfy linter
  expect(snap.exists).toBe(true);
  expect(snap.data().__test_write).toBeDefined();
  expect(typeof snap.data().lock_takeover_attempt_total === "number").toBe(true);
});

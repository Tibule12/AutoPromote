const { db, admin } = require("../../firebaseAdmin");

test("firestore basic write/read", async () => {
  await db.collection("system").doc("global_counters").set({ __test_write: 1 }, { merge: true });
  // Fall back to a deterministic numeric increment to avoid emulator/FieldValue differences
  const before = await db.collection("system").doc("global_counters").get();
  const prev =
    before.exists && typeof before.data().lock_takeover_attempt_total === "number"
      ? before.data().lock_takeover_attempt_total
      : 0;
  await db
    .collection("system")
    .doc("global_counters")
    .set({ lock_takeover_attempt_total: prev + 1 }, { merge: true });
  const snap = await db.collection("system").doc("global_counters").get();
  expect(snap.exists).toBe(true);
  expect(snap.data().__test_write).toBeDefined();
  expect(typeof snap.data().lock_takeover_attempt_total === "number").toBe(true);
});

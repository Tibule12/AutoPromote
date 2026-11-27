const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
process.env.COST_TELEMETRY_ENABLED = "true";
const telemetry = require("../../src/services/infrastructureTelemetry");
telemetry.install();
const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
const { cleanupPublishedVideos } = require("../../src/services/publishedVideoRetention");
const db = createSandboxDatabase();
const now = Date.parse("2026-11-27T00:00:00Z");
let storageReads = 0;
const storage = {
  bucket: () => ({
    file: () => ({
      getMetadata: async () => {
        storageReads++;
        throw Object.assign(Error("Already absent local fixture"), { code: 404 });
      },
    }),
  }),
};
const extractPath = url => (url.startsWith("https://owned.test/") ? url.slice(19) : null);
const run = extra => cleanupPublishedVideos({ db, storage, extractPath, now, ...extra });
const totals = () =>
  telemetry
    .snapshot()
    .firestore.reduce(
      (s, r) => ({
        reads: s.reads + r.minimumReadEstimate,
        writes: s.writes + r.writesCommitted,
        calls: s.calls + r.calls,
      }),
      { reads: 0, writes: 0, calls: 0 }
    );
async function measured(task) {
  const start = totals();
  await task();
  const end = totals();
  return Object.fromEntries(Object.keys(start).map(k => [k, end[k] - start[k]]));
}
const evidence = {
  scope:
    "Real Firestore emulator; repeated complete retention scans. No production writes, object deletion or cloud processing.",
  measurements: {},
};
after(async () => {
  if (process.env.RETENTION_CACHE_EVIDENCE)
    fs.writeFileSync(
      process.env.RETENTION_CACHE_EVIDENCE,
      JSON.stringify(evidence, null, 2) + "\n"
    );
  await db.terminate();
});
async function fixture(owner, count = 1) {
  await db
    .collection("user_billing")
    .doc(owner)
    .set({ storageRetention: { publishedVideoHours: 24 } });
  const refs = [];
  for (let i = 0; i < count; i++) {
    const ref = db.collection("content").doc(owner + "-" + i);
    await ref.set({
      user_id: owner,
      type: "video",
      url: "https://owned.test/uploads/videos/" + ref.id + ".mp4",
    });
    refs.push(ref);
  }
  return refs;
}
test("six repeated scans retain media and avoid repeated historical dependency reads", async () => {
  const refs = await fixture("cache-sparse", 8),
    batch = db.batch();
  for (const ref of refs)
    for (let i = 0; i < 10; i++)
      batch.set(db.collection("platform_posts").doc(ref.id + "-" + i), {
        contentId: ref.id,
        success: false,
      });
  await batch.commit();
  const before = await measured(async () => {
    for (let i = 0; i < 6; i++) await run({ dryRun: true, now: now + i * 600000 });
  });
  const after = await measured(async () => {
    for (let i = 0; i < 6; i++) await run({ now: now + i * 600000 });
  });
  assert.ok(after.reads < before.reads / 3, JSON.stringify({ before, after }));
  assert.equal(after.writes, 0);
  assert.equal(storageReads, 0);
  evidence.measurements.sixCycles = {
    before,
    after,
    avoidedReadPercent: (1 - after.reads / before.reads) * 100,
    retainedContent: 8,
  };
});
test("a changed content record invalidates its hold immediately", async () => {
  const [ref] = await fixture("cache-change");
  await run();
  await ref.update({ target_platforms: ["youtube"] });
  const rows = await run({ now: now + 1 });
  assert.equal(rows.find(r => r.contentId === ref.id).reason, "publication_unconfirmed");
});
test("dependency-only changes cannot make a cached hold authorize deletion and expire within an hour", async () => {
  const [ref] = await fixture("cache-dependency");
  await ref.update({ target_platforms: ["youtube"] });
  await run();
  await db
    .collection("platform_posts")
    .doc(ref.id)
    .set({
      contentId: ref.id,
      platform: "youtube",
      success: true,
      externalId: "local-receipt",
      publishedAt: new Date(now - 2 * 86400000).toISOString(),
    });
  const reads = storageReads;
  assert.equal(
    (await run({ now: now + 600000 })).find(r => r.contentId === ref.id).eligible,
    false
  );
  assert.equal(storageReads, reads);
  assert.equal(
    (await run({ now: now + 3600000 })).find(r => r.contentId === ref.id).eligible,
    true
  );
  assert.equal(storageReads, reads + 1);
});
test("known future publication deadlines expire precisely and dry runs always refresh dependencies", async () => {
  const [ref] = await fixture("cache-deadline");
  await ref.update({ target_platforms: ["youtube"] });
  await db
    .collection("platform_posts")
    .doc(ref.id)
    .set({
      contentId: ref.id,
      platform: "youtube",
      success: true,
      externalId: "local-receipt",
      publishedAt: new Date(now - 86400000 + 300000).toISOString(),
    });
  assert.equal((await run()).find(r => r.contentId === ref.id).reason, "within_24_hours");
  assert.equal(
    (await run({ now: now + 299999 })).find(r => r.contentId === ref.id).reason,
    "within_24_hours"
  );
  assert.equal((await run({ now: now + 300000 })).find(r => r.contentId === ref.id).eligible, true);
  const [other] = await fixture("cache-dryrun");
  await run();
  await other.update({ target_platforms: ["youtube"] });
  await run();
  await db
    .collection("platform_posts")
    .doc(other.id)
    .set({
      contentId: other.id,
      platform: "youtube",
      success: true,
      externalId: "local-receipt",
      publishedAt: new Date(now - 2 * 86400000).toISOString(),
    });
  assert.equal((await run({ dryRun: true })).find(r => r.contentId === other.id).eligible, true);
});
test("truncated dependency scans never become cached permission or cached incompleteness", async () => {
  const [ref] = await fixture("cache-truncated");
  const batch = db.batch();
  for (let i = 0; i < 200; i++)
    batch.set(db.collection("promotion_tasks").doc(ref.id + "-" + i), {
      contentId: ref.id,
      status: "pending",
    });
  await batch.commit();
  assert.equal(
    (await run()).find(r => r.contentId === ref.id).reason,
    "dependency_scan_incomplete"
  );
  const second = await measured(() => run({ now: now + 1 }));
  assert.ok(second.reads >= 200);
  assert.equal((await ref.get()).data().storageRetentionStatus, undefined);
});

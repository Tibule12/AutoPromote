// Real disposable emulator checks; no production credentials or object access.
const { before, after, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  ref,
  uploadBytes,
  getBytes,
  listAll,
  deleteObject,
  updateMetadata,
} = require("firebase/storage");
const { doc, setDoc } = require("firebase/firestore");
const projectId = "demo-autopromote-containment";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
const bucket = `${projectId}.appspot.com`;
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"])
  assert.match(process.env[key] || "", /^127\.0\.0\.1:\d+$/);
const root = path.resolve(__dirname, "../..");
let env;
const upload = (ctx, file, metadata) =>
  uploadBytes(ref(ctx.storage(bucket), file), Buffer.from("fixture"), metadata);
before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync(
        path.join(root, "config/security/firestore.owner-scoped.rules"),
        "utf8"
      ),
    },
    storage: {
      host: storageHost,
      port: Number(storagePort),
      rules: fs.readFileSync(path.join(root, "config/security/storage.owner-scoped.rules"), "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "users/owner"), { credits: 31, role: "user" });
    await setDoc(doc(ctx.firestore(), "users/blocked"), { uploadBlocked: true });
    for (const file of [
      "private/owner.txt",
      "uploads/videos/legacy.mp4",
      "studio/model-runtime/private.bin",
      "temp/studio-analysis/owner/private.bin",
      "studio/analysis-results/owner/private.bin",
      "temp_studio_vfx/owner/private.bin",
      "studio/sources/owner/model-private.mp4",
      "landing-pages/index.html",
      "public/logo.png",
    ])
      await upload(ctx, file);
  });
});
after(async () => {
  await env?.cleanup();
});
it("preserves current Publisher upload, owner download/list and owner cleanup", async () => {
  const owner = env.authenticatedContext("owner");
  const file = "uploads/videos/owner/source.mp4";
  await assertSucceeds(
    upload(owner, file, { customMetadata: { ownerUid: "owner", sourcePurpose: "publisher" } })
  );
  await assertSucceeds(getBytes(ref(owner.storage(bucket), file)));
  await assertSucceeds(listAll(ref(owner.storage(bucket), "uploads/videos/owner")));
  await assertFails(
    updateMetadata(ref(owner.storage(bucket), file), { customMetadata: { ownerUid: "attacker" } })
  );
  await assertSucceeds(deleteObject(ref(owner.storage(bucket), file)));
});
it("blocks cross-owner read, listing, overwrite, delete and forged owner metadata", async () => {
  const owner = env.authenticatedContext("owner");
  const file = "uploads/images/owner/private.png";
  await assertSucceeds(upload(owner, file, { customMetadata: { ownerUid: "owner" } }));
  for (const claims of [{}, { admin: true, isAdmin: true, role: "admin" }]) {
    const attacker = env.authenticatedContext("attacker", claims);
    await assertFails(getBytes(ref(attacker.storage(bucket), file)));
    await assertFails(listAll(ref(attacker.storage(bucket), "uploads/images/owner")));
    await assertFails(upload(attacker, file, { customMetadata: { ownerUid: "attacker" } }));
    await assertFails(upload(attacker, file, { customMetadata: { ownerUid: "owner" } }));
    await assertFails(deleteObject(ref(attacker.storage(bucket), file)));
  }
});
it("requires Find Viral Clips ownership and scan-purpose metadata", async () => {
  const owner = env.authenticatedContext("owner");
  const file = "temp_scans/owner/scan.mp4";
  await assertFails(upload(owner, file));
  await assertFails(
    upload(owner, file, { customMetadata: { ownerUid: "owner", sourcePurpose: "publisher" } })
  );
  await assertSucceeds(
    upload(owner, file, { customMetadata: { ownerUid: "owner", sourcePurpose: "viral_scan" } })
  );
  await assertSucceeds(getBytes(ref(owner.storage(bucket), file)));
  await assertFails(getBytes(ref(env.authenticatedContext("attacker").storage(bucket), file)));
});
it("preserves current editor, thumbnail, source and Cam Combiner SDK layouts", async () => {
  const owner = env.authenticatedContext("owner");
  const attacker = env.authenticatedContext("attacker");
  for (const prefix of [
    "temp_sources",
    "temp_uploads",
    "temp_analysis",
    "thumbnails",
    "memetic_seeds",
    "temp/multicam",
    "temp/multicam-clean-sync",
    "temp/multicam-clean-sync-audio",
    "temp/multicam-ingest",
  ]) {
    const file = `${prefix}/owner/fixture.bin`;
    await assertSucceeds(upload(owner, file));
    await assertSucceeds(getBytes(ref(owner.storage(bucket), file)));
    await assertFails(getBytes(ref(attacker.storage(bucket), file)));
    await assertFails(upload(attacker, file));
  }
});
it("enforces server-controlled upload blocks on every restored private layout", async () => {
  const blocked = env.authenticatedContext("blocked");
  for (const file of [
    "uploads/videos/blocked/a.mp4",
    "temp_scans/blocked/a.mp4",
    "temp_sources/blocked/a.mp4",
    "temp_uploads/blocked/a.mp4",
    "temp/multicam/blocked/a.mp4",
  ])
    await assertFails(
      upload(blocked, file, {
        customMetadata: { ownerUid: "blocked", sourcePurpose: "viral_scan" },
      })
    );
});
it("keeps unowned legacy, unrelated, model and analysis paths API-only even for trusted admins", async () => {
  for (const uid of ["owner", "bf04dPKELvVMivWoUyLsAVyw2sg2"]) {
    const ctx = env.authenticatedContext(uid, { admin: true });
    for (const file of [
      "private/owner.txt",
      "uploads/videos/legacy.mp4",
      "studio/model-runtime/private.bin",
      "temp/studio-analysis/owner/private.bin",
      "studio/analysis-results/owner/private.bin",
      "temp_studio_vfx/owner/private.bin",
      "studio/sources/owner/model-private.mp4",
    ]) {
      await assertFails(getBytes(ref(ctx.storage(bucket), file)));
      await assertFails(upload(ctx, file));
    }
  }
});
it("preserves public reads while denying ordinary/forged-admin public writes", async () => {
  const anon = env.unauthenticatedContext();
  for (const file of ["public/logo.png", "landing-pages/index.html"])
    await assertSucceeds(getBytes(ref(anon.storage(bucket), file)));
  const attacker = env.authenticatedContext("attacker", { admin: true, role: "admin" });
  await assertFails(upload(attacker, "public/logo.png"));
  await assertFails(upload(attacker, "landing-pages/index.html"));
  const owner = env.authenticatedContext("owner");
  await assertSucceeds(upload(owner, "content/owner/published/video.mp4"));
  await assertSucceeds(getBytes(ref(anon.storage(bucket), "content/owner/published/video.mp4")));
  await assertFails(upload(attacker, "content/owner/published/video.mp4"));
});

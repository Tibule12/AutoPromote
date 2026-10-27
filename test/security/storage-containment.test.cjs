// Only run with the disposable demo Firestore + Storage emulators.
const { it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { ref, uploadBytes, getBytes, listAll } = require("firebase/storage");
const { doc, setDoc, getDoc } = require("firebase/firestore");
const projectId = "demo-autopromote-containment";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"])
  assert.match(process.env[key] || "", /^127\.0\.0\.1:\d+$/);
const root = path.resolve(__dirname, "../..");
const bucket = `${projectId}.appspot.com`;
let env;
async function load(firestoreRules, storageRules) {
  await env?.cleanup();
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync(path.join(root, firestoreRules), "utf8"),
    },
    storage: {
      host: storageHost,
      port: Number(storagePort),
      rules: fs.readFileSync(path.join(root, storageRules), "utf8"),
    },
  });
}
before(async () => {
  await load(
    "test/security/fixtures/firestore.before.rules",
    "test/security/fixtures/storage.before.rules"
  );
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "users/attacker"), { role: "user", uploadBlocked: false });
    await setDoc(doc(ctx.firestore(), "users/owner"), { role: "user", credits: 31 });
    await uploadBytes(
      ref(ctx.storage(bucket), "temp_scans/owner/private.txt"),
      Buffer.from("private fixture")
    );
  });
});
after(async () => {
  await env?.cleanup();
});
it("reproduces the deployed Storage fallback's cross-owner private read/write in emulators", async () => {
  const storage = env.authenticatedContext("attacker").storage(bucket);
  const file = ref(storage, "temp_scans/owner/private.txt");
  await assertSucceeds(getBytes(file));
  await assertSucceeds(uploadBytes(file, Buffer.from("attacker overwrite")));
});
it("blocks client financial/admin writes, private Storage reads, listing and uploads under coordinated fallback", async () => {
  await load(
    "config/security/firestore.restrictive-fallback.rules",
    "config/security/storage.restrictive-fallback.rules"
  );
  for (const claims of [{}, { admin: true, isAdmin: true, role: "admin" }]) {
    const ctx = env.authenticatedContext("attacker", claims);
    await assertFails(
      setDoc(doc(ctx.firestore(), "users/attacker"), { role: "admin", credits: 999 })
    );
    await assertFails(setDoc(doc(ctx.firestore(), "admins/attacker"), { role: "admin" }));
    await assertFails(getBytes(ref(ctx.storage(bucket), "temp_scans/owner/private.txt")));
    await assertFails(
      uploadBytes(ref(ctx.storage(bucket), "uploads/videos/new.mp4"), Buffer.from("fixture"))
    );
    await assertFails(listAll(ref(ctx.storage(bucket), "temp_scans/owner")));
  }
  const anon = env.unauthenticatedContext().storage(bucket);
  await assertFails(getBytes(ref(anon, "temp_scans/owner/private.txt")));
});
it("preserves trusted bypass billing/media writes while documenting client outage", async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "payments/verified-fixture"), {
      status: "COMPLETED",
      userId: "owner",
    });
    await uploadBytes(
      ref(ctx.storage(bucket), "temp_scans/owner/server-output.txt"),
      Buffer.from("trusted output")
    );
    const snap = await getDoc(doc(ctx.firestore(), "users/owner"));
    assert.equal(snap.data().credits, 31);
  });
  const owner = env.authenticatedContext("owner");
  await assertFails(getDoc(doc(owner.firestore(), "users/owner")));
  await assertFails(getBytes(ref(owner.storage(bucket), "temp_scans/owner/server-output.txt")));
});

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { once } = require("node:events");
const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
const db = createSandboxDatabase();
after(() => db.terminate());
test(
  "actual Storage rules reject unreserved, expired and wrong-size uploads when enforcement is enabled",
  { timeout: 30000 },
  async () => {
    const { StorageEmulator } = require("firebase-tools/lib/emulator/storage");
    const { EmulatorRegistry } = require("firebase-tools/lib/emulator/registry");
    const [host, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    EmulatorRegistry.set("firestore", {
      getInfo: () => ({ name: "firestore", host, port: Number(firestorePort) }),
    });
    const probe = net.createServer().listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise(r => probe.close(r));
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-free-first-storage-"));
    class OwnedStorage extends StorageEmulator {
      getPersistenceTmpDir() {
        return scratch;
      }
    }
    const emulator = new OwnedStorage({
      projectId: "demo-autopromote-credits",
      host,
      port,
      auto_download: false,
      rules: {
        name: path.resolve("storage.rules"),
        content: fs.readFileSync("storage.rules", "utf8"),
      },
    });
    await EmulatorRegistry.start(emulator);
    const {
      initializeTestEnvironment,
      assertFails,
      assertSucceeds,
    } = require("@firebase/rules-unit-testing");
    const { ref, uploadBytes } = require("firebase/storage");
    const environment = await initializeTestEnvironment({
      projectId: "demo-autopromote-credits",
      firestore: { host, port: Number(firestorePort) },
      storage: { host, port },
    });
    try {
      const uid = "storage-free",
        objectPath = `uploads/videos/${uid}/clip.mp4`;
      await db.collection("processing_control").doc("storage").set({ enforceReservations: true });
      const client = environment.authenticatedContext(uid, { email_verified: true }).storage();
      const object = ref(client, objectPath),
        data = Buffer.from("video");
      await assertFails(uploadBytes(object, data, { customMetadata: { ownerUid: uid } }));
      const leaseId = "a".repeat(64),
        lease = db.collection("processing_storage_reservations").doc(leaseId);
      const meta = { customMetadata: { ownerUid: uid, processingReservationId: leaseId } };
      const record = {
        userId: uid,
        state: "reserved",
        storagePath: objectPath,
        bytes: data.length,
        expiresAt: Date.now() + 60000,
      };
      await lease.set({ ...record, bytes: data.length + 1 });
      await assertFails(uploadBytes(object, data, meta));
      await lease.set({ ...record, expiresAt: Date.now() - 1 });
      await assertFails(uploadBytes(object, data, meta));
      await lease.set(record);
      await assertSucceeds(uploadBytes(object, data, meta));
      assert.equal((await lease.get()).data().bytes, data.length);
    } finally {
      await environment.cleanup();
      await emulator.stop();
      await db.collection("processing_control").doc("storage").delete();
    }
  }
);

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { setTimeout: delay } = require("timers/promises");
const { SHA, error } = require("./contentFactoryContract");
// Leave space for Firestore field/index overhead. Do not silently accept a
// locally valid screenplay job that the durable production store cannot save.
function boundedRecord(next) {
  if (next && Buffer.byteLength(JSON.stringify(next), 'utf8') > 850000)
    throw error('CONTENT_FACTORY_JOB_RECORD_LIMIT', 413);
  return next;
}
function firestoreFactoryStore(firestore) {
  const ref = id => firestore.collection("content_factory_jobs").doc(id);
  return {
    async get(id) { const snap = await ref(id).get(); return snap.exists ? snap.data() : null; },
    async transaction(id, mutate) {
      return firestore.runTransaction(async tx => {
        const snap = await tx.get(ref(id));
        const next = boundedRecord(mutate(snap.exists ? snap.data() : null));
        if (next) tx.set(ref(id), next);
        return next;
      });
    },
    async listQueued() {
      const snap = await firestore.collection("content_factory_jobs").where("status", "in", ["queued", "running"]).limit(30).get();
      return snap.docs.filter(d => !d.data().cancelled && (!d.data().lease || d.data().lease.expiresAt <= Date.now())).slice(0,10).map(d => d.id);
    },
  };
}
// Local adapter uses the same service/identity/lease logic for isolated founder
// sessions. It never falls back to production Firebase or Cloud Run.
function localFactoryStore(root) {
  const directory = path.resolve(root, "jobs");
  const file = id => { if (!SHA.test(id || "")) throw error("CONTENT_FACTORY_JOB_ID_INVALID"); return path.join(directory, `${id}.json`); };
  const read = async id => { try { return JSON.parse(await fs.readFile(file(id), "utf8")); } catch (e) { if (e.code === "ENOENT") return null; throw e; } };
  return {
    get: read,
    async transaction(id, mutate) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const lock = `${file(id)}.lock`;
      let handle;
      for (let i = 0; i < 200; i++) {
        try { handle = await fs.open(lock, "wx", 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid })); break; }
        catch (e) {
          if (e.code !== "EEXIST") throw e;
          try { const owner = JSON.parse(await fs.readFile(lock, "utf8")); process.kill(owner.pid, 0); }
          catch (failure) { if (failure.code === "ESRCH") { await fs.unlink(lock).catch(() => {}); continue; } }
          await delay(25);
        }
      }
      if (!handle) throw error("CONTENT_FACTORY_STORE_BUSY", 503);
      try {
        const next = boundedRecord(mutate(await read(id)));
        if (next) {
          const temp = `${file(id)}.${crypto.randomUUID()}.tmp`;
          await fs.writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
          await fs.rename(temp, file(id));
        }
        return next;
      } finally { await handle.close(); await fs.unlink(lock); }
    },
    async listQueued() {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const result = [];
      for (const name of await fs.readdir(directory)) if (/^[a-f0-9]{64}\.json$/.test(name)) {
        const job = await read(name.slice(0, 64)); if (["queued","running"].includes(job.status) && !job.cancelled && (!job.lease || job.lease.expiresAt <= Date.now())) result.push(job.jobId);
      }
      return result.slice(0, 10);
    },
  };
}
module.exports = { firestoreFactoryStore, localFactoryStore };

const fs = require('fs/promises');
const path = require('path');
const { stable, hash, fail } = require('./contract');
const { verifyArtifact } = require('./artifacts');
const exists = e => ['EEXIST', 6, 'already-exists', 'ALREADY_EXISTS'].includes(e?.code);
async function immutableJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const bytes = Buffer.from(stable(value));
  try { await fs.writeFile(filename, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (!exists(e)) throw e; if (!bytes.equals(await fs.readFile(filename))) throw fail('MODEL_IMMUTABLE_CONFLICT', 409); }
}
// Development/proof transport only. One Node process owns the mutable journal;
// the Cloud/Firestore adapter below is required for multiple API/worker replicas.
class FileStore {
  constructor(root) { this.root = root; this.chain = Promise.resolve(); }
  serial(fn) { const work = this.chain.then(fn); this.chain = work.catch(() => {}); return work; }
  filename(id) { if (!/^[a-f0-9]{64}$/.test(id)) throw fail('MODEL_STORE_KEY_INVALID'); return path.join(this.root, 'jobs', `${id}.json`); }
  async get(id) { try { return JSON.parse(await fs.readFile(this.filename(id), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  create(job) { return this.serial(async () => { const prior = await this.get(job.id); if (prior) return prior;
    await immutableJson(this.filename(job.id), job); return job; }); }
  transition(id, token, from, patch) { return this.serial(async () => {
    const job = await this.get(id);
    if (!job || job.attemptToken !== token) throw fail('MODEL_JOB_FENCED', 409);
    if (!from.includes(job.status)) return false;
    const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
    const temp = this.filename(id) + '.tmp';
    await fs.writeFile(temp, stable(next), { mode: 0o600 }); await fs.rename(temp, this.filename(id)); return true;
  }); }
  claim(id, token, { gpu }) { return this.serial(async () => {
    const job = await this.get(id); if (job?.status !== 'queued' || job.attemptToken !== token) return false;
    if (job.claimed) return false;
    if (!gpu) {
      const temp=this.filename(id)+'.tmp';await fs.writeFile(temp,stable({...job,claimed:true}));await fs.rename(temp,this.filename(id));return true;
    }
    await fs.mkdir(this.root, { recursive: true });
    try {
      await fs.writeFile(path.join(this.root, 'gpu-capacity.json'), stable({ id, token }), { flag: 'wx', mode: 0o600 });
      const temp=this.filename(id)+'.tmp';await fs.writeFile(temp,stable({...job,claimed:true}));await fs.rename(temp,this.filename(id));return true;
    }
    catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  }); }
  release(id, token) { return this.serial(async () => {
    const file = path.join(this.root, 'gpu-capacity.json');
    try { const lease = JSON.parse(await fs.readFile(file)); if (lease.id === id && lease.token === token) await fs.unlink(file); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }); }
  finalize(job,artifact,artifacts,status) { return this.serial(async()=>{
    const current=await this.get(job.id);
    if(current?.attemptToken!==job.attemptToken || !['running','dispatching','dispatch_uncertain'].includes(current.status))return false;
    await artifacts.put(artifact);
    const temp=this.filename(job.id)+'.tmp';
    await fs.writeFile(temp,stable({...current,status,artifactHash:artifact.artifactHash,updatedAt:new Date().toISOString()}));
    await fs.rename(temp,this.filename(job.id));return true;
  }); }
}
class FileArtifactStore {
  constructor(root) { this.root = root; }
  async put(artifact) { verifyArtifact(artifact); await immutableJson(path.join(this.root, `${artifact.artifactHash}.json`), artifact); }
  async get(id) { if (!/^[a-f0-9]{64}$/.test(id)) throw fail('MODEL_STORE_KEY_INVALID');
    try { return JSON.parse(await fs.readFile(path.join(this.root, `${id}.json`), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
}
class FirestoreJobStore {
  constructor(db) { this.db = db; this.collection = db.collection('studio_model_capability_jobs');
    this.capacity = db.collection('studio_model_capability_capacity').doc('single_gpu'); }
  async get(id) { const d = await this.collection.doc(id).get(); return d.exists ? JSON.parse(d.data().recordJson) : null; }
  async create(job) { const ref = this.collection.doc(job.id); return this.db.runTransaction(async tx => {
    const d = await tx.get(ref); if (d.exists) return JSON.parse(d.data().recordJson);
    tx.create(ref, { ownerUid: job.ownerUid, status: job.status, recordJson: stable(job) }); return job;
  }); }
  async transition(id, token, from, patch) { const ref = this.collection.doc(id); return this.db.runTransaction(async tx => {
    const d = await tx.get(ref); const job = d.exists && JSON.parse(d.data().recordJson);
    if (!job || job.attemptToken !== token) throw fail('MODEL_JOB_FENCED', 409);
    if (!from.includes(job.status)) return false;
    const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
    tx.update(ref, { status: next.status, recordJson: stable(next) }); return true;
  }); }
  async claim(id, token, { gpu }) { return this.db.runTransaction(async tx => {
    const ref = this.collection.doc(id), d = await tx.get(ref), capacity = gpu && await tx.get(this.capacity);
    const job = d.exists && JSON.parse(d.data().recordJson);
    if (job?.status !== 'queued' || job.attemptToken !== token || job.claimed || (gpu && capacity.exists)) return false;
    job.claimed = true; tx.update(ref, { recordJson: stable(job) });
    if (gpu) tx.create(this.capacity, { id, token, ownerUid: job.ownerUid, claimedAt: new Date().toISOString() }); return true;
  }); }
  async release(id, token) { return this.db.runTransaction(async tx => {
    const d = await tx.get(this.capacity); if (d.exists && d.data().id === id && d.data().token === token) tx.delete(this.capacity);
  }); }
  async finalize(job,artifact,artifacts,status) {
    verifyArtifact(artifact);
    return this.db.runTransaction(async tx=>{
      const ref=this.collection.doc(job.id),artifactRef=artifacts.collection.doc(artifact.artifactHash);
      const [d,previous]=await Promise.all([tx.get(ref),tx.get(artifactRef)]);
      const current=d.exists && JSON.parse(d.data().recordJson);
      if(current?.attemptToken!==job.attemptToken || !['running','dispatching','dispatch_uncertain'].includes(current.status))return false;
      const artifactJson=stable(artifact);
      if(previous.exists && previous.data().artifactJson!==artifactJson)throw fail('MODEL_IMMUTABLE_CONFLICT',409);
      if(!previous.exists)tx.create(artifactRef,{ownerUid:artifact.ownerUid,projectId:artifact.projectId,artifactJson});
      const next={...current,status,artifactHash:artifact.artifactHash,updatedAt:new Date().toISOString()};
      tx.update(ref,{status,recordJson:stable(next)});return true;
    });
  }
}
class FirestoreArtifactStore {
  constructor(db) { this.collection = db.collection('studio_model_capability_artifacts'); }
  async get(id) { const d = await this.collection.doc(id).get(); return d.exists ? JSON.parse(d.data().artifactJson) : null; }
  async put(artifact) {
    verifyArtifact(artifact); const ref = this.collection.doc(artifact.artifactHash), artifactJson = stable(artifact);
    try { await ref.create({ ownerUid: artifact.ownerUid, projectId: artifact.projectId, artifactJson }); }
    catch (e) { if (!exists(e)) throw e; const d = await ref.get(); if (d.data()?.artifactJson !== artifactJson) throw fail('MODEL_IMMUTABLE_CONFLICT', 409); }
  }
}
module.exports = { FileStore, FileArtifactStore, FirestoreJobStore, FirestoreArtifactStore, immutableJson };

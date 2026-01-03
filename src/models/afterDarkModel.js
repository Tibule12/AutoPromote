/* AfterDark model: simple Firestore wrapper for adult "shows" */
const { db, admin } = require('../firebaseAdmin');

const COLLECTION = 'afterdark_shows';

async function createShow(data) {
  const now = new Date().toISOString();
  const payload = {
    title: data.title || 'Untitled',
    description: data.description || '',
    userId: data.userId || null,
    isAdult: data.isAdult === undefined ? true : !!data.isAdult,
    status: data.status || 'draft',
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata || {},
  };

  const ref = await db.collection(COLLECTION).add(payload);
  const doc = await db.collection(COLLECTION).doc(ref.id).get();
  return { id: ref.id, ...doc.data() };
}

async function getShow(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function listShows({ limit = 50, offset = 0 } = {}) {
  // Simple list, ordered by createdAt desc. Firestore offset is supported but costly.
  let q = db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit + offset);
  const snap = await q.get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (offset) return docs.slice(offset);
  return docs;
}

async function updateShow(id, patch) {
  const ref = db.collection(COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const now = new Date().toISOString();
  const updated = { ...patch, updatedAt: now };
  await ref.update(updated);
  const fresh = await ref.get();
  return { id: fresh.id, ...fresh.data() };
}

async function deleteShow(id) {
  const ref = db.collection(COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

module.exports = { createShow, getShow, listShows, updateShow, deleteShow };

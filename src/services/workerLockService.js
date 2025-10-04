// workerLockService.js
// Firestore-based lightweight lease for background workers to avoid duplicate processing on multi-instance deployments.

const { db } = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

const INSTANCE_ID = process.env.INSTANCE_ID || uuidv4();

async function acquireLock(workerType, ttlMs) {
  const lockRef = db.collection('system_locks').doc(workerType);
  const now = Date.now();
  const expiresAt = now + ttlMs;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) {
      tx.set(lockRef, { owner: INSTANCE_ID, expiresAt, updatedAt: now });
      return true;
    }
    const data = snap.data();
    if (!data.expiresAt || data.expiresAt < now) {
      tx.set(lockRef, { owner: INSTANCE_ID, expiresAt, updatedAt: now });
      return true;
    }
    if (data.owner === INSTANCE_ID) {
      // Refresh our lease
      tx.set(lockRef, { owner: INSTANCE_ID, expiresAt, updatedAt: now });
      return true;
    }
    return false; // Another active owner
  });
}

module.exports = { acquireLock, INSTANCE_ID };

// complianceLogs.js
// Helper for writing immutable compliance logs to Firestore

const { db, admin } = require("../firebaseAdmin");

/**
 * Write an immutable compliance log entry.
 * @param {object} opts
 * @param {string} opts.type - e.g., 'purchase', 'enqueue', 'post', 'review', 'refund'
 * @param {string|null} opts.userId
 * @param {string|null} opts.campaignId
 * @param {string|null} opts.entityId
 * @param {string} opts.action
 * @param {object} [opts.payload]
 */
async function logComplianceEvent({ type, userId = null, campaignId = null, entityId = null, action, payload = {} }) {
  if (!type || !action) throw new Error("type and action required");
  const doc = db.collection("compliance_logs").doc();
  const entry = {
    type,
    userId: userId || null,
    campaignId: campaignId || null,
    entityId: entityId || null,
    action,
    payload: payload || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    immutable: true,
  };
  await doc.set(entry);
  return { id: doc.id, ...entry };
}

module.exports = { logComplianceEvent };

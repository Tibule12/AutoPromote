// auditLogger: minimal append-only structured logging into Firestore `audit_logs` collection.
// Usage: audit.log(eventType, { userId, ...details })
// NOTE: Keep payloads small (< 1KB) to control Firestore costs.
const { db } = require('../firebaseAdmin');

class AuditLogger {
  constructor(collection = 'audit_logs') { this.col = collection; }
  async log(type, data = {}) {
    try {
      const entry = {
        type,
        at: new Date().toISOString(),
        ...data,
      };
      // Basic size guard
      const raw = JSON.stringify(entry);
      if (raw.length > 2048) entry._truncated = true; // flag if large
      await db.collection(this.col).add(entry);
    } catch (e) {
      // Fail silently to avoid user-facing errors due to audit issues.
      if (process.env.DEBUG_AUDIT === 'true') console.warn('[audit] log failure', e.message);
    }
  }
}

const audit = new AuditLogger();
module.exports = { audit, AuditLogger };

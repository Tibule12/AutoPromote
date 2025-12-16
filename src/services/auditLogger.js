// auditLogger: minimal append-only structured logging into Firestore `audit_logs` collection.
// Usage: audit.log(eventType, { userId, ...details })
// NOTE: Keep payloads small (< 1KB) to control Firestore costs.
const { db } = require("../firebaseAdmin");

class AuditLogger {
  constructor(collection = "audit_logs", { enablePIIRedaction = true } = {}) {
    this.col = collection;
    this.enablePIIRedaction = enablePIIRedaction;
  }
  redact(obj) {
    if (!this.enablePIIRedaction) return obj;
    const copy = Array.isArray(obj)
      ? obj.map(v => this.redact(v))
      : obj && typeof obj === "object"
        ? { ...obj }
        : obj;
    if (!copy || typeof copy !== "object") return copy;
    const piiKeys = [
      "email",
      "password",
      "token",
      "authorization",
      "auth",
      "secret",
      "address",
      "phone",
    ];
    for (const k of Object.keys(copy)) {
      if (piiKeys.includes(k.toLowerCase())) copy[k] = "[REDACTED]";
      else if (typeof copy[k] === "object") copy[k] = this.redact(copy[k]);
    }
    return copy;
  }
  async log(type, data = {}) {
    try {
      const base = { type, at: new Date().toISOString() };
      const entry = { ...base, ...this.redact(data) };
      // Optional integrity signature for financial / security events
      if (/payout|subscription|overage|security|webhook/i.test(type)) {
        try {
          const { attachSignature } = require("../utils/docSigner");
          Object.assign(entry, attachSignature({ ...entry }));
        } catch (_) {
          /* ignore */
        }
      }
      const raw = JSON.stringify(entry);
      if (raw.length > 2048) entry._truncated = true; // flag if large
      await db.collection(this.col).add(entry);
    } catch (e) {
      if (process.env.DEBUG_AUDIT === "true") console.warn("[audit] log failure", e.message);
    }
  }
}

const audit = new AuditLogger();
module.exports = { audit, AuditLogger };

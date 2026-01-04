#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// This script queries a Firestore collection (default `audit_logs`) and writes
// the most recent entries to a JSON file under `evidence/`.
// Usage: node scripts/exportAuditEvidence.js [limit] [collectionName]
// Example: node scripts/exportAuditEvidence.js 200 auditLogs

(async () => {
  try {
    const limit = parseInt(process.argv[2], 10) || parseInt(process.env.LIMIT, 10) || 200;
    const collectionName = process.argv[3] || process.env.COLLECTION_NAME || "audit_logs";
    const { db } = require("../firebaseAdmin");

    // Try to order by commonly used timestamp fields; prefer `at`, fallback to `timestamp` or document id ordering
    let query = null;
    try {
      query = db.collection(collectionName).orderBy("at", "desc").limit(limit);
    } catch (e) {
      try {
        query = db.collection(collectionName).orderBy("timestamp", "desc").limit(limit);
      } catch (_) {
        query = db.collection(collectionName).limit(limit);
      }
    }

    const snap = await query.get();
    const out = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      // Normalize Firestore Timestamps to ISO strings when possible for common fields
      const norm = { ...d };
      const tsFields = ["at", "timestamp", "createdAt", "updatedAt"];
      for (const f of tsFields) {
        if (norm[f] && typeof norm[f] === "object" && typeof norm[f].toDate === "function") {
          norm[f] = norm[f].toDate().toISOString();
        }
      }
      // If no explicit timestamp field, leave as-is
      out.push(Object.assign({ id: doc.id }, norm));
    });

    const dir = path.join(__dirname, "..", "evidence");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = collectionName.replace(/[^a-z0-9_-]/gi, "_");
    const fname = path.join(dir, `${safeName}_evidence_${Date.now()}.json`);
    fs.writeFileSync(fname, JSON.stringify(out, null, 2), "utf8");
    console.log("Wrote", fname, "entries:", out.length);
  } catch (err) {
    console.error("Failed to export collection evidence:", err && err.message ? err.message : err);
    process.exit(1);
  }
})();

#!/usr/bin/env node
const { db } = require("../firebaseAdmin");
const { v4: uuidv4 } = require("uuid");

// Usage: node scripts/createTestAudit.js [collectionName]
const collectionName = process.argv[2] || "auditLogs";
const now = new Date().toISOString();

(async () => {
  try {
    const id = uuidv4();
    const entry = {
      id,
      eventType: "admin_test_event",
      type: "admin_test_event",
      adminId: "test-admin-uid-123",
      adminEmail: "admin-redacted@example.com",
      status: "success",
      timestamp: now,
      at: now,
    };
    await db.collection(collectionName).doc(id).set(entry);
    console.log("Wrote test audit doc to", collectionName, "id=", id);
    process.exit(0);
  } catch (e) {
    console.error("createTestAudit failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();

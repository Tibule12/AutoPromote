#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { db, admin } = require("../firebaseAdmin");

// Scans auditLogs (or given collection) for suspicious events in the last 7 days.
// Usage: node scripts/detectSuspicious.js [collectionName] [limit]

const collectionName = process.argv[2] || "auditLogs";
const limit = parseInt(process.argv[3], 10) || 1000;
const now = new Date();
const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

function parseTimestamp(e) {
  const cand = e.at || e.timestamp || e.createdAt || e.updatedAt;
  if (!cand) return null;
  try {
    // Firestore Timestamp -> toDate present
    if (typeof cand === "object" && typeof cand.toDate === "function") return cand.toDate();
    return new Date(cand);
  } catch (e) {
    return null;
  }
}

function isSuspicious(e) {
  try {
    const type = String(e.type || e.eventType || e.action || "").toLowerCase();
    const status = String(e.status || "").toLowerCase();
    const payload = JSON.stringify(e).toLowerCase();
    // Heuristics:
    if (
      status &&
      (status.includes("fail") || status.includes("unauth") || status.includes("error"))
    )
      return { reason: "status indicates failure" };
    if (/admin/.test(type) && status !== "success")
      return { reason: "admin event with non-success status" };
    if (/admin/.test(type) && /login/.test(type)) return { reason: "admin login event" };
    if (/login/.test(type) && status !== "success") return { reason: "login failure" };
    if (
      payload.includes("unauthorized") ||
      payload.includes("invalid") ||
      payload.includes("forbidden")
    )
      return { reason: "contains unauthorized/invalid/forbidden" };
    if (payload.includes("token") && payload.includes("refresh"))
      return { reason: "token refresh activity" };
    if (payload.includes("revoke") && payload.includes("admin")) return { reason: "admin revoke" };
    // flag admin events generally as noteworthy
    if (/\badmin\b/.test(payload)) return { reason: "admin-related event" };
    return null;
  } catch (err) {
    return { reason: "error evaluating heuristics" };
  }
}

(async () => {
  try {
    console.log("Scanning collection", collectionName, "for events since", cutoff.toISOString());
    // Try to order by a timestamp field, fallback to simple limit
    let query;
    try {
      query = db.collection(collectionName).orderBy("at", "desc").limit(limit);
    } catch (_) {
      try {
        query = db.collection(collectionName).orderBy("timestamp", "desc").limit(limit);
      } catch (_) {
        query = db.collection(collectionName).limit(limit);
      }
    }
    const snap = await query.get();
    const findings = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const ts = parseTimestamp(d);
      if (ts && ts < cutoff) return; // older than 7 days
      const s = isSuspicious(d);
      if (s) {
        findings.push({
          id: doc.id,
          doc: d,
          reason: s.reason,
          ts: ts ? ts.toISOString() : "(no-ts)",
        });
      }
    });

    const dir = path.join(__dirname, "..", "evidence");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const outTxt = path.join(dir, `alerts_${collectionName}_${stamp}.txt`);
    const outJson = path.join(dir, `alerts_${collectionName}_${stamp}_slack.json`);

    const header = `Suspicious audit findings for collection ${collectionName} (since ${cutoff.toISOString()})\nFound: ${findings.length} items\nGenerated: ${new Date().toISOString()}\n\n`;
    fs.writeFileSync(
      outTxt,
      header +
        findings
          .map(
            f =>
              `ID: ${f.id}\nTime: ${f.ts}\nReason: ${f.reason}\nType: ${f.doc.type || f.doc.eventType || "(n/a)"}\nSample: ${JSON.stringify(f.doc, null, 2)}\n---\n`
          )
          .join("\n"),
      "utf8"
    );

    // Produce a simple Slack-like payload (not sent) for evidence
    const slackPayload = {
      text: `Detected ${findings.length} suspicious audit events in ${collectionName}`,
      ts: new Date().toISOString(),
      findings: findings.map(f => ({
        id: f.id,
        time: f.ts,
        reason: f.reason,
        type: f.doc.type || f.doc.eventType,
      })),
    };
    fs.writeFileSync(outJson, JSON.stringify(slackPayload, null, 2), "utf8");

    // Print console summary
    console.log(header);
    if (findings.length === 0) console.log("No suspicious events found in last 7 days.");
    else {
      findings.forEach((f, i) => {
        console.log(
          `[${i + 1}] id=${f.id} time=${f.ts} reason=${f.reason} type=${f.doc.type || f.doc.eventType || "(n/a)"} `
        );
      });
    }
    console.log("\nWrote alert files:\n", outTxt, "\n", outJson);
    process.exit(0);
  } catch (e) {
    console.error("detectSuspicious failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();

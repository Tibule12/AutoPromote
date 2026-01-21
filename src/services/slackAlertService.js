// slackAlertService.js
// Lightweight Slack alert sender using Incoming Webhooks

const { db } = require("../firebaseAdmin");

const ENABLED = String(process.env.ENABLE_SLACK_ALERTS || "false").toLowerCase() === "true";
const WEBHOOK = process.env.SLACK_ALERT_WEBHOOK_URL || null;

async function sendSlackAlert({
  text,
  blocks = null,
  fallback = null,
  severity = "info",
  extra = {},
} = {}) {
  if (!ENABLED) return { ok: false, reason: "disabled" };
  if (!WEBHOOK) return { ok: false, reason: "no_webhook" };
  try {
    const body = { text: fallback || text };
    if (blocks) body.blocks = blocks;
    // Attach small metadata to the message
    body.attachments = [
      {
        color: severity === "critical" ? "#e01e5a" : severity === "warning" ? "#f2c744" : "#36a64f",
        text: text,
      },
    ];
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ok = res && (res.status === 200 || res.status === 201 || res.status === 204);
    // best-effort: record we attempted to send an alert
    try {
      await db.collection("events").add({
        type: "slack_alert_sent",
        ok,
        severity,
        text: text ? (text.length > 1000 ? text.slice(0, 1000) + "…" : text) : null,
        at: new Date().toISOString(),
        extra: extra || null,
      });
    } catch (_) {}
    return { ok };
  } catch (err) {
    try {
      await db
        .collection("events")
        .add({
          type: "slack_alert_error",
          error: err && err.message,
          at: new Date().toISOString(),
          extra,
        });
    } catch (_) {}
    return { ok: false, reason: err && err.message };
  }
}

module.exports = { sendSlackAlert };

#!/usr/bin/env node
// set-slack-webhook.js
// Writes alerting.slackWebhookUrl into runtime config via updateConfig()

const { getConfig, updateConfig } = require("../src/services/configService");

async function main() {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.error("SLACK_ALERT_WEBHOOK_URL not set in environment. Provide via env variable.");
    process.exit(2);
  }

  console.log("Setting Slack webhook URL in alerting config...");
  const cfg = await getConfig(true).catch(e => {
    console.error("Failed to load config:", e && (e.message || e));
    process.exit(1);
  });

  const patch = { alerting: { ...(cfg.alerting || {}), slackWebhookUrl: url } };
  try {
    const updated = await updateConfig(patch);
    console.log("Updated config:", JSON.stringify(updated.alerting || {}, null, 2));
  } catch (e) {
    console.error("Failed to update config:", e && (e.message || e));
    process.exit(1);
  }

  // Optionally send a test alert using the alertingService to ensure delivery
  try {
    const { sendAlert } = require("../src/services/alertingService");
    const r = await sendAlert({ type: "slack_webhook_test", severity: "info", message: "Test alert: Slack webhook configured via set-slack-webhook.js", meta: { ts: new Date().toISOString() } });
    console.log("sendAlert result:", r);
  } catch (e) {
    console.error("Failed to send test alert:", e && (e.message || e));
  }
}

main().catch(e => {
  console.error(e && (e.stack || e.message || e));
  process.exit(1);
});
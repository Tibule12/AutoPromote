#!/usr/bin/env node
// send-tiktok-test-alert.js
// Sends a real alert of an enabled TikTok type to verify Slack delivery.

const { sendAlert } = require("../src/services/alertingService");

async function main() {
  console.log("Sending test TikTok fallback alert (tiktok_upload_fallback_high)...");
  try {
    const res = await sendAlert({
      type: "tiktok_upload_fallback_high",
      severity: "warning",
      message: "Test alert: TikTok upload fallback ratio is high (manual test)",
      meta: { test: true, ts: new Date().toISOString(), enqueues: 20, fallbacks: 10 },
    });
    console.log("sendAlert result:", res);
    if (res && res.ok) process.exit(0);
    process.exit(0);
  } catch (e) {
    console.error("sendAlert failed:", e && (e.stack || e.message || e));
    process.exit(1);
  }
}

main();
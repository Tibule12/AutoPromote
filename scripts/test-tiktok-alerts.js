#!/usr/bin/env node
// test-tiktok-alerts.js
// Quick helper to simulate TikTok metric spikes and exercise alert checks.

const { db, admin } = require("../src/firebaseAdmin");
const { incrCounter } = require("../src/services/metricsRecorder");
const { runAlertChecks } = require("../src/services/alertingService");

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function simulatePublishFailure({ successes = 5, failures = 20 }) {
  console.log(`Simulating publish events: success=${successes} failure=${failures}`);
  // Apply increments
  await incrCounter("tiktok.publish.success", successes);
  await incrCounter("tiktok.publish.failure", failures);
}

async function simulateFallbackHigh({ enqueues = 50, fallbacks = 20 }) {
  console.log(`Simulating enqueues/fallbacks: enqueues=${enqueues} fallbacks=${fallbacks}`);
  await incrCounter("tiktok.enqueue.succeeded", enqueues);
  await incrCounter("tiktok.upload.fallback.file_upload", fallbacks);
}

async function main() {
  const mode = (process.argv[2] || "publish-failure").toLowerCase();
  console.log("Starting TikTok alert test (mode=", mode, ")");

  // Warm baseline snapshot
  console.log("Taking baseline snapshot (first run - may return skipped)");
  const first = await runAlertChecks();
  console.log("Baseline result:", JSON.stringify(first, null, 2));

  // If credentials are missing, alert checks will return errors (use emulator or set credentials)
  if (first && first.tiktok && first.tiktok.error && first.tiktok.error.includes("Could not load the default credentials")) {
    console.error("Error: Firestore credentials not available. To run this script locally, either:");
    console.error("  - Start the Firestore emulator: npm run emulator:start and set FIRESTORE_EMULATOR_HOST, or");
    console.error("  - Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with access to Firestore.");
    process.exit(2);
  }

  if (mode === "publish-failure") {
    await simulatePublishFailure({ successes: 5, failures: 25 });
  } else if (mode === "fallback-high") {
    await simulateFallbackHigh({ enqueues: 60, fallbacks: 20 });
  } else if (mode === "both") {
    await simulatePublishFailure({ successes: 5, failures: 25 });
    await simulateFallbackHigh({ enqueues: 60, fallbacks: 20 });
  } else {
    console.error("Unknown mode. Use publish-failure, fallback-high, or both");
    process.exit(2);
  }

  // allow Firestore eventual consistency a short moment
  await sleep(1000);

  console.log("Running alert checks again to detect deltas and trigger alerts");
  const second = await runAlertChecks();
  console.log("Check result:", JSON.stringify(second, null, 2));

  if (second && second.tiktok && second.tiktok.alerted) {
    console.log("✅ Alert detected: ", JSON.stringify(second.tiktok, null, 2));
  } else {
    console.log("No alert detected. If no alert fired, try increasing the simulated counts or check config.alerting thresholds.");
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error("Test script failed:", e && (e.stack || e.message || e));
    process.exit(1);
  });
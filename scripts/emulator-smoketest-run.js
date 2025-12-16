#!/usr/bin/env node
/*
 * Basic emulator smoke test for autopilot admin endpoints
 * Usage: (start emulators with firestore+functions) and then run this script
 * Example: FIRESTORE_EMULATOR_HOST=localhost:8080 npx firebase emulators:start --only firestore,functions
 * Then in another terminal: node ./scripts/emulator-smoketest-run.js
 */
const fetch = require("node-fetch");

const project = process.env.GCLOUD_PROJECT || "autopromote-cc6d3";
const base = `http://localhost:5001/${project}/us-central1/api`;

async function callPreview() {
  const url = `${base}/admin/ab_tests/test-autopilot-1/autopilot/preview`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer test-token-for-adminUser",
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  console.log("Preview status:", res.status);
  try {
    console.log(JSON.parse(body));
  } catch (e) {
    console.log(body);
  }
}

async function callSimulate() {
  const url = `${base}/admin/ab_tests/test-autopilot-1/autopilot/simulate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token-for-adminUser",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ simulationCount: 50 }),
  });
  const body = await res.text();
  console.log("Simulate status:", res.status);
  try {
    console.log(JSON.parse(body));
  } catch (e) {
    console.log(body);
  }
}

async function main() {
  console.log("Running autopilot smoke tests against", base);
  try {
    await callPreview();
  } catch (e) {
    console.log("Preview error", e.message);
  }
  try {
    await callSimulate();
  } catch (e) {
    console.log("Simulate error", e.message);
  }
}

main().catch(err => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});

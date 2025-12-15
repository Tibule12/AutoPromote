#!/usr/bin/env node
/*
 * Script to process pending payouts via PayPal. Uses FIREBASE_ADMIN_SERVICE_ACCOUNT
 * and PAYPAL_* environment variables.
 */
const admin = require("firebase-admin");
const { processPendingPayouts } = require("../src/services/paypalPayoutService");

async function main() {
  // Initialize firebase admin using env service account
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  console.log("Processing pending payouts...");
  try {
    const res = await processPendingPayouts(50);
    console.log("Processed payouts:", res.processed);
    process.exit(0);
  } catch (e) {
    console.error("Failed to process payouts:", e && e.message);
    process.exit(1);
  }
}

main();

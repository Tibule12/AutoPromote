#!/usr/bin/env node
/*
 * Script to process pending payouts via PayPal. Uses FIREBASE_ADMIN_SERVICE_ACCOUNT
 * and PAYPAL_* environment variables.
 */
function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function parseArgs(argv) {
  return argv.reduce(
    (opts, arg) => {
      if (arg === "--dry-run") opts.dryRun = true;
      if (arg.startsWith("--limit=")) {
        const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
        if (Number.isFinite(parsed) && parsed > 0) opts.limit = parsed;
      }
      return opts;
    },
    { dryRun: false, limit: 50 }
  );
}

function hasFirebaseCredentials(env = process.env) {
  const hasServiceAccountJson = Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_BASE64
  );
  const hasIndividualServiceAccountFields = Boolean(
    env.FIREBASE_PROJECT_ID && env.FIREBASE_PRIVATE_KEY && env.FIREBASE_CLIENT_EMAIL
  );
  const hasApplicationDefault = Boolean(
    env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT
  );

  return hasServiceAccountJson || hasIndividualServiceAccountFields || hasApplicationDefault;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dryRun =
    opts.dryRun || isTruthy(process.env.PAYOUTS_DRY_RUN) || isTruthy(process.env.DRY_RUN);
  const hasFirebase = hasFirebaseCredentials();

  console.log("Processing pending payouts...");

  if (!hasFirebase) {
    if (dryRun) {
      console.log("Dry run: no Firebase credentials configured; skipping payout scan.");
      return { processed: 0, dryRun: true, skipped: true };
    }

    throw new Error(
      "Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT_BASE64 or run with --dry-run."
    );
  }

  try {
    const { processPendingPayouts } = require("../src/services/paypalPayoutService");
    const res = await processPendingPayouts(opts.limit);
    console.log("Processed payouts:", res.processed);
    return res;
  } catch (e) {
    console.error("Failed to process payouts:", e && e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.error("Failed to process payouts:", e && e.message);
      process.exit(1);
    });
}

module.exports = { hasFirebaseCredentials, isTruthy, parseArgs, main };

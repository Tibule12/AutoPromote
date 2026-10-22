#!/usr/bin/env node
// Explicit operator action using the configured service account. Never changes
// subscription, payment, usage, user role or other accounts. Not run by the timer.
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes("--apply") || !args.includes("--limit") || !args.includes("--reason"))
  throw Error("Explicit --apply --limit N --reason TEXT required");
const session = JSON.parse(
  fs.readFileSync(path.join(root, require("../../config/daily-studio.json").authState))
);
const user = session.origins
  .flatMap(origin => origin.localStorage)
  .find(item => item.name === "user");
const uid = JSON.parse(user?.value || "{}").uid;
if (!uid) throw Error("Retained actual account identity missing");
require("dotenv").config({ path: path.resolve(root, "../AutoPromote/.env"), quiet: true });
async function main() {
  const { db } = require("../../src/firebaseAdmin");
  const { setUploadAllowance } = require("../../src/services/uploadAllowance");
  const allowance = await setUploadAllowance(db, {
    userId: uid,
    adminId: "service-operator:explicit-account-owner-request",
    monthlyLimit: Number(option("--limit")),
    monthlyPlatformPosts: args.includes("--publishing-limit")
      ? Number(option("--publishing-limit"))
      : undefined,
    reason: option("--reason"),
    publishedVideoHours: args.includes("--published-retention-hours")
      ? Number(option("--published-retention-hours"))
      : undefined,
  });
  const folder = path.join(
    root,
    "reports/daily-studio",
    new Date().toISOString().slice(0, 10),
    "proof"
  );
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, "upload-allowance-change.private.json"),
    JSON.stringify(
      {
        uid,
        allowance,
        source: "Explicit user request to increase upload limit",
        billingChange: false,
        usageReset: false,
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({
      monthlyUploadAllowance: allowance.monthlyLimit,
      auditWritten: true,
      billingChange: false,
      usageReset: false,
    })
  );
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.message);
    process.exit(1);
  });

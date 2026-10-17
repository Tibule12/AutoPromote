#!/usr/bin/env node
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.resolve(root, "../AutoPromote/.env"), quiet: true });
async function main() {
  const dryRun = !process.argv.includes("--apply");
  const results = await require("../../src/services/storageCleanupService").cleanupPublishedVideos({
    dryRun,
  });
  const file = path.join(root, "reports/daily-studio", "published-retention-latest.private.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ checkedAt: new Date().toISOString(), dryRun, results }, null, 2),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({
      dryRun,
      evaluated: results.length,
      eligible: results.filter(row => row.eligible).length,
      objectsDeleted: dryRun
        ? 0
        : results.reduce(
            (total, row) => total + (row.deleted?.filter(item => !item.alreadyMissing).length || 0),
            0
          ),
    })
  );
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.message);
    process.exit(1);
  });

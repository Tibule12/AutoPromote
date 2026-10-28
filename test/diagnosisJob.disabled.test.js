const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("A disabled diagnosis job reports failure before any database/provider initialization", () => {
  const root = path.resolve(__dirname, "..");
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    require('./scripts/run-diagnosis-job').main().then(() => {
      if (Object.keys(require.cache).some(file => /firebaseAdmin|contentRecoveryService|platformStatsPoller/.test(file)))
        process.exitCode = 9;
    });
  `,
    ],
    {
      cwd: root,
      env: { ...process.env, ENABLE_CONTENT_DIAGNOSIS_CRON: "false" },
      encoding: "utf8",
      timeout: 10000,
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No analytics or diagnosis work ran/);
});

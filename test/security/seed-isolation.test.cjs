const { it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");

for (const changes of [
  {},
  { GCLOUD_PROJECT: "autopromote-cc6d3", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8188" },
  { GCLOUD_PROJECT: "demo-autopromote-e2e" },
  { GCLOUD_PROJECT: "demo-autopromote-e2e", FIRESTORE_EMULATOR_HOST: "remote.example:8080" },
  { GCLOUD_PROJECT: "demo-autopromote-e2e", FIRESTORE_EMULATOR_HOST: "127.0.0.1:0" },
  { GCLOUD_PROJECT: "demo-autopromote-e2e", FIRESTORE_EMULATOR_HOST: "127.0.0.1:65536" },
]) {
  it(`refuses emulator fixture writes without literal demo/loopback guards: ${JSON.stringify(changes)}`, () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/seed-autopilot-emulator.js")],
      {
        env: { PATH: process.env.PATH, ...changes },
        encoding: "utf8",
        timeout: 5000,
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Autopilot fixtures require a local demo Firestore emulator/);
  });
}
for (const key of ["CI", "GITHUB_ACTIONS"]) {
  it(`refuses cloud fixture seeding under ${key} before credentials or SDK import`, () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/seed-autopilot-cloud.js")],
      {
        env: { PATH: process.env.PATH, [key]: "true" },
        encoding: "utf8",
        timeout: 5000,
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cloud fixture seeding is disabled in CI/);
  });
}

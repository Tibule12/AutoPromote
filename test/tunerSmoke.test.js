// tunerSmoke.test.js - lightweight smoke tests (no real Firestore writes if emulator not present)
const assert = require("assert");

async function run() {
  console.log("Running tuner smoke test");
  try {
    const svc = require("../src/services/banditTuningService");
    assert.ok(svc.recordSelectionOutcome, "recordSelectionOutcome missing");
    assert.ok(svc.applyAutoTune, "applyAutoTune missing");
    console.log("Bandit tuning service exports verified");
  } catch (e) {
    console.error("Tuner smoke test failed:", e.message);
    process.exitCode = 1;
  }

  try {
    const exp = require("../src/services/explorationControllerService");
    assert.ok(exp.adjustExplorationFactor, "adjustExplorationFactor missing");
    console.log("Exploration controller exports verified");
  } catch (e) {
    console.error("Exploration controller test failed:", e.message);
    process.exitCode = 1;
  }
}

run();

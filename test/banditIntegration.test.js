// banditIntegration.test.js - lightweight integration smoke test
// NOTE: This is a placeholder; in a full setup we'd use Firestore emulator.

const assert = require("assert");

(async function run() {
  console.log("[integration] starting bandit integration smoke test");
  try {
    const {
      recordSelectionOutcome,
      computeSuggestedWeights,
    } = require("../src/services/banditTuningService");
    // Inject synthetic outcome samples
    for (let i = 0; i < 60; i++) {
      await recordSelectionOutcome({
        contentId: "c1",
        platform: "test",
        variant: "v" + (i % 3),
        rewardCtr: Math.random() * 0.1 + (i % 3 === 0 ? 0.05 : 0),
        rewardQuality: 0.4 + Math.random() * 0.2,
        rewardReach: 0.05 + Math.random() * 0.05,
      });
    }
    const suggestion = await computeSuggestedWeights();
    assert(suggestion && suggestion.sample >= 50, "expected sufficient sample for suggestion");
    console.log("[integration] suggestion", suggestion);
    console.log("[integration] PASS");
  } catch (e) {
    console.error("[integration] FAIL", e.message);
  }
})();

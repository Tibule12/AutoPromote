// scripts/verify-tiktok-canary.js
// Minimal script to verify TIKTOK feature-gate + canary logic without needing a running emulator.

async function runScenario(env, uid) {
  // Reset require cache for modules we will mock
  delete require.cache[require.resolve("../src/services/promotionTaskQueue")];
  // Provide a minimal stub for firebaseAdmin to avoid network calls
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        id: `stub-${Math.random().toString(36).slice(2, 8)}`,
        set: async () => ({}),
      }),
    }),
  };
  const fakeFirebaseAdmin = { db: fakeDb, admin: {} };
  // Inject stub into require cache for src/firebaseAdmin so promotionTaskQueue uses it
  const fakePath = require.resolve("../src/firebaseAdmin");
  require.cache[fakePath] = { id: fakePath, filename: fakePath, loaded: true, exports: fakeFirebaseAdmin };

  // Also stub metricsRecorder to prevent errors when incrementing metrics
  const metricsPath = require.resolve("../src/services/metricsRecorder");
  require.cache[metricsPath] = {
    id: metricsPath,
    filename: metricsPath,
    loaded: true,
    exports: { incrCounter: () => {} },
  };

  // Set env as requested
  process.env.TIKTOK_ENABLED = String(env.enabled);
  process.env.TIKTOK_CANARY_UIDS = env.canary.join(",");
  // Force fast-path in the module (mimic test mode)
  process.env.JEST_WORKER_ID = "1";

  // Now require the module fresh and call enqueuePlatformPostTask
  const { enqueuePlatformPostTask } = require("../src/services/promotionTaskQueue");

  try {
    const res = await enqueuePlatformPostTask({
      contentId: "verify-canary-content",
      uid,
      platform: "tiktok",
      reason: "manual",
      payload: {},
    });
    return res;
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

(async () => {
  // Scenario A: TIKTOK disabled and empty canary
  console.log("Scenario A: TIKTOK_ENABLED=false, TIKTOK_CANARY_UIDS= (empty)");
  let r = await runScenario({ enabled: false, canary: [] }, "user-not-canary");
  console.log("Result for user-not-canary:", r);

  // Scenario B: same env but allow a specific uid
  console.log("Scenario B: TIKTOK_ENABLED=false, TIKTOK_CANARY_UIDS=allowed-uid");
  r = await runScenario({ enabled: false, canary: ["allowed-uid"] }, "allowed-uid");
  console.log("Result for allowed-uid:", r);

  // Scenario C: TIKTOK enabled globally (should allow any uid)
  console.log("Scenario C: TIKTOK_ENABLED=true, TIKTOK_CANARY_UIDS= (ignored)");
  r = await runScenario({ enabled: true, canary: [] }, "any-user");
  console.log("Result for any-user:", r);
})();

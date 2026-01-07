const { run } = require("../../workers/fetchProviderFeedsWorker");

let hasRulesUnitTesting = true;
let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  hasRulesUnitTesting = false;
}

jest.setTimeout(30000);

describe("fetchProviderFeedsWorker", () => {
  if (hasRulesUnitTesting) {
    let testEnv, testDb;
    beforeAll(async () => {
      const { initializeTestEnvironmentWithDiscovery } = require("../../testUtils/initTestEnv");
      testEnv = await initializeTestEnvironmentWithDiscovery("fetch-provider-worker");
    });
    beforeEach(async () => {
      const ctx = testEnv.authenticatedContext("service-account", {
        firebase: { sign_in_provider: "service_account" },
      });
      testDb = ctx.firestore();
    });
    afterEach(async () => {
      await testEnv.clearFirestore();
    });
    afterAll(async () => {
      await testEnv.cleanup();
    });

    test("run imports mocked provider feeds", async () => {
      // reset modules so we can mock providers prior to requiring the worker
      jest.resetModules();
      jest.mock("../../services/providers/spotifyProvider", () => ({
        fetchTrending: async () => [{ id: "sp1", title: "S1" }],
      }));
      jest.mock("../../services/providers/tiktokProvider", () => ({
        fetchTrending: async () => [{ id: "tt1", title: "T1" }],
      }));

      const { run } = require("../../workers/fetchProviderFeedsWorker");

      const res = await run({ db: testDb, providersToFetch: ["spotify", "tiktok"] });
      expect(Array.isArray(res)).toBe(true);
      const sp = res.find(r => r.provider === "spotify");
      expect(sp).toBeDefined();
      if (sp.error) throw new Error(`provider error: ${sp.error}`);
      expect(typeof sp.addedOrUpdated).toBe("number");
      expect(sp.addedOrUpdated).toBeGreaterThanOrEqual(1);

      // verify docs exist
      const s = await testDb.collection("sounds").where("providerId", "==", "sp1").get();
      expect(s.docs.length).toBeGreaterThanOrEqual(1);
    });
  } else {
    test("run with stub db", async () => {
      const fb = require("../../firebaseAdmin");
      const res = await run({ db: fb.db, providersToFetch: ["spotify"] });
      expect(Array.isArray(res)).toBe(true);
    });
  }
});

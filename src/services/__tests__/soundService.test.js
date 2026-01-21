const { addSound, importFromProvider, listSounds } = require("../soundService");

let hasRulesUnitTesting = true;
let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  hasRulesUnitTesting = false;
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  hasRulesUnitTesting = false;
}

// Allow more time for emulator startup and Firestore operations
jest.setTimeout(30000);

describe("soundService", () => {
  if (hasRulesUnitTesting) {
    let testEnv, testDb;
    beforeAll(async () => {
      const { initializeTestEnvironmentWithDiscovery } = require("../../testUtils/initTestEnv");
      testEnv = await initializeTestEnvironmentWithDiscovery("sound-service");
    });
    beforeEach(async () => {
      const ctx = testEnv.authenticatedContext("service-account", {
        firebase: { sign_in_provider: "service_account" },
      });
      testDb = ctx.firestore();
      global.__testDb = testDb;
    });
    afterEach(async () => {
      await testEnv.clearFirestore();
      delete global.__testDb;
    });
    afterAll(async () => {
      await testEnv.cleanup();
    });

    test("addSound and listSounds work (emulator)", async () => {
      const { id } = await addSound(testDb, { title: "Beat One", durationSec: 12 });
      expect(id).toBeDefined();
      const list = await listSounds(testDb, { filter: "new" });
      expect(Array.isArray(list)).toBe(true);
      expect(list.find(s => s.id === id)).toBeDefined();
    });

    test("importFromProvider adds feed items", async () => {
      const feed = [
        { id: "p1", title: "Trend 1", duration: 10 },
        { id: "p2", title: "Trend 2", duration: 8 },
      ];
      const added = await importFromProvider(testDb, "spotify", feed);
      expect(added.length).toBe(2);
      const list = await listSounds(testDb, { filter: "all" });
      expect(list.length).toBeGreaterThanOrEqual(2);
    });
  } else {
    // fallback: use in-memory stubbed db from firebaseAdmin
    const fbAdmin = require("../../firebaseAdmin");

    beforeEach(() => {
      /* no-op, using in-memory stub */
    });

    test("addSound & list (stub)", async () => {
      const { id } = await addSound(fbAdmin.db, { title: "Stub Sound" });
      expect(id).toBeDefined();
      const list = await listSounds(fbAdmin.db, { filter: "all" });
      expect(Array.isArray(list)).toBe(true);
    });
  }
});

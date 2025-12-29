const { runOnce } = require("../services/memeticWorker");

// Increase default Jest timeout to allow emulator startup
jest.setTimeout(30000);

let hasRulesUnitTesting = true;
let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  // not available in this environment (offline or not installed)
  hasRulesUnitTesting = false;
}

const firebaseAdmin = require("../../firebaseAdmin");

describe("memeticWorker", () => {
  if (hasRulesUnitTesting) {
    let testEnv;
    let testDb;

    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({ projectId: "memetic-test" });
    });

    beforeEach(async () => {
      const context = testEnv.unauthenticatedContext();
      testDb = context.firestore();
      await testDb.collection("memetic_experiments").add({
        plan: [{ variantId: "v1", variant: { hookStrength: 0.6 } }],
        options: { seedSize: 100 },
        status: "scheduled",
        createdAt: Date.now(),
      });
    });

    afterEach(async () => {
      await testEnv.clearFirestore();
    });

    afterAll(async () => {
      await testEnv.cleanup();
    });

    test("runOnce creates seeds and marks experiment seeded (emulator)", async () => {
      const res = await runOnce({ limit: 5 }, testDb);
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThanOrEqual(1);
      expect(res[0].seeded).toBe(1);

      // verify memetic_seeds was created
      const seedsSnap = await testDb.collection("memetic_seeds").get();
      expect(seedsSnap.docs.length).toBeGreaterThanOrEqual(1);

      const seedData = seedsSnap.docs[0].data();
      expect(seedData.experimentId).toBe(res[0].experimentId);
      expect(seedData.variantId).toBe("v1");
      expect(seedData.seedSize).toBe(100);
      expect(seedData.status).toBe("scheduled");

      // verify experiment status updated and seedCount/seededAt present
      const exDoc = await testDb.collection("memetic_experiments").doc(res[0].experimentId).get();
      expect(exDoc.exists).toBeTruthy();
      const exData = exDoc.data();
      expect(exData.status).toBe("seeded");
      expect(exData.seedCount).toBe(1);
      expect(exData.seededAt).toBeDefined();
    });
  } else {
    // Fallback: use the in-memory stub exported by firebaseAdmin
    beforeEach(() => {
      // helper to make a simple QuerySnapshot-like object
      const makeQuerySnapshot = docs => ({
        forEach: cb => docs.forEach(d => cb({ id: d.id, data: () => d.data })),
      });

      // capture last-added seed for assertions
      let lastSeed = null;
      // default: one scheduled experiment doc
      firebaseAdmin.db.collection = name => {
        if (name === "memetic_experiments") {
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  get: async () =>
                    makeQuerySnapshot([
                      {
                        id: "exp1",
                        data: {
                          plan: [{ variantId: "v1", variant: { hookStrength: 0.6 } }],
                          options: { seedSize: 100 },
                          status: "scheduled",
                        },
                      },
                    ]),
                }),
              }),
            }),
            doc: id => ({
              update: async patch => true,
              get: async () => ({
                exists: true,
                data: () => ({
                  plan: [{ variantId: "v1", variant: { hookStrength: 0.6 } }],
                  options: { seedSize: 100 },
                  status: "scheduled",
                }),
              }),
            }),
          };
        }
        if (name === "memetic_seeds") {
          return {
            add: async doc => {
              lastSeed = doc;
              return { id: "seed123", ...doc };
            },
          };
        }
        return {
          doc: id => ({
            update: async patch => true,
            get: async () => ({ exists: false, data: () => ({}) }),
          }),
          add: async c => ({ id: "x" }),
        };
      };
      try {
        require("../firebaseAdmin").db.collection = firebaseAdmin.db.collection;
      } catch (e) {}

      // expose a helper on the test scope so the test can assert on lastSeed
      Object.defineProperty(global, "__lastSeed", { get: () => lastSeed });
    });

    test("runOnce creates seeds and marks experiment seeded (stub)", async () => {
      const res = await runOnce({ limit: 5 });
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThanOrEqual(1);
      expect(res[0].seeded).toBe(1);

      // assert last seed matches expectations
      const lastSeed = global.__lastSeed;
      expect(lastSeed).not.toBeNull();
      expect(lastSeed.experimentId).toBe(res[0].experimentId);
      expect(lastSeed.variantId).toBe("v1");
      expect(lastSeed.seedSize).toBe(100);
    });
  }
});

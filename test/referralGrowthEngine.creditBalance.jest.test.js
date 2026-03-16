describe("referralGrowthEngine.getCreditBalance", () => {
  let docs;
  let setCalls;
  let referralGrowthEngine;

  beforeEach(() => {
    jest.resetModules();

    docs = {
      user_credits: new Map(),
      users: new Map([["user-1", { credits: 150 }]]),
    };
    setCalls = [];

    const buildDocRef = (collectionName, docId) => ({
      async get() {
        const value = docs[collectionName].get(docId);
        return {
          exists: typeof value !== "undefined",
          data: () => value,
        };
      },
      async set(payload, options = {}) {
        const previous = docs[collectionName].get(docId) || {};
        const nextValue = options.merge ? { ...previous, ...payload } : payload;
        docs[collectionName].set(docId, nextValue);
        setCalls.push({ collectionName, docId, payload, options });
      },
    });

    jest.doMock("../src/firebaseAdmin", () => ({
      db: {
        collection(collectionName) {
          if (!docs[collectionName]) {
            docs[collectionName] = new Map();
          }

          return {
            doc(docId) {
              return buildDocRef(collectionName, docId);
            },
          };
        },
      },
    }));

    referralGrowthEngine = require("../src/services/referralGrowthEngine");
  });

  test("restores balance from the legacy users document when user_credits is missing", async () => {
    const result = await referralGrowthEngine.getCreditBalance("user-1");

    expect(result.balance).toBe(150);
    expect(result.totalEarned).toBe(150);
    expect(result.transactions).toEqual([]);
    expect(docs.user_credits.get("user-1")).toMatchObject({
      balance: 150,
      totalEarned: 150,
    });
    expect(setCalls).toHaveLength(1);
  });
});
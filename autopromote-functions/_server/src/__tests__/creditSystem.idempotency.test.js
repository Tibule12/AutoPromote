const mockLedger = [];
const mockUserData = { credits: 0, subscriptionTier: "premium" };

const mockDb = {
  collection: jest.fn(name => {
    if (name === "users") {
      return { doc: jest.fn(id => ({ kind: "user", id })) };
    }
    if (name === "user_billing") {
      return { doc: jest.fn(id => ({ kind: "billing", id })) };
    }
    if (name === "credit_usage") {
      const query = {
        kind: "ledger-query",
        where: jest.fn(() => query),
      };
      return {
        where: query.where,
        doc: jest.fn(() => ({ kind: "ledger", id: `ledger-${mockLedger.length + 1}` })),
      };
    }
    throw new Error(`Unexpected collection ${name}`);
  }),
  runTransaction: jest.fn(async callback => {
    const transaction = {
      get: jest.fn(async ref => {
        if (ref.kind === "user") return { exists: true, data: () => mockUserData };
        if (ref.kind === "billing") return { exists: false, data: () => ({}) };
        if (ref.kind === "ledger") {
          return {
            exists: mockLedger.length > 0,
            data: () => mockLedger[0],
          };
        }
        if (ref.kind === "ledger-query") {
          return {
            forEach: visitor => mockLedger.forEach(entry => visitor({ data: () => entry })),
          };
        }
        throw new Error(`Unexpected transaction read ${ref.kind}`);
      }),
      update: jest.fn(),
      set: jest.fn((_ref, entry) => mockLedger.push(entry)),
    };
    return callback(transaction);
  }),
};

jest.mock("../firebaseAdmin", () => ({ db: mockDb }));
jest.mock("../config/subscriptionPlans", () => ({
  normalizePlanId: value => value,
  resolvePlan: () => ({ features: { monthlyCredits: 100 } }),
}));
jest.mock("../services/billingService", () => ({ getEffectiveTierSnapshot: jest.fn() }));

const { deductCredits } = require("../creditSystem");

describe("credit charge idempotency", () => {
  beforeEach(() => {
    mockLedger.splice(0, mockLedger.length);
    jest.clearAllMocks();
    process.env.NODE_ENV = "production";
  });

  afterAll(() => {
    delete process.env.NODE_ENV;
  });

  test("the same render request is charged only once", async () => {
    const metadata = { idempotencyKey: "media-process:request-123" };

    const first = await deductCredits("user-1", 10, "process", metadata);
    const retry = await deductCredits("user-1", 10, "process", metadata);

    expect(first.success).toBe(true);
    expect(retry).toEqual(expect.objectContaining({ success: true, duplicate: true }));
    expect(mockLedger).toHaveLength(1);
    expect(mockLedger[0].idempotencyKey).toBe(metadata.idempotencyKey);
  });
});

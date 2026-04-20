jest.mock("../firebaseAdmin", () => {
  const makeDoc = data => ({
    exists: true,
    data: () => data,
  });

  const db = {
    collection: jest.fn(name => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          name === "user_billing"
            ? makeDoc({ tier: "free", bot_actions_used: 0, status: "active" })
            : makeDoc({ subscriptionTier: "free", subscriptionStatus: "active" })
        ),
        set: jest.fn(),
        update: jest.fn(),
      })),
    })),
  };

  return {
    db,
    admin: {
      firestore: {
        FieldValue: {
          increment: jest.fn(value => ({ __increment: value })),
        },
      },
    },
  };
});

const { checkBotEntitlement } = require("../services/billingService");

describe("functions billingService entitlement enforcement", () => {
  it("denies free-tier bot boost access when the plan does not include it", async () => {
    await expect(checkBotEntitlement("user-1", "bot_boost")).rejects.toThrow(
      "requires a paid subscription"
    );
  });
});
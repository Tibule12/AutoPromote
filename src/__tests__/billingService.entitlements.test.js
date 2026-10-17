jest.mock("../firebaseAdmin", () => {
  const makeDoc = data => ({
    exists: true,
    data: () => data,
  });

  const db = {
    collection: jest.fn(name => ({
      doc: jest.fn(() => ({
        get: jest
          .fn()
          .mockResolvedValue(
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

const { checkBotEntitlement, getEffectiveTierSnapshot, getPlatformPostMonthlyQuota } = require("../services/billingService");

describe("billingService entitlement enforcement", () => {
  it("keeps daily destination capacity account-specific without lowering larger plans", () => {
    expect(getPlatformPostMonthlyQuota("premium", null, null, { publishingAllowance: { monthlyLimit: 1000 } })).toBe(1000);
    expect(getPlatformPostMonthlyQuota("premium")).toBe(150);
    expect(getPlatformPostMonthlyQuota("enterprise", null, null, { publishingAllowance: { monthlyLimit: 1000 } })).toBe(2000);
  });
  it("uses a server-owned upload allowance without upgrading or resetting usage", async () => {
    const billing = { tier: "premium", status: "active", uploads_this_month: 20,
      uploadAllowance: { monthlyLimit: 150 } };
    const snapshot = await getEffectiveTierSnapshot("user-1", billing,
      { subscriptionTier: "premium", subscriptionStatus: "active" });
    expect(snapshot.tierId).toBe("premium");
    expect(snapshot.tier.monthly_upload_cap).toBe(150);
    expect(snapshot.billingData.uploads_this_month).toBe(20);
  });

  it("ignores a user-profile upload allowance", async () => {
    const snapshot = await getEffectiveTierSnapshot("user-1",
      { tier: "premium", status: "active" },
      { subscriptionTier: "premium", subscriptionStatus: "active", uploadAllowance: { monthlyLimit: 9999 } });
    expect(snapshot.tier.monthly_upload_cap).toBe(20);
  });
  it("denies free-tier bot boost access when the plan does not include it", async () => {
    await expect(checkBotEntitlement("user-1", "bot_boost")).rejects.toThrow(
      "requires a paid subscription"
    );
  });

  it("treats externally missing PayPal subscriptions as free tier", async () => {
    const snapshot = await getEffectiveTierSnapshot(
      "user-1",
      { tier: "premium", status: "external_missing" },
      { subscriptionTier: "premium", subscriptionStatus: "external_missing" }
    );

    expect(snapshot.tierId).toBe("free");
  });

  it("grants Studio entitlements while Founding Tester access is active", async () => {
    const snapshot = await getEffectiveTierSnapshot(
      "tester-1",
      { tier: "free", status: "inactive" },
      {
        subscriptionTier: "free",
        subscriptionStatus: "inactive",
        testerAccess: {
          programId: "founding_testers_2026",
          status: "active",
          planId: "pro",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      }
    );

    expect(snapshot.tierId).toBe("pro");
    expect(snapshot.accessSource).toBe("tester_program");
    expect(snapshot.status).toBe("promotional");
    expect(snapshot.tier.monthly_upload_cap).toBe(10);
    expect(snapshot.tier.platform_limit).toBe(3);
  });

  it("removes Founding Tester entitlements after expiry", async () => {
    const snapshot = await getEffectiveTierSnapshot(
      "tester-1",
      { tier: "free", status: "inactive" },
      {
        subscriptionTier: "free",
        subscriptionStatus: "inactive",
        testerAccess: {
          programId: "founding_testers_2026",
          status: "active",
          planId: "pro",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      }
    );

    expect(snapshot.tierId).toBe("free");
    expect(snapshot.accessSource).toBe("subscription");
  });
});

const mockDocs = new Map();
const mockSet = jest.fn();

function mockMakeRef(path) {
  return {
    path,
    collection: name => ({ doc: id => mockMakeRef(`${path}/${name}/${id}`) }),
  };
}

jest.mock("../../firebaseAdmin", () => ({
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: jest.fn(() => "server-timestamp") },
    },
  },
  db: {
    collection: name => ({ doc: id => mockMakeRef(`${name}/${id}`) }),
    runTransaction: jest.fn(async callback =>
      callback({
        get: async ref => {
          const value = mockDocs.get(ref.path);
          return { exists: value !== undefined, data: () => value };
        },
        set: mockSet,
      })
    ),
  },
}));

const { grantTesterAccess } = require("../testerProgramService");
const { getPlanCapabilities } = require("../../config/subscriptionPlans");
const {
  applyTesterCapabilityAllowlist,
  getTesterCreditState,
} = require("../../config/testerProgram");

describe("testerProgramService", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockSet.mockClear();
    mockDocs.set("users/user-1", {
      email: "tester@example.com",
      name: "Test Creator",
      credits: 25,
    });
  });

  it("atomically grants a capped tester place and expiring promotional allowance", async () => {
    mockDocs.set("programs/founding_testers_2026", { claimedSeats: 2 });

    const result = await grantTesterAccess({ userId: "user-1", adminId: "admin-1" });

    expect(result.alreadyGranted).toBe(false);
    expect(result.claimedSeats).toBe(3);
    expect(result.bundle).toMatchObject({
      planId: "pro",
      planName: "Studio",
      monthlyCredits: 500,
      bonusCredits: 1000,
      totalStartingCredits: 1500,
      uploads: 10,
      queuedPlatformPosts: 30,
      connectedPlatforms: 3,
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/user-1" }),
      expect.objectContaining({
        testerAccess: expect.objectContaining({
          status: "active",
          planId: "pro",
          bonusCredits: 1000,
          creditAllowance: 1500,
          creditsUsed: 0,
          allowedWorkflows: expect.arrayContaining([
            "camCombiner",
            "publishing",
            "queue",
            "findViralClips",
            "smartPromoSummary",
          ]),
          autoRenews: false,
        }),
      }),
      { merge: true }
    );
  });

  it("does not grant more than ten tester places", async () => {
    mockDocs.set("programs/founding_testers_2026", { claimedSeats: 10 });

    await expect(grantTesterAccess({ userId: "user-1", adminId: "admin-1" })).rejects.toMatchObject(
      { code: "tester_program_full", statusCode: 409 }
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("does not grant the expiring allowance twice when the same tester is granted again", async () => {
    mockDocs.set("programs/founding_testers_2026", { claimedSeats: 4 });
    mockDocs.set("programs/founding_testers_2026/testers/user-1", {
      userId: "user-1",
      status: "active",
    });

    const result = await grantTesterAccess({ userId: "user-1", adminId: "admin-1" });

    expect(result.alreadyGranted).toBe(true);
    expect(result.claimedSeats).toBe(4);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("keeps tools outside the controlled tester workflow locked", () => {
    const capabilities = applyTesterCapabilityAllowlist(getPlanCapabilities("pro"), {
      programId: "founding_testers_2026",
      status: "active",
    });

    expect(capabilities.editing.features.multicam.enabled).toBe(true);
    expect(capabilities.editing.features.findViralClips.enabled).toBe(true);
    expect(capabilities.editing.features.clipRender.enabled).toBe(true);
    expect(capabilities.editing.features.smartPromoSummary.enabled).toBe(true);
    expect(capabilities.editing.features.thumbnailLab.enabled).toBe(false);
    expect(capabilities.editing.features.viralClipStudio.enabled).toBe(false);
    expect(capabilities.editing.features.watermarkRemoval.enabled).toBe(false);
    expect(capabilities.editing.topUpsEnabled).toBe(false);
    expect(capabilities.teamSeats).toBe(1);
  });

  it("tracks one expiring credit allowance instead of resetting it by calendar month", () => {
    expect(
      getTesterCreditState({ creditAllowance: 1500, creditsUsed: 1492, bonusCredits: 1000 }, 500)
    ).toEqual({ allowance: 1500, used: 1492, remaining: 8 });
    expect(
      getTesterCreditState({ creditAllowance: 1500, creditsUsed: 2000, bonusCredits: 1000 }, 500)
    ).toEqual({ allowance: 1500, used: 1500, remaining: 0 });
  });
});

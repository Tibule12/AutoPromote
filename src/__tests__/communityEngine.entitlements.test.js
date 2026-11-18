jest.mock("../firebaseAdmin", () => {
  const makeDoc = (id, data, exists = true) => ({
    id,
    exists,
    data: () => data,
  });

  const userRef = {
    id: "user-1",
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ id: "2026-04" })),
    })),
  };

  const db = {
    collection: jest.fn(name => {
      if (name === "content") {
        return {
          doc: jest.fn(() => ({
            get: jest
              .fn()
              .mockResolvedValue(
                makeDoc("content-1", { publishedUrl: "https://youtube.com/watch?v=abc123" })
              ),
          })),
        };
      }

      if (name === "users") {
        return {
          doc: jest.fn(() => userRef),
        };
      }

      if (name === "engagement_campaigns") {
        return {
          doc: jest.fn(() => ({ id: "campaign-1" })),
        };
      }

      return { doc: jest.fn() };
    }),
    runTransaction: jest.fn(async callback => {
      const transaction = {
        get: jest.fn(async ref => {
          if (ref === userRef) {
            return makeDoc("user-1", { growth_credits: 100, subscriptionTier: "free" });
          }

          if (ref && ref.id === "2026-04") {
            return makeDoc("2026-04", { campaignsCreated: 3 });
          }

          return makeDoc("missing", {}, false);
        }),
        update: jest.fn(),
        set: jest.fn(),
      };

      return callback(transaction);
    }),
  };

  return {
    db,
    admin: {
      firestore: {
        FieldValue: {
          increment: jest.fn(value => ({ __increment: value })),
          arrayUnion: jest.fn(value => ({ __arrayUnion: value })),
        },
      },
    },
  };
});

jest.mock("../services/discordService", () => ({
  postViaBot: jest.fn(),
}));

jest.mock("../services/viralMissionControl", () => ({
  deriveStrategy: jest.fn(() => ({ codeName: "test-pack" })),
}));

const { createEngagementBounty } = require("../services/communityEngine");

describe("retired engagement marketplace", () => {
  it("refuses old direct creation without reading or changing records", async () => {
    const { db } = require('../firebaseAdmin');
    db.collection.mockClear();
    db.runTransaction.mockClear();
    await expect(createEngagementBounty('user-1','content-1','youtube','like',5))
      .rejects.toMatchObject({ code: 'FEATURE_RETIRED', statusCode: 410 });
    expect(db.collection).not.toHaveBeenCalled();
    expect(db.runTransaction).not.toHaveBeenCalled();
  });
});

const express = require("express");
const request = require("supertest");

function createTimestamp(date) {
  return {
    toDate() {
      return date;
    },
    toMillis() {
      return date.getTime();
    },
  };
}

function createSnapshot(docs) {
  const snapshotDocs = docs.map(doc => ({ id: doc.id, data: () => doc }));
  return {
    docs: snapshotDocs,
    size: snapshotDocs.length,
    forEach(callback) {
      snapshotDocs.forEach(callback);
    },
  };
}

describe("analyticsRoutes /user", () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const collections = {
      content: [
        {
          id: "content-1",
          user_id: "test-user-id",
          title: "Campaign A",
          platform: "instagram",
          views: 25,
          likes: 10,
          shares: 2,
          createdAt: createTimestamp(recentDate),
        },
        {
          id: "content-2",
          userId: "someone-else",
          title: "Other Campaign",
          platform: "youtube",
          views: 900,
          createdAt: createTimestamp(recentDate),
        },
      ],
      platform_posts: [
        {
          id: "post-1",
          uid: "test-user-id",
          success: true,
          contentId: "content-1",
          platform: "instagram",
          metrics: {
            views: 75,
            likes: 6,
            shares: 3,
            clicks: 4,
            comments: 2,
          },
          createdAt: createTimestamp(recentDate),
        },
        {
          id: "post-2",
          uid: "test-user-id",
          success: true,
          simulated: true,
          contentId: "content-1",
          platform: "instagram",
          metrics: {
            views: 1000,
            likes: 100,
            shares: 20,
            clicks: 50,
            comments: 10,
          },
          createdAt: createTimestamp(recentDate),
        },
      ],
    };
    const docData = {
      users: {
        "test-user-id": { referralCode: "REF-123" },
      },
      user_credits: {
        "test-user-id": { totalReferrals: 3 },
      },
    };

    jest.doMock("../src/firebaseAdmin", () => ({
      db: {
        collection(collectionName) {
          const list = collections[collectionName] || [];
          return {
            where(field, operator, value) {
              if (operator !== "==") {
                throw new Error(`Unexpected operator: ${operator}`);
              }

              const filtered = list.filter(item => item[field] === value);
              return {
                limit() {
                  return {
                    async get() {
                      return createSnapshot(filtered);
                    },
                  };
                },
              };
            },
            doc(docId) {
              return {
                async get() {
                  const value = docData[collectionName] && docData[collectionName][docId];
                  return {
                    exists: typeof value !== "undefined",
                    data: () => value,
                  };
                },
              };
            },
          };
        },
      },
    }));

    jest.doMock("../src/authMiddleware", () => (req, res, next) => {
      req.user = { uid: "test-user-id", role: "user" };
      req.userId = "test-user-id";
      next();
    });

    jest.doMock("../src/routes/platformAnalyticsRoutes", () => express.Router());

    const analyticsRoutes = require("../src/analyticsRoutes");
    app = express();
    app.use(express.json());
    app.use("/api/analytics", analyticsRoutes);
  });

  test("aggregates content owned via legacy user_id and platform posts owned via uid", async () => {
    const response = await request(app).get("/api/analytics/user?range=7d");

    expect(response.statusCode).toBe(200);
    expect(response.body.totalContent).toBe(1);
    expect(response.body.publishedPostCount).toBe(1);
    expect(response.body.totalViews).toBe(75);
    expect(response.body.totalLikes).toBe(6);
    expect(response.body.totalShares).toBe(3);
    expect(response.body.totalClicks).toBe(4);
    expect(response.body.topPlatform).toBe("instagram");
    expect(response.body.dataSource).toBe("published_platform_posts");
    expect(response.body.referralCode).toBe("REF-123");
    expect(response.body.referralTracker).toMatchObject({ total: 3, nextGoal: 10 });
    expect(response.body.platformBreakdown.instagram).toMatchObject({
      views: 75,
      likes: 6,
      shares: 3,
      comments: 2,
      clicks: 4,
    });
  });
});

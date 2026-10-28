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
  let collections;

  beforeEach(() => {
    jest.resetModules();

    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    collections = {
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
              const query = (offset = 0) => ({
                startAfter(cursor) {
                  return query(filtered.findIndex(row => row.id === cursor.id) + 1);
                },
                limit(count) {
                  return {
                    async get() {
                      return createSnapshot(filtered.slice(offset, offset + count));
                    },
                  };
                },
              });
              return query();
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

    jest.doMock("../src/services/billingService", () => ({
      getEffectiveTierSnapshot: jest.fn().mockResolvedValue({
        tierId: "pro",
        tier: { id: "pro", name: "Studio" },
      }),
    }));

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

  test("uncollected statistics remain unavailable instead of claiming low reach", async () => {
    collections.platform_posts[0].metrics = null;
    const { body } = await request(app).get("/api/analytics/user?range=7d");
    expect(body.totalViews).toBeNull();
    expect(body.totalClicks).toBeNull();
    expect(body.ctr).toBeNull();
    expect(body.performanceStatus).toBe("Platform statistics unavailable");
    expect(body.measurement).toMatchObject({
      status: "unavailable",
      postsWithMetrics: 0,
      postsWithoutMetrics: 1,
    });
    expect(body.platformBreakdown.instagram.views).toBeNull();
    expect(body.topContent[0]).toMatchObject({
      postId: "post-1",
      views: null,
      metricsAvailable: false,
    });
  });

  test("a genuine reported zero remains a measured zero", async () => {
    collections.platform_posts[0].metrics = { view_count: 0, like_count: 0 };
    const { body } = await request(app).get("/api/analytics/user?range=7d");
    expect(body.totalViews).toBe(0);
    expect(body.totalLikes).toBe(0);
    expect(body.measurement.postsWithMetrics).toBe(1);
    expect(body.performanceStatus).toBe("Live platform statistics");
    expect(body.totalShares).toBeNull();
  });

  test("impressions and Reddit scores are not presented as video views or likes", async () => {
    collections.platform_posts[0].metrics = { impressions: 100, score: 8, comment_count: 0 };
    const { body } = await request(app).get("/api/analytics/user?range=7d");
    expect(body.totalViews).toBeNull();
    expect(body.totalLikes).toBeNull();
    expect(body.platformBreakdown.instagram.impressions).toBe(100);
    expect(body.platformBreakdown.instagram.comments).toBe(0);
    expect(body.topPlatform).toBe("N/A");
  });
  test("release filtering and refresh targets stay within owned published records", async () => {
    collections.platform_posts.push({
      ...collections.platform_posts[0],
      id: "post-new",
      contentId: "content-new",
      metrics: null,
      createdAt: createTimestamp(new Date()),
    });
    const selected = await request(app).get("/api/analytics/user?range=7d&contentId=content-1");
    expect(selected.body.publishedPostCount).toBe(1);
    expect(selected.body.refreshTargets).toEqual([{ postId: "post-1", platform: "instagram" }]);
    const all = await request(app).get("/api/analytics/user?range=7d");
    expect(all.body.refreshTargets).toEqual([{ postId: "post-new", platform: "instagram" }]);
    const foreign = await request(app).get("/api/analytics/user?range=7d&contentId=content-2");
    expect(foreign.body.publishedPostCount).toBe(0);
    expect(foreign.body.refreshTargets).toEqual([]);
    expect(foreign.body.releaseOptions.some(row => row.id === "content-2")).toBe(false);
  });

  test("release filtering rejects document paths", async () => {
    expect((await request(app).get("/api/analytics/user?contentId=foreign%2Fpost")).status).toBe(
      400
    );
  });

  test("a measured zero ranks ahead of unavailable counts while refresh uses the newest post", async () => {
    collections.platform_posts[0].metrics = { views: 0 };
    collections.platform_posts.push({
      ...collections.platform_posts[0],
      id: "new-uncollected",
      metrics: null,
      createdAt: createTimestamp(new Date()),
    });
    const { body } = await request(app).get("/api/analytics/user?range=7d");
    expect(body.topContent[0].postId).toBe("post-1");
    expect(body.viralityTracker.views).toBe(0);
    expect(body.refreshTargets[0].postId).toBe("new-uncollected");
  });

  test("loads owned posts beyond the first 400 records without including another owner", async () => {
    const original = collections.platform_posts[0];
    collections.platform_posts = Array.from({ length: 405 }, (_, index) => ({
      ...original,
      id: `post-${index}`,
      userId: "test-user-id", // Same document discovered under two owner aliases.
      metrics: { views: 1 },
    }));
    collections.platform_posts.push({
      ...original,
      id: "latest-youtube",
      platform: "youtube",
      metrics: { views: 25 },
      createdAt: createTimestamp(new Date()),
    });
    collections.platform_posts.push({
      ...original,
      id: "foreign",
      uid: "someone-else",
      metrics: { views: 99999 },
    });
    const { statusCode, body } = await request(app).get("/api/analytics/user?range=7d");
    expect(statusCode).toBe(200);
    expect(body.publishedPostCount).toBe(406);
    expect(body.totalViews).toBe(430);
    expect(body.platformBreakdown.youtube.views).toBe(25);
    expect(body.refreshTargets).toContainEqual({ postId: "latest-youtube", platform: "youtube" });
  });

  test("does not report a capped history as complete analytics", async () => {
    const original = collections.platform_posts[0];
    collections.platform_posts = Array.from({ length: 10001 }, (_, index) => ({
      ...original,
      id: `post-${index}`,
    }));
    const { statusCode, body } = await request(app).get("/api/analytics/user?range=all");
    expect(statusCode).toBe(503);
    expect(body.totalViews).toBeUndefined();
    expect(body.error).toMatch(/could not be fully loaded/);
  });
});

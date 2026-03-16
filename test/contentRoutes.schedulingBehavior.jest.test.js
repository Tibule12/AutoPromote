const express = require("express");
const request = require("supertest");

describe("contentRoutes scheduling behavior", () => {
  let app;
  let distributeContentMock;
  let performViralOptimizationMock;

  beforeEach(() => {
    jest.resetModules();
    process.env.NO_VIRAL_OPTIMIZATION = "false";
    distributeContentMock = jest.fn().mockResolvedValue(undefined);
    performViralOptimizationMock = jest.fn().mockResolvedValue({ success: true });

    jest.doMock("../src/services/distributionManager", () => ({
      distributeContent: distributeContentMock,
    }));
    jest.doMock("../src/services/viralOptimizationService", () => ({
      performViralOptimization: performViralOptimizationMock,
    }));

    const router = require("../src/contentRoutes");
    app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use("/api/content", router);
  });

  afterEach(() => {
    delete process.env.NO_VIRAL_OPTIMIZATION;
  });

  test("future scheduled uploads do not trigger immediate distribution", async () => {
    const futureTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const res = await request(app)
      .post("/api/content/upload")
      .set("Authorization", "Bearer test-token-for-adminScheduleUser123")
      .set("Host", "example.com")
      .send({
        title: "Scheduled upload",
        type: "video",
        url: "preview://scheduled.mp4",
        description: "Queue this later",
        target_platforms: ["youtube"],
        scheduled_promotion_time: futureTime,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(distributeContentMock).not.toHaveBeenCalled();
    expect(performViralOptimizationMock).toHaveBeenCalled();
  });

  test("immediate uploads still trigger background distribution", async () => {
    const res = await request(app)
      .post("/api/content/upload")
      .set("Authorization", "Bearer test-token-for-immediateUser123")
      .set("Host", "example.com")
      .send({
        title: "Immediate upload",
        type: "video",
        url: "preview://immediate.mp4",
        description: "Publish now",
        target_platforms: ["youtube"],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(distributeContentMock).toHaveBeenCalledTimes(1);
    expect(performViralOptimizationMock).toHaveBeenCalled();
  });
});
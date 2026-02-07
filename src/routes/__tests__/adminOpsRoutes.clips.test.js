const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");

// Mock videoClippingService and youtubeService
jest.mock("../../services/videoClippingService", () => ({
  analyzeVideo: jest.fn(async () => ({
    analysisId: "a1",
    topClips: [{ id: "clip1", start: 0, end: 10 }],
  })),
  generateClip: jest.fn(async () => ({ url: "https://signed.example/generated_clip.mp4" })),
}));
jest.mock("../../services/youtubeService", () => ({
  uploadVideo: jest.fn(async () => ({ success: true, videoId: "yt123" })),
}));

jest.mock("../../middlewares/adminOnly", () => (req, res, next) => next());

// DO NOT mock firebaseAdmin directly, rely on unmock + global in-memory DB
jest.unmock("../../../firebaseAdmin");

describe("POST /api/admin/ops/clips/generate-and-publish", () => {
  let app;

  beforeEach(() => {
    // initialize global in-memory DB used by firebaseAdmin bypass mode
    // IMPORTANT: specific to firebaseAdmin stub implementation, we must mutate existing map if it exists
    // rather than replacing it, because firebaseAdmin caches the reference.
    if (!global.__AUTOPROMOTE_IN_MEMORY_DB) {
      global.__AUTOPROMOTE_IN_MEMORY_DB = new Map();
    }
    global.__AUTOPROMOTE_IN_MEMORY_DB.clear();
    const dbMap = global.__AUTOPROMOTE_IN_MEMORY_DB;

    // Seed content
    dbMap.set("content/c1", {
      id: "c1",
      data: {
        processedUrl: "https://example.com/video.mp4",
        userId: "u1",
        type: "video",
        createdAt: "2025-01-01T00:00:00Z",
      },
    });

    // Seed generated clips (referenced by analysis result)
    dbMap.set("generated_clips/g1", {
      id: "g1",
      data: {
        url: "https://signed.example/generated_clip.mp4",
        clipId: "clip1",
        analysisId: "a1",
        viralScore: 7,
        duration: 10,
        createdAt: "2025-01-01T00:05:00Z",
      },
    });

    app = express();
    app.use(bodyParser.json());
    app.use((req, res, next) => {
      req.userId = "admin-user";
      req.user = { uid: "admin-user", isAdmin: true };
      next();
    });

    const router = require("../adminOpsRoutes");
    app.use("/api/admin/ops", router);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("generates clip and calls uploadVideo", async () => {
    const res = await request(app)
      .post("/api/admin/ops/clips/generate-and-publish")
      .send({ uid: "u1" });

    if (res.status !== 200) {
      // Use console.warn to ensure it logs
      console.warn("FAIL BODY:", JSON.stringify(res.body));
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.uploadOutcome).toBeDefined();
    expect(res.body.uploadOutcome.success).toBe(true);
  });
});

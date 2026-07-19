const express = require("express");
const request = require("supertest");

const mockAnalyzeVideo = jest.fn();
const mockRenderClip = jest.fn();

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "viral-user" };
  req.userId = "viral-user";
  next();
});

jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));

jest.mock("../services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({
    analyzeVideo: mockAnalyzeVideo,
    renderClip: mockRenderClip,
  }))
);

jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));

jest.mock("../services/clipOutcomeLearningService", () => ({
  getClipLearningProfile: jest.fn().mockResolvedValue(null),
}));

const mediaRoutes = require("../mediaRoutes");
const { deductCredits, refundCredits } = require("../creditSystem");
const { getClipLearningProfile } = require("../services/clipOutcomeLearningService");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

describe("viral scan and render billing recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deductCredits.mockResolvedValue({
      success: true,
      remaining: 92,
      deducted: 8,
      fromMonthly: 8,
      fromTopUp: 0,
      monthKey: "2026-07",
    });
    refundCredits.mockResolvedValue({ success: true, refunded: 8 });
    getClipLearningProfile.mockResolvedValue(null);
  });

  it("refunds a charged viral analysis when the worker fails", async () => {
    mockAnalyzeVideo.mockRejectedValue(new Error("worker unavailable"));

    const response = await request(buildApp())
      .post("/api/media/analyze")
      .send({ fileUrl: "https://example.com/source.mp4" });

    expect(response.statusCode).toBe(500);
    expect(response.body.creditsRefunded).toBe(true);
    expect(refundCredits).toHaveBeenCalledWith(
      "viral-user",
      expect.objectContaining({ deducted: 8 }),
      "viral-analysis-refund",
      expect.objectContaining({ reason: "analysis_failed" })
    );
  });

  it("does not refund a successful viral analysis", async () => {
    getClipLearningProfile.mockResolvedValue({
      status: "active",
      sampleCount: 7,
      confidence: 0.42,
      strategyWeights: { hero_clip: { multiplier: 1.05 } },
    });
    mockAnalyzeVideo.mockResolvedValue([{ id: "clip-1", start: 2, end: 14, viralScore: 84 }]);

    const response = await request(buildApp())
      .post("/api/media/analyze")
      .send({ fileUrl: "https://example.com/source.mp4" });

    expect(response.statusCode).toBe(200);
    expect(response.body.scenes).toHaveLength(1);
    expect(response.body.learning).toEqual({ status: "active", sampleCount: 7, confidence: 0.42 });
    expect(mockAnalyzeVideo).toHaveBeenCalledWith(
      "https://example.com/source.mp4",
      "viral-user",
      expect.objectContaining({
        learningProfile: expect.objectContaining({ status: "active", sampleCount: 7 }),
      })
    );
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("refunds a charged clip render when rendering fails", async () => {
    deductCredits.mockResolvedValue({
      success: true,
      remaining: 95,
      deducted: 5,
      fromMonthly: 5,
      fromTopUp: 0,
      monthKey: "2026-07",
    });
    refundCredits.mockResolvedValue({ success: true, refunded: 5 });
    mockRenderClip.mockRejectedValue(new Error("ffmpeg failed"));

    const response = await request(buildApp())
      .post("/api/media/render-clip")
      .send({ fileUrl: "https://example.com/source.mp4", startTime: 2, endTime: 14 });

    expect(response.statusCode).toBe(500);
    expect(response.body.creditsRefunded).toBe(true);
    expect(refundCredits).toHaveBeenCalledWith(
      "viral-user",
      expect.objectContaining({ deducted: 5 }),
      "viral-render-refund",
      expect.objectContaining({ reason: "render_failed" })
    );
  });
});

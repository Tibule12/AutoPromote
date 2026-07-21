const express = require("express");
const request = require("supertest");

const mockAnalyzeVideo = jest.fn();
const mockRenderClip = jest.fn();
const mockResolveOwnedTemporaryVideoSource = jest.fn();
const mockDeleteOwnedTemporaryVideoSource = jest.fn();

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

jest.mock("../services/ownedTemporaryMediaService", () => ({
  resolveOwnedTemporaryVideoSource: mockResolveOwnedTemporaryVideoSource,
  deleteOwnedTemporaryVideoSource: mockDeleteOwnedTemporaryVideoSource,
}));

const mediaRoutes = require("../mediaRoutes");
const { deductCredits, refundCredits, getCreditBreakdown } = require("../creditSystem");
const { getEffectiveTierSnapshot } = require("../services/billingService");

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
    getCreditBreakdown.mockResolvedValue({
      totalAvailable: 100,
      tier: "premium",
      localCreditBypass: false,
    });
    getEffectiveTierSnapshot.mockResolvedValue({
      tierId: "premium",
      testerAccess: null,
      accessSource: "subscription",
    });
    mockResolveOwnedTemporaryVideoSource.mockResolvedValue({
      signedUrl: "https://storage.googleapis.com/private/signed-source.mp4",
      storagePath: "temp_scans/viral-user/source.mp4",
      temporary: true,
    });
    mockDeleteOwnedTemporaryVideoSource.mockResolvedValue({ status: "deleted" });
  });

  it("blocks Starter plans during preflight before any upload or credit charge", async () => {
    getCreditBreakdown.mockResolvedValue({
      totalAvailable: 15,
      tier: "free",
      localCreditBypass: false,
    });
    getEffectiveTierSnapshot.mockResolvedValue({
      tierId: "free",
      testerAccess: null,
      accessSource: "subscription",
    });

    const response = await request(buildApp()).get("/api/media/scan-preflight");

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      allowed: false,
      code: "VIRAL_SCAN_PLAN_REQUIRED",
      balance: 15,
      requiredCredits: 8,
    });
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockAnalyzeVideo).not.toHaveBeenCalled();
  });

  it("reports the exact paid-plan credit shortfall during preflight", async () => {
    getCreditBreakdown.mockResolvedValue({
      totalAvailable: 3,
      tier: "premium",
      localCreditBypass: false,
    });

    const response = await request(buildApp()).get("/api/media/scan-preflight");

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      allowed: false,
      code: "VIRAL_SCAN_CREDITS_REQUIRED",
      balance: 3,
      requiredCredits: 8,
      topUpsAllowed: true,
    });
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it("blocks tools outside the controlled Founding Tester allowlist", async () => {
    getEffectiveTierSnapshot.mockResolvedValue({
      tierId: "pro",
      testerAccess: {
        programId: "founding_testers_2026",
        status: "active",
        allowedWorkflows: ["camCombiner", "findViralClips", "smartPromoSummary"],
      },
      accessSource: "tester_program",
    });

    const response = await request(buildApp())
      .post("/api/media/extract-audio")
      .send({ fileUrl: "https://example.com/source.mp4" });

    expect(response.statusCode).toBe(403);
    expect(response.body.code).toBe("TESTER_FEATURE_NOT_INCLUDED");
    expect(deductCredits).not.toHaveBeenCalled();
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
    mockAnalyzeVideo.mockResolvedValue([{ id: "clip-1", start: 2, end: 14, viralScore: 84 }]);

    const response = await request(buildApp())
      .post("/api/media/analyze")
      .send({ fileUrl: "https://example.com/source.mp4" });

    expect(response.statusCode).toBe(200);
    expect(response.body.scenes).toHaveLength(1);
    expect(mockAnalyzeVideo).toHaveBeenCalledWith(
      "https://example.com/source.mp4",
      "viral-user",
      expect.any(Object)
    );
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("verifies an owned temporary upload and deletes it after analysis", async () => {
    mockAnalyzeVideo.mockResolvedValue([{ id: "secure-clip", start: 3, end: 15 }]);

    const response = await request(buildApp()).post("/api/media/analyze").send({
      sourceStoragePath: "temp_scans/viral-user/source.mp4",
    });

    expect(response.statusCode).toBe(200);
    expect(mockResolveOwnedTemporaryVideoSource).toHaveBeenCalledWith({
      storagePath: "temp_scans/viral-user/source.mp4",
      userId: "viral-user",
      purpose: "viral_scan",
    });
    expect(mockAnalyzeVideo).toHaveBeenCalledWith(
      "https://storage.googleapis.com/private/signed-source.mp4",
      "viral-user",
      expect.not.objectContaining({ localPath: expect.anything() })
    );
    expect(mockDeleteOwnedTemporaryVideoSource).toHaveBeenCalledWith({
      storagePath: "temp_scans/viral-user/source.mp4",
      userId: "viral-user",
      purpose: "viral_scan",
    });
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

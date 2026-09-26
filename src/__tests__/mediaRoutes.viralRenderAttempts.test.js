const express = require("express");
const request = require("supertest");

const mockDocs = new Map();
const mockStartProcessingJob = jest.fn();
const mockDispatches = [];

const mockDocRef = id => ({
  id,
  get: jest.fn(async () => ({
    id,
    exists: mockDocs.has(id),
    data: () => mockDocs.get(id),
  })),
  create: jest.fn(async data => {
    if (mockDocs.has(id)) throw new Error("ALREADY_EXISTS");
    mockDocs.set(id, { ...data });
  }),
  set: jest.fn(async (data, options) => {
    mockDocs.set(id, options?.merge ? { ...mockDocs.get(id), ...data } : { ...data });
  }),
});

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({ collection: jest.fn(() => ({ doc: jest.fn(id => mockDocRef(id)) })) })),
    { FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP") } }
  ),
}));

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: req.get("x-test-user") || "owner-1" };
  next();
});

jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));

jest.mock("../services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({ startProcessingJob: mockStartProcessingJob }))
);

jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));

const mediaRoutes = require("../mediaRoutes");
const { deductCredits, refundCredits, getCreditBreakdown } = require("../creditSystem");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

const renderRequest = (app, renderRequestId = "render-request-123", userId = "owner-1") =>
  request(app)
    .post("/api/media/process")
    .set("x-test-user", userId)
    .send({
      renderRequestId,
      fileUrl: "https://storage.example.com/source.mp4",
      options: { renderViral: true, viralData: { timeline_segments: [] } },
    });

describe("Viral Clip Studio render attempts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocs.clear();
    mockDispatches.length = 0;
    getCreditBreakdown.mockResolvedValue({ totalAvailable: 100, tier: "premium" });
    deductCredits.mockResolvedValue({
      success: true,
      remaining: 95,
      deducted: 5,
      fromMonthly: 5,
      fromTopUp: 0,
      monthKey: "2026-09",
    });
    refundCredits.mockResolvedValue({ success: true, refunded: 5 });
    mockStartProcessingJob.mockImplementation(async (url, options, userId, attempt) => {
      if (!attempt?.jobId) return { jobId: "legacy-job" };
      const ref = mockDocRef(attempt.jobId);
      try {
        await ref.create({
          jobId: attempt.jobId,
          userId,
          type: "viral_render",
          renderRequestId: attempt.renderRequestId,
          options,
          videoUrl: url,
          sourceRenderJobId: attempt.sourceRenderJobId,
          creditReceipt: attempt.creditReceipt,
          status: "queued",
          progress: 0,
        });
      } catch (_error) {
        return { jobId: attempt.jobId, reused: true, status: mockDocs.get(attempt.jobId).status };
      }
      mockDispatches.push(attempt.jobId);
      return { jobId: attempt.jobId, reused: false };
    });
  });

  it("returns the same job on retry without another charge or dispatch", async () => {
    const app = buildApp();
    const first = await renderRequest(app);
    const retry = await renderRequest(app);

    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(first.body.jobId).toBe(retry.body.jobId);
    expect(first.body.reused).toBe(false);
    expect(retry.body.reused).toBe(true);
    expect(mockDispatches).toEqual([first.body.jobId]);
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect(deductCredits).toHaveBeenCalledWith(
      "owner-1", 5, "render-clip",
      expect.objectContaining({ idempotencyKey: `viral-render-charge:${first.body.jobId}` })
    );
  });

  it("allows concurrent submissions to claim only one job and uses one billing key", async () => {
    const app = buildApp();
    let releaseCharges;
    const chargesReady = new Promise(resolve => { releaseCharges = resolve; });
    let arrivals = 0;
    deductCredits.mockImplementation(async () => {
      arrivals += 1;
      if (arrivals === 2) releaseCharges();
      await chargesReady;
      return { success: true, remaining: 95, deducted: 5, fromMonthly: 5, monthKey: "2026-09" };
    });

    const [first, second] = await Promise.all([renderRequest(app), renderRequest(app)]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.body.jobId).toBe(second.body.jobId);
    expect(mockDispatches).toEqual([first.body.jobId]);
    expect(new Set(deductCredits.mock.calls.map(([, , , meta]) => meta.idempotencyKey)).size).toBe(1);
  });

  it("scopes attempts to the user and exposes completed output only to its owner", async () => {
    const app = buildApp();
    const first = await renderRequest(app, "shared-request", "owner-1");
    const second = await renderRequest(app, "shared-request", "owner-2");
    expect(first.body.jobId).not.toBe(second.body.jobId);

    mockDocs.set(first.body.jobId, {
      ...mockDocs.get(first.body.jobId),
      status: "completed",
      progress: 100,
      result: { url: "https://storage.example.com/rendered.mp4" },
    });
    const recovered = await request(app)
      .get("/api/media/viral-render-attempt/shared-request")
      .set("x-test-user", "owner-1");
    expect(recovered.body).toMatchObject({
      jobId: first.body.jobId,
      status: "completed",
      outputUrl: "https://storage.example.com/rendered.mp4",
      result: { url: "https://storage.example.com/rendered.mp4" },
    });
    const absent = await request(app)
      .get("/api/media/viral-render-attempt/unknown-request")
      .set("x-test-user", "owner-1");
    expect(absent.statusCode).toBe(404);
    mockDocs.set(second.body.jobId, { ...mockDocs.get(second.body.jobId), userId: "someone-else" });
    const wrongOwner = await request(app)
      .get("/api/media/viral-render-attempt/shared-request")
      .set("x-test-user", "owner-2");
    expect(wrongOwner.statusCode).toBe(404);
  });

  it("reports active progress and refunds a worker failure during recovery", async () => {
    const app = buildApp();
    const submitted = await renderRequest(app);
    const jobId = submitted.body.jobId;
    mockDocs.set(jobId, {
      ...mockDocs.get(jobId),
      status: "processing_remote",
      progress: 42,
      detail: "Rendering segment 3",
    });

    const active = await request(app).get("/api/media/viral-render-attempt/render-request-123");
    expect(active.body).toMatchObject({
      jobId,
      status: "processing_remote",
      progress: 42,
      detail: "Rendering segment 3",
      outputUrl: null,
    });

    mockDocs.set(jobId, { ...mockDocs.get(jobId), status: "failed", error: "worker unavailable" });
    const failed = await request(app).get("/api/media/viral-render-attempt/render-request-123");
    expect(failed.body).toMatchObject({
      jobId,
      status: "failed",
      error: "worker unavailable",
      creditsRefunded: true,
    });
    expect(refundCredits).toHaveBeenCalledTimes(1);
  });

  it("records a queue failure before refunding so a retry cannot dispatch", async () => {
    const app = buildApp();
    mockStartProcessingJob.mockRejectedValueOnce(new Error("queue unavailable"));

    const first = await renderRequest(app);
    const retry = await renderRequest(app);
    expect(first.statusCode).toBe(500);
    expect(first.body.creditsRefunded).toBe(true);
    expect(retry.statusCode).toBe(200);
    expect(retry.body).toMatchObject({ jobId: mockDocs.keys().next().value, status: "failed", reused: true });
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(mockDispatches).toHaveLength(0);
  });

  it("rejects invalid IDs before charging", async () => {
    const response = await renderRequest(buildApp(), "bad id");
    expect(response.statusCode).toBe(400);
    expect(deductCredits).not.toHaveBeenCalled();
  });
});

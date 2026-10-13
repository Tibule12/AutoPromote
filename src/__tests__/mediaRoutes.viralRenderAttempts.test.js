const express = require("express");
const request = require("supertest");

const mockDocs = new Map();
const mockStartProcessingJob = jest.fn();
const mockAssertRenderWorkerReady = jest.fn();
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
  jest.fn().mockImplementation(() => ({
    startProcessingJob: mockStartProcessingJob,
    assertRenderWorkerReady: mockAssertRenderWorkerReady,
  }))
);

jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));

jest.mock("../services/studioWorkerOutputService", () => ({
  ...jest.requireActual("../services/studioWorkerOutputService"),
  persistWorkerBucketOutput: jest.fn().mockResolvedValue(null),
  refreshOwnedStudioOutput: jest.fn().mockResolvedValue("https://storage.example.com/renewed.mp4"),
}));
const {persistWorkerBucketOutput,refreshOwnedStudioOutput} = require("../services/studioWorkerOutputService");
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
    mockAssertRenderWorkerReady.mockResolvedValue({ ready: true });
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
      result: { url: "https://storage.example.com/rendered.mp4", outputSha256: "a".repeat(64) },
    });
    const recovered = await request(app)
      .get("/api/media/viral-render-attempt/shared-request")
      .set("x-test-user", "owner-1");
    expect(recovered.body).toMatchObject({
      jobId: first.body.jobId,
      status: "completed",
      outputUrl: "https://storage.example.com/rendered.mp4",
      result: { url: "https://storage.example.com/rendered.mp4", outputSha256: "a".repeat(64) },
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

  it("leaves no charge or phantom job when the render worker is unavailable", async () => {
    mockAssertRenderWorkerReady.mockRejectedValueOnce(new Error("Render worker offline"));
    const response = await renderRequest(buildApp());
    expect(response.statusCode).toBe(503);
    expect(response.body.code).toBe("STUDIO_RENDER_WORKER_UNAVAILABLE");
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockStartProcessingJob).not.toHaveBeenCalled();
    expect(mockDocs.size).toBe(0);
  });

  it.each(["hue", "unknown"])("rejects unsupported %s before worker checks, job creation or charging", async mode => {
    const response = await request(buildApp()).post("/api/media/process").send({
      renderRequestId: "unsupported-blend", fileUrl: "https://storage.example.com/source.mp4",
      options: { renderViral: true, viralData: { overlays: [{ id: "title", type: "text", blendMode: mode }] } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe("UNSUPPORTED_STUDIO_BLEND");
    expect(mockAssertRenderWorkerReady).not.toHaveBeenCalled();
    expect(mockStartProcessingJob).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockDocs.size).toBe(0);
  });

  it.each([
    {layers:[{id:"main-video",blend_mode:"difference"}],overlays:[]},
    {layers:[{id:"title",blend_mode:"screen"}],overlays:[{id:"title",type:"text",blendMode:"multiply"}]},
  ])("rejects unsupported main or contradictory canonical layer decisions before charging", async ({layers,overlays}) => {
    const response = await request(buildApp()).post("/api/media/process").send({
      renderRequestId: "conflicting-blend", fileUrl: "https://storage.example.com/source.mp4",
      options: { renderViral: true, viralData: { overlays, composition_plan:{layers} } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe("UNSUPPORTED_STUDIO_BLEND");
    expect(mockStartProcessingJob).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockDocs.size).toBe(0);
  });

  it.each(["normal","multiply","screen","difference","overlay","soft-light","hard-light","color-dodge","luminosity"])("preserves a matching %s decision in the worker request", async mode => {
    const response = await request(buildApp()).post("/api/media/process").send({
      renderRequestId: "supported-blend", fileUrl: "https://storage.example.com/source.mp4",
      options: { renderViral: true, viralData: { overlays:[{id:"title",type:"text",blendMode:mode}],
        composition_plan:{layers:[{id:"main-video",blend_mode:"normal"},{id:"title",blend_mode:mode}]} } },
    });
    expect(response.statusCode).toBe(200);
    expect(mockStartProcessingJob.mock.calls[0][1].viralData.overlays[0].blendMode).toBe(mode);
    expect(deductCredits).toHaveBeenCalledTimes(1);
  });

  it("adopts the owned completed result once and renews subsequent access without a worker or charge", async () => {
    const jobId=`viral_${"c".repeat(64)}`,sha="a".repeat(64);
    const storagePath=`studio/exports/owner-1/${jobId}/render.mp4`;
    mockDocs.set(jobId,{userId:"owner-1",renderRequestId:"legacy-cloud-result",type:"viral_render",
      status:"completed",options:{renderViral:true},result:{url:`https://storage.googleapis.com/bucket/processed/${jobId}_viral.mp4`,outputSha256:sha}});
    persistWorkerBucketOutput.mockResolvedValueOnce({url:"https://storage.example.com/owned.mp4",storagePath,
      sha256:sha,bytes:1234,generation:"456"});
    const app=buildApp();
    const first=await request(app).get(`/api/media/status/${jobId}`);
    const second=await request(app).get(`/api/media/status/${jobId}`);
    expect(first.statusCode).toBe(200);expect(second.statusCode).toBe(200);
    expect(persistWorkerBucketOutput).toHaveBeenCalledTimes(1);
    expect(persistWorkerBucketOutput).toHaveBeenCalledWith(expect.objectContaining({userId:"owner-1",jobId,expectedSha256:sha,legacy:true}));
    expect(mockDocs.get(jobId)).toMatchObject({outputStoragePath:storagePath,result:{outputSha256:sha,outputGeneration:"456"}});
    expect(refreshOwnedStudioOutput).toHaveBeenCalledTimes(4);
    expect(deductCredits).not.toHaveBeenCalled();expect(mockStartProcessingJob).not.toHaveBeenCalled();
  });

  it("checks the saved job owner before any adoption or signed access", async () => {
    const jobId=`viral_${"d".repeat(64)}`;
    mockDocs.set(jobId,{userId:"other-owner",status:"completed",options:{renderViral:true},
      result:{url:`https://storage.googleapis.com/bucket/processed/${jobId}_viral.mp4`,outputSha256:"a".repeat(64)}});
    const response=await request(buildApp()).get(`/api/media/status/${jobId}`);
    expect(response.statusCode).toBe(403);expect(persistWorkerBucketOutput).not.toHaveBeenCalled();
    expect(refreshOwnedStudioOutput).not.toHaveBeenCalled();expect(deductCredits).not.toHaveBeenCalled();
  });

  it("returns the owned finished identity for receipt recovery without charging or dispatching", async () => {
    const jobId = `viral_${"b".repeat(64)}`;
    mockDocs.set(jobId, { userId: "owner-1", renderRequestId: "render-receipt-request-123", status: "completed",
      options: { renderViral: true, viralData: { brand_watermark: false } },
      result: { url: "https://storage.example.com/final.mp4", outputSha256: "a".repeat(64) } });
    const app = buildApp();
    const response = await request(app).get(`/api/media/status/${jobId}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ jobId, renderRequestId: "render-receipt-request-123",
      brandWatermark: false, status: "completed", result: { outputSha256: "a".repeat(64) } });
    const denied = await request(app).get(`/api/media/status/${jobId}`).set("x-test-user", "other-owner");
    expect(denied.statusCode).toBe(403);
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockStartProcessingJob).not.toHaveBeenCalled();
  });
});

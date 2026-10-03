const express = require("express");
const request = require("supertest");
const crypto = require("crypto");

jest.mock("../src/authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "owner-1" };
  req.userId = "owner-1";
  next();
});
jest.mock("../src/services/studioAnalysisJobService", () => ({
  MAX_SOURCE_BYTES: 100 * 1024 * 1024,
  createStudioAnalysisJob: jest.fn(),
  createStudioAnalysisJobFromOwnedSource: jest.fn(),
  getOwnedStudioAnalysisJob: jest.fn(),
  getOwnedStudioAnalysisResult: jest.fn(),
  cancelStudioAnalysisJob: jest.fn(),
}));
jest.mock("../src/creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));
jest.mock("../src/services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ testerAccess: null }),
}));
jest.mock("../src/services/videoEditingService", () => jest.fn().mockImplementation(() => ({})));
jest.mock("firebase-admin", () => ({ storage: jest.fn(), firestore: jest.fn() }));

const jobs = require("../src/services/studioAnalysisJobService");
const app = express();
app.use(express.json());
app.use("/api/media", require("../src/mediaRoutes"));

beforeEach(() => jest.clearAllMocks());

test("upload derives source hash on the server and returns a queued receipt", async () => {
  jobs.createStudioAnalysisJob.mockResolvedValue({ jobId: "a".repeat(64), status: "queued" });
  const bytes = Buffer.from("source-video");
  const response = await request(app)
    .post("/api/media/studio-analysis-jobs")
    .field("requestId", "request-0001")
    .field("projectId", "project-1")
    .field("sourceAssetId", "asset-1")
    .field("mode", "source_shots")
    .field("start", "0")
    .field("end", "60")
    .field("anchors", JSON.stringify({ solo: { x: 40, y: 50 } }))
    .attach("file", bytes, "source.mp4");
  expect(response.status).toBe(202);
  expect(jobs.createStudioAnalysisJob).toHaveBeenCalledWith(
    expect.objectContaining({
      uid: "owner-1",
      requestId: "request-0001",
      sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      buffer: bytes,
    })
  );
});

test("malformed anchors fail before creating a job", async () => {
  await request(app)
    .post("/api/media/studio-analysis-jobs")
    .field("anchors", "{bad")
    .attach("file", Buffer.from("x"), "source.mp4")
    .expect(400);
  expect(jobs.createStudioAnalysisJob).not.toHaveBeenCalled();
});

test("owned source submission forwards path and settings without browser video bytes", async () => {
  jobs.createStudioAnalysisJobFromOwnedSource.mockResolvedValue({
    jobId: "a".repeat(64), status: "queued",
  });
  const response = await request(app)
    .post("/api/media/studio-analysis-jobs/from-source")
    .send({ requestId: "owned-request-1", projectId: "project-1",
      sourceAssetId: "asset-1", storagePath: "studio/sources/owner-1/video.mp4",
      mode: "source_shots", start: 0, end: 60,
      anchors: { solo: { x: 40, y: 50 } } });
  expect(response.status).toBe(202);
  expect(jobs.createStudioAnalysisJobFromOwnedSource).toHaveBeenCalledWith(
    expect.objectContaining({ uid: "owner-1",
      storagePath: "studio/sources/owner-1/video.mp4" })
  );
});

test("read and cancel use authenticated owner and hide unknown jobs", async () => {
  jobs.getOwnedStudioAnalysisJob.mockResolvedValue(null);
  jobs.cancelStudioAnalysisJob.mockResolvedValue({ jobId: "a".repeat(64), status: "cancelled" });
  await request(app)
    .get(`/api/media/studio-analysis-jobs/${"a".repeat(64)}`)
    .expect(404);
  const response = await request(app)
    .post(`/api/media/studio-analysis-jobs/${"a".repeat(64)}/cancel`)
    .expect(200);
  expect(response.body.status).toBe("cancelled");
  expect(jobs.getOwnedStudioAnalysisJob).toHaveBeenCalledWith(
    expect.objectContaining({ uid: "owner-1" })
  );
  expect(jobs.cancelStudioAnalysisJob).toHaveBeenCalledWith(
    expect.objectContaining({ uid: "owner-1" })
  );
});

test("result read is owner scoped through the service", async () => {
  jobs.getOwnedStudioAnalysisResult.mockResolvedValue({ mode: "source_shots", tracks: {} });
  const response = await request(app)
    .get(`/api/media/studio-analysis-jobs/${"a".repeat(64)}/result`)
    .expect(200);
  expect(response.body.mode).toBe("source_shots");
  expect(jobs.getOwnedStudioAnalysisResult).toHaveBeenCalledWith({
    uid: "owner-1",
    jobId: "a".repeat(64),
  });
});

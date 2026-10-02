const express = require("express");
const request = require("supertest");
const crypto = require("crypto");
const mockSave = jest.fn().mockResolvedValue();
const mockDelete = jest.fn().mockResolvedValue();
const mockSignedUrl = jest.fn().mockResolvedValue(["https://storage.example.test/tracking-source"]);
const mockFile = jest.fn(() => ({ save: mockSave, delete: mockDelete, getSignedUrl: mockSignedUrl }));
jest.mock("../src/authMiddleware", () => (req, res, next) => {
  req.user = { uid: "tracking-user" };
  req.userId = "tracking-user";
  next();
});
jest.mock("../src/services/studioDirectorProjectBinding", () => ({
  assertOwnedStudioSourceBinding: jest.fn(),
}));
jest.mock("../src/services/studioSourceShotArtifactService", () => ({
  persistSourceShotArtifact: jest.fn(),
  projectSourceShotAnalysis: jest.fn(),
}));
jest.mock("../src/creditSystem", () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(), getCreditBreakdown: jest.fn() }));
jest.mock("../src/services/billingService", () => ({ getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ testerAccess: null }) }));
jest.mock("../src/services/videoEditingService", () => jest.fn().mockImplementation(() => ({})));
jest.mock("../src/utils/cloudRunAuth", () => ({ buildWorkerRequestConfig: jest.fn().mockResolvedValue({ timeout: 180000 }) }));
jest.mock("firebase-admin", () => ({ storage: () => ({ bucket: () => ({ file: mockFile }) }), firestore: jest.fn() }));
jest.mock("axios", () => ({ post: jest.fn() }));
const axios = require("axios");
const { assertOwnedStudioSourceBinding } = require("../src/services/studioDirectorProjectBinding");
const {
  persistSourceShotArtifact,
  projectSourceShotAnalysis,
} = require("../src/services/studioSourceShotArtifactService");
const routes = require("../src/mediaRoutes");
const app = express();
app.use("/api/media", routes);
const send = anchors => request(app).post("/api/media/track-studio-faces")
  .field("anchors", typeof anchors === "string" ? anchors : JSON.stringify(anchors))
  .field("start", "0").field("end", "60")
  .field("projectId", "project-1").field("sourceAssetId", "source:asset-1")
  .attach("file", Buffer.from("fixture-video"), "source.mp4");

beforeEach(() => {
  jest.clearAllMocks();
  assertOwnedStudioSourceBinding.mockResolvedValue({});
  projectSourceShotAnalysis.mockReturnValue({});
  persistSourceShotArtifact.mockResolvedValue({
    artifactHash: "a".repeat(64), sourceSha256: "b".repeat(64),
    projectId: "project-1", sourceAssetId: "source:asset-1",
    analysisRange: { space: "source", startTick: 0, endTick: 5400000 },
    createdAt: "2026-09-29T00:00:00.000Z",
  });
});

test("forwards authenticated face analysis and deletes its temporary upload", async () => {
  axios.post.mockResolvedValue({ data: { tracks: {}, reviewRequired: true } });
  const response = await send({ solo: { x: 34, y: 47 } }).expect(200);
  expect(response.body.reviewRequired).toBe(true);
  expect(mockFile).toHaveBeenCalledWith(expect.stringMatching(/^temp_tracking\/tracking-user\//));
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining("/track-studio-faces"),
    expect.objectContaining({ start: 0, end: 60, anchors: { solo: { x: 34, y: 47 } } }), expect.any(Object));
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("rejects malformed coordinates before any upload", async () => {
  for (const anchors of ["{broken", "null", { solo: { x: 101, y: 50 } }, { other: { x: 50, y: 50 } }]) {
    await send(anchors).expect(400);
  }
  expect(mockSave).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
});

test("worker failure still cleans up the temporary source", async () => {
  axios.post.mockRejectedValue({ response: { status: 422 } });
  await send({ solo: { x: 34, y: 47 } }).expect(422);
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("forwards explicit source-shot mode without requiring separate cameras", async () => {
  axios.post.mockResolvedValue({ data: { tracks: {}, sceneCuts: [49.5] } });
  const response = await send({ solo: { x: 34, y: 47 } })
    .field("mode", "source_shots").expect(200);
  const sourceSha256 = crypto.createHash("sha256").update("fixture-video").digest("hex");
  expect(axios.post).toHaveBeenCalledWith(expect.any(String),
    expect.objectContaining({ mode: "source_shots" }), expect.any(Object));
  expect(assertOwnedStudioSourceBinding).toHaveBeenCalledWith({
    uid: "tracking-user", projectId: "project-1",
    sourceAssetId: "source:asset-1", sourceSha256,
  });
  expect(persistSourceShotArtifact).toHaveBeenCalledWith(expect.objectContaining({
    uid: "tracking-user", projectId: "project-1", sourceAssetId: "source:asset-1",
    sourceSha256, analysis: { tracks: {}, sceneCuts: [49.5] },
  }));
  expect(projectSourceShotAnalysis.mock.invocationCallOrder[0])
    .toBeLessThan(assertOwnedStudioSourceBinding.mock.invocationCallOrder[0]);
  expect(assertOwnedStudioSourceBinding.mock.invocationCallOrder[0])
    .toBeLessThan(persistSourceShotArtifact.mock.invocationCallOrder[0]);
  expect(response.body.sourceShotArtifact.artifactHash).toBe("a".repeat(64));
});

test("accepts a complete ten-minute podcast analysis range", async () => {
  axios.post.mockResolvedValue({ data: { tracks: {}, editPlan: { timelineCuts: [] } } });
  await request(app).post("/api/media/track-studio-faces")
    .field("anchors", JSON.stringify({ solo: { x: 34, y: 47 } }))
    .field("start", "0").field("end", "600").field("mode", "source_shots")
    .field("projectId", "project-1").field("sourceAssetId", "source:asset-1")
    .attach("file", Buffer.from("fixture-video"), "source.mp4").expect(200);
  expect(axios.post).toHaveBeenCalledWith(expect.any(String),
    expect.objectContaining({ start: 0, end: 600, mode: "source_shots" }), expect.any(Object));
});

test("rejects unknown modes and source-shot reassignment of two panel identities", async () => {
  await send({ solo: { x: 34, y: 47 } }).field("mode", "invented").expect(400);
  await send({ top: { x: 34, y: 47 }, bottom: { x: 89, y: 17 } })
    .field("mode", "source_shots").expect(400);
  expect(mockSave).not.toHaveBeenCalled();
});

test("rejects a hash-qualified asset ID that does not match uploaded source bytes", async () => {
  await request(app).post("/api/media/track-studio-faces")
    .field("anchors", JSON.stringify({ solo: { x: 34, y: 47 } }))
    .field("start", "0").field("end", "60").field("mode", "source_shots")
    .field("projectId", "project-1")
    .field("sourceAssetId", `source:asset-1:sha256:${"0".repeat(64)}`)
    .attach("file", Buffer.from("fixture-video"), "source.mp4")
    .expect(409);
  expect(assertOwnedStudioSourceBinding).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
});

test("accepts a hash-qualified asset ID matching the uploaded source bytes", async () => {
  const sourceSha256 = crypto.createHash("sha256").update("fixture-video").digest("hex");
  const sourceAssetId = `source:asset-1:sha256:${sourceSha256}`;
  axios.post.mockResolvedValue({ data: { tracks: {}, sceneCuts: [49.5] } });
  await request(app).post("/api/media/track-studio-faces")
    .field("anchors", JSON.stringify({ solo: { x: 34, y: 47 } }))
    .field("start", "0").field("end", "60").field("mode", "source_shots")
    .field("projectId", "project-1").field("sourceAssetId", sourceAssetId)
    .attach("file", Buffer.from("fixture-video"), "source.mp4")
    .expect(200);
  expect(assertOwnedStudioSourceBinding).toHaveBeenCalledWith({
    uid: "tracking-user", projectId: "project-1", sourceAssetId, sourceSha256,
  });
});

test("rejects malformed source bindings before invoking the worker", async () => {
  await request(app).post("/api/media/track-studio-faces")
    .field("anchors", JSON.stringify({ solo: { x: 34, y: 47 } }))
    .field("start", "0").field("end", "60").field("mode", "source_shots")
    .field("projectId", "project/another-user").field("sourceAssetId", "source:asset-1")
    .attach("file", Buffer.from("fixture-video"), "source.mp4")
    .expect(400);
  expect(mockSave).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
  expect(assertOwnedStudioSourceBinding).not.toHaveBeenCalled();
});

test("does not return unrecorded source-shot analysis when artifact storage fails", async () => {
  axios.post.mockResolvedValue({ data: { tracks: {}, sceneCuts: [49.5] } });
  persistSourceShotArtifact.mockRejectedValue(Object.assign(new Error("receipt unavailable"), {
    code: "SOURCE_SHOT_ARTIFACT_UNAVAILABLE", statusCode: 503,
  }));
  const result = await send({ solo: { x: 34, y: 47 } })
    .field("mode", "source_shots").expect(503);
  expect(result.body.code).toBe("SOURCE_SHOT_ARTIFACT_UNAVAILABLE");
  expect(result.body).not.toHaveProperty("sceneCuts");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("worker failure or invalid analysis cannot permanently bind a source asset", async () => {
  axios.post.mockRejectedValueOnce({ response: { status: 422 } });
  await send({ solo: { x: 34, y: 47 } })
    .field("mode", "source_shots").expect(422);
  expect(assertOwnedStudioSourceBinding).not.toHaveBeenCalled();

  axios.post.mockResolvedValueOnce({ data: { tracks: {}, sceneCuts: [49.5] } });
  projectSourceShotAnalysis.mockImplementationOnce(() => {
    throw Object.assign(new Error("Invalid source-shot analysis"), {
      code: "SOURCE_SHOT_ANALYSIS_INVALID", statusCode: 502,
    });
  });
  await send({ solo: { x: 34, y: 47 } })
    .field("mode", "source_shots").expect(502);
  expect(assertOwnedStudioSourceBinding).not.toHaveBeenCalled();
  expect(persistSourceShotArtifact).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledTimes(2);
});

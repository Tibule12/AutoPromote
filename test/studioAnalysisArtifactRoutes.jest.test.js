const express = require("express");
const request = require("supertest");

jest.mock("../src/authMiddleware", () => (req, _res, next) => {
  const uid = req.get("x-test-uid");
  if (uid) {
    req.user = { uid };
    req.userId = uid;
  }
  next();
});
jest.mock("../src/services/studioAnalysisArtifactService", () => ({
  getOwnedAnalysisArtifact: jest.fn(),
}));

const { getOwnedAnalysisArtifact } = require("../src/services/studioAnalysisArtifactService");
const router = require("../src/routes/studioAnalysisArtifactRoutes");
const app = express();
app.use("/api/studio/director/analysis-artifacts", router);
const artifactHash = "a".repeat(64);

beforeEach(() => getOwnedAnalysisArtifact.mockReset());

test("read endpoint requires authenticated scope and never exposes a missing foreign artifact", async () => {
  await request(app).get(`/api/studio/director/analysis-artifacts/${artifactHash}`).expect(401);
  expect(getOwnedAnalysisArtifact).not.toHaveBeenCalled();
  getOwnedAnalysisArtifact.mockResolvedValue(null);
  await request(app)
    .get(`/api/studio/director/analysis-artifacts/${artifactHash}`)
    .set("x-test-uid", "owner-1")
    .expect(404);
  expect(getOwnedAnalysisArtifact).toHaveBeenCalledWith({
    uid: "owner-1",
    artifactHash,
  });
});

test("read endpoint returns only an owned validated artifact", async () => {
  const artifact = { artifactHash, ownerUid: "owner-1", analysisType: "source_shots" };
  getOwnedAnalysisArtifact.mockResolvedValue(artifact);
  const response = await request(app)
    .get(`/api/studio/director/analysis-artifacts/${artifactHash}`)
    .set("x-test-uid", "owner-1")
    .expect(200);
  expect(response.body).toEqual({ ok: true, artifact });
  expect(router.stack.map(item => Object.keys(item.route.methods))).toEqual([["get"]]);
});

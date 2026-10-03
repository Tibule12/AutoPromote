const express = require("express");
const request = require("supertest");
const { db } = require("../src/firebaseAdmin");
const authMiddleware = require("../src/authMiddleware");
const { miniFilmFixture, ownerUid, projectId } =
  require("./fixtures/studioProjectIntelligenceFixtures");
const { createProjectIntelligenceRevision } =
  require("../src/services/studioProjectIntelligenceContract");

jest.mock("../src/services/studioDirectorProjectBinding", () => ({
  getOwnedStudioSourceBinding: jest.fn(),
}));
jest.mock("../src/services/studioSourceShotArtifactService", () => ({
  getOwnedSourceShotArtifact: jest.fn(),
}));
jest.mock("../src/services/studioAnalysisArtifactService", () => ({
  getOwnedAnalysisArtifact: jest.fn(),
}));
jest.mock("../src/services/studioProjectRevisionService", () => ({
  parseStudioProjectHeadRecord: jest.fn(() => ({ revision: 1 })),
}));

const { getOwnedStudioSourceBinding } = require("../src/services/studioDirectorProjectBinding");
const { getOwnedSourceShotArtifact } = require("../src/services/studioSourceShotArtifactService");
const { getOwnedAnalysisArtifact } = require("../src/services/studioAnalysisArtifactService");
const { registerOwnedProjectIntelligence, getOwnedProjectIntelligence } =
  require("../src/services/studioProjectIntelligenceService");
const router = require("../src/routes/studioProjectIntelligenceRoutes");

const clone = value => structuredClone(value);
const snapshot = value => ({ exists: value !== undefined, data: () => clone(value) });
const fakeFirestore = () => {
  const data = new Map();
  return {
    data,
    collection: name => ({ doc: uid => ({ collection: collection => ({ doc: id => {
      const path = `${name}/${uid}/${collection}/${id}`;
      return { path, get: async () => snapshot(data.get(path)) };
    } }) }) }),
    runTransaction: async work => {
      const writes = [];
      const result = await work({ get: async ref => snapshot(data.get(ref.path)),
        create: (ref, value) => writes.push([ref.path, clone(value), true]),
        set: (ref, value) => writes.push([ref.path, clone(value), false]) });
      for (const [path, , mustBeNew] of writes)
        if (mustBeNew && data.has(path)) throw new Error("already exists");
      writes.forEach(([path, value]) => data.set(path, value));
      return result;
    },
  };
};

const originalCollection = db.collection;
const originalRunTransaction = db.runTransaction;
let firestore;
const app = express();
app.use(express.json({ limit: "270kb" }));
app.use("/api/studio/director/projects/intelligence", router);
const post = (revision, uid = ownerUid) => request(app)
  .post("/api/studio/director/projects/intelligence")
  .set("Authorization", `Bearer test-token-for-${uid}`).send({ revision });

beforeEach(() => {
  firestore = fakeFirestore();
  db.collection = firestore.collection;
  db.runTransaction = firestore.runTransaction;
  getOwnedStudioSourceBinding.mockReset();
  getOwnedSourceShotArtifact.mockReset();
  getOwnedAnalysisArtifact.mockReset();
  getOwnedStudioSourceBinding.mockImplementation(async ({ sourceAssetId }) => {
    const asset = miniFilmFixture().assets.find(item => item.assetId === sourceAssetId);
    return asset ? { sourceSha256: asset.contentHash } : null;
  });
  const hash = require("crypto").createHash("sha256").update(projectId).digest("hex");
  firestore.data.set(`users/${ownerUid}/studioDirectorProjects/${hash}`, { stub: true });
});
afterAll(() => {
  db.collection = originalCollection;
  db.runTransaction = originalRunTransaction;
});

test("route requires authenticated owner identity", async () => {
  expect(router.stack.find(item => item.route?.path === "/").route.stack[0].handle)
    .toBe(authMiddleware);
  expect((await request(app).post("/api/studio/director/projects/intelligence")
    .send({ revision: miniFilmFixture() })).status).toBe(401);
  expect((await post(miniFilmFixture(), "foreign-user")).status).toBe(400);
});

test("registers immutable scoped revision and reads sparse answer", async () => {
  const film = miniFilmFixture();
  const first = await post(film);
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ revisionId: film.revisionId,
    planningBlocked: true, duplicate: false });
  expect((await post(film)).body.duplicate).toBe(true);
  const current = await getOwnedProjectIntelligence({ uid: ownerUid, projectId,
    firestore });
  expect(current.summary.assets).toHaveLength(9);
  expect(current.summary.beats.find(beat => beat.beatId === "exit").coverageState)
    .toBe("missing");
  const response = await request(app).get(
    `/api/studio/director/projects/intelligence/${projectId}`)
    .set("Authorization", `Bearer test-token-for-${ownerUid}`);
  expect(response.status).toBe(200);
  expect(response.body.summary.revisionId).toBe(film.revisionId);
  expect(await getOwnedProjectIntelligence({ uid: "foreign-user", projectId,
    firestore })).toBeNull();
});

test("source hash mismatch and forged model origin fail closed", async () => {
  const film = miniFilmFixture();
  getOwnedStudioSourceBinding.mockResolvedValue({ sourceSha256: "f".repeat(64) });
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision: film, firestore })).rejects.toMatchObject({
    code: "PROJECT_INTELLIGENCE_SOURCE_UNVERIFIED" });
  getOwnedStudioSourceBinding.mockResolvedValue({ sourceSha256: film.assets[0].contentHash });
  const forged = clone(film);
  forged.assertions[0].provenance.origin = "model_inferred";
  const core = clone(forged);
  delete core.revisionId;
  delete core.sourceAssetSetDigest;
  delete core.analysisDependencyDigests;
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision: createProjectIntelligenceRevision(core), firestore }))
    .rejects.toMatchObject({ code: "PROJECT_INTELLIGENCE_INVALID" });
  expect(firestore.data.size).toBe(1);
});

test("source shot evidence must resolve to the matching immutable owner artifact", async () => {
  const film = miniFilmFixture();
  const core = clone(film);
  delete core.revisionId;
  delete core.sourceAssetSetDigest;
  delete core.analysisDependencyDigests;
  const artifactHash = "a".repeat(64);
  const workerResultSha256 = "b".repeat(64);
  core.evidenceRefs.push({ evidenceId: "evidence:source_shots:t1",
    kind: "source_shot_artifact", sourceAssetId: film.assets[0].assetId,
    sourceContentHash: film.assets[0].contentHash, artifactHash,
    analysisType: "source_shots", modelRevision: "shot-engine-v1", configHash: null,
    dependencyHashes: [workerResultSha256], statement: null });
  const revision = createProjectIntelligenceRevision(core);
  getOwnedSourceShotArtifact.mockResolvedValue(null);
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision, firestore })).rejects.toMatchObject({
    code: "PROJECT_INTELLIGENCE_SOURCE_UNVERIFIED" });
  getOwnedSourceShotArtifact.mockResolvedValue({ projectId, sourceAssetId: film.assets[0].assetId,
    sourceSha256: film.assets[0].contentHash, engine: "shot-engine-v1",
    workerResultSha256 });
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision, firestore })).resolves.toMatchObject({ revisionId: revision.revisionId });
});

test("generic analysis evidence requires the exact server artifact and its source-shot dependency", async () => {
  const film = miniFilmFixture();
  const core = clone(film);
  delete core.revisionId;
  delete core.sourceAssetSetDigest;
  delete core.analysisDependencyDigests;
  const asset = film.assets[0];
  const artifactHash = "a".repeat(64);
  const sourceShotHash = "b".repeat(64);
  const workerResultHash = "c".repeat(64);
  const configHash = "d".repeat(64);
  core.evidenceRefs.push({ evidenceId: "evidence:analysis:t1",
    kind: "analysis_artifact", sourceAssetId: asset.sourceRef.sourceAssetId,
    sourceContentHash: asset.contentHash, artifactHash, analysisType: "source_shots",
    modelRevision: "opencv-yunet-source-shot-follow", configHash,
    dependencyHashes: [sourceShotHash], statement: null });
  const revision = createProjectIntelligenceRevision(core);
  const call = () => registerOwnedProjectIntelligence({ uid: ownerUid,
    revision, firestore });
  getOwnedAnalysisArtifact.mockResolvedValue(null);
  await expect(call()).rejects.toMatchObject({ code: "PROJECT_INTELLIGENCE_SOURCE_UNVERIFIED" });
  getOwnedAnalysisArtifact.mockResolvedValue({ projectId,
    sourceAssetId: asset.sourceRef.sourceAssetId, sourceSha256: asset.contentHash,
    analysisType: "source_shots", modelRevision: "opencv-yunet-source-shot-follow",
    engine: "opencv-yunet-source-shot-follow", configHash,
    dependencyHashes: [sourceShotHash], contentHash: workerResultHash });
  getOwnedSourceShotArtifact.mockResolvedValue(null);
  await expect(call()).rejects.toMatchObject({ code: "PROJECT_INTELLIGENCE_SOURCE_UNVERIFIED" });
  getOwnedSourceShotArtifact.mockResolvedValue({ projectId,
    sourceAssetId: asset.sourceRef.sourceAssetId, sourceSha256: asset.contentHash,
    engine: "opencv-yunet-source-shot-follow", workerResultSha256: workerResultHash });
  await expect(call()).resolves.toMatchObject({ revisionId: revision.revisionId });
  const forged = clone(revision);
  forged.evidenceRefs.at(-1).configHash = "e".repeat(64);
  const forgedCore = clone(forged);
  delete forgedCore.revisionId;
  delete forgedCore.sourceAssetSetDigest;
  delete forgedCore.analysisDependencyDigests;
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision: createProjectIntelligenceRevision(forgedCore), firestore }))
    .rejects.toMatchObject({ code: "PROJECT_INTELLIGENCE_SOURCE_UNVERIFIED" });
});

test("lineage rejects stale bases and removal of prior evidence", async () => {
  const film = miniFilmFixture();
  await registerOwnedProjectIntelligence({ uid: ownerUid, revision: film, firestore });
  const core = clone(film);
  delete core.revisionId;
  delete core.sourceAssetSetDigest;
  delete core.analysisDependencyDigests;
  core.baseRevisionId = film.revisionId;
  core.beats.push({ beatId: "arrival", title: "Arrival", origin: "human_supplied" });
  const second = createProjectIntelligenceRevision(core);
  expect((await registerOwnedProjectIntelligence({ uid: ownerUid, revision: second,
    firestore })).duplicate).toBe(false);
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid, revision: second,
    firestore })).resolves.toMatchObject({ duplicate: true });
  const stale = createProjectIntelligenceRevision({ ...core, baseRevisionId: film.revisionId,
    beats: [...core.beats, { beatId: "stale", title: "Stale", origin: "human_supplied" }] });
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision: stale, firestore })).rejects.toMatchObject({ code: "PROJECT_INTELLIGENCE_CONFLICT" });
  const removed = createProjectIntelligenceRevision({ ...core,
    baseRevisionId: second.revisionId, evidenceRefs: core.evidenceRefs.slice(1) });
  await expect(registerOwnedProjectIntelligence({ uid: ownerUid,
    revision: removed, firestore })).rejects.toMatchObject({
    code: "PROJECT_INTELLIGENCE_INVALID" });
});

test("route rejects incompatible supersession without advancing the stored head", async () => {
  const film = miniFilmFixture();
  expect((await post(film)).status).toBe(201);
  const core = clone(film);
  delete core.revisionId;
  delete core.sourceAssetSetDigest;
  delete core.analysisDependencyDigests;
  core.baseRevisionId = film.revisionId;
  core.captureGroups.push({ ...clone(core.captureGroups[1]),
    groupId: "capture:t2:unrelated", captureEventId: "other:event",
    supersedes: "capture:t2" });
  expect((await post(createProjectIntelligenceRevision(core))).status).toBe(400);
  const current = await getOwnedProjectIntelligence({ uid: ownerUid, projectId, firestore });
  expect(current.record.revisionId).toBe(film.revisionId);
  expect(firestore.data.size).toBe(3);
});

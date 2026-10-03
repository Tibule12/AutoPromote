const crypto = require("crypto");

jest.mock("../src/services/studioDirectorProjectBinding", () => ({
  getOwnedStudioSourceBinding: jest.fn(),
}));
jest.mock("../src/services/studioSourceShotArtifactService", () => ({
  getOwnedSourceShotArtifact: jest.fn(),
  projectSourceShotAnalysis: jest.fn(),
}));

const { getOwnedStudioSourceBinding } = require("../src/services/studioDirectorProjectBinding");
const {
  getOwnedSourceShotArtifact,
  projectSourceShotAnalysis,
} = require("../src/services/studioSourceShotArtifactService");
const {
  getOwnedAnalysisArtifact,
  persistSourceShotAnalysisArtifact,
  projectSourceShotAnalysisArtifact,
} = require("../src/services/studioAnalysisArtifactService");

const stable = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );
const hash = value =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : stable(value))
    .digest("hex");
const actualSourceShot = jest.requireActual("../src/services/studioSourceShotArtifactService");
const analysis = () => ({
  engine: "opencv-yunet-source-shot-follow",
  mode: "source_shots",
  start: 10,
  end: 70,
  sceneCuts: [20.5],
  decodeFailures: [],
  reviewRequired: true,
  tracks: { solo: { coverage: 0.7, keyframes: [] } },
  editPlan: { version: 1, preflight: { passed: true } },
});
const input = () => ({
  uid: "owner-1",
  projectId: "project-1",
  sourceAssetId: "asset-1",
  sourceSha256: hash("uploaded source bytes"),
  analysis: analysis(),
  request: { mode: "source_shots", start: 10, end: 70, anchors: { solo: { x: 30, y: 40 } } },
});

const fakeFirestore = () => {
  const docs = new Map();
  return {
    docs,
    collection: collection => ({
      doc: uid => ({
        collection: subcollection => ({
          doc: id => {
            const path = `${collection}/${uid}/${subcollection}/${id}`;
            return {
              create: async value => {
                if (docs.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
                docs.set(path, structuredClone(value));
              },
              get: async () => ({
                exists: docs.has(path),
                data: () => structuredClone(docs.get(path)),
              }),
            };
          },
        }),
      }),
    }),
  };
};

beforeEach(() => {
  getOwnedStudioSourceBinding.mockReset();
  getOwnedSourceShotArtifact.mockReset();
  projectSourceShotAnalysis.mockReset();
  projectSourceShotAnalysis.mockImplementation(actualSourceShot.projectSourceShotAnalysis);
  getOwnedStudioSourceBinding.mockImplementation(async () => ({
    sourceSha256: input().sourceSha256,
  }));
  getOwnedSourceShotArtifact.mockImplementation(async () => {
    const source = input();
    const core = actualSourceShot.projectSourceShotAnalysis(source);
    return { ...core, artifactHash: hash(core), createdAt: "2026-10-03T00:00:00Z" };
  });
});

test("stores a scoped immutable CPU projection and returns the same receipt on retry", async () => {
  const firestore = fakeFirestore();
  const first = await persistSourceShotAnalysisArtifact({ ...input(), firestore });
  const second = await persistSourceShotAnalysisArtifact({ ...input(), firestore });
  expect(second).toEqual(first);
  expect(firestore.docs.size).toBe(1);
  const stored = await getOwnedAnalysisArtifact({
    uid: "owner-1",
    artifactHash: first.artifactHash,
    firestore,
  });
  expect(stored).toMatchObject({
    ownerUid: "owner-1",
    projectId: "project-1",
    sourceAssetId: "asset-1",
    sourceSha256: input().sourceSha256,
    analysisType: "source_shots",
    producer: "studio-face-tracking-python",
    engine: "opencv-yunet-source-shot-follow",
    modelRevision: "opencv-yunet-source-shot-follow",
    streamId: null,
    coveredIntervals: [],
    coverageBasis: "sampled_observations_only",
    sampleCoverage: 0.7,
    projection: {
      sceneCutTicks: [1845000],
      decodeFailureCount: 0,
      reviewRequired: true,
      preflightPassed: true,
    },
  });
  expect(stored.dependencyHashes).toHaveLength(1);
  expect(stored.configHash).toMatch(/^[a-f0-9]{64}$/);
  expect(stored.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await getOwnedAnalysisArtifact({
      uid: "foreign-owner",
      artifactHash: first.artifactHash,
      firestore,
    })
  ).toBeNull();
});

test("records a failed decode tail without pretending sampled faces cover the full range", async () => {
  const source = input();
  source.analysis.decodeFailures = [65];
  const core = actualSourceShot.projectSourceShotAnalysis(source);
  const projected = projectSourceShotAnalysisArtifact({
    ...source,
    sourceShotArtifact: { ...core, artifactHash: hash(core) },
  });
  expect(projected.failedIntervals).toEqual([
    {
      space: "source",
      startTick: 5850000,
      endTick: 6300000,
    },
  ]);
  expect(projected.coveredIntervals).toEqual([]);
});

test("request settings and worker range are bound into immutable identity", async () => {
  const firestore = fakeFirestore();
  const first = await persistSourceShotAnalysisArtifact({ ...input(), firestore });
  const changed = input();
  changed.request.anchors.solo.x = 31;
  const second = await persistSourceShotAnalysisArtifact({ ...changed, firestore });
  expect(second.artifactHash).not.toBe(first.artifactHash);
  expect(second.configHash).not.toBe(first.configHash);
  const wrongRange = input();
  wrongRange.request.end = 69;
  await expect(
    persistSourceShotAnalysisArtifact({ ...wrongRange, firestore })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_ARTIFACT_INVALID" });
});

test("missing source binding or source-shot dependency fails closed", async () => {
  const firestore = fakeFirestore();
  getOwnedStudioSourceBinding.mockResolvedValueOnce(null);
  await expect(persistSourceShotAnalysisArtifact({ ...input(), firestore })).rejects.toMatchObject({
    code: "STUDIO_ANALYSIS_SOURCE_UNVERIFIED",
  });
  getOwnedSourceShotArtifact.mockResolvedValueOnce(null);
  await expect(persistSourceShotAnalysisArtifact({ ...input(), firestore })).rejects.toMatchObject({
    code: "STUDIO_ANALYSIS_SOURCE_UNVERIFIED",
  });
  expect(firestore.docs.size).toBe(0);
});

test("forged worker result, malformed failure time and corrupt stored record are rejected", async () => {
  const firestore = fakeFirestore();
  const forged = input();
  forged.analysis.sceneCuts = [21];
  await expect(persistSourceShotAnalysisArtifact({ ...forged, firestore })).rejects.toMatchObject({
    code: "STUDIO_ANALYSIS_ARTIFACT_INVALID",
  });
  const invalidFailure = input();
  invalidFailure.analysis.decodeFailures = [71];
  const invalidFailureCore = actualSourceShot.projectSourceShotAnalysis(invalidFailure);
  getOwnedSourceShotArtifact.mockResolvedValueOnce({
    ...invalidFailureCore,
    artifactHash: hash(invalidFailureCore),
  });
  await expect(
    persistSourceShotAnalysisArtifact({ ...invalidFailure, firestore })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_ARTIFACT_INVALID" });
  const receipt = await persistSourceShotAnalysisArtifact({ ...input(), firestore });
  const path = `users/owner-1/studioAnalysisArtifacts/${receipt.artifactHash}`;
  firestore.docs.get(path).projection.sceneCutTicks = [123];
  await expect(
    getOwnedAnalysisArtifact({ uid: "owner-1", artifactHash: receipt.artifactHash, firestore })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_ARTIFACT_UNAVAILABLE" });
  await expect(persistSourceShotAnalysisArtifact({ ...input(), firestore })).rejects.toMatchObject({
    code: "STUDIO_ANALYSIS_ARTIFACT_UNAVAILABLE",
  });
});

const crypto = require("crypto");
const {
  getOwnedSourceShotArtifact,
  persistSourceShotArtifact,
  projectSourceShotAnalysis,
} = require("../src/services/studioSourceShotArtifactService");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const workerAnalysis = () => ({
  engine: "opencv-yunet-source-shot-follow",
  mode: "source_shots",
  start: 10,
  end: 70,
  sceneCuts: [42.125, 19.5, 42.125],
  reviewRequired: true,
  decodeFailures: [],
  tracks: { solo: { coverage: 0.87654321, keyframes: [{ time: 10, x: 50, y: 50 }] } },
  editPlan: { version: 1, preflight: { passed: true } },
});
const input = (overrides = {}) => ({
  uid: "reviewer-1",
  projectId: "project-1",
  sourceAssetId: "source:asset-1",
  sourceSha256: sha256("the uploaded video bytes"),
  analysis: workerAnalysis(),
  ...overrides,
});

const makeFirestore = () => {
  const docs = new Map();
  const writes = [];
  return {
    docs,
    writes,
    collection: collection => ({
      doc: uid => ({
        collection: subcollection => ({
          doc: id => {
            const path = `${collection}/${uid}/${subcollection}/${id}`;
            return {
              create: async value => {
                writes.push(path);
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

test("projects only bounded server-observed source-shot evidence in Studio ticks", () => {
  const core = projectSourceShotAnalysis(input());
  expect(core).toMatchObject({
    schemaVersion: 1,
    ownerUid: "reviewer-1",
    projectId: "project-1",
    sourceAssetId: "source:asset-1",
    sourceSha256: sha256("the uploaded video bytes"),
    engine: "opencv-yunet-source-shot-follow",
    mode: "source_shots",
    analysisRange: { space: "source", startTick: 900000, endTick: 6300000 },
    sceneCutTicks: [1755000, 3791250],
    sampleCoverage: 0.876543,
    decodeFailures: 0,
    reviewRequired: true,
    editPlanVersion: 1,
    preflightPassed: true,
  });
  expect(core.workerResultSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(core).not.toHaveProperty("tracks");
  expect(JSON.stringify(core).length).toBeLessThan(1000);
});

test("persists by canonical content hash and replays the exact immutable record", async () => {
  const firestore = makeFirestore();
  const first = await persistSourceShotArtifact({ ...input(), firestore });
  expect(first).toMatchObject({
    artifactHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    sourceSha256: sha256("the uploaded video bytes"),
    projectId: "project-1",
    sourceAssetId: "source:asset-1",
    analysisRange: { space: "source", startTick: 900000, endTick: 6300000 },
    createdAt: expect.any(String),
  });
  const path = `users/reviewer-1/studioSourceShotArtifacts/${first.artifactHash}`;
  expect([...firestore.docs.keys()]).toEqual([path]);
  const replay = await persistSourceShotArtifact({ ...input(), firestore });
  expect(replay).toEqual(first);
  expect(firestore.docs.size).toBe(1);
  expect(await getOwnedSourceShotArtifact({
    uid: "reviewer-1", artifactHash: first.artifactHash, firestore,
  })).toEqual(firestore.docs.get(path));
  expect(await getOwnedSourceShotArtifact({
    uid: "another-user", artifactHash: first.artifactHash, firestore,
  })).toBeNull();
  const changed = await persistSourceShotArtifact({
    ...input({ analysis: { ...workerAnalysis(), sceneCuts: [19.5] } }), firestore,
  });
  expect(changed.artifactHash).not.toBe(first.artifactHash);
  expect(firestore.docs.size).toBe(2);
});

test("retains failed preflight and decode counts so review can reject ineligible analysis", () => {
  const core = projectSourceShotAnalysis(input({
    analysis: {
      ...workerAnalysis(), decodeFailures: [25],
      editPlan: { version: 1, preflight: { passed: false } },
      tracks: { solo: { coverage: 0.54 } },
    },
  }));
  expect(core).toMatchObject({
    decodeFailures: 1, preflightPassed: false, sampleCoverage: 0.54,
  });
});

test("rejects malformed worker results and oversized cut lists before storage", async () => {
  const firestore = makeFirestore();
  const invalidAnalyses = [
    { ...workerAnalysis(), engine: "client-fabricated" },
    { ...workerAnalysis(), mode: "anchored" },
    { ...workerAnalysis(), sceneCuts: [9] },
    { ...workerAnalysis(), sceneCuts: [71] },
    { ...workerAnalysis(), sceneCuts: Array(2001).fill(15) },
    { ...workerAnalysis(), start: 0, end: 901 },
    { ...workerAnalysis(), tracks: { solo: { coverage: Number.NaN } } },
    { ...workerAnalysis(), decodeFailures: "none" },
  ];
  for (const analysis of invalidAnalyses) {
    await expect(persistSourceShotArtifact({ ...input({ analysis }), firestore }))
      .rejects.toMatchObject({ code: "SOURCE_SHOT_ANALYSIS_INVALID" });
  }
  expect(firestore.docs.size).toBe(0);
});

test("does not accept a corrupted existing record or a failed Firestore create", async () => {
  const firestore = makeFirestore();
  const first = await persistSourceShotArtifact({ ...input(), firestore });
  const path = `users/reviewer-1/studioSourceShotArtifacts/${first.artifactHash}`;
  firestore.docs.get(path).sceneCutTicks = [123];
  await expect(persistSourceShotArtifact({ ...input(), firestore }))
    .rejects.toMatchObject({ code: "SOURCE_SHOT_ARTIFACT_UNAVAILABLE" });
  await expect(getOwnedSourceShotArtifact({
    uid: "reviewer-1", artifactHash: first.artifactHash, firestore,
  })).rejects.toMatchObject({ code: "SOURCE_SHOT_ARTIFACT_UNAVAILABLE" });

  const offline = {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
      create: async () => { throw new Error("offline"); },
    }) }) }) }),
  };
  await expect(persistSourceShotArtifact({ ...input(), firestore: offline }))
    .rejects.toMatchObject({ code: "SOURCE_SHOT_ARTIFACT_UNAVAILABLE" });
});

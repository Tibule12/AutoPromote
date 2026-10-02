const crypto = require("crypto");
const express = require("express");
const request = require("supertest");
const { db } = require("../src/firebaseAdmin");
const authMiddleware = require("../src/authMiddleware");
const router = require("../src/routes/studioDirectorReviewRoutes");
const { assertOwnedStudioSourceBinding } = require("../src/services/studioDirectorProjectBinding");
const { persistSourceShotArtifact } = require("../src/services/studioSourceShotArtifactService");
const { computeStudioDirectorPreviewFingerprint } = require("../src/services/studioDirectorReplayService");
const { adaptStudioSnapshotToDocument } = require("../frontend/src/components/studioProjectDocument");
const { prepareStudioDirectorProposal } = require("../frontend/src/components/studioDirectorProposals");

const store = new Map();
const originalCollection = db.collection;
const originalRunTransaction = db.runTransaction;
const paths = [];
const app = express();
app.use(express.json({ limit: "24kb" }));
app.use("/api/studio/director/reviews", router);

const stableStringify = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
);
const hash = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
const sourceRange = { space: "source", startTick: 0, endTick: 1_800_000 };
const programmeRange = { space: "programme", startTick: 0, endTick: 1_800_000 };
const projectDocument = () => ({
  schemaVersion: 1, projectId: "project-1", revision: 4,
  clock: { ticksPerSecond: 90_000, interval: "half_open" },
  output: {
    aspectRatio: "9:16", requestedResolution: "1080p",
    frameRate: { numerator: 30, denominator: 1 }, codec: "h264",
    audioCodec: "aac", audioSampleRate: null, audioSampleRatePolicy: "worker_selected",
  },
  assets: [{ assetId: "source:asset-1", sourceId: "asset-1",
    identityState: "legacy_reference_unverified" }],
  clipOccurrences: [{
    occurrenceId: "main", assetId: "source:asset-1", sourceRange,
    programmeRange, timeMapId: "map:main",
    playback: { direction: "forward", freeze: false,
      rate: { numerator: 1, denominator: 1 } },
  }],
  timeMaps: [{
    timeMapId: "map:main", occurrenceId: "main",
    segments: [{ sourceRange,
      clipLocalRange: { space: "clip_local", startTick: 0, endTick: 1_800_000 },
      programmeRange, rate: { numerator: 1, denominator: 1 },
      direction: "forward", freeze: false }],
  }],
  layers: [], linkedTiming: { cues: {}, keys: {} }, audioGraph: {},
  constraints: { locks: [] }, styleRef: null, analysisRefs: [],
  programmeSpeedKeys: [], fallbackSpeed: 1,
  outputTimeMap: [{ programmeRange,
    outputRange: { space: "output", startTick: 0, endTick: 1_800_000 },
    rateNumerator: 1_000_000, rateDenominator: 1_000_000 }],
  journal: [], idempotency: {}, directorReviewJournal: [],
  compatibility: { legacySnapshotVersion: 1,
    projection: "clip_occurrences_canonical_other_fields_legacy",
    layerComposition: "separate_worker_stages" },
});
const headPath = (uid = "reviewer-1") =>
  `users/${uid}/studioDirectorProjects/${crypto.createHash("sha256").update("project-1").digest("hex")}`;
const seedHead = (uid = "reviewer-1", document = projectDocument()) => {
  const documentFingerprint = hash(document);
  store.set(headPath(uid), {
    schemaVersion: 1, ownerUid: uid, projectId: document.projectId,
    revision: document.revision, documentFingerprint,
    serverRevisionId: crypto.createHash("sha256")
      .update(`${document.projectId}\0${document.revision}`).digest("hex"),
    registeredAt: new Date().toISOString(),
    documentJson: stableStringify(document),
  });
};
const split = () => ({
  type: "split_clip",
  target: { occurrenceId: "main" },
  at: { space: "source", ticks: 720_000 },
  newOccurrenceIds: { left: "left", right: "right" },
  preconditions: { sourceRange },
});
const proposal = (operation = split(), evidence, document = projectDocument()) => {
  const batch = {
    projectId: "project-1",
    baseRevision: 4,
    idempotencyKey: "edit-1",
    actor: { type: "ai", id: "director" },
    operations: [operation],
  };
  let previewFingerprint;
  try {
    previewFingerprint = computeStudioDirectorPreviewFingerprint({ document, batch });
  } catch (_) {
    // Malformed and intentionally unexecutable proposals still need a valid
    // fingerprint shape to exercise the route's own rejection path.
    previewFingerprint = "b".repeat(64);
  }
  const core = {
    schemaVersion: 1,
    proposalId: "proposal-1",
    projectId: "project-1",
    baseRevision: 4,
    documentFingerprint: hash(document),
    previewFingerprint,
    batch,
    ...(evidence ? { evidence } : {}),
  };
  return { ...core, proposalFingerprint: hash(core) };
};
const rehash = candidate => {
  const { proposalFingerprint: _oldFingerprint, ...core } = candidate;
  return { ...core, proposalFingerprint: hash(core) };
};
const evidence = receipt => ({
  schemaVersion: 1,
  type: "source_shot_boundary",
  provider: "studio_face_tracking",
  engine: "opencv-yunet-source-shot-follow",
  sourceAssetId: "source:asset-1",
  sourceIdentityState: "legacy_reference_unverified",
  sourceContentHash: null,
  artifactHash: receipt.artifactHash,
  sourceSha256: receipt.sourceSha256,
  analysisRange: sourceRange,
  boundaryTick: 720_000,
  sampleCoverage: 0.8,
  verification: "needs_review",
  decodeFailures: 0,
});
const seedSourceShot = async (uid = "reviewer-1") => {
  const sourceSha256 = "c".repeat(64);
  await assertOwnedStudioSourceBinding({
    uid, projectId: "project-1", sourceAssetId: "source:asset-1", sourceSha256,
  });
  return persistSourceShotArtifact({
    uid, projectId: "project-1", sourceAssetId: "source:asset-1", sourceSha256,
    analysis: {
      mode: "source_shots", engine: "opencv-yunet-source-shot-follow",
      start: 0, end: 20, sceneCuts: [8], decodeFailures: [],
      reviewRequired: true, tracks: { solo: { coverage: 0.8 } },
      editPlan: { version: 1, preflight: { passed: true } },
    },
  });
};
const post = (body, uid = "reviewer-1") =>
  request(app).post("/api/studio/director/reviews")
    .set("Authorization", `Bearer test-token-for-${uid}`)
    .send(body);

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: crypto.webcrypto });
  globalThis.TextEncoder = require("util").TextEncoder;
});

beforeEach(() => {
  store.clear();
  paths.length = 0;
  db.collection = collection => {
    expect(collection).toBe("users");
    return {
      doc: uid => ({
        collection: subcollection => {
          expect(["studioDirectorReviews", "studioDirectorProjects", "studioDirectorProjectBindings",
            "studioSourceShotArtifacts"]).toContain(subcollection);
          return {
            doc: id => {
              const path = `${collection}/${uid}/${subcollection}/${id}`;
              paths.push(path);
              return {
                path,
                create: async data => {
                  if (store.has(path)) throw Object.assign(new Error("already exists"), { code: 6 });
                  store.set(path, structuredClone(data));
                },
                get: async () => ({
                  exists: store.has(path),
                  data: () => structuredClone(store.get(path)),
                }),
              };
            },
          };
        },
      }),
    };
  };
  db.runTransaction = async work => {
    const writes = [];
    const transaction = {
      get: ref => ref.get(),
      create: (ref, data) => writes.push({ ref, data }),
    };
    const result = await work(transaction);
    for (const { ref, data } of writes) await ref.create(data);
    return result;
  };
});

afterAll(() => {
  db.collection = originalCollection;
  db.runTransaction = originalRunTransaction;
});

test("route requires the shared Firebase auth middleware", async () => {
  const route = router.stack.find(layer => layer.route?.path === "/");
  expect(route.route.stack[0].handle).toBe(authMiddleware);
  const unauthenticated = await request(app)
    .post("/api/studio/director/reviews")
    .send({ proposal: proposal(), decision: "approve" });
  expect(unauthenticated.status).toBe(401);
  expect(paths).toHaveLength(0);
});

test("pre-attached or mismatched user objects cannot choose a review scope", async () => {
  const spoofed = express();
  spoofed.use(express.json());
  spoofed.use((req, _res, next) => {
    req.user = { uid: "victim" };
    req.userId = "attacker";
    next();
  });
  spoofed.use("/api/studio/director/reviews", router);
  const result = await request(spoofed)
    .post("/api/studio/director/reviews")
    .send({ proposal: proposal(), decision: "approve" });
  expect(result.status).toBe(401);
  expect(paths).toHaveLength(0);
});

test("server derives UID and time, writes once, and replays the same immutable decision", async () => {
  seedHead();
  const body = { proposal: proposal(), decision: "approve" };
  const first = await post(body);
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({
    ok: true,
    projectId: "project-1",
    proposalId: "proposal-1",
    baseRevision: 4,
    proposalFingerprint: body.proposal.proposalFingerprint,
    decision: "approve",
    reviewerUid: "reviewer-1",
    duplicate: false,
  });
  expect(first.body.serverReviewId).toMatch(/^[a-f0-9]{64}$/);
  expect(Date.parse(first.body.reviewedAt)).not.toBeNaN();
  expect(paths[0]).toBe(`users/reviewer-1/studioDirectorReviews/${first.body.serverReviewId}`);
  expect(store.get(paths[0]).proposal).toEqual(body.proposal);
  expect(store.get(paths[0]).previewVerificationVersion).toBe(1);
  seedHead("reviewer-1", { ...projectDocument(), revision: 5 });
  const replay = await post(body);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual({ ...first.body, duplicate: true });
  expect(store.size).toBe(2);
});

test("browser-prepared proposal passes server replay against its registered document", async () => {
  const document = adaptStudioSnapshotToDocument({
    projectId: "project-1",
    snapshot: {
      orderedClips: [{ id: "asset-1", start: 0, end: 20 }],
      selectedClipId: "asset-1",
      timeline: [{ id: "main", sourceClipId: "asset-1", startRequest: 0, endRequest: 20 }],
    },
  });
  const prepared = await prepareStudioDirectorProposal(document, {
    proposalId: "browser-proposal",
    idempotencyKey: "browser-edit",
    directorId: "director",
    operation: {
      type: "trim_clip", target: { occurrenceId: "main" },
      keep: { space: "source", startTick: 0, endTick: 1_350_000 },
    },
  });
  seedHead("reviewer-1", document);
  const result = await post({ proposal: prepared.proposal, decision: "approve" });
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({
    ok: true, proposalId: "browser-proposal", decision: "approve", duplicate: false,
  });
  expect(store.get(`users/reviewer-1/studioDirectorReviews/${result.body.serverReviewId}`)
    .previewVerificationVersion).toBe(1);
});

test("forged preview fingerprints fail before an immutable decision is written", async () => {
  seedHead();
  const forged = rehash({ ...proposal(), previewFingerprint: "a".repeat(64) });
  const result = await post({ proposal: forged, decision: "approve" });
  expect(result.status).toBe(409);
  expect(result.body.error).toBe("preview_fingerprint_mismatch");
  expect([...store.keys()].filter(path => path.includes("studioDirectorReviews"))).toHaveLength(0);
});

test("locked edits fail server replay even with a syntactically valid proposal", async () => {
  const document = projectDocument();
  document.constraints.locks.push({
    lockId: "locked-cut", occurrenceId: "main", mode: "preserve",
    sourceRange: { space: "source", startTick: 700_000, endTick: 740_000 },
  });
  seedHead("reviewer-1", document);
  const result = await post({ proposal: proposal(split(), undefined, document), decision: "approve" });
  expect(result.status).toBe(409);
  expect(result.body.error).toBe("proposal_replay_rejected");
  expect([...store.keys()].filter(path => path.includes("studioDirectorReviews"))).toHaveLength(0);
});

test("legacy decisions cannot be replayed as server-verified reviews", async () => {
  seedHead();
  const body = { proposal: proposal(), decision: "approve" };
  const first = await post(body);
  expect(first.status).toBe(201);
  delete store.get(`users/reviewer-1/studioDirectorReviews/${first.body.serverReviewId}`)
    .previewVerificationVersion;
  const retry = await post(body);
  expect(retry.status).toBe(409);
  expect(retry.body.error).toBe("review_requires_reproposal");
});

test("review requires the authenticated owner's current stored revision", async () => {
  const body = { proposal: proposal(), decision: "approve" };
  const missing = await post(body);
  expect(missing.status).toBe(409);
  expect(missing.body.error).toBe("project_revision_missing");
  expect(store.size).toBe(0);

  seedHead("other-user");
  const otherOwner = await post(body);
  expect(otherOwner.status).toBe(409);
  expect(otherOwner.body.error).toBe("project_revision_missing");

  seedHead();
  const changed = rehash({ ...body.proposal, documentFingerprint: "a".repeat(64) });
  const mismatch = await post({ proposal: changed, decision: "approve" });
  expect(mismatch.status).toBe(409);
  expect(mismatch.body.error).toBe("project_revision_mismatch");
  expect([...store.keys()].filter(path => path.includes("studioDirectorReviews"))).toHaveLength(0);
});

test("review checks the target occurrence and source range in the stored document", async () => {
  seedHead();
  const unknownTarget = proposal({ ...split(), target: { occurrenceId: "other" } });
  const unknown = await post({ proposal: unknownTarget, decision: "approve" });
  expect(unknown.status).toBe(409);
  expect(unknown.body.error).toBe("project_revision_target_mismatch");

  const wrongRange = proposal({ ...split(), preconditions: {
    sourceRange: { space: "source", startTick: 0, endTick: 1_900_000 },
  } });
  const mismatch = await post({ proposal: wrongRange, decision: "approve" });
  expect(mismatch.status).toBe(409);
  expect(mismatch.body.error).toBe("project_revision_target_mismatch");
  expect([...store.keys()].filter(path => path.includes("studioDirectorReviews"))).toHaveLength(0);
});

test("source-shot evidence must name the stored target's source asset", async () => {
  const document = projectDocument();
  document.assets.push({ assetId: "source:asset-2", sourceId: "asset-2",
    identityState: "legacy_reference_unverified" });
  document.clipOccurrences[0].assetId = "source:asset-2";
  seedHead("reviewer-1", document);
  const receipt = await seedSourceShot();
  const result = await post({ proposal: proposal(split(), evidence(receipt), document),
    decision: "approve" });
  expect(result.status).toBe(409);
  expect(result.body.error).toBe("project_revision_target_mismatch");
});

test("a corrupt current head cannot attest a document", async () => {
  seedHead();
  store.get(headPath()).documentJson = "{invalid";
  const result = await post({ proposal: proposal(), decision: "approve" });
  expect(result.status).toBe(503);
  expect(result.body.error).toBe("project_revision_unavailable");
});

test("conflicting decision or changed proposal cannot overwrite the first review", async () => {
  seedHead();
  const original = proposal();
  expect((await post({ proposal: original, decision: "reject" })).status).toBe(201);
  const conflictingDecision = await post({ proposal: original, decision: "approve" });
  expect(conflictingDecision.status).toBe(409);
  expect(conflictingDecision.body.error).toBe("review_conflict");
  const changed = proposal({ ...split(), at: { space: "source", ticks: 810_000 } });
  const conflictingProposal = await post({ proposal: changed, decision: "reject" });
  expect(conflictingProposal.status).toBe(409);
  expect(store.size).toBe(2);
  expect([...store.values()].find(value => value.decision)?.decision).toBe("reject");
});

test("different authenticated users have separate review scopes", async () => {
  seedHead("reviewer-1");
  seedHead("reviewer-2");
  const body = { proposal: proposal(), decision: "reject" };
  const first = await post(body, "reviewer-1");
  const second = await post(body, "reviewer-2");
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body.reviewerUid).toBe("reviewer-2");
  expect(store.size).toBe(4);
});

test("rejects client identity and time, malformed fingerprints, and invalid edit bounds", async () => {
  const valid = proposal();
  const cases = [
    { proposal: valid, decision: "approve", reviewerUid: "victim" },
    { proposal: valid, decision: "approve", reviewedAt: "2020-01-01T00:00:00Z" },
    { proposal: { ...valid, proposalFingerprint: "0".repeat(64) }, decision: "approve" },
    { proposal: { ...valid, extra: "unbounded" }, decision: "approve" },
    { proposal: rehash({ ...valid, batch: { ...valid.batch, projectId: "other-project" } }), decision: "approve" },
    { proposal: rehash({ ...valid, batch: { ...valid.batch, baseRevision: 5 } }), decision: "approve" },
    { proposal: valid, decision: "auto_apply" },
    { proposal: proposal({ ...split(), at: { space: "source", ticks: 1 } }), decision: "approve" },
    { proposal: proposal({ ...split(), preconditions: {} }), decision: "approve" },
    { proposal: proposal({ ...split(), target: { occurrenceId: "main", script: "run" } }), decision: "approve" },
  ];
  for (const body of cases) {
    const result = await post(body);
    expect(result.status).toBe(400);
  }
  expect(store.size).toBe(0);
});

test("a bounded edge trim can be reviewed without source-shot evidence", async () => {
  seedHead();
  const trim = {
    type: "trim_clip",
    target: { occurrenceId: "main" },
    keep: { space: "source", startTick: 0, endTick: 1_350_000 },
    preconditions: { sourceRange },
  };
  const result = await post({ proposal: proposal(trim), decision: "approve" });
  expect(result.status).toBe(201);
  expect(result.body.decision).toBe("approve");
});

test("accepts bounded shot evidence and rejects extra or unbound evidence", async () => {
  seedHead();
  const receipt = await seedSourceShot();
  const valid = proposal(split(), evidence(receipt));
  expect((await post({ proposal: valid, decision: "approve" })).status).toBe(201);
  const wrongBoundary = proposal(split(), { ...evidence(receipt), boundaryTick: 810_000 });
  expect((await post({ proposal: wrongBoundary, decision: "approve" })).status).toBe(400);
  const unknownField = proposal(split(), { ...evidence(receipt), command: "run" });
  expect((await post({ proposal: unknownField, decision: "approve" })).status).toBe(400);
  const lowCoverage = proposal(split(), { ...evidence(receipt), sampleCoverage: 0.64 });
  expect((await post({ proposal: lowCoverage, decision: "approve" })).status).toBe(400);
  const outsideSource = proposal(split(), {
    ...evidence(receipt),
    analysisRange: { space: "source", startTick: 0, endTick: sourceRange.endTick + 1 },
  });
  expect((await post({ proposal: outsideSource, decision: "approve" })).status).toBe(400);
  const trim = {
    type: "trim_clip",
    target: { occurrenceId: "main" },
    keep: { space: "source", startTick: 0, endTick: 1_350_000 },
    preconditions: { sourceRange },
  };
  expect((await post({ proposal: proposal(trim, evidence(receipt)), decision: "approve" })).status).toBe(400);
});

test("source-shot review requires the server-observed cut and source binding", async () => {
  seedHead();
  const receipt = await seedSourceShot();
  const otherCut = { ...split(), at: { space: "source", ticks: 810_000 } };
  const unobserved = proposal(otherCut, { ...evidence(receipt), boundaryTick: 810_000 });
  expect((await post({ proposal: unobserved, decision: "approve" })).status).toBe(409);
  const wrongBytes = proposal(split(), { ...evidence(receipt), sourceSha256: "d".repeat(64) });
  expect((await post({ proposal: wrongBytes, decision: "approve" })).status).toBe(409);
  const wrongUser = await post({ proposal: proposal(split(), evidence(receipt)), decision: "approve" }, "other-user");
  expect(wrongUser.status).toBe(409);
  expect(store.size).toBe(3);
});

test("oversized envelopes fail before a Firestore write", async () => {
  const result = await post({ proposal: proposal(), decision: "approve", padding: "x".repeat(25_000) });
  expect(result.status).toBe(413);
  expect(store.size).toBe(0);
});

test("storage failures return unavailable and never claim a successful review", async () => {
  seedHead();
  db.runTransaction = async () => { throw new Error("offline"); };
  const result = await post({ proposal: proposal(), decision: "approve" });
  expect(result.status).toBe(503);
  expect(result.body.error).toBe("review_store_unavailable");
});

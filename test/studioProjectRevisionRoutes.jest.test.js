const express = require("express");
const crypto = require("crypto");
const request = require("supertest");
const { adaptStudioSnapshotToDocument } = require("../frontend/src/components/studioProjectDocument");
const { executeStudioCommandBatch } = require("../frontend/src/components/studioCommands");
const {
  prepareStudioDirectorProposal,
  createStudioDirectorReviewReceipt,
  recordStudioDirectorReviewRejection,
} = require("../frontend/src/components/studioDirectorProposals");
const { db } = require("../src/firebaseAdmin");
const authMiddleware = require("../src/authMiddleware");
const router = require("../src/routes/studioProjectRevisionRoutes");
const {
  MAX_DOCUMENT_BYTES,
  getCurrentOwnedStudioProjectRevision,
  registerOwnedStudioProjectRevision,
  validateStudioProjectRevisionDocument,
} = require("../src/services/studioProjectRevisionService");

const clone = value => structuredClone(value);
const snapshot = value => ({ exists: value !== undefined, data: () => clone(value) });
const fakeFirestore = () => {
  const data = new Map();
  const paths = [];
  const firestore = {
    data,
    paths,
    collection: name => ({
      doc: uid => ({
        collection: subcollection => ({
          doc: id => {
            const path = `${name}/${uid}/${subcollection}/${id}`;
            paths.push(path);
            return { path, get: async () => snapshot(data.get(path)) };
          },
        }),
      }),
    }),
    runTransaction: async work => {
      const pending = [];
      const result = await work({
        get: async ref => snapshot(data.get(ref.path)),
        create: (ref, value) => pending.push({ type: "create", path: ref.path, value: clone(value) }),
        set: (ref, value) => pending.push({ type: "set", path: ref.path, value: clone(value) }),
      });
      for (const write of pending) {
        if (write.type === "create" && data.has(write.path))
          throw Object.assign(new Error("exists"), { code: 6 });
      }
      pending.forEach(write => data.set(write.path, write.value));
      return result;
    },
  };
  return firestore;
};

const document = (revision = 4) => {
  const sourceRange = { space: "source", startTick: 0, endTick: 900_000 };
  const programmeRange = { space: "programme", startTick: 0, endTick: 900_000 };
  return {
    schemaVersion: 1,
    projectId: "project-1",
    revision,
    clock: { ticksPerSecond: 90_000, interval: "half_open" },
    output: {
      aspectRatio: "9:16", requestedResolution: "1080p",
      frameRate: { numerator: 30, denominator: 1 }, codec: "h264",
      audioCodec: "aac", audioSampleRate: null,
      audioSampleRatePolicy: "worker_selected",
    },
    assets: [{
      assetId: "source:asset-1", sourceId: "asset-1",
      identityState: "legacy_reference_unverified",
    }],
    clipOccurrences: [{
      occurrenceId: "main", assetId: "source:asset-1",
      sourceRange, programmeRange, timeMapId: "map:main",
      playback: {
        direction: "forward", freeze: false,
        rate: { numerator: 1, denominator: 1 },
      },
    }],
    timeMaps: [{
      timeMapId: "map:main", occurrenceId: "main", segments: [{
        sourceRange,
        clipLocalRange: { space: "clip_local", startTick: 0, endTick: 900_000 },
        programmeRange,
        rate: { numerator: 1, denominator: 1 },
        direction: "forward", freeze: false,
      }],
    }],
    layers: [],
    linkedTiming: { cues: {}, keys: {} },
    audioGraph: {},
    constraints: { locks: [] },
    styleRef: null,
    analysisRefs: [],
    programmeSpeedKeys: [],
    fallbackSpeed: 1,
    outputTimeMap: [{
      programmeRange,
      outputRange: { space: "output", startTick: 0, endTick: 900_000 },
      rateNumerator: 1, rateDenominator: 1,
    }],
    journal: [],
    idempotency: {},
    directorReviewJournal: [],
    compatibility: {
      legacySnapshotVersion: 1,
      projection: "clip_occurrences_canonical_other_fields_legacy",
      layerComposition: "separate_worker_stages",
    },
  };
};

const originalCollection = db.collection;
const originalRunTransaction = db.runTransaction;
let firestore;
const app = express();
app.use(express.json({ limit: "550kb" }));
app.use("/api/studio/director/projects/revisions", router);
const post = (body, uid = "reviewer-1") => request(app)
  .post("/api/studio/director/projects/revisions")
  .set("Authorization", `Bearer test-token-for-${uid}`)
  .send(body);

beforeEach(() => {
  firestore = fakeFirestore();
  db.collection = firestore.collection;
  db.runTransaction = firestore.runTransaction;
});
afterAll(() => {
  db.collection = originalCollection;
  db.runTransaction = originalRunTransaction;
});

test("route requires Firebase identity and never trusts a claimed owner", async () => {
  const layer = router.stack.find(item => item.route?.path === "/");
  expect(layer.route.stack[0].handle).toBe(authMiddleware);
  const noToken = await request(app).post("/api/studio/director/projects/revisions")
    .send({ document: document() });
  expect(noToken.status).toBe(401);
  const spoofed = await post({ document: document(), ownerUid: "victim" });
  expect(spoofed.status).toBe(400);
  expect(firestore.data.size).toBe(0);
});

test("transaction creates immutable revision and current head, then replays exact registration", async () => {
  const original = document();
  const fingerprint = validateStudioProjectRevisionDocument(original).documentFingerprint;
  const first = await post({ document: original });
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({
    ok: true, projectId: "project-1", revision: 4,
    documentFingerprint: fingerprint, duplicate: false,
  });
  expect(first.body.serverRevisionId).toMatch(/^[a-f0-9]{64}$/);
  expect(firestore.data.size).toBe(2);
  expect([...firestore.data.values()][0].documentFingerprint).toBe(fingerprint);
  const stored = [...firestore.data.values()][0];
  expect(crypto.createHash("sha256").update(stored.documentJson).digest("hex"))
    .toBe(stored.documentFingerprint);
  expect(stored.serverRevisionId).toBe(first.body.serverRevisionId);
  expect(stored.ownerUid).toBe("reviewer-1");
  expect(stored).toMatchObject({
    schemaVersion: 1, projectId: "project-1", revision: 4,
    documentFingerprint: fingerprint, registeredAt: expect.any(String),
  });
  expect(Date.parse(stored.registeredAt)).not.toBeNaN();
  expect(stored.serverRevisionId).toBe(crypto.createHash("sha256")
    .update("project-1\0" + stored.revision).digest("hex"));
  expect(firestore.paths).toEqual(expect.arrayContaining([
    expect.stringContaining("users/reviewer-1/studioDirectorProjects/"),
    expect.stringContaining("users/reviewer-1/studioDirectorProjectRevisions/"),
  ]));
  const current = await getCurrentOwnedStudioProjectRevision({
    uid: "reviewer-1", projectId: "project-1", firestore,
  });
  expect(current.document).toEqual(original);
  expect(current.documentFingerprint).toBe(fingerprint);
  const duplicate = await post({ document: original });
  expect(duplicate.status).toBe(200);
  expect(duplicate.body).toEqual({ ...first.body, duplicate: true });
  expect(firestore.data.size).toBe(2);
});

test("higher revision advances head and preserves earlier immutable record", async () => {
  const initial = document(4);
  await post({ document: initial });
  const later = document(8);
  later.layers.push({ layerId: "title-1", type: "title", parameters: { text: "New" } });
  const second = await post({ document: later });
  expect(second.status).toBe(201);
  expect(second.body.revision).toBe(8);
  expect(firestore.data.size).toBe(3);
  const replay = await post({ document: initial });
  expect(replay.status).toBe(200);
  expect(replay.body.duplicate).toBe(true);
  const current = await getCurrentOwnedStudioProjectRevision({
    uid: "reviewer-1", projectId: "project-1", firestore,
  });
  expect(current.document).toEqual(later);
});

test("same revision with different bytes conflicts; stale unseen revision cannot replace head", async () => {
  await post({ document: document(4) });
  const changed = document(4);
  changed.layers.push({ layerId: "title-1", type: "title", parameters: { text: "Changed" } });
  const conflict = await post({ document: changed });
  expect(conflict.status).toBe(409);
  expect(conflict.body.error).toBe("project_revision_conflict");
  await post({ document: document(8) });
  const stale = await post({ document: document(6) });
  expect(stale.status).toBe(409);
  expect(stale.body.error).toBe("project_revision_stale");
  expect(firestore.data.size).toBe(3);
});

test("separate authenticated users have separate project heads", async () => {
  const first = await post({ document: document() }, "reviewer-1");
  const second = await post({ document: document() }, "reviewer-2");
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(firestore.data.size).toBe(4);
});

test("rejects malformed clock, mismatched source/time map and arbitrary top-level fields", async () => {
  const invalid = [
    { ...document(), projectId: "../victim" },
    { ...document(), schemaVersion: 2 },
    { ...document(), clock: { ticksPerSecond: 1000, interval: "half_open" } },
    { ...document(), arbitraryCommand: "run" },
    { ...document(), clipOccurrences: [{
      ...document().clipOccurrences[0],
      sourceRange: { space: "source", startTick: 0, endTick: 10 },
    }] },
    { ...document(), timeMaps: [] },
    { ...document(), outputTimeMap: [] },
  ];
  for (const value of invalid) {
    const response = await post({ document: value });
    expect(response.status).toBe(400);
  }
  expect(firestore.data.size).toBe(0);
});

test("bounds canonical JSON below Firestore document size", async () => {
  const over = document();
  over.layers = Array.from({ length: 120 }, (_, index) => ({
    layerId: `layer-${index}`, type: "title",
    parameters: { text: "x".repeat(6_000) },
  }));
  expect(Buffer.byteLength(JSON.stringify(over), "utf8")).toBeGreaterThan(MAX_DOCUMENT_BYTES);
  const response = await post({ document: over });
  expect(response.status).toBe(413);
  expect(firestore.data.size).toBe(0);
});

test("transaction failure publishes neither project head nor revision", async () => {
  firestore.runTransaction = async work => {
    await work({
      get: async () => snapshot(undefined),
      create: () => {},
      set: () => { throw new Error("storage failed"); },
    });
  };
  const result = await registerOwnedStudioProjectRevision({
    uid: "reviewer-1", document: document(), firestore,
  }).catch(error => error);
  expect(result.code).toBe("STUDIO_PROJECT_REVISION_UNAVAILABLE");
  expect(firestore.data.size).toBe(0);
});

test("corrupt stored head fails closed", async () => {
  await post({ document: document() });
  const headPath = [...firestore.data.keys()].find(path =>
    path.includes("/studioDirectorProjects/"));
  firestore.data.get(headPath).documentFingerprint = "0".repeat(64);
  const current = await getCurrentOwnedStudioProjectRevision({
    uid: "reviewer-1", projectId: "project-1", firestore,
  }).catch(error => error);
  expect(current.code).toBe("STUDIO_PROJECT_REVISION_UNAVAILABLE");
  const next = await post({ document: document(5) });
  expect(next.status).toBe(503);
  expect(firestore.data.size).toBe(2);
});

test("accepts real frontend adapter, split command and rejected review documents", async () => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: crypto.webcrypto });
  const source = adaptStudioSnapshotToDocument({
    projectId: "studio-real-projection",
    snapshot: {
      orderedClips: [{ id: "source-a", start: 0, end: 20 }],
      selectedClipId: "source-a",
      timeline: [{ id: "main", sourceClipId: "source-a", startRequest: 0, endRequest: 20 }],
      overlays: [{ id: "title-1", type: "text", startTime: 1, duration: 2, text: "Hello" }],
      soundEffects: [{ id: "cue-1", startTime: 10, duration: 1 }],
      speedKeyframes: [{ property: "speed", time: 12, value: 2 }],
      captionSegments: [{ id: "caption-1", text: "Hello world", start: 0, end: 2 }],
    },
  });
  expect((await post({ document: source })).status).toBe(201);
  const operation = {
    type: "split_clip", target: { occurrenceId: "main" },
    at: { space: "source", ticks: 720_000 },
    newOccurrenceIds: { left: "left", right: "right" },
  };
  const split = executeStudioCommandBatch(source, {
    projectId: source.projectId, baseRevision: source.revision,
    idempotencyKey: "split-1", actor: { type: "human", id: "reviewer-1" },
    operations: [operation],
  });
  expect((await post({ document: split.document })).status).toBe(201);
  const { proposal } = await prepareStudioDirectorProposal(split.document, {
    proposalId: "proposal-1", idempotencyKey: "director-split-1",
    directorId: "director", operation: {
      type: "split_clip", target: { occurrenceId: "right" },
      at: { space: "source", ticks: 1_080_000 },
      newOccurrenceIds: { left: "right-left", right: "right-right" },
    },
  });
  const receipt = await createStudioDirectorReviewReceipt({
    proposal, reviewerId: "reviewer-1", decision: "reject",
    reviewedAt: "2026-09-30T12:00:00.000Z",
  });
  const rejected = await recordStudioDirectorReviewRejection({
    document: split.document, proposal, reviewReceipt: receipt,
  });
  expect(rejected.document.revision).toBeGreaterThan(split.document.revision);
  expect((await post({ document: rejected.document })).status).toBe(201);
  const current = await getCurrentOwnedStudioProjectRevision({
    uid: "reviewer-1", projectId: source.projectId, firestore,
  });
  expect(current.document).toEqual(rejected.document);
});

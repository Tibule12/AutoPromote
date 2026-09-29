const crypto = require("crypto");
const express = require("express");
const request = require("supertest");
const { db } = require("../src/firebaseAdmin");
const authMiddleware = require("../src/authMiddleware");
const router = require("../src/routes/studioDirectorReviewRoutes");

const store = new Map();
const originalCollection = db.collection;
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
const split = () => ({
  type: "split_clip",
  target: { occurrenceId: "main" },
  at: { space: "source", ticks: 720_000 },
  newOccurrenceIds: { left: "left", right: "right" },
  preconditions: { sourceRange },
});
const proposal = (operation = split(), evidence) => {
  const core = {
    schemaVersion: 1,
    proposalId: "proposal-1",
    projectId: "project-1",
    baseRevision: 4,
    documentFingerprint: "a".repeat(64),
    previewFingerprint: "b".repeat(64),
    batch: {
      projectId: "project-1",
      baseRevision: 4,
      idempotencyKey: "edit-1",
      actor: { type: "ai", id: "director" },
      operations: [operation],
    },
    ...(evidence ? { evidence } : {}),
  };
  return { ...core, proposalFingerprint: hash(core) };
};
const rehash = candidate => {
  const { proposalFingerprint: _oldFingerprint, ...core } = candidate;
  return { ...core, proposalFingerprint: hash(core) };
};
const evidence = () => ({
  schemaVersion: 1,
  type: "source_shot_boundary",
  provider: "studio_face_tracking",
  engine: "opencv-yunet-source-shot-follow",
  sourceAssetId: "source:asset-1",
  sourceIdentityState: "legacy_reference_unverified",
  sourceContentHash: null,
  analysisRange: sourceRange,
  boundaryTick: 720_000,
  sampleCoverage: 0.8,
  verification: "needs_review",
  decodeFailures: 0,
});
const post = (body, uid = "reviewer-1") =>
  request(app).post("/api/studio/director/reviews")
    .set("Authorization", `Bearer test-token-for-${uid}`)
    .send(body);

beforeEach(() => {
  store.clear();
  paths.length = 0;
  db.collection = collection => {
    expect(collection).toBe("users");
    return {
      doc: uid => ({
        collection: subcollection => {
          expect(subcollection).toBe("studioDirectorReviews");
          return {
            doc: id => {
              const path = `${collection}/${uid}/${subcollection}/${id}`;
              paths.push(path);
              return {
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
});

afterAll(() => {
  db.collection = originalCollection;
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
  const replay = await post(body);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual({ ...first.body, duplicate: true });
  expect(store.size).toBe(1);
});

test("conflicting decision or changed proposal cannot overwrite the first review", async () => {
  const original = proposal();
  expect((await post({ proposal: original, decision: "reject" })).status).toBe(201);
  const conflictingDecision = await post({ proposal: original, decision: "approve" });
  expect(conflictingDecision.status).toBe(409);
  expect(conflictingDecision.body.error).toBe("review_conflict");
  const changed = proposal({ ...split(), at: { space: "source", ticks: 810_000 } });
  const conflictingProposal = await post({ proposal: changed, decision: "reject" });
  expect(conflictingProposal.status).toBe(409);
  expect(store.size).toBe(1);
  expect([...store.values()][0].decision).toBe("reject");
});

test("different authenticated users have separate review scopes", async () => {
  const body = { proposal: proposal(), decision: "reject" };
  const first = await post(body, "reviewer-1");
  const second = await post(body, "reviewer-2");
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body.reviewerUid).toBe("reviewer-2");
  expect(store.size).toBe(2);
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
  const valid = proposal(split(), evidence());
  expect((await post({ proposal: valid, decision: "approve" })).status).toBe(201);
  const wrongBoundary = proposal(split(), { ...evidence(), boundaryTick: 810_000 });
  expect((await post({ proposal: wrongBoundary, decision: "approve" })).status).toBe(400);
  const unknownField = proposal(split(), { ...evidence(), command: "run" });
  expect((await post({ proposal: unknownField, decision: "approve" })).status).toBe(400);
  const lowCoverage = proposal(split(), { ...evidence(), sampleCoverage: 0.64 });
  expect((await post({ proposal: lowCoverage, decision: "approve" })).status).toBe(400);
  const outsideSource = proposal(split(), {
    ...evidence(),
    analysisRange: { space: "source", startTick: 0, endTick: sourceRange.endTick + 1 },
  });
  expect((await post({ proposal: outsideSource, decision: "approve" })).status).toBe(400);
  const trim = {
    type: "trim_clip",
    target: { occurrenceId: "main" },
    keep: { space: "source", startTick: 0, endTick: 1_350_000 },
    preconditions: { sourceRange },
  };
  expect((await post({ proposal: proposal(trim, evidence()), decision: "approve" })).status).toBe(400);
});

test("oversized envelopes fail before a Firestore write", async () => {
  const result = await post({ proposal: proposal(), decision: "approve", padding: "x".repeat(25_000) });
  expect(result.status).toBe(413);
  expect(store.size).toBe(0);
});

test("storage failures return unavailable and never claim a successful review", async () => {
  db.collection = () => ({
    doc: () => ({
      collection: () => ({
        doc: () => ({ create: async () => { throw new Error("offline"); } }),
      }),
    }),
  });
  const result = await post({ proposal: proposal(), decision: "approve" });
  expect(result.status).toBe(503);
  expect(result.body.error).toBe("review_store_unavailable");
});

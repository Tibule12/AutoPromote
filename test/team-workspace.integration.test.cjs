const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createTeamWorkspace, digest } = require("../src/services/teamWorkspace");
const { createTeamProjects, inspectBackup } = require("../src/services/teamProjects");
const projectId = "demo-autopromote-team";
if (
  process.env.TEAM_TEST_PROJECT !== projectId ||
  !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
  require("../src/utils/authAuthority").isHostedRuntime()
)
  throw new Error("Own loopback demo emulator required");
let db,
  team,
  projects,
  workspaceId,
  clock,
  mediaGeneration,
  readiness,
  verification,
  archives,
  cloneCount,
  admission;
const media = () => ({
  ownerUid: "editor",
  storagePath: "uploads/videos/editor/movie.mp4",
  bucketName: projectId,
  generation: mediaGeneration,
  size: 100,
  contentType: "video/mp4",
});
const payload = (extra = {}) => ({
  title: "Reviewed movie",
  description: "Original copy",
  url: "https://fixture.invalid/movie.mp4",
  platforms: ["telegram", "discord"],
  platformOptions: {
    telegram: { destinationId: "channel-1", message: "Reviewed Telegram caption" },
    discord: { destinationId: "channel-2", message: "Reviewed Discord caption" },
  },
  time: null,
  ...extra,
});
const code = name => error => error.code === name;
const submit = (uid = "editor", extra = {}, key = "request-000000000001") =>
  team.submit(workspaceId, uid, payload(extra), key);
async function approve(release) {
  await team.review(workspaceId, "admin", release.id, release.revision, "approved");
}
before(() => {
  const { Firestore } = require("firebase-admin/firestore");
  db = new Firestore({ projectId, host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
});
beforeEach(async () => {
  workspaceId = `workspace_${require("node:crypto").randomUUID()}`;
  clock = Date.now();
  mediaGeneration = "12345";
  readiness = 0;
  verification = 0;
  archives = new Map();
  cloneCount = 0;
  admission = null;
  const ref = db.collection("workspaces").doc(workspaceId);
  await ref.set({ ownerUid: "owner", sharedPlatforms: ["telegram", "discord"] });
  for (const role of ["admin", "editor", "viewer"])
    await ref.collection("members").doc(role).set({ uid: role, role, status: "active" });
  await db
    .collection("users")
    .doc("owner")
    .set({ credits: 500, subscriptionPlan: "studio", role: "user" });
  team = createTeamWorkspace({
    db,
    now: () => clock,
    resolveMedia: async () => ({ media: media(), url: "https://fixture.invalid/pinned.mp4" }),
    checkReadiness: async () => {
      readiness++;
      return admission;
    },
    verifyDestinations: async () => {
      verification++;
    },
    buildSchedule: (contentId, settings) => ({
      ...settings,
      contentId,
      status: "pending",
      isActive: true,
      createdAt: new Date(clock).toISOString(),
    }),
  });
  projects = createTeamProjects({
    db,
    team,
    now: () => clock,
    inspectSource: async (uid, path) => {
      if (!path.startsWith(`uploads/videos/${uid}/`))
        throw Object.assign(new Error("forbidden"), { code: "media_forbidden" });
      return { ...media(), ownerUid: uid, storagePath: path };
    },
    store: {
      put: async (_w, _p, id, bytes) => {
        archives.set(id, bytes);
        return { id };
      },
      read: async item => archives.get(item.id),
    },
    cloneSource: async source => {
      cloneCount++;
      return {
        storagePath: `uploads/videos/editor/copied-${source.generation}.mp4`,
        url: "https://fixture.invalid/copy.mp4",
      };
    },
  });
});
after(async () => {
  await db.terminate();
});

test("private media rewrite binds the exact source generation and never overwrites a destination", async () => {
  const requests = [];
  const source = { request: (options, done) => {
    requests.push(options);
    done(null, requests.length === 1 ? { done: false, rewriteToken: "fixture-continuation" } : { done: true });
  } };
  await require("../src/services/teamStorageCopy").rewriteCreateOnly(source, { bucket: { name: "private-demo" }, name: "uploads/videos/editor/copy.mp4" }, {
    generation: "123", contentType: "video/mp4", metadata: { ownerUid: "editor" },
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.qs.sourceGeneration, "123"); assert.equal(request.qs.ifGenerationMatch, 0);
    assert.equal(request.json.metadata.firebaseStorageDownloadTokens, undefined);
    assert.equal(request.json.metadata.ownerUid, "editor");
  }
  assert.equal(requests[1].qs.rewriteToken, "fixture-continuation");
});
test("a destination collision is surfaced rather than retried as an overwrite", async () => {
  let requests = 0;
  await assert.rejects(require("../src/services/teamStorageCopy").rewriteCreateOnly({ request: (_options, done) => { requests++; done(Object.assign(new Error("precondition"), { code: 412 })); } },
    { bucket: { name: "private-demo" }, name: "copy.mp4" }, { generation: "123", contentType: "video/mp4", metadata: {} }), error => error.code === 412);
  assert.equal(requests, 1);
});

test("editor submits without creating content, schedules or changing balances", async () => {
  const before = (await db.collection("users").doc("owner").get()).data();
  const release = await submit();
  assert.equal(release.status, "pending_review");
  assert.equal((await db.collection("content").doc(release.contentId).get()).exists, false);
  assert.equal(
    (await db.collection("promotion_schedules").where("workspace_id", "==", workspaceId).get())
      .size,
    0
  );
  assert.deepEqual((await db.collection("users").doc("owner").get()).data(), before);
});
test("viewer cannot submit, approve, dispatch or share connections", async () => {
  await assert.rejects(submit("viewer"), code("workspace_read_only"));
  const release = await submit();
  await assert.rejects(
    team.review(workspaceId, "viewer", release.id, 1, "approved"),
    code("reviewer_required")
  );
  await assert.rejects(
    team.dispatch(workspaceId, "viewer", release.id, 1),
    code("reviewer_required")
  );
  await assert.rejects(team.settings(workspaceId, "viewer", []), code("owner_required"));
});
test("editor cannot approve their own work or directly dispatch", async () => {
  const release = await submit();
  await assert.rejects(
    team.review(workspaceId, "editor", release.id, 1, "approved"),
    code("reviewer_required")
  );
  await assert.rejects(
    team.dispatch(workspaceId, "editor", release.id, 1),
    code("reviewer_required")
  );
});
test("approval is required before dispatch", async () => {
  const release = await submit();
  await assert.rejects(
    team.dispatch(workspaceId, "admin", release.id, 1),
    code("approval_required")
  );
});
test("approved dispatch atomically schedules both destinations once under concurrent retries", async () => {
  const release = await submit();
  await approve(release);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => team.dispatch(workspaceId, "admin", release.id, 1))
  );
  const ids = results[0].scheduleIds;
  assert.equal(ids.length, 2);
  assert.equal(results.filter(item => !item.replay).length, 1);
  const schedules = await db
    .collection("promotion_schedules")
    .where("workspace_id", "==", workspaceId)
    .get();
  assert.equal(schedules.size, 2);
  for (const doc of schedules.docs) {
    assert.equal(doc.data().user_id, "owner");
    assert.equal(doc.data().created_by, "admin");
    assert.equal(doc.data().teamApproval.fingerprint, release.fingerprint);
  }
  const content = (await db.collection("content").doc(release.contentId).get()).data();
  assert.equal(content.description, "Original copy");
  assert.equal(content.source.generation, "12345");
  assert.equal(content.workspace_id, workspaceId);
  assert.ok(readiness > 0 && verification > 0);
});
test("a stored destination object with a forged length cannot create unbounded dispatch work", async () => {
  const release = await submit();
  await approve(release);
  await db.collection("workspaces").doc(workspaceId).collection("releases").doc(release.id)
    .update({ "payload.platforms": { 0: "telegram", length: 1000000000 } });
  await assert.rejects(team.dispatch(workspaceId, "admin", release.id, 1), code("invalid_release"));
  assert.equal(readiness, 0);
  assert.equal((await db.collection("promotion_schedules").where("workspace_id", "==", workspaceId).get()).size, 0);
});
test("revision invalidates approval and rejects stale reviewer requests", async () => {
  const release = await submit();
  await approve(release);
  const revised = await team.revise(
    workspaceId,
    "editor",
    release.id,
    payload({ description: "Changed copy" }),
    1
  );
  assert.equal(revised.revision, 2);
  assert.equal(revised.approval, null);
  assert.equal(revised.status, "pending_review");
  await assert.rejects(
    team.review(workspaceId, "admin", release.id, 1, "approved"),
    code("release_changed")
  );
  await assert.rejects(
    team.dispatch(workspaceId, "admin", release.id, 2),
    code("approval_required")
  );
});
test("different copy/settings/timing produce a different approval fingerprint", async () => {
  const release = await submit();
  const revised = await team.revise(
    workspaceId,
    "editor",
    release.id,
    payload({
      platformOptions: { telegram: { message: "Changed" }, discord: {} },
      time: new Date(clock + 60000).toISOString(),
    }),
    1
  );
  assert.notEqual(release.fingerprint, revised.fingerprint);
});
test("client-supplied alternate per-platform media is rejected", async () => {
  await assert.rejects(
    submit("editor", {
      platformOptions: { telegram: { media_url: "https://fixture.invalid/other.mp4" } },
    }),
    code("review_one_media_file")
  );
});
test("changed media generation cannot use an old approval", async () => {
  const release = await submit();
  await approve(release);
  mediaGeneration = "99999";
  await assert.rejects(team.dispatch(workspaceId, "admin", release.id, 1), code("media_changed"));
  await assert.rejects(team.preview(workspaceId, "viewer", release.id), code("media_changed"));
});
test("a removed member loses read, comments and submission access", async () => {
  const release = await submit();
  await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("members")
    .doc("editor")
    .update({ status: "removed" });
  await assert.rejects(team.list(workspaceId, "editor"), code("not_a_workspace_member"));
  await assert.rejects(
    team.comment(workspaceId, "editor", release.id, "Hello"),
    code("not_a_workspace_member")
  );
  await assert.rejects(submit(), code("not_a_workspace_member"));
});
test("a demoted approver cannot leave an approval capable of later dispatch", async () => {
  const release = await submit();
  await approve(release);
  await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("members")
    .doc("admin")
    .update({ role: "editor" });
  await assert.rejects(
    team.dispatch(workspaceId, "owner", release.id, 1),
    code("reviewer_required")
  );
});
test("outsiders cannot see or mutate another workspace even with known release IDs", async () => {
  const release = await submit();
  await assert.rejects(team.list(workspaceId, "outsider"), code("not_a_workspace_member"));
  await assert.rejects(
    team.preview(workspaceId, "outsider", release.id),
    code("not_a_workspace_member")
  );
  await assert.rejects(
    team.review(workspaceId, "outsider", release.id, 1, "approved"),
    code("not_a_workspace_member")
  );
});
test("unsharing a connection blocks both new submissions and approved dispatch", async () => {
  const release = await submit();
  await approve(release);
  await team.settings(workspaceId, "owner", ["telegram"]);
  await assert.rejects(submit(), code("destination_not_shared"));
  await assert.rejects(
    team.dispatch(workspaceId, "admin", release.id, 1),
    code("destination_not_shared")
  );
});
test("idempotency key is bound to the human actor and exact release", async () => {
  const first = await submit(),
    replay = await submit();
  assert.equal(first.id, replay.id);
  await assert.rejects(submit("editor", { title: "Changed" }), code("request_id_conflict"));
  const other = await submit("admin");
  assert.notEqual(first.id, other.id);
});
test("viewer comments create attributable history without editing release copy", async () => {
  const release = await submit();
  await team.comment(workspaceId, "viewer", release.id, "Please shorten the opening.");
  const listed = await team.list(workspaceId, "viewer");
  assert.equal(listed.releases[0].payload.description, "Original copy");
  assert.equal(listed.releases[0].comments[0].uid, "viewer");
  assert.ok(
    listed.activity.some(item => item.action === "release_commented" && item.actorUid === "viewer")
  );
});
test("past delivery time cannot silently become immediate publishing", async () => {
  const release = await submit("editor", { time: new Date(clock + 1000).toISOString() });
  await approve(release);
  clock += 2000;
  await assert.rejects(
    team.dispatch(workspaceId, "admin", release.id, 1),
    code("release_time_passed")
  );
});
test("scheduled release survives creator removal and dispatch replay cannot duplicate it", async () => {
  const release = await submit();
  await approve(release);
  const first = await team.dispatch(workspaceId, "owner", release.id, 1);
  await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("members")
    .doc("editor")
    .update({ status: "removed" });
  const replay = await team.dispatch(workspaceId, "owner", release.id, 1);
  assert.deepEqual(replay.scheduleIds, first.scheduleIds);
  assert.equal(replay.replay, true);
});

const backup = () => {
  const id = "viral-project-original";
  const source = { id: "source", start: 0, end: 1 };
  const snapshot = { orderedClips: [source], selectedClipId: "source",
    timeline: [{ id: "main", sourceClipId: "source", sourceStoragePath: "uploads/videos/editor/movie.mp4", url: "https://fixture.invalid/source.mp4", startRequest: 0, endRequest: 1 }],
    projectMedia: [{ storagePath: "uploads/videos/editor/movie.mp4", url: "https://fixture.invalid/source.mp4" }],
    overlays: [{ id: "headline", type: "text", text: "Original headline", startTime: 0, duration: 1 }],
  };
  snapshot.studioDocument = require("../src/generated/studioDirectorReplayKernel.cjs").adaptStudioSnapshotToDocument({ snapshot, projectId: id });
  return { id, name: "Editable team movie", snapshot, versions: [] };
};

test("native project sharing preserves exact archive and ownership manifest", async () => {
  const original = backup(),
    result = await projects.save(workspaceId, "editor", original, 0);
  assert.equal(result.revision, 1);
  assert.equal(result.versions[0].hash, digest(JSON.stringify(original)));
  assert.equal(result.versions[0].manifest[0].ownerUid, "editor");
  assert.equal(original.snapshot.overlays[0].text, "Original headline");
});
test("new project version requires checkout and exact current revision", async () => {
  const original = backup();
  await projects.save(workspaceId, "editor", original, 0);
  await assert.rejects(
    projects.save(workspaceId, "editor", original, 1),
    code("project_checkout_required")
  );
  await projects.lock(workspaceId, "editor", original.id);
  const next = await projects.save(workspaceId, "editor", { ...original, name: "Revised" }, 1);
  assert.equal(next.versions.length, 2);
  assert.equal(next.lock, null);
  await assert.rejects(projects.save(workspaceId, "editor", original, 1), code("project_changed"));
});
test("checkout prevents concurrent teammate overwrite and expires safely", async () => {
  const original = backup();
  await projects.save(workspaceId, "editor", original, 0);
  await projects.lock(workspaceId, "editor", original.id);
  await assert.rejects(
    projects.lock(workspaceId, "admin", original.id),
    code("project_checked_out")
  );
  clock += 31 * 60000;
  await projects.lock(workspaceId, "admin", original.id);
});
test("personal editable copy preserves native decisions and leaves original untouched", async () => {
  const original = backup(),
    shared = await projects.save(workspaceId, "editor", original, 0);
  const copy = await projects.personalCopy(
    workspaceId,
    "editor",
    original.id,
    shared.versions[0].id
  );
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.snapshot.studioDocument.projectId, copy.id);
  assert.equal(copy.snapshot.overlays[0].text, "Original headline");
  assert.equal(cloneCount, 1);
  assert.equal(original.snapshot.projectMedia[0].storagePath, "uploads/videos/editor/movie.mp4");
});
test("changed source/archive or unportable server job cannot be silently restored", async () => {
  const original = backup(),
    shared = await projects.save(workspaceId, "editor", original, 0);
  mediaGeneration = "54321";
  await assert.rejects(
    projects.personalCopy(workspaceId, "editor", original.id, shared.versions[0].id),
    code("project_source_changed")
  );
  assert.throws(
    () =>
      inspectBackup({ ...original, snapshot: { ...original.snapshot, jobId: "other-owner-job" } }),
    code("project_asset_not_portable")
  );
});
test("viewer and removed members cannot create project copies or overwrite archives", async () => {
  const original = backup(),
    shared = await projects.save(workspaceId, "editor", original, 0);
  await assert.rejects(
    projects.personalCopy(workspaceId, "viewer", original.id, shared.versions[0].id),
    code("workspace_read_only")
  );
  await assert.rejects(
    projects.save(workspaceId, "viewer", original, 0),
    code("workspace_read_only")
  );
});
test("the existing owner upload allowance is consumed once and cannot be overspent concurrently", async () => {
  admission = { upload: { monthKey: "2026-11", limit: 1 } };
  const first = await submit("editor", {}, "request-000000000010"),
    second = await submit("editor", {}, "request-000000000011");
  await approve(first);
  await approve(second);
  const attempts = await Promise.allSettled([
    team.dispatch(workspaceId, "owner", first.id, 1),
    team.dispatch(workspaceId, "owner", second.id, 1),
  ]);
  assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(
    attempts.find(item => item.status === "rejected").reason.code,
    "UPLOAD_CAP_EXCEEDED"
  );
  assert.equal(
    (await db.collection("user_billing").doc("owner").get()).data().uploads_this_month,
    1
  );
  assert.equal((await db.collection("users").doc("owner").get()).data().credits, 500);
});
test("the same request ID in two workspaces has different content and schedule identities", async () => {
  const first = await submit();
  const otherId = `workspace_${require("node:crypto").randomUUID()}`;
  await db
    .collection("workspaces")
    .doc(otherId)
    .set({ ownerUid: "editor", sharedPlatforms: ["telegram", "discord"] });
  const second = await team.submit(otherId, "editor", payload(), "request-000000000001");
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.contentId, second.contentId);
});
test("unknown membership roles are denied rather than gaining editor permissions", async () => {
  await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("members")
    .doc("editor")
    .update({ role: "made-up" });
  await assert.rejects(team.list(workspaceId, "editor"), code("not_a_workspace_member"));
});
test("API workspace scope retains the actor, rejects raw publishing and hides personal/other-team records", async () => {
  const target = require.resolve("../src/firebaseAdmin");
  const previous = require.cache[target];
  require.cache[target] = { id: target, filename: target, loaded: true, exports: { db } };
  try {
    const express = require("express"),
      request = require("supertest");
    const scope = require("../src/middlewares/workspaceScope"),
      boundary = require("../src/middlewares/teamContentBoundary");
    const app = express();
    app.use((req, _res, next) => {
      req.user = { uid: req.headers["x-fixture-actor"] || "editor" };
      req.userId = req.user.uid;
      next();
    });
    app.use("/api/content", scope, boundary);
    app.get("/api/content/my-content", (req, res) =>
      res.json({ actor: req.user.uid, resourceOwner: scope.resourceUserId(req) })
    );
    app.get("/api/content/:id", (_req, res) => res.json({ reached: true }));
    app.post("/api/content/upload", (_req, res) => res.sendStatus(201));
    const context = await request(app)
      .get("/api/content/my-content")
      .set("X-Workspace-Id", workspaceId);
    assert.equal(context.status, 200);
    assert.equal(context.body.actor, "editor");
    assert.equal(context.body.resourceOwner, "owner");
    await db.collection("content").doc("owner-private").set({ user_id: "owner" });
    assert.equal(
      (await request(app).get("/api/content/owner-private").set("X-Workspace-Id", workspaceId))
        .status,
      404
    );
    assert.equal(
      (await request(app).post("/api/content/upload").set("X-Workspace-Id", workspaceId)).status,
      403
    );
    assert.equal(
      (
        await request(app)
          .post("/api/content/upload")
          .set("X-Workspace-Id", workspaceId)
          .set("x-fixture-actor", "owner")
      ).status,
      403
    );
    assert.equal(
      (
        await request(app)
          .get("/api/content/my-content")
          .set("X-Workspace-Id", workspaceId)
          .set("x-fixture-actor", "outsider")
      ).status,
      403
    );
    assert.equal(boundary.inScope({ workspaceId }, { workspace_id: "another-team" }), false);
    assert.equal(boundary.inScope({}, { workspace_id: workspaceId }), false);
    assert.equal(boundary.inScope({}, { user_id: "owner" }), true);
  } finally {
    if (previous) require.cache[target] = previous;
    else delete require.cache[target];
  }
});
test("Firestore denies direct authority, review, team-content and schedule writes", async () => {
  const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
  } = require("@firebase/rules-unit-testing");
  const { doc, setDoc, updateDoc, getDoc, deleteDoc } = require("firebase/firestore");
  const [host, rawPort] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(rawPort),
      rules: fs.readFileSync(require("node:path").resolve(__dirname, "../firestore.rules"), "utf8"),
    },
  });
  try {
    const release = await submit();
    await approve(release);
    const result = await team.dispatch(workspaceId, "owner", release.id, 1);
    const owner = env.authenticatedContext("owner", { email_verified: true }).firestore(),
      editor = env.authenticatedContext("editor", { email_verified: true }).firestore();
    await assertFails(
      updateDoc(doc(owner, "workspaces", workspaceId), {
        ownerUid: "editor",
        sharedPlatforms: ["youtube"],
      })
    );
    await assertFails(
      updateDoc(doc(editor, "workspaces", workspaceId, "releases", release.id), {
        status: "approved",
      })
    );
    await assertFails(
      setDoc(doc(editor, "promotion_schedules", "forged"), {
        user_id: "editor",
        workspace_id: workspaceId,
      })
    );
    await assertFails(
      updateDoc(doc(owner, "content", release.contentId), { description: "Unreviewed" })
    );
    await assertFails(deleteDoc(doc(editor, "content", release.contentId)));
    await assertSucceeds(getDoc(doc(editor, "promotion_schedules", result.scheduleIds[0])));
    await assertFails(
      getDoc(
        doc(
          env.authenticatedContext("outsider", { email_verified: true }).firestore(),
          "content",
          release.contentId
        )
      )
    );
    await assertFails(updateDoc(doc(owner, "users", "owner"), { credits: 9999, role: "admin" }));
    await assertSucceeds(updateDoc(doc(owner, "users", "owner"), { displayName: "Owner profile" }));
  } finally {
    await env.cleanup();
  }
});

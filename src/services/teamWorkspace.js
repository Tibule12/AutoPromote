const crypto = require("node:crypto");

const PLATFORMS = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "linkedin",
  "reddit",
  "telegram",
  "discord",
];
const ROLES = new Set(["owner", "admin", "editor", "viewer"]);
const fail = (status, code, message = code) => {
  throw Object.assign(new Error(message), { status, code });
};
const digest = value =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : stable(value))
    .digest("hex");
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function clean(value, depth = 0) {
  if (depth > 25) fail(400, "invalid_release");
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
  if (!value || typeof value !== "object") fail(400, "invalid_release");
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) fail(400, "invalid_release");
    result[key] = clean(item, depth + 1);
  }
  return result;
}
function releasePayload(input) {
  if (!input || Buffer.byteLength(JSON.stringify(input)) > 60000) fail(400, "invalid_release");
  const {
    title,
    description = "",
    platforms,
    platformOptions = {},
    time = null,
    timezone = "UTC",
    frequency = "once",
  } = input;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 160 ||
    typeof description !== "string" ||
    description.length > 5000 ||
    !Array.isArray(platforms) ||
    !platforms.length ||
    platforms.length > 8 ||
    new Set(platforms).size !== platforms.length ||
    platforms.some(platform => !PLATFORMS.includes(platform)) ||
    frequency !== "once" ||
    !platformOptions ||
    Array.isArray(platformOptions) ||
    typeof platformOptions !== "object"
  )
    fail(
      400,
      "invalid_release",
      "Choose supported destinations, complete the copy and use a one-time release."
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch (_) {
    fail(400, "invalid_timezone");
  }
  if (time !== null && (typeof time !== "string" || !Number.isFinite(Date.parse(time))))
    fail(400, "invalid_release_time");
  // Only the selected destination's settings enter the reviewed release.
  return clean({
    title: title.trim(),
    description,
    platforms,
    platformOptions: Object.fromEntries(
      platforms.map(platform => [platform, platformOptions[platform] || {}])
    ),
    time,
    timezone,
    frequency,
  });
}

function createTeamWorkspace({
  db,
  resolveMedia,
  checkReadiness,
  verifyDestinations,
  buildSchedule,
  now = () => Date.now(),
}) {
  const root = id => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
      fail(400, "invalid_workspace");
    return db.collection("workspaces").doc(id);
  };
  async function access(workspaceId, uid, transaction) {
    const ref = root(workspaceId),
      read = item => (transaction ? transaction.get(item) : item.get());
    const workspaceDoc = await read(ref);
    if (!workspaceDoc.exists) fail(404, "workspace_not_found");
    const workspace = workspaceDoc.data();
    const memberDoc = await read(ref.collection("members").doc(uid));
    const member =
      workspace.ownerUid === uid ? { role: "owner", status: "active" } : memberDoc.data();
    if (!member || member.status !== "active" || !ROLES.has(member.role))
      fail(403, "not_a_workspace_member");
    return {
      ref,
      workspace,
      role: member.role,
      uid,
      label:
        member.email || (workspace.ownerUid === uid ? workspace.ownerEmail : null) || "Teammate",
    };
  }
  const requireWrite = context => {
    if (context.role === "viewer") fail(403, "workspace_read_only");
  };
  const requireReview = context => {
    if (!["owner", "admin"].includes(context.role)) fail(403, "reviewer_required");
  };
  const log = (tx, context, action, subject, details = {}) =>
    tx.create(context.ref.collection("activity").doc(), {
      actorUid: context.uid,
      actorLabel: context.label,
      action,
      subject,
      ...details,
      at: new Date(now()).toISOString(),
    });
  function assertDestinations(context, payload) {
    const allowed = context.workspace.sharedPlatforms || [];
    if (payload.platforms.some(platform => !allowed.includes(platform)))
      fail(
        403,
        "destination_not_shared",
        "The owner must share these publishing connections with the team first."
      );
  }
  const releaseRef = (context, id) => {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) fail(400, "invalid_release");
    return context.ref.collection("releases").doc(id);
  };
  async function preview(workspaceId, uid, id) {
    const context = await access(workspaceId, uid),
      snapshot = await releaseRef(context, id).get();
    if (!snapshot.exists) fail(404, "release_not_found");
    const release = snapshot.data(),
      source = await resolveMedia({ uid: release.media.ownerUid, media: release.media });
    if (digest(source.media) !== digest(release.media)) fail(409, "media_changed");
    await access(workspaceId, uid);
    return { url: source.url, contentType: release.media.contentType };
  }
  async function settings(workspaceId, uid, platforms) {
    if (
      !Array.isArray(platforms) ||
      new Set(platforms).size !== platforms.length ||
      platforms.some(item => !PLATFORMS.includes(item))
    )
      fail(400, "invalid_destinations");
    return db.runTransaction(async tx => {
      const context = await access(workspaceId, uid, tx);
      if (context.role !== "owner") fail(403, "owner_required");
      tx.update(context.ref, { sharedPlatforms: platforms });
      log(tx, context, "connections_shared", workspaceId, { platforms });
      return { sharedPlatforms: platforms };
    });
  }
  async function list(workspaceId, uid) {
    const context = await access(workspaceId, uid);
    const [releases, activity, projects] = await Promise.all(
      ["releases", "activity", "projects"].map(collection =>
        context.ref
          .collection(collection)
          .orderBy(collection === "activity" ? "at" : "updatedAt", "desc")
          .limit(50)
          .get()
      )
    );
    // A viewer is a whole-workspace viewer. Project-specific client portals are not implied.
    return {
      role: context.role,
      sharedPlatforms: context.workspace.sharedPlatforms || [],
      releases: releases.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      activity: activity.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      projects: projects.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    };
  }
  async function submit(workspaceId, uid, input, requestId) {
    if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId))
      fail(400, "request_id_required");
    const context = await access(workspaceId, uid);
    requireWrite(context);
    const payload = releasePayload(input);
    assertDestinations(context, payload);
    const source = await resolveMedia({
      uid,
      workspaceId,
      sourceContentId: input.sourceContentId,
      url: input.url,
    });
    for (const options of Object.values(payload.platformOptions)) {
      for (const key of ["media_url", "videoUrl"])
        if (options[key] && options[key] !== input.url)
          fail(
            400,
            "review_one_media_file",
            "Use the same saved media for each destination in this team release."
          );
      delete options.media_url;
      delete options.videoUrl;
    }
    const id = digest(`${workspaceId}:${uid}:${requestId}`),
      fingerprint = digest({ payload, media: source.media });
    return db.runTransaction(async tx => {
      const current = await access(workspaceId, uid, tx);
      requireWrite(current);
      assertDestinations(current, payload);
      const ref = releaseRef(current, id),
        previous = await tx.get(ref);
      if (previous.exists) {
        if (previous.data().fingerprint !== fingerprint) fail(409, "request_id_conflict");
        return { id, ...previous.data() };
      }
      const record = {
        payload,
        media: source.media,
        fingerprint,
        revision: 1,
        status: "pending_review",
        createdBy: uid,
        contentId: `team_${id}`,
        createdAt: new Date(now()).toISOString(),
        updatedAt: new Date(now()).toISOString(),
      };
      tx.create(ref, record);
      log(tx, current, "release_submitted", id, { revision: 1 });
      return { id, ...record };
    });
  }
  async function revise(workspaceId, uid, id, input, revision) {
    const payload = releasePayload(input),
      context = await access(workspaceId, uid);
    requireWrite(context);
    assertDestinations(context, payload);
    const ref = releaseRef(context, id);
    return db.runTransaction(async tx => {
      const current = await access(workspaceId, uid, tx);
      requireWrite(current);
      assertDestinations(current, payload);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) fail(404, "release_not_found");
      const old = snapshot.data();
      if (old.revision !== revision || old.status === "scheduled") fail(409, "release_changed");
      // Source identity is immutable. A different movie is a new release, never a silent replacement.
      const record = {
        payload,
        revision: revision + 1,
        fingerprint: digest({ payload, media: old.media }),
        status: "pending_review",
        approval: null,
        updatedAt: new Date(now()).toISOString(),
      };
      tx.update(ref, record);
      log(tx, current, "release_revised", id, { revision: record.revision });
      return { id, ...old, ...record };
    });
  }
  async function review(workspaceId, uid, id, revision, decision) {
    if (!["approved", "changes_requested"].includes(decision)) fail(400, "invalid_decision");
    return db.runTransaction(async tx => {
      const context = await access(workspaceId, uid, tx);
      requireReview(context);
      const ref = releaseRef(context, id),
        snapshot = await tx.get(ref);
      if (!snapshot.exists) fail(404, "release_not_found");
      const release = snapshot.data();
      if (
        release.revision !== revision ||
        !["pending_review", "changes_requested", "approved"].includes(release.status)
      )
        fail(409, "release_changed");
      const approval =
        decision === "approved"
          ? { uid, revision, fingerprint: release.fingerprint, at: new Date(now()).toISOString() }
          : null;
      tx.update(ref, { status: decision, approval, updatedAt: new Date(now()).toISOString() });
      log(tx, context, decision === "approved" ? "release_approved" : "changes_requested", id, {
        revision,
      });
      return { status: decision };
    });
  }
  async function comment(workspaceId, uid, id, text) {
    if (typeof text !== "string" || !text.trim() || text.length > 2000)
      fail(400, "invalid_comment");
    return db.runTransaction(async tx => {
      const context = await access(workspaceId, uid, tx),
        ref = releaseRef(context, id),
        snapshot = await tx.get(ref);
      if (!snapshot.exists) fail(404, "release_not_found");
      const comments = snapshot.data().comments || [];
      if (comments.length >= 50) fail(409, "comment_limit");
      tx.update(ref, {
        comments: [
          ...comments,
          { uid, authorLabel: context.label, text: text.trim(), at: new Date(now()).toISOString() },
        ],
      });
      log(tx, context, "release_commented", id);
      return { ok: true };
    });
  }
  async function dispatch(workspaceId, uid, id, revision) {
    const context = await access(workspaceId, uid);
    requireReview(context);
    const ref = releaseRef(context, id),
      snapshot = await ref.get();
    if (!snapshot.exists) fail(404, "release_not_found");
    const release = snapshot.data();
    if (release.status === "scheduled" && release.revision === revision)
      return { scheduleIds: release.scheduleIds, replay: true };
    if (
      release.status !== "approved" ||
      revision !== release.revision ||
      release.approval?.fingerprint !== release.fingerprint
    )
      fail(409, "approval_required");
    assertDestinations(context, release.payload);
    const source = await resolveMedia({
      uid: release.media.ownerUid,
      workspaceId,
      media: release.media,
    });
    if (digest(source.media) !== digest(release.media))
      fail(409, "media_changed", "The saved media changed. Submit it for a new review.");
    const admission = await checkReadiness(context.workspace.ownerUid, release.payload);
    await verifyDestinations(context.workspace.ownerUid, release.payload);
    const scheduleIds = release.payload.platforms.map(platform => `team_${id}_${platform}`);
    return db.runTransaction(async tx => {
      const current = await access(workspaceId, uid, tx);
      requireReview(current);
      const currentSnapshot = await tx.get(ref),
        record = currentSnapshot.data();
      if (record?.status === "scheduled" && record.revision === revision)
        return { scheduleIds: record.scheduleIds, replay: true };
      if (
        !record ||
        record.status !== "approved" ||
        record.revision !== revision ||
        record.fingerprint !== release.fingerprint ||
        record.approval?.fingerprint !== record.fingerprint
      )
        fail(409, "release_changed");
      assertDestinations(current, record.payload);
      // Revocation/demotion of the approver also invalidates an unsubmitted approval.
      const approver = await access(workspaceId, record.approval.uid, tx);
      requireReview(approver);
      let usage = null,
        billingSnapshot = null;
      if (admission?.upload?.monthKey) {
        const stats = admission.upload;
        const query = db
          .collection("usage_ledger")
          .where("userId", "==", current.workspace.ownerUid)
          .where("type", "==", "upload")
          .where("monthKey", "==", stats.monthKey);
        usage = await tx.get(query);
        billingSnapshot = await tx.get(
          db.collection("user_billing").doc(current.workspace.ownerUid)
        );
        const used = usage.docs.reduce((sum, doc) => sum + (doc.data().count || 1), 0);
        if (Number.isFinite(stats.limit) && used >= stats.limit)
          fail(
            403,
            "UPLOAD_CAP_EXCEEDED",
            "The workspace owner’s existing upload allowance is exhausted."
          );
      }
      const contentRef = db.collection("content").doc(record.contentId);
      const content = {
        user_id: current.workspace.ownerUid,
        workspace_id: workspaceId,
        created_by: record.createdBy,
        title: record.payload.title,
        description: record.payload.description,
        type: record.media.contentType.startsWith("image/") ? "image" : "video",
        url: source.url,
        storagePath: record.media.storagePath,
        source: record.media,
        target_platforms: record.payload.platforms,
        platform_options: record.payload.platformOptions,
        status: "approved",
        approvalStatus: "approved",
        teamReleaseId: id,
        teamReleaseRevision: revision,
        created_at: new Date(now()),
        storageRetentionPolicy: "keep",
        lastMediaDependencyAt: new Date(now()).toISOString(),
      };
      tx.create(contentRef, content);
      for (let index = 0; index < scheduleIds.length; index++) {
        const platform = record.payload.platforms[index];
        const time = record.payload.time || new Date(now() + 1000).toISOString();
        if (Date.parse(time) < now())
          fail(
            409,
            "release_time_passed",
            "Choose a new delivery time and request approval again."
          );
        const settings = { ...record.payload.platformOptions[platform], media_url: source.url };
        const schedule = buildSchedule(record.contentId, {
          platform,
          startTime: time,
          frequency: "once",
          timezone: record.payload.timezone,
          platformSpecificSettings: settings,
        });
        tx.create(db.collection("promotion_schedules").doc(scheduleIds[index]), {
          ...schedule,
          user_id: current.workspace.ownerUid,
          workspace_id: workspaceId,
          created_by: uid,
          teamReleaseId: id,
          teamReleaseRevision: revision,
          teamApproval: record.approval,
          teamMedia: record.media,
        });
      }
      if (usage) {
        tx.create(db.collection("usage_ledger").doc(`team_${id}`), {
          userId: current.workspace.ownerUid,
          type: "upload",
          count: 1,
          monthKey: admission.upload.monthKey,
          timestamp: new Date(now()).toISOString(),
          metadata: { workspaceId, releaseId: id, actorUid: uid },
        });
        tx.set(
          billingSnapshot.ref,
          {
            uploads_this_month: Number(billingSnapshot.data()?.uploads_this_month || 0) + 1,
            last_upload: new Date(now()),
          },
          { merge: true }
        );
      }
      tx.update(ref, {
        status: "scheduled",
        scheduleIds,
        updatedAt: new Date(now()).toISOString(),
      });
      log(tx, current, "release_scheduled", id, { revision, scheduleIds });
      return { scheduleIds, replay: false };
    });
  }
  return { access, settings, list, submit, revise, review, comment, dispatch, preview };
}

module.exports = { createTeamWorkspace, releasePayload, stable, digest, PLATFORMS };

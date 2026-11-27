const { toMillis } = require("./storageRetentionPolicy");
const { createHash } = require("node:crypto");
const DAY = 24 * 60 * 60 * 1000;
const ownerOf = content => content.user_id || content.userId || content.uid;
const names = value => (Array.isArray(value) ? value : value ? [value] : []).map(String);
const publishingCopies = (content, extractPath) =>
  [
    ...new Set(
      [
        content.url,
        content.media_url,
        content.video_url,
        content.file_url,
        content.processedUrl,
        content.persistentMediaUrl,
      ].filter(value => typeof value === "string")
    ),
  ]
    .map(url => ({ url, path: extractPath(url) }))
    .filter(row => row.path?.startsWith("uploads/videos/"));

// Retaining bytes is safe when dependencies change without updating content.
// Cache only negative decisions, never permission to delete. This may postpone
// reconsideration by at most an hour; publication/scheduling do not use this cache.
// A future known 24-hour deadline expires the entry at that deadline instead.
const retentionHoldsByDatabase = new WeakMap();
const RETENTION_HOLD_MS = 60 * 60 * 1000;
const MAX_RETENTION_HOLDS = 2000;
const retentionVersion = record =>
  createHash("sha256").update(JSON.stringify(record.data())).digest("hex");
function retentionHoldCache(db) {
  let cache = retentionHoldsByDatabase.get(db);
  if (!cache) retentionHoldsByDatabase.set(db, (cache = new Map()));
  return cache;
}
function cachedRetentionHold(db, accountId, record, now) {
  const cache = retentionHoldCache(db),
    key = accountId + "/" + record.id;
  const entry = cache.get(key);
  const version = retentionVersion(record);
  if (entry && entry.expiresAt > now && now >= entry.observedAt && entry.version === version)
    return { ...entry.decision };
  cache.delete(key);
  return null;
}
function rememberRetentionHold(db, accountId, record, decision, now) {
  if (decision.eligible) return;
  const deadline = Date.parse(decision.deleteAfter);
  const expiresAt =
    Number.isFinite(deadline) && deadline > now
      ? Math.min(now + RETENTION_HOLD_MS, deadline)
      : now + RETENTION_HOLD_MS;
  const cache = retentionHoldCache(db),
    key = accountId + "/" + record.id;
  cache.delete(key);
  while (cache.size >= MAX_RETENTION_HOLDS) cache.delete(cache.keys().next().value);
  cache.set(key, {
    version: retentionVersion(record),
    observedAt: now,
    expiresAt,
    decision: { ...decision },
  });
}

async function readRetentionDependencies(db, ids, scanLimit) {
  const result = new Map();
  const collections = [
    "platform_posts",
    "promotion_tasks",
    "promotion_schedules",
    "media_transform_tasks",
  ];
  for (let index = 0; index < ids.length; index += 10) {
    const group = ids.slice(index, index + 10);
    const byCollection = await Promise.all(
      collections.map(async name => {
        if (group.length === 1)
          return new Map([
            [
              group[0],
              await db.collection(name).where("contentId", "==", group[0]).limit(scanLimit).get(),
            ],
          ]);
        const snapshot = await db
          .collection(name)
          .where("contentId", "in", group)
          .limit(scanLimit)
          .get();
        // A full shared result can hide dependencies for later IDs. Fall back to
        // the original per-content bounds; never infer safe deletion from it.
        if (snapshot.docs.length >= scanLimit)
          return new Map(
            await Promise.all(
              group.map(async id => [
                id,
                await db.collection(name).where("contentId", "==", id).limit(scanLimit).get(),
              ])
            )
          );
        return new Map(
          group.map(id => [id, { docs: snapshot.docs.filter(doc => doc.data().contentId === id) }])
        );
      })
    );
    for (const id of group)
      result.set(
        id,
        byCollection.map(map => map.get(id))
      );
  }
  return result;
}

function publicationDeadline(
  content,
  { posts = [], tasks = [], schedules = [], transforms = [] },
  now = Date.now()
) {
  const video = String(content.type || content.mediaType || "").toLowerCase();
  if (!video.startsWith("video")) return { eligible: false, reason: "not_video" };
  if (transforms.some(row => !["completed", "cancelled"].includes(row.status)))
    return { eligible: false, reason: "dependent_transform" };
  if (tasks.some(row => !["completed", "cancelled"].includes(row.status)))
    return { eligible: false, reason: "dependent_publication" };
  if (
    schedules.some(
      row =>
        (row.frequency && row.frequency !== "once") ||
        !["executed", "completed", "cancelled"].includes(row.status)
    )
  )
    return { eligible: false, reason: "dependent_schedule" };
  const targets = new Set(
    [
      ...names(content.target_platforms),
      ...names(content.platforms),
      ...tasks.filter(row => row.type === "platform_post").flatMap(row => names(row.platform)),
      ...schedules.flatMap(row => names(row.platform || row.platforms)),
    ].map(name => name.toLowerCase())
  );
  if (!targets.size) return { eligible: false, reason: "no_destination_evidence" };
  let lastPublished = 0;
  for (const platform of targets) {
    const confirmed = posts.filter(
      row =>
        row.platform === platform &&
        row.success === true &&
        !row.simulated &&
        !row.publicationPending &&
        row.externalId &&
        !row.rawOutcome?.simulated &&
        !row.rawOutcome?.publicationPending &&
        !["accepted", "pending", "processing", "submitted"].includes(row.rawOutcome?.status)
    );
    if (!confirmed.length) return { eligible: false, reason: "publication_unconfirmed", platform };
    const publishedAt = Math.max(
      ...confirmed.map(
        row =>
          toMillis(row.publishedAt) ||
          toMillis(row.rawOutcome?.publishedAt) ||
          toMillis(tasks.find(task => task.id === row.taskId)?.completedAt) ||
          toMillis(row.updatedAt) ||
          toMillis(row.createdAt)
      )
    );
    if (!publishedAt || publishedAt > now)
      return { eligible: false, reason: "publication_time_unconfirmed" };
    lastPublished = Math.max(lastPublished, publishedAt);
  }
  const deleteAfter = lastPublished + DAY;
  return {
    eligible: now >= deleteAfter,
    reason: now >= deleteAfter ? "expired" : "within_24_hours",
    lastPublishedAt: new Date(lastPublished).toISOString(),
    deleteAfter: new Date(deleteAfter).toISOString(),
  };
}

async function cleanupPublishedVideos({
  db,
  storage,
  extractPath,
  now = Date.now(),
  dryRun = false,
  scanLimit = 200,
}) {
  const accounts = await db
    .collection("user_billing")
    .where("storageRetention.publishedVideoHours", "==", 24)
    .limit(scanLimit)
    .get();
  const results = [];
  const rows = snapshot => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  for (const account of accounts.docs) {
    const seen = new Set();
    for (const ownerField of ["user_id", "userId"]) {
      const cursor = account.data()?.storageRetention?.scanCursor?.[ownerField];
      let contentQuery = db
        .collection("content")
        .where(ownerField, "==", account.id)
        .orderBy("__name__");
      if (cursor) contentQuery = contentQuery.startAfter(cursor);
      const contentSnap = await contentQuery.limit(scanLimit).get();
      const heldDecisions = new Map();
      if (!dryRun)
        for (const record of contentSnap.docs) {
          const decision = cachedRetentionHold(db, account.id, record, now);
          if (decision) heldDecisions.set(record.id, decision);
        }
      const candidatesForPreflight = contentSnap.docs.filter(record => {
        const content = record.data();
        return (
          !seen.has(record.id) &&
          ownerOf(content) === account.id &&
          content.storageRetentionStatus !== "deleted_after_publication" &&
          String(content.type || content.mediaType || "")
            .toLowerCase()
            .startsWith("video") &&
          publishingCopies(content, extractPath).length > 0 &&
          !heldDecisions.has(record.id)
        );
      });
      const preflight = await readRetentionDependencies(
        db,
        candidatesForPreflight.map(record => record.id),
        scanLimit
      );
      for (const record of contentSnap.docs) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        const content = record.data();
        if (
          ownerOf(content) !== account.id ||
          content.storageRetentionStatus === "deleted_after_publication"
        )
          continue;
        if (
          !String(content.type || content.mediaType || "")
            .toLowerCase()
            .startsWith("video")
        ) {
          results.push({ contentId: record.id, eligible: false, reason: "not_video" });
          continue;
        }
        if (!publishingCopies(content, extractPath).length) {
          results.push({
            contentId: record.id,
            eligible: false,
            reason: "no_owned_publishing_copy",
          });
          continue;
        }
        const heldDecision = heldDecisions.get(record.id);
        if (heldDecision) {
          results.push({ contentId: record.id, ...heldDecision, deleted: [] });
          continue;
        }
        const [posts, tasks, schedules, transforms] = preflight.get(record.id);
        if ([posts, tasks, schedules, transforms].some(snap => snap.docs.length >= scanLimit)) {
          results.push({
            contentId: record.id,
            eligible: false,
            reason: "dependency_scan_incomplete",
          });
          continue;
        }
        const decision = publicationDeadline(
          content,
          {
            posts: rows(posts),
            tasks: rows(tasks),
            schedules: rows(schedules),
            transforms: rows(transforms),
          },
          now
        );
        const result = { contentId: record.id, ...decision, deleted: [] };
        results.push(result);
        if (!decision.eligible) {
          if (!dryRun) rememberRetentionHold(db, account.id, record, decision, now);
          continue;
        }
        // Only content-publishing copies in our bucket qualify. Project/source
        // libraries, models, thumbnails and arbitrary remote objects do not.
        const urls = [
          ...new Set(
            [
              content.url,
              content.media_url,
              content.video_url,
              content.file_url,
              content.processedUrl,
              content.persistentMediaUrl,
            ].filter(value => typeof value === "string")
          ),
        ];
        const candidates = [
          ...new Map(
            urls
              .map(url => ({ url, path: extractPath(url) }))
              .filter(row => row.path?.startsWith("uploads/videos/"))
              .map(row => [row.path, row])
          ).values(),
        ];
        if (!candidates.length) {
          result.eligible = false;
          result.reason = "no_owned_publishing_copy";
          continue;
        }
        let held = false;
        for (const candidate of candidates) {
          for (const field of ["storagePath", "sourceStoragePath", "source.storagePath"]) {
            const references = await db
              .collection("content")
              .where(field, "==", candidate.path)
              .limit(2)
              .get();
            if (references.docs.some(doc => doc.id !== record.id)) held = true;
          }
          // A second content record may still need the same bytes. Missing or
          // failed queries abort the cycle instead of authorizing deletion.
          for (const field of [
            "url",
            "media_url",
            "video_url",
            "file_url",
            "processedUrl",
            "persistentMediaUrl",
          ]) {
            const references = await db
              .collection("content")
              .where(field, "==", candidate.url)
              .limit(2)
              .get();
            if (references.docs.some(doc => doc.id !== record.id)) held = true;
          }
        }
        if (held) {
          result.eligible = false;
          result.reason = "shared_content_reference";
          continue;
        }
        const files = [];
        for (const candidate of candidates) {
          const file = storage.bucket().file(candidate.path);
          let metadata;
          try {
            [metadata] = await file.getMetadata();
          } catch (error) {
            if (Number(error.code) === 404) {
              result.deleted.push({ path: candidate.path, alreadyMissing: true });
              continue;
            }
            throw error;
          }
          if (
            metadata.metadata?.ownerUid !== account.id ||
            !String(metadata.contentType).startsWith("video/") ||
            !/^[1-9]\d*$/.test(String(metadata.generation))
          ) {
            held = true;
            break;
          }
          files.push({ file, candidate, generation: metadata.generation });
        }
        if (held) {
          result.eligible = false;
          result.reason = "object_owner_or_type_unconfirmed";
          continue;
        }
        if (dryRun) {
          result.wouldDelete = files.map(row => row.candidate.path);
          continue;
        }
        // Claim the content against the same transactional write used by new
        // schedules/tasks. Recheck all dependencies while holding that claim.
        const claimed = await db.runTransaction(async transaction => {
          const fresh = await transaction.get(record.ref);
          if (JSON.stringify(fresh.data()) !== JSON.stringify(content)) return false;
          const dependencies = await Promise.all(
            [
              "platform_posts",
              "promotion_tasks",
              "promotion_schedules",
              "media_transform_tasks",
            ].map(name =>
              transaction.get(
                db.collection(name).where("contentId", "==", record.id).limit(scanLimit)
              )
            )
          );
          if (dependencies.some(snap => snap.docs.length >= scanLimit)) return false;
          const current = publicationDeadline(
            content,
            {
              posts: rows(dependencies[0]),
              tasks: rows(dependencies[1]),
              schedules: rows(dependencies[2]),
              transforms: rows(dependencies[3]),
            },
            now
          );
          if (!current.eligible) return false;
          transaction.set(
            record.ref,
            { storageRetentionStatus: "deleting_after_publication" },
            { merge: true }
          );
          return true;
        });
        if (!claimed) {
          result.eligible = false;
          result.reason = "dependencies_changed";
          continue;
        }
        for (const { file, candidate, generation } of files) {
          await file.delete({ ifGenerationMatch: generation });
          result.deleted.push({ path: candidate.path, generation });
        }
        await record.ref.set(
          {
            storageRetentionStatus: "deleted_after_publication",
            publishedVideoDeletedAt: new Date(now).toISOString(),
            publishedVideoDeleteAfter: decision.deleteAfter,
            publishedVideoDeletedPaths: result.deleted.map(row => row.path),
          },
          { merge: true }
        );
      }
      if (!dryRun && (cursor || contentSnap.docs.length === scanLimit))
        await account.ref.set(
          {
            storageRetention: {
              scanCursor: {
                [ownerField]:
                  contentSnap.docs.length === scanLimit ? contentSnap.docs.at(-1).id : null,
              },
            },
          },
          { merge: true }
        );
    }
  }
  return results;
}

module.exports = { publicationDeadline, cleanupPublishedVideos, readRetentionDependencies };

const { db, admin } = require("../firebaseAdmin");
const { createTeamWorkspace } = require("./teamWorkspace");
const { extractOwnedStoragePathFromUrl } = require("../utils/cleanupSource");
const { getStudioSourceBucket, getStudioSourcePathKind } = require("./studioSourceService");
const error = (status, code) => {
  throw Object.assign(new Error(code), { status, code });
};

async function resolveMedia({ uid, workspaceId, sourceContentId, url, media }) {
  let ownerUid = uid;
  let storagePath = media?.storagePath || extractOwnedStoragePathFromUrl(url);
  if (sourceContentId) {
    if (typeof sourceContentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceContentId))
      error(400, "invalid_source");
    const record = await db.collection("content").doc(sourceContentId).get();
    if (!record.exists) error(404, "source_unavailable");
    const content = record.data();
    if (
      content.workspace_id
        ? content.workspace_id !== workspaceId
        : (content.user_id || content.userId) !== uid
    )
      error(403, "source_not_shared");
    require("./contentMediaDependency").assertAvailable(content);
    storagePath =
      content.storagePath ||
      content.source?.storagePath ||
      extractOwnedStoragePathFromUrl(content.url);
    ownerUid = content.source?.ownerUid || content.user_id || content.userId;
  }
  const kind = getStudioSourcePathKind(storagePath, ownerUid, true);
  const exportPath =
    typeof storagePath === "string" && storagePath.startsWith(`studio/exports/${ownerUid}/`);
  if (!kind && !exportPath) error(403, "save_owned_media_first");
  const bucket = exportPath
    ? admin.storage().bucket()
    : getStudioSourceBucket(kind, media?.bucketName);
  const file = bucket.file(storagePath);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (_) {
    error(409, "saved_media_unavailable");
  }
  if (
    metadata.metadata?.ownerUid !== ownerUid ||
    !/^(video|image)\//.test(metadata.contentType || "") ||
    !metadata.generation ||
    Number(metadata.size) <= 0 ||
    (metadata.metadata?.deleteAfter && Date.parse(metadata.metadata.deleteAfter) <= Date.now())
  )
    error(403, "saved_media_unavailable");
  const identity = {
    ownerUid,
    storagePath,
    bucketName: bucket.name,
    generation: String(metadata.generation),
    size: Number(metadata.size),
    contentType: metadata.contentType,
  };
  // A version-specific URL prevents a replacement object becoming the reviewed movie.
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 15 * 60000,
    queryParams: { generation: identity.generation },
  });
  return { media: identity, url: signedUrl };
}

const service = createTeamWorkspace({
  db,
  resolveMedia,
  checkReadiness: async (uid, payload) => {
    const result = await require("../contentRoutes").evaluateUploadReadiness(uid, {
      target_platforms: payload.platforms,
      scheduled_promotion_time: payload.time,
    });
    if (!result.allowed)
      throw Object.assign(new Error(result.message), { status: 403, code: result.code });
    return result;
  },
  verifyDestinations: async (uid, payload) => {
    const service = require("./communityPublishing");
    for (const platform of payload.platforms.filter(item => ["telegram", "discord"].includes(item)))
      await service.resolveDestination(uid, platform, payload.platformOptions[platform]);
    const compliance = require("./complianceService");
    for (const platform of payload.platforms)
      compliance.checkPlatformCompliance(
        platform,
        payload.platformOptions[platform],
        require("./publishingIntent").determineContentIntent(payload.platformOptions)
      );
  },
  buildSchedule: (contentId, settings) =>
    require("../promotionService").buildScheduleRecord(contentId, settings),
});

async function verifyTeamTaskMedia(content) {
  if (!content.teamReleaseId) return;
  require("../config/teamRollout").assertTeamCollaborationAvailable();
  const media = content.source;
  if (!media?.generation) error(409, "team_media_unbound");
  const resolved = await resolveMedia({ uid: media.ownerUid, media });
  if (
    require("./teamWorkspace").digest(resolved.media) !== require("./teamWorkspace").digest(media)
  )
    error(409, "team_media_changed");
  content.url = resolved.url;
  return resolved.url;
}

async function prepareTeamDispatch(contentId, platform, scheduleId) {
  const snapshot = await db.collection("content").doc(contentId).get();
  // Historical IDs with a team_ prefix are not necessarily reviewed releases.
  if (!snapshot.exists || !snapshot.data().teamReleaseId) return null;
  require("../config/teamRollout").assertTeamCollaborationAvailable();
  const content = snapshot.data();
  const releaseDoc = await db
    .collection("workspaces")
    .doc(content.workspace_id)
    .collection("releases")
    .doc(content.teamReleaseId)
    .get();
  const release = releaseDoc.data();
  if (
    !release ||
    release.status !== "scheduled" ||
    release.contentId !== contentId ||
    release.revision !== content.teamReleaseRevision ||
    !release.payload.platforms.includes(platform) ||
    release.approval?.fingerprint !== release.fingerprint
  )
    error(409, "team_approval_unavailable");
  const url = await verifyTeamTaskMedia(content);
  await snapshot.ref.update({ url });
  const options = release.payload.platformOptions[platform] || {};
  const text =
    options.message ||
    options.text ||
    options.caption ||
    options.description ||
    release.payload.description;
  return {
    ...options,
    title: options.title || release.payload.title,
    message: text,
    text,
    media_url: url,
    videoUrl: url,
    ...(scheduleId ? { scheduleId } : {}),
  };
}
module.exports = { service, resolveMedia, verifyTeamTaskMedia, prepareTeamDispatch };

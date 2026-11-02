const admin = require("firebase-admin");

const SIGNED_READ_HOURS = 24;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|mts|ts)$/i;
const MEDIA_EXTENSIONS = /\.(png|jpe?g|webp|gif|wav|mp3|m4a|aac|ogg|flac)$/i;

const sourceError = (statusCode, code, message) =>
  Object.assign(new Error(message), { statusCode, code });

const isSafeStoragePath = path =>
  typeof path === "string" &&
  path.length > 0 &&
  path.length <= 1024 &&
  !path.includes("..") &&
  !path.includes("\\") &&
  !/[\x00-\x1f\x7f]/.test(path) &&
  !path.startsWith("/") &&
  !path.endsWith("/");

const getStudioSourcePathKind = (storagePath, userId, allowMedia = false) => {
  if (!isSafeStoragePath(storagePath) || !userId) return null;
  if (storagePath.startsWith(`studio/sources/${userId}/`)) return "durable_studio";
  if (storagePath.startsWith(`temp/multicam-ingest/${userId}/`)) return "legacy_studio";
  if (storagePath.startsWith(`uploads/videos/${userId}/`)) return "user_upload";
  if (allowMedia && ["images", "audios"].some(type => storagePath.startsWith(`uploads/${type}/${userId}/`)))
    return "user_upload";
  // The backend's older raw upload route omitted the UID for all media types.
  // Accept only one filename component; immutable ownerUid, MIME, size and
  // expiry checks below still authorize every read. Images/audio never enter
  // video-only consumers through this compatibility path.
  if (/^uploads\/videos\/[^/]+$/.test(storagePath)) return "legacy_upload";
  if (allowMedia && /^uploads\/(?:images|audios)\/[^/]+$/.test(storagePath)) return "legacy_upload";
  return null;
};

const bucketName = value => String(value || "").trim().replace(/^gs:\/\//, "").replace(/\/$/, "");
const getStudioSourceBucket = (kind, resolvedBucketName) => {
  const studio = kind === "durable_studio" || kind === "legacy_studio";
  const preferred = studio
    ? bucketName(process.env.MULTICAM_INGEST_BUCKET || process.env.FIREBASE_STORAGE_BUCKET)
    : "";
  if (resolvedBucketName) {
    const allowed = [preferred, bucketName(process.env.FIREBASE_STORAGE_BUCKET),
      admin.storage().bucket().name].filter(Boolean);
    if (!allowed.includes(resolvedBucketName))
      throw sourceError(403, "STUDIO_SOURCE_FORBIDDEN", "Choose a video uploaded to your Studio project");
    return admin.storage().bucket(resolvedBucketName);
  }
  return preferred ? admin.storage().bucket(preferred) : admin.storage().bucket();
};

async function resolveOwnedStudioSource({ storagePath, userId, signRead = true }, allowMedia) {
  const path = String(storagePath || "").trim();
  const kind = getStudioSourcePathKind(path, userId, allowMedia);
  if (!kind) {
    throw sourceError(403, "STUDIO_SOURCE_FORBIDDEN", "Choose a video uploaded to your Studio project");
  }

  const preferredBucket = getStudioSourceBucket(kind);
  const buckets = [preferredBucket];
  // Older Studio projects retain object paths from the main bucket. Moving
  // new uploads to a dedicated ingest bucket must not strand those sources.
  if ((kind === "durable_studio" || kind === "legacy_studio") && process.env.MULTICAM_INGEST_BUCKET) {
    const mainName = bucketName(process.env.FIREBASE_STORAGE_BUCKET);
    const mainBucket = mainName ? admin.storage().bucket(mainName) : admin.storage().bucket();
    if (mainBucket.name !== preferredBucket.name) buckets.push(mainBucket);
  }
  let file, metadata, resolvedBucket;
  for (const candidate of buckets) {
    const candidateFile = candidate.file(path);
    try {
      [metadata] = await candidateFile.getMetadata();
      file = candidateFile;
      resolvedBucket = candidate.name || candidateFile.bucket?.name;
      break;
    } catch (error) {
      if (Number(error?.code || error?.statusCode) !== 404)
        throw sourceError(503, "STUDIO_SOURCE_UNAVAILABLE", "Could not check a Studio source. Try again shortly");
    }
  }
  if (!metadata)
    throw sourceError(404, "STUDIO_SOURCE_MISSING", "A Studio source is missing. Upload it again before exporting");

  const custom = metadata?.metadata || {};
  if (custom.ownerUid !== userId) {
    throw sourceError(403, "STUDIO_SOURCE_FORBIDDEN", "This video does not belong to your Studio project");
  }
  if (
    (kind === "durable_studio" || kind === "legacy_studio") &&
    !["studio_source", "studio_project"].includes(custom.purpose)
  ) {
    throw sourceError(403, "STUDIO_SOURCE_PURPOSE_INVALID", "Choose a Studio source video");
  }
  const size = Number(metadata?.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw sourceError(409, "STUDIO_SOURCE_INCOMPLETE", "A Studio source upload is incomplete. Upload it again");
  }
  const contentType = String(metadata?.contentType || "").toLowerCase();
  if (
    contentType &&
    !contentType.startsWith("video/") &&
    !(allowMedia && /^(image\/(png|jpeg|webp|gif)|audio\/[a-z0-9.+-]+)$/.test(contentType)) &&
    !(contentType === "application/octet-stream" && (VIDEO_EXTENSIONS.test(path) || allowMedia && MEDIA_EXTENSIONS.test(path)))
  ) {
    throw sourceError(422, "STUDIO_SOURCE_NOT_VIDEO", "Choose a video file for this timeline clip");
  }
  const expiry = Date.parse(custom.deleteAfter || "");
  if (Number.isFinite(expiry) && expiry <= Date.now()) {
    throw sourceError(410, "STUDIO_SOURCE_EXPIRED", "A Studio source has expired. Upload it again before exporting");
  }

  // Local deterministic decoding needs the owned object/generation, not a
  // remotely signed URL. Keep the same authorization checks in both paths.
  if (!signRead) return { storagePath: path, size, contentType, kind, generation: metadata.generation, ...(resolvedBucket ? { bucketName: resolvedBucket } : {}) };

  try {
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + SIGNED_READ_HOURS * 60 * 60 * 1000,
    });
    return { storagePath: path, signedUrl, size, contentType, kind, generation: metadata.generation, ...(resolvedBucket ? { bucketName: resolvedBucket } : {}) };
  } catch (_error) {
    throw sourceError(503, "STUDIO_SOURCE_UNAVAILABLE", "Could not prepare a Studio source. Try again shortly");
  }
}

const resolveOwnedStudioVideoSource = input => resolveOwnedStudioSource(input, false);
const resolveOwnedStudioMediaSource = input => resolveOwnedStudioSource(input, true);

module.exports = {
  getStudioSourceBucket,
  getStudioSourcePathKind,
  resolveOwnedStudioVideoSource,
  resolveOwnedStudioMediaSource,
  sourceError,
};

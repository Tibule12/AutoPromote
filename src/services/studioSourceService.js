const admin = require("firebase-admin");

const SIGNED_READ_HOURS = 24;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|mts|ts)$/i;

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

const getStudioSourcePathKind = (storagePath, userId) => {
  if (!isSafeStoragePath(storagePath) || !userId) return null;
  if (storagePath.startsWith(`studio/sources/${userId}/`)) return "durable_studio";
  if (storagePath.startsWith(`temp/multicam-ingest/${userId}/`)) return "legacy_studio";
  if (storagePath.startsWith(`uploads/videos/${userId}/`)) return "user_upload";
  // The backend's older raw upload route omitted the UID from its object name.
  // Its immutable ownerUid metadata is still checked below.
  if (/^uploads\/videos\/[^/]+$/.test(storagePath)) return "legacy_upload";
  return null;
};

const getStudioSourceBucket = kind => {
  if (kind === "durable_studio" || kind === "legacy_studio") {
    const bucketName = String(
      process.env.MULTICAM_INGEST_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || ""
    ).replace(/^gs:\/\//, "").replace(/\/$/, "");
    return bucketName ? admin.storage().bucket(bucketName) : admin.storage().bucket();
  }
  return admin.storage().bucket();
};

async function resolveOwnedStudioVideoSource({ storagePath, userId }) {
  const path = String(storagePath || "").trim();
  const kind = getStudioSourcePathKind(path, userId);
  if (!kind) {
    throw sourceError(403, "STUDIO_SOURCE_FORBIDDEN", "Choose a video uploaded to your Studio project");
  }

  const file = getStudioSourceBucket(kind).file(path);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (error) {
    if (Number(error?.code || error?.statusCode) === 404) {
      throw sourceError(404, "STUDIO_SOURCE_MISSING", "A Studio source is missing. Upload it again before exporting");
    }
    throw sourceError(503, "STUDIO_SOURCE_UNAVAILABLE", "Could not check a Studio source. Try again shortly");
  }

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
    !(contentType === "application/octet-stream" && VIDEO_EXTENSIONS.test(path))
  ) {
    throw sourceError(422, "STUDIO_SOURCE_NOT_VIDEO", "Choose a video file for this timeline clip");
  }
  const expiry = Date.parse(custom.deleteAfter || "");
  if (Number.isFinite(expiry) && expiry <= Date.now()) {
    throw sourceError(410, "STUDIO_SOURCE_EXPIRED", "A Studio source has expired. Upload it again before exporting");
  }

  try {
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + SIGNED_READ_HOURS * 60 * 60 * 1000,
    });
    return { storagePath: path, signedUrl, size, contentType, kind };
  } catch (_error) {
    throw sourceError(503, "STUDIO_SOURCE_UNAVAILABLE", "Could not prepare a Studio source. Try again shortly");
  }
}

module.exports = {
  getStudioSourceBucket,
  getStudioSourcePathKind,
  resolveOwnedStudioVideoSource,
  sourceError,
};

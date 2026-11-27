const admin = require("firebase-admin");

const MAX_TEMP_VIDEO_BYTES = 500 * 1024 * 1024;
const SIGNED_READ_TTL_MS = 2 * 60 * 60 * 1000;
const PURPOSE_PREFIXES = Object.freeze({
  viral_scan: "temp_scans",
  smart_promo: "temp_sources",
});

function buildSourceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeOwnedTemporaryPath(storagePath, userId, purpose) {
  const path = String(storagePath || "").trim();
  const uid = String(userId || "").trim();
  const prefix = PURPOSE_PREFIXES[purpose];

  if (!path || !uid || !prefix) {
    throw buildSourceError(400, "TEMP_SOURCE_INVALID", "The temporary video source is invalid.");
  }
  if (path.includes("..") || path.includes("\\") || path.length > 700) {
    throw buildSourceError(400, "TEMP_SOURCE_INVALID", "The temporary video source is invalid.");
  }

  const ownedPrefix = `${prefix}/${uid}/`;
  if (!path.startsWith(ownedPrefix) || path.length <= ownedPrefix.length) {
    throw buildSourceError(
      403,
      "TEMP_SOURCE_NOT_OWNED",
      "This temporary video does not belong to the signed-in user."
    );
  }
  return path;
}

async function resolveOwnedTemporaryVideoSource({ storagePath, userId, purpose }) {
  const path = normalizeOwnedTemporaryPath(storagePath, userId, purpose);
  const file = admin.storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) {
    throw buildSourceError(
      410,
      "TEMP_SOURCE_MISSING",
      "The temporary video is no longer available. Please upload it again."
    );
  }

  const [metadata] = await file.getMetadata();
  const ownerUid = String(metadata?.metadata?.ownerUid || "");
  const sourcePurpose = String(metadata?.metadata?.sourcePurpose || "");
  const size = Number(metadata?.size || 0);
  const contentType = String(metadata?.contentType || "").toLowerCase();

  if (ownerUid !== String(userId)) {
    throw buildSourceError(
      403,
      "TEMP_SOURCE_NOT_OWNED",
      "This temporary video does not belong to the signed-in user."
    );
  }
  if (sourcePurpose !== purpose) {
    throw buildSourceError(403, "TEMP_SOURCE_PURPOSE_MISMATCH", "Invalid temporary video purpose.");
  }
  if (size <= 0 || size > MAX_TEMP_VIDEO_BYTES) {
    throw buildSourceError(
      413,
      "TEMP_SOURCE_SIZE_INVALID",
      "The temporary video is empty or exceeds the 500 MB limit."
    );
  }
  if (contentType && !contentType.startsWith("video/") && contentType !== "application/octet-stream") {
    throw buildSourceError(415, "TEMP_SOURCE_TYPE_INVALID", "The temporary source must be a video.");
  }

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_READ_TTL_MS,
  });

  return {
    storagePath: path,
    signedUrl,
    size,
    contentType,
    temporary: true,
  };
}

async function deleteOwnedTemporaryVideoSource({ storagePath, userId, purpose }) {
  const path = normalizeOwnedTemporaryPath(storagePath, userId, purpose);
  const file = admin.storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return { status: "already_missing", storagePath: path };
  await file.delete();
  return { status: "deleted", storagePath: path };
}

module.exports = {
  MAX_TEMP_VIDEO_BYTES,
  deleteOwnedTemporaryVideoSource,
  normalizeOwnedTemporaryPath,
  resolveOwnedTemporaryVideoSource,
};

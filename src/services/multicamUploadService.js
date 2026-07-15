const crypto = require("crypto");
const admin = require("firebase-admin");

const DEFAULT_MAX_UPLOAD_BYTES = 12 * 1024 * 1024 * 1024;
const DEFAULT_RETENTION_HOURS = 72;
const ALLOWED_PURPOSES = new Set(["camera_original", "external_audio"]);

function sanitizeFileName(value) {
  const safe = String(value || "media.bin")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return safe || "media.bin";
}

function resolveIngestBucketName() {
  const configured =
    process.env.MULTICAM_INGEST_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "";
  if (configured) return configured.replace(/^gs:\/\//, "").replace(/\/$/, "");

  try {
    return String(admin.app().options.storageBucket || "")
      .replace(/^gs:\/\//, "")
      .replace(/\/$/, "");
  } catch (_error) {
    return "";
  }
}

function getMaxUploadBytes() {
  const parsed = Number(process.env.MULTICAM_MAX_SOURCE_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

function getRetentionHours() {
  const parsed = Number(
    process.env.MULTICAM_INGEST_RETENTION_HOURS || DEFAULT_RETENTION_HOURS
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_HOURS;
}

function getDeleteAfterFromCompletion(completedAtMs = Date.now()) {
  return new Date(completedAtMs + getRetentionHours() * 60 * 60 * 1000).toISOString();
}

function buildIngestStoragePath({ userId, fileName, sizeBytes, lastModified, fingerprint }) {
  const identity = [
    userId,
    fingerprint || "",
    fileName || "",
    Number(sizeBytes || 0),
    Number(lastModified || 0),
  ].join(":");
  const digest = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
  return `temp/multicam-ingest/${userId}/${digest}_${sanitizeFileName(fileName)}`;
}

function assertOwnedIngestPath(userId, storagePath) {
  const expectedPrefix = `temp/multicam-ingest/${userId}/`;
  if (!String(storagePath || "").startsWith(expectedPrefix)) {
    const error = new Error("Upload does not belong to this user");
    error.statusCode = 403;
    throw error;
  }
}

function buildFirebaseDownloadUrl(bucketName, storagePath, token) {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}` +
    `/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`
  );
}

function getDownloadTokenFromUrl(value) {
  try {
    return new URL(String(value || "")).searchParams.get("token") || "";
  } catch (_error) {
    return "";
  }
}

async function verifyOwnedIngestObject({ userId, source, purpose }) {
  const storagePath = source?.storagePath || source?.storage_path;
  assertOwnedIngestPath(userId, storagePath);
  const bucketName = resolveIngestBucketName();
  if (!bucketName) {
    const error = new Error("Multicam ingest bucket is not configured");
    error.statusCode = 503;
    throw error;
  }

  const [metadata] = await admin.storage().bucket(bucketName).file(storagePath).getMetadata();
  const customMetadata = metadata.metadata || {};
  if (customMetadata.ownerUid !== userId || customMetadata.purpose !== purpose) {
    const error = new Error("Render source ownership or purpose does not match");
    error.statusCode = 403;
    throw error;
  }
  if (Number(metadata.size || 0) <= 0) {
    const error = new Error("Render source is empty");
    error.statusCode = 409;
    throw error;
  }

  const urlToken = getDownloadTokenFromUrl(source?.url);
  const storedTokens = String(customMetadata.firebaseStorageDownloadTokens || "").split(",");
  if (!urlToken || !storedTokens.includes(urlToken)) {
    const error = new Error("Render source download token does not match its upload");
    error.statusCode = 403;
    throw error;
  }

  const deleteAfter = Date.parse(customMetadata.deleteAfter || "");
  if (Number.isFinite(deleteAfter) && deleteAfter <= Date.now()) {
    const error = new Error("Render source has expired; upload it again");
    error.statusCode = 410;
    throw error;
  }

  return { storagePath, size: Number(metadata.size), deleteAfter: customMetadata.deleteAfter || null };
}

async function verifyMulticamRenderInputs({ userId, sources, externalAudio }) {
  const cameraSources = Array.isArray(sources) ? sources : [];
  const checks = cameraSources.map(source =>
    verifyOwnedIngestObject({ userId, source, purpose: "camera_original" })
  );
  if (externalAudio?.url) {
    checks.push(
      verifyOwnedIngestObject({ userId, source: externalAudio, purpose: "external_audio" })
    );
  }
  return Promise.all(checks);
}

async function recoverMulticamUpload({ userId, source, purpose }) {
  const storagePath = source?.storagePath || source?.storage_path;
  assertOwnedIngestPath(userId, storagePath);
  const bucketName = resolveIngestBucketName();
  if (!bucketName) {
    const error = new Error("Multicam ingest bucket is not configured");
    error.statusCode = 503;
    throw error;
  }

  const [metadata] = await admin.storage().bucket(bucketName).file(storagePath).getMetadata();
  const customMetadata = metadata.metadata || {};
  if (customMetadata.ownerUid !== userId || customMetadata.purpose !== purpose) {
    const error = new Error("Recoverable source ownership or purpose does not match");
    error.statusCode = 403;
    throw error;
  }
  if (Number(metadata.size || 0) <= 0) {
    const error = new Error("Recoverable source is empty");
    error.statusCode = 409;
    throw error;
  }

  const deleteAfter = Date.parse(customMetadata.deleteAfter || "");
  if (Number.isFinite(deleteAfter) && deleteAfter <= Date.now()) {
    const error = new Error("Recoverable source has expired");
    error.statusCode = 410;
    throw error;
  }

  const storedTokens = String(customMetadata.firebaseStorageDownloadTokens || "")
    .split(",")
    .map(token => token.trim())
    .filter(Boolean);
  const existingToken = getDownloadTokenFromUrl(source?.url);
  const downloadToken = storedTokens.includes(existingToken) ? existingToken : storedTokens[0];
  if (!downloadToken) {
    const error = new Error("Recoverable source has no Firebase download token");
    error.statusCode = 409;
    throw error;
  }

  return {
    url: buildFirebaseDownloadUrl(bucketName, storagePath, downloadToken),
    storagePath,
    size: Number(metadata.size),
    deleteAfter: customMetadata.deleteAfter || null,
    cacheKey: `${bucketName}/${storagePath}#${metadata.generation || "current"}`,
  };
}

async function startMulticamUpload({
  userId,
  fileName,
  contentType,
  sizeBytes,
  lastModified,
  fingerprint,
  purpose,
  origin,
}) {
  const normalizedSize = Number(sizeBytes || 0);
  const normalizedPurpose = String(purpose || "camera_original");
  if (!userId) {
    const error = new Error("Authenticated user is required");
    error.statusCode = 401;
    throw error;
  }
  if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
    const error = new Error("A non-empty source file is required");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedSize > getMaxUploadBytes()) {
    const error = new Error(
      `Source is larger than the ${Math.round(getMaxUploadBytes() / 1024 / 1024 / 1024)} GiB upload limit`
    );
    error.statusCode = 413;
    throw error;
  }
  if (!ALLOWED_PURPOSES.has(normalizedPurpose)) {
    const error = new Error("Unsupported multicam upload purpose");
    error.statusCode = 400;
    throw error;
  }

  const bucketName = resolveIngestBucketName();
  if (!bucketName) {
    const error = new Error("MULTICAM_INGEST_BUCKET or FIREBASE_STORAGE_BUCKET is required");
    error.statusCode = 503;
    throw error;
  }

  const storagePath = buildIngestStoragePath({
    userId,
    fileName,
    sizeBytes: normalizedSize,
    lastModified,
    fingerprint,
  });
  const downloadToken = crypto.randomUUID();
  const uploadStartedAt = new Date().toISOString();
  const bucket = admin.storage().bucket(bucketName);
  const file = bucket.file(storagePath);
  const [uploadUrl] = await file.createResumableUpload({
    origin: origin || undefined,
    private: true,
    metadata: {
      contentType: String(contentType || "application/octet-stream").slice(0, 200),
      cacheControl: "private, no-store, max-age=0",
      contentDisposition: `attachment; filename="${sanitizeFileName(fileName)}"`,
      metadata: {
        ownerUid: userId,
        purpose: normalizedPurpose,
        expectedSizeBytes: String(normalizedSize),
        uploadStartedAt,
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  return {
    uploadUrl,
    storagePath,
    bucketName,
    downloadToken,
    deleteAfter: null,
    expectedSizeBytes: normalizedSize,
    chunkSizeBytes: 16 * 1024 * 1024,
  };
}

async function completeMulticamUpload({ userId, storagePath, downloadToken, sizeBytes }) {
  assertOwnedIngestPath(userId, storagePath);
  const bucketName = resolveIngestBucketName();
  if (!bucketName) {
    const error = new Error("Multicam ingest bucket is not configured");
    error.statusCode = 503;
    throw error;
  }

  const file = admin.storage().bucket(bucketName).file(storagePath);
  const [metadata] = await file.getMetadata();
  const customMetadata = metadata.metadata || {};
  if (customMetadata.ownerUid !== userId) {
    const error = new Error("Upload ownership metadata does not match");
    error.statusCode = 403;
    throw error;
  }

  const actualSize = Number(metadata.size || 0);
  const expectedSize = Number(customMetadata.expectedSizeBytes || sizeBytes || 0);
  if (!actualSize || (expectedSize > 0 && actualSize !== expectedSize)) {
    const error = new Error(`Upload is incomplete (${actualSize}/${expectedSize || "unknown"} bytes)`);
    error.statusCode = 409;
    throw error;
  }

  const storedTokens = String(customMetadata.firebaseStorageDownloadTokens || "").split(",");
  if (!downloadToken || !storedTokens.includes(downloadToken)) {
    const error = new Error("Upload completion token does not match");
    error.statusCode = 403;
    throw error;
  }

  // Retention starts only after Firebase has finalized the complete object.
  // Starting this clock when a resumable upload session is created steals
  // hours from large uploads and can make a freshly completed source expire.
  const completedAt = new Date();
  const deleteAfter = getDeleteAfterFromCompletion(completedAt.getTime());
  await file.setMetadata({
    customTime: completedAt.toISOString(),
    metadata: {
      ...customMetadata,
      uploadCompletedAt: completedAt.toISOString(),
      deleteAfter,
    },
  });

  return {
    url: buildFirebaseDownloadUrl(bucketName, storagePath, downloadToken),
    storagePath,
    bucketName,
    size: actualSize,
    generation: metadata.generation || null,
    deleteAfter,
    cacheKey: `${bucketName}/${storagePath}#${metadata.generation || "current"}`,
  };
}

async function abortMulticamUpload({ userId, storagePath }) {
  assertOwnedIngestPath(userId, storagePath);
  const bucketName = resolveIngestBucketName();
  if (!bucketName) return { status: "not_configured" };
  await admin.storage().bucket(bucketName).file(storagePath).delete({ ignoreNotFound: true });
  return { status: "deleted", storagePath };
}

module.exports = {
  abortMulticamUpload,
  buildFirebaseDownloadUrl,
  buildIngestStoragePath,
  completeMulticamUpload,
  recoverMulticamUpload,
  sanitizeFileName,
  startMulticamUpload,
  verifyMulticamRenderInputs,
};

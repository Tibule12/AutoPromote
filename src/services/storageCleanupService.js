const { storage, db } = require("../firebaseAdmin");
const { cleanupSourceFile } = require("../utils/cleanupSource");

const SOURCE_UPLOAD_RETENTION_DAYS = parseInt(process.env.SOURCE_UPLOAD_RETENTION_DAYS || "14", 10);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCAN_LIMIT = parseInt(process.env.SOURCE_UPLOAD_RETENTION_SCAN_LIMIT || "200", 10);

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function extractStoragePathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return null;

  try {
    if (fileUrl.startsWith("gs://")) {
      const parts = fileUrl.split("/");
      return parts.length >= 4 ? parts.slice(3).join("/") : null;
    }

    const decoded = decodeURIComponent(fileUrl);
    if (decoded.includes("/o/")) {
      const afterO = decoded.split("/o/")[1];
      return afterO ? afterO.split("?")[0] : null;
    }

    if (decoded.includes("storage.googleapis.com")) {
      const parsed = new URL(decoded);
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      return pathParts.length > 1 ? pathParts.slice(1).join("/") : null;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function resolveSourceUploadState(contentId, data = {}) {
  const sourceUrl = typeof data.url === "string" ? data.url : null;
  const storagePath = data.storagePath || extractStoragePathFromUrl(sourceUrl);
  if (!storagePath || !storagePath.startsWith("uploads/")) return null;

  const createdAtMs =
    toMillis(data.created_at) || toMillis(data.createdAt) || toMillis(data.sourceCreatedAt) || 0;
  const deleteAfterMs =
    toMillis(data.sourceDeleteAfter) ||
    (createdAtMs > 0 ? createdAtMs + SOURCE_UPLOAD_RETENTION_DAYS * ONE_DAY_MS : 0);

  if (!sourceUrl || !deleteAfterMs) return null;

  return {
    contentId,
    sourceUrl,
    storagePath,
    createdAtMs,
    deleteAfterMs,
    deleteAfterIso: new Date(deleteAfterMs).toISOString(),
  };
}

function getAlternateMediaUrl(data = {}, sourceUrl) {
  const candidates = [
    data.processedUrl,
    data.persistentMediaUrl,
    data.repostPreview?.outputUrl,
    data.downloadInfo?.url,
    data.mediaUrl,
    data.media_url,
    data.video_url,
    data.file_url,
  ];

  return (
    candidates.find(candidate => {
      return typeof candidate === "string" && candidate.trim() && candidate !== sourceUrl;
    }) || null
  );
}

async function reconcileRetentionState(docRef, data, sourceState, cleanupResult) {
  const nowIso = new Date().toISOString();
  const baseUpdate = {
    sourceRetentionUpdatedAt: nowIso,
    sourceRetentionStatus: cleanupResult?.status || "unknown",
    sourceRetentionDays: SOURCE_UPLOAD_RETENTION_DAYS,
    storagePath: sourceState.storagePath,
    sourceDeleteAfter: sourceState.deleteAfterIso,
  };

  if (cleanupResult?.status === "deleted" || cleanupResult?.status === "already_missing") {
    const alternateMediaUrl = getAlternateMediaUrl(data, sourceState.sourceUrl);
    const update = {
      ...baseUpdate,
      sourceDeletedAt: nowIso,
      sourceOriginalUrl: sourceState.sourceUrl,
    };

    if (data.url === sourceState.sourceUrl && alternateMediaUrl) {
      update.url = alternateMediaUrl;
    }

    await docRef.set(update, { merge: true });
    return;
  }

  await docRef.set(baseUpdate, { merge: true });
}

/**
 * Cleanup temporary uploads older than 24 hours.
 * This runs periodically on the server to prevent storage bloat.
 */
async function cleanupTempUploads() {
  if (!storage) {
    console.warn("[StorageCleanup] Storage service not available, skipping cleanup.");
    return;
  }

  const bucket = storage.bucket();
  const tempFolder = "temp_sources/";
  const now = Date.now();
  try {
    const [files] = await bucket.getFiles({ prefix: tempFolder });

    if (files.length === 0) {
      // console.debug("[StorageCleanup] No files found in temp_sources to clean.");
      return;
    }

    console.log(`[StorageCleanup] Checking ${files.length} files in ${tempFolder} for cleanup...`);

    const deletePromises = files.map(async file => {
      // Skip the folder placeholder itself if it exists
      if (file.name === tempFolder) return;

      const [metadata] = await file.getMetadata();
      const createdTime = new Date(metadata.timeCreated).getTime();

      if (now - createdTime > ONE_DAY_MS) {
        console.log(`[StorageCleanup] Deleting old temp file: ${file.name}`);
        try {
          await file.delete();
        } catch (delErr) {
          console.error(`[StorageCleanup] Failed to delete ${file.name}: ${delErr.message}`);
        }
      }
    });

    await Promise.all(deletePromises);
    console.log("[StorageCleanup] Cleanup cycle complete");
  } catch (error) {
    console.error("[StorageCleanup] Error cleaning up temp files:", error);
  }
}

async function cleanupExpiredSourceUploads() {
  if (!storage || !db) {
    console.warn(
      "[StorageCleanup] Firestore/Storage service not available, skipping source cleanup."
    );
    return;
  }

  const nowMs = Date.now();
  const cutoffDate = new Date(nowMs - SOURCE_UPLOAD_RETENTION_DAYS * ONE_DAY_MS);
  const processed = new Set();
  const candidates = [];

  try {
    const [retentionSnap, legacySnap] = await Promise.all([
      db
        .collection("content")
        .where("sourceDeleteAfter", "<=", new Date(nowMs).toISOString())
        .orderBy("sourceDeleteAfter")
        .limit(DEFAULT_SCAN_LIMIT)
        .get()
        .catch(() => ({ docs: [] })),
      db
        .collection("content")
        .where("created_at", "<=", cutoffDate)
        .orderBy("created_at")
        .limit(DEFAULT_SCAN_LIMIT)
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    for (const doc of [...(retentionSnap.docs || []), ...(legacySnap.docs || [])]) {
      if (processed.has(doc.id)) continue;
      processed.add(doc.id);

      const data = doc.data() || {};
      if (data.sourceDeletedAt) continue;
      const sourceState = resolveSourceUploadState(doc.id, data);
      if (!sourceState) continue;
      if (sourceState.deleteAfterMs > nowMs) continue;

      candidates.push({ docRef: doc.ref, data, sourceState });
    }

    if (candidates.length === 0) {
      return;
    }

    console.log(
      `[StorageCleanup] Evaluating ${candidates.length} expired source uploads for ${SOURCE_UPLOAD_RETENTION_DAYS}-day retention.`
    );

    for (const candidate of candidates) {
      const cleanupResult = await cleanupSourceFile(candidate.sourceState.sourceUrl, {
        contentId: candidate.sourceState.contentId,
        currentPlatform: "retention",
      });

      await reconcileRetentionState(
        candidate.docRef,
        candidate.data,
        candidate.sourceState,
        cleanupResult || { status: "unknown" }
      );
    }
  } catch (error) {
    console.error("[StorageCleanup] Error cleaning expired source uploads:", error);
  }
}

module.exports = { cleanupTempUploads, cleanupExpiredSourceUploads };

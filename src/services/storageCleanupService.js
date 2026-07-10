const { storage, db } = require("../firebaseAdmin");
const { cleanupSourceFile, extractOwnedStoragePathFromUrl } = require("../utils/cleanupSource");
const {
  shouldDeleteTemporaryObject,
  toMillis,
} = require("./storageRetentionPolicy");

const SOURCE_UPLOAD_RETENTION_DAYS = parseInt(process.env.SOURCE_UPLOAD_RETENTION_DAYS || "14", 10);
const TEMP_SCAN_RETENTION_MINUTES = parseInt(process.env.TEMP_SCAN_RETENTION_MINUTES || "20", 10);
const MULTICAM_MASTER_RETENTION_DAYS = parseInt(
  process.env.MULTICAM_MASTER_RETENTION_DAYS || "7",
  10
) || 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCAN_LIMIT = parseInt(process.env.SOURCE_UPLOAD_RETENTION_SCAN_LIMIT || "200", 10);

function extractStoragePathFromUrl(fileUrl) {
  return extractOwnedStoragePathFromUrl(fileUrl);
}

function getMulticamStoragePaths(data = {}) {
  const result = data.result || {};
  const candidates = [
    data.outputStoragePath,
    data.output_storage_path,
    data.storagePath,
    result.outputStoragePath,
    result.output_storage_path,
    extractStoragePathFromUrl(data.outputUrl || data.output_url || result.url || result.output_url),
    data.thumbnailStoragePath,
    data.thumbnail_storage_path,
    result.thumbnailStoragePath,
    result.thumbnail_storage_path,
    extractStoragePathFromUrl(
      data.thumbnailUrl || data.thumbnail_url || result.thumbnailUrl || result.thumbnail_url
    ),
    data.manifestStoragePath,
    data.manifest_storage_path,
    result.manifestStoragePath,
    result.manifest_storage_path,
    extractStoragePathFromUrl(
      data.manifestUrl || data.manifest_url || result.manifestUrl || result.manifest_url
    ),
  ];

  return Array.from(new Set(candidates.filter(Boolean))).filter(path => {
    return (
      path.startsWith("processed/multicam_") ||
      path.startsWith("processed/thumbnails/multicam_") ||
      path.startsWith("processed/manifests/multicam_")
    );
  });
}

async function deleteStoragePath(path) {
  const bucket = storage.bucket();
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return { path, status: "already_missing" };
  await file.delete();
  return { path, status: "deleted" };
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
 * Cleanup temporary uploads. Find Viral Clips scan uploads are deliberately short-lived.
 * This runs periodically on the server to prevent storage bloat.
 */
async function cleanupTempUploads() {
  if (!storage) {
    console.warn("[StorageCleanup] Storage service not available, skipping cleanup.");
    return;
  }

  const bucket = storage.bucket();
  const now = Date.now();

  const cleanupConfigs = [
    {
      prefix: "temp_sources/",
      retentionMs: ONE_DAY_MS,
      label: "temp source",
    },
    {
      prefix: "temp/multicam-clean-sync/",
      retentionMs: ONE_DAY_MS,
      label: "multicam camera source",
    },
    {
      prefix: "temp/multicam-clean-sync-audio/",
      retentionMs: ONE_DAY_MS,
      label: "multicam external audio",
    },
    {
      prefix: "temp/multicam-ingest/",
      retentionMs: 3 * ONE_DAY_MS,
      label: "multicam original ingest",
    },
    {
      prefix: "temp_scans/",
      retentionMs: TEMP_SCAN_RETENTION_MINUTES * 60 * 1000,
      label: "scanner upload",
    },
  ];

  try {
    for (const config of cleanupConfigs) {
      const [files] = await bucket.getFiles({ prefix: config.prefix });

      if (files.length === 0) {
        continue;
      }

      console.log(
        `[StorageCleanup] Checking ${files.length} files in ${config.prefix} for cleanup...`
      );

      const deletePromises = files.map(async file => {
        if (file.name === config.prefix) return;

        const [metadata] = await file.getMetadata();
        const shouldDelete = shouldDeleteTemporaryObject({
          metadata,
          now,
          retentionMs: config.retentionMs,
        });

        if (shouldDelete) {
          console.log(`[StorageCleanup] Deleting old ${config.label} file: ${file.name}`);
          try {
            await file.delete();
          } catch (delErr) {
            console.error(`[StorageCleanup] Failed to delete ${file.name}: ${delErr.message}`);
          }
        }
      });

      await Promise.all(deletePromises);
    }

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

async function cleanupExpiredMulticamRenders() {
  if (!storage || !db) {
    console.warn(
      "[StorageCleanup] Firestore/Storage service not available, skipping multicam cleanup."
    );
    return;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const processed = new Set();
  const candidates = [];

  try {
    const [expirySnap, legacySnap] = await Promise.all([
      db
        .collection("video_edits")
        .where("expiresAt", "<=", nowIso)
        .limit(DEFAULT_SCAN_LIMIT)
        .get()
        .catch(() => ({ docs: [] })),
      db
        .collection("video_edits")
        .where("type", "==", "multicam_render")
        .limit(DEFAULT_SCAN_LIMIT)
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    for (const doc of [...(expirySnap.docs || []), ...(legacySnap.docs || [])]) {
      if (processed.has(doc.id)) continue;
      processed.add(doc.id);

      const data = doc.data() || {};
      if (data.type !== "multicam_render" || data.status !== "completed") continue;
      if (data.masterDeletedAt || data.retentionStatus === "expired_deleted") continue;

      const explicitExpiryMs = toMillis(data.expiresAt || data.result?.expiresAt || data.result?.expires_at);
      const completedMs = toMillis(data.completedAt || data.completed_at);
      const deleteAfterMs =
        explicitExpiryMs || (completedMs ? completedMs + MULTICAM_MASTER_RETENTION_DAYS * ONE_DAY_MS : 0);
      if (!deleteAfterMs || deleteAfterMs > nowMs) continue;

      const storagePaths = getMulticamStoragePaths(data);
      candidates.push({
        docRef: doc.ref,
        jobId: doc.id,
        storagePaths,
        deleteAfterIso: new Date(deleteAfterMs).toISOString(),
      });
    }

    for (const candidate of candidates) {
      const deleteResults = [];
      for (const storagePath of candidate.storagePaths) {
        try {
          deleteResults.push(await deleteStoragePath(storagePath));
        } catch (error) {
          deleteResults.push({ path: storagePath, status: "failed", error: error.message });
        }
      }

      await candidate.docRef.set(
        {
          status: "expired",
          retentionStatus: "expired_deleted",
          retentionDays: MULTICAM_MASTER_RETENTION_DAYS,
          expiresAt: candidate.deleteAfterIso,
          masterDeletedAt: new Date().toISOString(),
          deletedStoragePaths: deleteResults,
          outputUrl: null,
          output_url: null,
          thumbnailUrl: null,
          thumbnail_url: null,
          manifestUrl: null,
          manifest_url: null,
          result: {
            url: null,
            outputUrl: null,
            output_url: null,
            thumbnailUrl: null,
            thumbnail_url: null,
            manifestUrl: null,
            manifest_url: null,
          },
        },
        { merge: true }
      );

      console.log(
        `[StorageCleanup] Expired multicam render ${candidate.jobId}; deleted ${deleteResults.length} file(s).`
      );
    }
  } catch (error) {
    console.error("[StorageCleanup] Error cleaning expired multicam renders:", error);
  }
}

module.exports = {
  cleanupTempUploads,
  cleanupExpiredSourceUploads,
  cleanupExpiredMulticamRenders,
  getMulticamStoragePaths,
};

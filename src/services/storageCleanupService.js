const { storage } = require("../firebaseAdmin");

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
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

module.exports = { cleanupTempUploads };

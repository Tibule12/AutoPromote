const { admin } = require("../firebaseAdmin");

/**
 * Irrevocably deletes a file from Firebase Storage/GCS to save costs.
 * Used after successful upload to external platforms.
 * @param {string} fileUrl - The GS URI or HTTPS URL of the file to delete
 */
async function cleanupSourceFile(fileUrl) {
  if (!fileUrl) return;

  // Ignore external URLs that are clearly not ours (e.g. random internet videos)
  // Only target our storage buckets to prevent accidents
  if (
    !fileUrl.includes("firebasestorage") &&
    !fileUrl.includes("storage.googleapis") &&
    !fileUrl.startsWith("gs://")
  ) {
    return;
  }

  console.log(`[Cleanup] Attempting to delete source file: ${fileUrl}`);

  try {
    const bucket = admin.storage().bucket();
    let filePath = null;

    // Case 1: gs:// URI (e.g., gs://my-app.appspot.com/uploads/video.mp4)
    if (fileUrl.startsWith("gs://")) {
      const parts = fileUrl.split("/");
      // parts: ["gs:", "", "bucket-name", "folder", "file.mp4"]
      if (parts.length >= 4) {
        filePath = parts.slice(3).join("/");
      }
    }
    // Case 2: HTTPS URL (Firebasestorage) -> https://firebasestorage.googleapis.com/v0/b/[bucket]/o/[path]?token...
    else if (fileUrl.includes("/o/")) {
      const decoded = decodeURIComponent(fileUrl);
      const afterO = decoded.split("/o/")[1];
      if (afterO) {
        filePath = afterO.split("?")[0]; // Remove query params
      }
    }
    // Case 3: HTTPS URL (storage.googleapis.com) -> https://storage.googleapis.com/[bucket]/[path]
    else if (fileUrl.includes("storage.googleapis.com")) {
      const u = new URL(fileUrl);
      // Pathname = /bucket/folder/file.mp4
      // We need to drop the first part (bucket) if we are using the default bucket reference,
      // but typically `bucket.file()` expects the path RELATIVE to the bucket.
      const pathParts = u.pathname.split("/").filter(Boolean);
      if (pathParts.length > 1) {
        // Assume first part is bucket, rest is path
        filePath = pathParts.slice(1).join("/");
      }
    }

    if (filePath) {
      const file = bucket.file(filePath);
      // We verify existence first to avoid 404 errors cluttering logs
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log(`[Cleanup] ✅ Successfully deleted source file: ${filePath}`);
      } else {
        console.log(`[Cleanup] File did not exist (already deleted?): ${filePath}`);
      }
    } else {
      console.log(`[Cleanup] Could not parse valid storage path from URL: ${fileUrl}`);
    }
  } catch (error) {
    console.warn(`[Cleanup] ⚠️ Failed to delete source file ${fileUrl}:`, error.message);
    // Swallow error to preventing crashing the main request
  }
}

module.exports = { cleanupSourceFile };

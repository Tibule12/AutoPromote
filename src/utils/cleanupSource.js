const { admin } = require("../firebaseAdmin");

function normalizeComparableUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function findReferencedContentRecord(fileUrl, contentId) {
  const firestore = admin.firestore();

  if (contentId) {
    const snap = await firestore.collection("content").doc(String(contentId)).get();
    if (snap.exists) {
      return {
        id: snap.id,
        data: snap.data() || {},
      };
    }
  }

  const fieldsToCheck = [
    "url",
    "processedUrl",
    "persistentMediaUrl",
    "media_url",
    "video_url",
    "file_url",
  ];

  for (const field of fieldsToCheck) {
    const snap = await firestore.collection("content").where(field, "==", fileUrl).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return {
        id: doc.id,
        data: doc.data() || {},
      };
    }
  }

  return null;
}

function getDistinctReferencedMediaUrls(contentData) {
  const candidates = [
    contentData?.url,
    contentData?.media_url,
    contentData?.video_url,
    contentData?.file_url,
    contentData?.processedUrl,
    contentData?.persistentMediaUrl,
    contentData?.downloadInfo?.url,
    contentData?.repostPreview?.outputUrl,
  ]
    .map(normalizeComparableUrl)
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

function shouldKeepReferencedSource(fileUrl, contentData) {
  const targetUrl = normalizeComparableUrl(fileUrl);
  if (!targetUrl || !contentData) return false;

  const referencedUrls = getDistinctReferencedMediaUrls(contentData);
  if (!referencedUrls.includes(targetUrl)) return false;

  return referencedUrls.length <= 1;
}

async function hasPendingDependentTasks(contentId, currentPlatform) {
  if (!contentId) return false;

  try {
    const [promotionSnap, transformSnap] = await Promise.all([
      admin
        .firestore()
        .collection("promotion_tasks")
        .where("contentId", "==", contentId)
        .limit(25)
        .get(),
      admin
        .firestore()
        .collection("media_transform_tasks")
        .where("contentId", "==", contentId)
        .limit(25)
        .get(),
    ]);

    const pendingPromotionTask = promotionSnap.docs.some(doc => {
      const data = doc.data() || {};
      const status = String(data.status || "").toLowerCase();
      const type = String(data.type || "").toLowerCase();
      const platform = String(data.platform || "").toLowerCase();
      if (!["queued", "processing"].includes(status)) return false;
      if (type !== "platform_post") return false;
      if (!currentPlatform) return true;
      return platform && platform !== String(currentPlatform).toLowerCase();
    });

    if (pendingPromotionTask) return true;

    return transformSnap.docs.some(doc => {
      const data = doc.data() || {};
      const status = String(data.status || "").toLowerCase();
      return ["queued", "processing"].includes(status);
    });
  } catch (error) {
    console.warn(
      "[Cleanup] Dependency check failed; skipping deletion to avoid breaking queued work:",
      error.message
    );
    return true;
  }
}

/**
 * Irrevocably deletes a file from Firebase Storage/GCS to save costs.
 * Used after successful upload to external platforms.
 * @param {string} fileUrl - The GS URI or HTTPS URL of the file to delete
 */
async function cleanupSourceFile(fileUrl, options = {}) {
  if (!fileUrl) return;

  let contentId = options && options.contentId ? String(options.contentId) : null;
  const currentPlatform = options && options.currentPlatform ? options.currentPlatform : null;

  // Ignore external URLs that are clearly not ours (e.g. random internet videos)
  // Only target our storage buckets to prevent accidents
  try {
    const urlObj = new URL(fileUrl);
    // Strict hostname checking
    const allowedHosts = ["firebasestorage.googleapis.com", "storage.googleapis.com"];
    if (!allowedHosts.includes(urlObj.hostname) && !fileUrl.startsWith("gs://")) {
      return { status: "skipped_external_url" };
    }
  } catch (e) {
    if (!fileUrl.startsWith("gs://")) return { status: "skipped_invalid_url" };
  }

  let referencedContent = null;
  try {
    referencedContent = await findReferencedContentRecord(fileUrl, contentId);
    if (referencedContent?.id) {
      contentId = referencedContent.id;
    }
  } catch (error) {
    console.warn(
      "[Cleanup] Content lookup failed; skipping deletion to avoid breaking history/previews:",
      error.message
    );
    return { status: "skipped_content_lookup_failed", error: error.message };
  }

  if (shouldKeepReferencedSource(fileUrl, referencedContent?.data)) {
    console.log(
      `[Cleanup] Keeping source for content ${contentId || "unknown"} because it is still the only user-facing media URL.`
    );
    return { status: "skipped_only_user_facing_media", contentId };
  }

  if (await hasPendingDependentTasks(contentId, currentPlatform)) {
    console.log(
      `[Cleanup] Skipping source deletion for content ${contentId || "unknown"} because dependent tasks are still queued or processing.`
    );
    return { status: "skipped_pending_dependencies", contentId };
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
        return { status: "deleted", contentId, filePath };
      } else {
        console.log(`[Cleanup] File did not exist (already deleted?): ${filePath}`);
        return { status: "already_missing", contentId, filePath };
      }
    } else {
      // Safe logging (prevent format string injection)
      console.log("[Cleanup] Could not parse valid storage path from URL:", fileUrl);
      return { status: "skipped_unparseable_path", contentId };
    }
  } catch (error) {
    console.warn("[Cleanup] ⚠️ Failed to delete source file:", fileUrl, error.message);
    // Swallow error to preventing crashing the main request
    return { status: "failed", contentId, error: error.message };
  }
}

module.exports = { cleanupSourceFile };

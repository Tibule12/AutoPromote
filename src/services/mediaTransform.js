const { db, admin } = require("../firebaseAdmin");
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("../../lib/uuid-compat");

/**
 * Placeholder media transform service.
 * Real implementation should call FFmpeg or use a dedicated transcoding service
 * to trim, rotate, crop, or otherwise modify the media file in Storage.
 */
async function enqueueMediaTransformTask({ contentId, uid, meta, url }) {
  if (!contentId) throw new Error("contentId required");
  const ref = db.collection("promotion_tasks").doc();
  const baseTask = {
    type: "media_transform",
    status: "queued",
    contentId,
    uid,
    meta: meta || {},
    sourceUrl: url || null,
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await ref.set(baseTask);
  return { id: ref.id, ...baseTask };
}

async function processNextMediaTransformTask() {
  // Fetch one queued media_transform task
  const snap = await db
    .collection("promotion_tasks")
    .where("type", "==", "media_transform")
    .where("status", "in", ["queued"])
    .orderBy("createdAt")
    .limit(5)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  await doc.ref.update({ status: "processing", updatedAt: new Date().toISOString() });
  try {
    // If no sourceUrl is present, nothing to do
    if (!data.sourceUrl) throw new Error("sourceUrl missing");

    // If preview or external non-transformable URL, mirror without transformation
    if (String(data.sourceUrl || "").startsWith("preview://")) {
      const processedUrl = data.sourceUrl;
      await db
        .collection("content")
        .doc(data.contentId)
        .set(
          { processedUrl, processedAt: new Date().toISOString(), processedMeta: data.meta || {} },
          { merge: true }
        );
      await doc.ref.update({
        status: "completed",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      return { id: doc.id, processedUrl };
    }

    // Download source to a temp file
    const tmpDir = os.tmpdir();
    const ext = path.extname(new URL(data.sourceUrl).pathname) || "";
    const tmpIn = path.join(tmpDir, `in-${uuidv4()}${ext}`);
    const tmpOut = path.join(tmpDir, `out-${uuidv4()}${ext || ".mp4"}`);

    // Use fetch to download file (node-fetch/polyfilled global fetch may be present)
    let okDownloaded = false;
    try {
      const fetchFn = global.fetch || require("node-fetch");
      const res = await fetchFn(data.sourceUrl);
      if (!res.ok) throw new Error(`download_failed(${res.status})`);
      const dest = fs.createWriteStream(tmpIn);
      await new Promise((resolve, reject) => {
        res.body.pipe(dest);
        res.body.on("error", reject);
        dest.on("finish", resolve);
        dest.on("error", reject);
      });
      okDownloaded = true;
    } catch (e) {
      console.warn("[transform] download failed", e && e.message);
      // Attempt to see if we can read from GCS directly using the firebase-admin SDK
      try {
        const bucket = admin.storage().bucket();
        // Try to convert https://.../o/encoded paths to bucket file path
        // Fallback: attempt to copy with gs:// path if provided
        const file = bucket.file(data.sourceUrl.replace(/^https?:\/\/.+?\/o\//, "").split("?")[0]);
        await file.download({ destination: tmpIn });
        okDownloaded = true;
      } catch (e2) {
        console.error("[transform] gcs download fallback failed", e2 && e2.message);
      }
    }
    if (!okDownloaded) throw new Error("download_failed");

    // Build ffmpeg args based on meta
    const args = ["-y", "-i", tmpIn];
    const meta = data.meta || {};
    // Trim start
    if (typeof meta.trimStart === "number" && meta.trimStart > 0) {
      args.unshift("-ss", String(meta.trimStart));
    }
    // Trim end (use duration to compute -to)
    if (typeof meta.trimEnd === "number" && meta.trimEnd > 0) {
      args.push("-to", String(meta.trimEnd));
    }
    // Image rotate/flip - use transpose or filters for images. For simplicity apply filters
    const filters = [];
    if (typeof meta.rotate === "number") {
      const r = ((meta.rotate % 360) + 360) % 360;
      if (r === 90) filters.push("transpose=1");
      else if (r === 180) filters.push("transpose=1,transpose=1");
      else if (r === 270) filters.push("transpose=2");
    }
    if (meta.flipH) filters.push("hflip");
    if (meta.flipV) filters.push("vflip");
    if (Array.isArray(filters) && filters.length) args.push("-vf", filters.join(","));
    // Crop support (meta.crop: { x, y, w, h })
    if (meta && meta.crop && typeof meta.crop.w === "number" && typeof meta.crop.h === "number") {
      const c = meta.crop;
      const cropStr = `crop=${Math.round(c.w)}:${Math.round(c.h)}:${Math.round(c.x || 0)}:${Math.round(c.y || 0)}`;
      args.push("-vf", filters.length ? filters.join(",") + "," + cropStr : cropStr);
    }

    // Ensure audio/video codecs copy by default to avoid re-encoding when not necessary
    args.push("-c:v", "libx264", "-c:a", "aac", "-movflags", "faststart");
    args.push(tmpOut);

    // Spawn ffmpeg
    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      proc.stderr.on("data", d => {
        stderr += d.toString();
      });
      proc.on("error", err => {
        if (err && err.code === "ENOENT") {
          reject(new Error("ffmpeg_not_found")); // guide caller to ensure ffmpeg installed
        } else reject(err);
      });
      proc.on("close", code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg_exit_${code} ${stderr.slice(0, 300)}`));
      });
    });

    // Upload processed file to GCS in a processed/ prefix and make it readable via signed URL
    const bucket = admin.storage().bucket();
    const processedPath = `processed/${data.contentId}/${Date.now()}_${path.basename(tmpOut)}`;
    await bucket.upload(tmpOut, {
      destination: processedPath,
      gzip: true,
      metadata: { contentType: detectMimeType(tmpOut) },
    });
    const uploadedFile = bucket.file(processedPath);
    // Create a long-lived signed URL for read (expires 1 Jan 2500)
    const signedUrls = await uploadedFile.getSignedUrl({ action: "read", expires: "01-01-2500" });
    const processedUrl =
      signedUrls && signedUrls[0] ? signedUrls[0] : `gs://${bucket.name}/${processedPath}`;

    // Clean up temp files
    try {
      fs.unlinkSync(tmpIn);
    } catch (_) {}
    try {
      fs.unlinkSync(tmpOut);
    } catch (_) {}

    await db
      .collection("content")
      .doc(data.contentId)
      .set(
        { processedUrl, processedAt: new Date().toISOString(), processedMeta: meta },
        { merge: true }
      );
    await doc.ref.update({
      status: "completed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      processedUrl,
    });
    // Optionally enqueue a platform post task to post processed media after transform
    try {
      // If the original content had platform tasks queued we won't enqueue automatically; but we can offer to
      // create a platform_post task if the original meta requested it via postAfterTransform
      if (meta && meta.postAfterTransform && Array.isArray(meta.postAfterTransform)) {
        for (const platform of meta.postAfterTransform) {
          try {
            // Require inside function to avoid circular require at module load time
            const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
            await enqueuePlatformPostTask({
              contentId: data.contentId,
              uid: data.uid,
              platform,
              reason: "post_transform",
              payload: { url: processedUrl, platformOptions: meta.platformOptions || {} },
            });
          } catch (e) {
            /* non-fatal */
          }
        }
      }
    } catch (_) {}
    return { id: doc.id, processedUrl };
  } catch (err) {
    await doc.ref.update({
      status: "failed",
      error: err.message || "transform_failed",
      updatedAt: new Date().toISOString(),
    });
    return { id: doc.id, error: err.message || "transform_failed" };
  }
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

module.exports = { enqueueMediaTransformTask, processNextMediaTransformTask };

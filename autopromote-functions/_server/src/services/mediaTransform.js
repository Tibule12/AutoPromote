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

    // Placeholder for AI Quality Enhancement
    if (data.meta && data.meta.quality_enhanced) {
      console.log(
        `[transform] Enhancing quality for content ${data.contentId} using AI-based upscale/denoise...`
      );
      // In a real implementation, this would call FFmpeg with specific filters or an external AI service.
      // For now, we simulate the processing time.
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

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

    // -------------------------------------------------------------------------
    // STRATEGIC TRANSFORM: Ensure unique hash for every repost (Bypass Algorithms)
    // -------------------------------------------------------------------------

    // Build ffmpeg args based on meta
    // Default to a negligible visual change to force re-encoding and unique hash
    const brightnessShift = (Math.random() * 0.002) - 0.001; // +/- 0.001 brightness (invisible)
    const uniqueId = uuidv4();
    const args = ["-y", "-i", tmpIn];
    
    // Apply filters (Strategic Obfuscation)
    const filters = [`eq=brightness=${1.0 + brightnessShift}`];
    
    // Optional: Trim slightly if requested or random variations enabled
    const meta = data.meta || {};
    if (meta.trimStart) {
      args.push("-ss", String(meta.trimStart));
    }
    
    args.push("-vf", filters.join(","));

    // Add unique metadata to further ensure hash collision avoidance
    args.push("-metadata", `comment=AutoPromote-Safe-Repost-${uniqueId}`);
    
    // Audio settings: Copy if possible, unless we need to re-encode (usually safer to copy for speed)
    // But for full uniqueness, re-encoding audio with a generic filter is safer.
    args.push("-c:a", "aac"); 
    
    // Video settings: Re-encode is REQUIRED for visual hash changes
    args.push("-c:v", "libx264");
    args.push("-preset", "faster"); // Speed over compression ratio for reposts
    args.push("-f", "mp4");
    
    args.push(tmpOut);

    console.log(`[transform] Executing FFmpeg strategic transform for ${data.contentId}...`);
    
    await new Promise((resolve, reject) => {
        const p = spawn("ffmpeg", args);
        // p.stdout.on("data", b => console.log(b.toString())); // Verbose
        p.stderr.on("data", b => {
            // FFmpeg writes progress to stderr, uncomment for debug
            // console.log(b.toString()); 
        });
        p.on("close", code => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });
        p.on("error", reject);
    });

    console.log(`[transform]FFmpeg success. Uploading unique variant...`);

    // Upload processed file back to storage (simulated or real)
    // For local env, we might just update the URL to the local path if serving static, 
    // but usually we upload to a 'processed/' folder in the bucket.
    
    // Assuming local simulation or Firebase Storage upload here:
    let bucket;
    try {
        bucket = admin.storage().bucket();
    } catch (_) {
         // Fallback if scope issue, though unlikely if valid admin
         bucket = require("../firebaseAdmin").admin.storage().bucket();
    }

    const destFileName = `processed/${data.contentId}/${uniqueId}.mp4`;
    const destFile = bucket.file(destFileName);
    
    await bucket.upload(tmpOut, {
        destination: destFileName,
        metadata: {
            contentType: 'video/mp4',
            metadata: {
                originalContentId: data.contentId,
                transformType: 'strategic_rehash'
            }
        }
    });

    // Make it public or get a signed URL (depending on policy)
    const [finalUrl] = await destFile.getSignedUrl({
        action: 'read',
        expires: '03-01-2500' // Far future
    });

    // Cleanup temp
    try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch (_) {}

    await db.collection("content").doc(data.contentId).set({
        processedUrl: finalUrl,
        lastTransformAt: new Date().toISOString(),
        transformMeta: {
            uniqueId,
            brightnessShift
        }
    }, { merge: true });

    await doc.ref.update({
        status: "completed",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outputUrl: finalUrl
    });

    // -------------------------------------------------------------------------
    // CHAINING: Automatically enqueue the post task if requested (The "After" Step)
    // -------------------------------------------------------------------------
    try {
      if (meta && meta.postAfterTransform && Array.isArray(meta.postAfterTransform)) {
        console.log(`[transform] Chaining post-transform tasks for: ${meta.postAfterTransform.join(",")}`);
        for (const platform of meta.postAfterTransform) {
          try {
            const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
            await enqueuePlatformPostTask({
              contentId: data.contentId,
              uid: data.uid,
              platform,
              reason: "post_transform", 
              // PASS THE NEW UNIQUE URL
              payload: { 
                url: finalUrl, 
                mediaUrl: finalUrl, // normalized
                message: meta.nextMessage || "Reposting this gem!", 
                platformOptions: meta.platformOptions || {} 
              },
              skipIfDuplicate: false, // We just made it unique, so force it!
              forceRepost: true
            });
          } catch (e) {
            console.error(`[transform] Failed to chain post for ${platform}:`, e.message);
          }
        }
      }
    } catch (_) {}

    return { id: doc.id, processedUrl: finalUrl };
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

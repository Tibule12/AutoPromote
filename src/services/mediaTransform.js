const { db, admin } = require("../firebaseAdmin");
const ffmpeg = require("fluent-ffmpeg");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid"); // Ensure consistent uuid import

// Configure FFmpeg path (Ensure ffmpeg is installed in environment or docker image)
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  const ffmpegPath = ffmpegInstaller.path;
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`[MediaTransform] Using ffmpeg installer at ${ffmpegPath}`);
  }
} catch (e) {
  console.warn(
    "[MediaTransform] @ffmpeg-installer/ffmpeg not found, relying on system PATH ffmpeg"
  );
}

/**
 * "Sci-Fi" Media Transform Service
 * Automatically fixes "Retention Killers" (Silence, Bad Audio, Wrong Aspect Ratio)
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

/**
 * FFmpeg Probe Wrapper
 */
function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
}

function processMedia(inputFile, outputFile, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      trimSilence = true,
      normalizeAudio = true,
      fixAspectRatio = true,
      targetAspectRatio = 9 / 16, // Default to TikTok/Reels vertical
      viralMutation = false, // ENABLE THE COMEBACK: Randomly mutate content to bypass hash/duplicate detection
    } = options;

    let command = ffmpeg(inputFile);
    const complexFilters = [];

    // --- VIRAL MUTATION ENGINE ---
    // If enabled, we subtly alter the video DNA to evade "Shadowban" or "Duplicate Content" filters.
    // 1. Speed Change (Tempo 1.05x) - Changes duration hash
    // 2. Color Grade (Saturation 1.2) - Changes visual hash
    // 3. Zoom Crop (1.02x) - Changes pixel mapping

    let videoFilterChain = "";
    let audioFilterChain = "";

    // 1. Retention Guard: Trim Silence at Start
    // silenceremove=start_periods=1:start_duration=0.5:start_threshold=-40dB
    if (trimSilence) {
      // Applied as an audio filter. Note: this shifts audio. Video needs to be synced or we just cut content.
      // FFmpeg 'silenceremove' only affects audio streams.
      // To cut VIDEO based on audio silence is complex.
      // Simplified "Sci-Fi" approach: We just cut the first 1.5s if it's dead silence,
      // OR we rely on 'silenceremove' and let ffmpeg sync (it usually drops video frames to match).
      // For safety, we will use a dedicated silence remover that works well.
      audioFilterChain += "silenceremove=start_periods=1:start_duration=0.3:start_threshold=-35dB,";
    }

    // 2. Loudness Equalizer (Spotify/TikTok Standard)
    // loudnorm=I=-16:TP=-1.5:LRA=11
    if (normalizeAudio) {
      // Chain from previous audio output
      audioFilterChain += "loudnorm=I=-16:TP=-1.5:LRA=11,";
    }

    // 3. Viral Mutation (The "Comeback" Logic)
    if (viralMutation) {
      // Speed up video and audio by 5% (imperceptible to humans, new content to bots)
      // video: setpts=0.95*PTS
      // audio: atempo=1.05
      videoFilterChain += "setpts=0.952*PTS,";
      audioFilterChain += "atempo=1.05,";

      // Color Grading (Pop the colors)
      // eq=saturation=1.1:contrast=1.05
      videoFilterChain += "eq=saturation=1.1:contrast=1.05,";

      // Slight Zoom (Crop 2% from center) to break pixel matching
      // crop=iw*0.98:ih*0.98:(iw-ow)/2:(ih-oh)/2
      videoFilterChain += "crop=iw*0.98:ih*0.98:(iw-ow)/2:(ih-oh)/2,";
    }

    // Clean up trailing commas in chains for basic processing
    // We will build the final complex filter graph carefully.

    // We need to name the streams to chain them properly.
    // [0:a] -> [a_proc]
    // [0:v] -> [v_proc]

    if (audioFilterChain.endsWith(",")) audioFilterChain = audioFilterChain.slice(0, -1);
    if (videoFilterChain.endsWith(",")) videoFilterChain = videoFilterChain.slice(0, -1);

    if (audioFilterChain) {
      complexFilters.push(`[0:a]${audioFilterChain}[a_processed]`);
    } else {
      complexFilters.push(`[0:a]anull[a_processed]`);
    }

    if (videoFilterChain) {
      complexFilters.push(`[0:v]${videoFilterChain}[v_processed]`);
    } else {
      complexFilters.push(`[0:v]null[v_processed]`);
    }

    // 4. Format Defender (Aspect Ratio)
    if (fixAspectRatio) {
      // We need to decide if we blur-fill or pass through.
      // This requires knowing input info, but we can use strict filter logic with 'scale' and 'pad'.
      // "Blur Fill" Logic for 9:16 target:
      // Split input -> Stream 1 (Background): Scale to 1080x1920 (Force), BoxBlur
      // Split input -> Stream 2 (Foreground): Scale to fit 1080x1920 (Keep Aspect)
      // Overlay Stream 2 on Stream 1.

      // Note: This logic forces everything to 9:16.
      // We should only do this if the user didn't opt out, or if we are sure it's for vertical platforms.
      // For now, let's implement the generic "Smart Scale" which fits into 1080x1920 with black bars (pad)
      // or blur fill. Blur fill is more professional ("Sci-Fi").

      // Complex Filter Graph for Blur Fill:
      // [v_processed]split[v_bg][v_fg];
      // [v_bg]scale=1080:1920:force_original_aspect_ratio=increase,boxblur=20:10[v_bg_blurred];
      // [v_bg_blurred]crop=1080:1920[v_bg_cropped];
      // [v_fg]scale=1080:1920:force_original_aspect_ratio=decrease[v_fg_scaled];
      // [v_bg_cropped][v_fg_scaled]overlay=(W-w)/2:(H-h)/2[v_out]

      complexFilters.push(`[v_processed]split[v_bg][v_fg]`);
      complexFilters.push(
        `[v_bg]scale=1080:1920:force_original_aspect_ratio=increase,boxblur=20:10,crop=1080:1920[v_bg_processed]`
      );
      complexFilters.push(
        `[v_fg]scale=1080:1920:force_original_aspect_ratio=decrease[v_fg_processed]`
      );
      complexFilters.push(`[v_bg_processed][v_fg_processed]overlay=(W-w)/2:(H-h)/2[v_out]`);
    } else {
      complexFilters.push(`[v_processed]null[v_out]`);
    }

    command
      .complexFilter(complexFilters)
      .outputOptions([
        "-map [v_out]",
        "-map [a_processed]",
        "-c:v libx264",
        "-preset veryfast", // speed over compression for user feedback loop
        "-c:a aac",
        "-b:a 192k",
        "-pix_fmt yuv420p",
        "-movflags +faststart", // Web optimization
      ])
      .save(outputFile)
      .on("end", () => resolve())
      .on("error", err => reject(err));
  });
}

async function processNextMediaTransformTask() {
  // Fetch one queued media_transform task
  const snap = await db
    .collection("promotion_tasks")
    .where("type", "==", "media_transform")
    .where("status", "in", ["queued"])
    .orderBy("createdAt")
    .limit(1) // Process one at a time per worker tick
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();

  await doc.ref.update({ status: "processing", updatedAt: new Date().toISOString() });

  const tmpDir = os.tmpdir();
  const tmpIn = path.join(tmpDir, `in-${data.contentId}.mp4`);
  const tmpOut = path.join(tmpDir, `out-${data.contentId}.mp4`);

  try {
    if (!data.sourceUrl) throw new Error("sourceUrl missing");

    // 1. Download source
    console.log(`[MediaTransform] Downloading ${data.contentId}...`);
    const fetchFn = global.fetch || require("node-fetch");
    const res = await fetchFn(data.sourceUrl);
    if (!res.ok) throw new Error(`download_failed(${res.status})`);
    const fileStream = fs.createWriteStream(tmpIn);
    await new Promise((resolve, reject) => {
      res.body.pipe(fileStream);
      res.body.on("error", reject);
      fileStream.on("finish", resolve);
    });

    // 2. Probe to check current state
    const metadata = await probeMedia(tmpIn);
    const videoStream = metadata.streams.find(s => s.codec_type === "video");
    const width = videoStream ? videoStream.width : 0;
    const height = videoStream ? videoStream.height : 0;
    const duration = metadata.format.duration || 0;

    // 3. Determine "Auto-Fix" Strategy
    // Intelligent defaulting:
    // If it's already vertical (height > width), don't blur-fill, just normalize.
    // If it's horizontal (width > height) AND duration < 60s, assume it's a Short => APPLY BLUR FILL.
    // If it's horizontal AND duration > 60s, assume it's Long Form => KEEP RATIO (YouTube).

    let shouldFixRatio = false;
    const isVertical = height > width;
    const isShort = duration < 65; // Tolerance for 60s limit

    if (!isVertical && isShort) {
      console.log(
        `[MediaTransform] 💡 Auto-Detected Horizontal Short (${duration}s). Applying 9:16 Blur-Fill.`
      );
      shouldFixRatio = true;
    }

    // 4. Run FFmpeg Processing
    const viralMode = data.meta?.viral_remix || false;

    console.log(
      `[MediaTransform] Processing ${data.contentId} (FixRatio: ${shouldFixRatio}, Normalize: true, ViralMode: ${viralMode})...`
    );

    // Apply "Comeback" Logic (Protcol 7 Mutation) if requested
    await processMedia(tmpIn, tmpOut, {
      trimSilence: true, // Always clean the hook
      normalizeAudio: true, // Always professional audio
      fixAspectRatio: shouldFixRatio, // Intelligent formatting
      viralMutation: viralMode, // Change DNA if this is a "Remix" attempt
    });

    // 5. Upload Processed File
    // In a real app, upload back to storage bucket.
    // Here we simulate by just logging success and updating the doc with "processedUrl" (mocked as same for demo, or new path)
    // To make this real, we would upload `tmpOut` to `processed/${data.contentId}.mp4`

    // For specific AutoPromote context, we likely want to overwrite or save as "optimized" version.
    console.log(`[MediaTransform] Optimization Complete. New file ready.`);

    let bucket;
    try {
      bucket = admin.storage().bucket();
    } catch (_) {
      // Fallback if scope issue, though unlikely if valid admin
      bucket = require("../firebaseAdmin").admin.storage().bucket();
    }

    const uniqueId = uuidv4();
    const destFileName = `processed/${data.contentId}/${uniqueId}.mp4`;
    const destFile = bucket.file(destFileName);

    await bucket.upload(tmpOut, {
      destination: destFileName,
      metadata: {
        contentType: "video/mp4",
        metadata: {
          originalContentId: data.contentId,
          transformType: "sci_fi_autofix",
          optimization: "silence_trim,loudness_norm,aspect_fix",
        },
      },
    });

    // Make it public or get a signed URL (depending on policy)
    const [finalUrl] = await destFile.getSignedUrl({
      action: "read",
      expires: "03-01-2500", // Far future
    });

    await doc.ref.update({
      status: "completed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      processingLog: `Auto-Fixed: Silence Trimmed, Audio Normalized (-16LUFS)${shouldFixRatio ? ", 9:16 Blur-Fill Applied" : ""}`,
      wasOptimized: true,
      outputUrl: finalUrl,
    });

    // Update Content Document
    await db.collection("content").doc(data.contentId).set(
      {
        processedUrl: finalUrl,
        lastTransformAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { id: doc.id, success: true };
  } catch (e) {
    console.warn("[MediaTransform] Task Failed", e.message);
    await doc.ref.update({
      status: "failed",
      error: e.message,
      updatedAt: new Date().toISOString(),
    });
    return null;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch (cleanupErr) {
      console.error("Cleanup error", cleanupErr);
    }
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

const { db, admin } = require("../firebaseAdmin");
const ffmpeg = require("fluent-ffmpeg");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid"); // Ensure consistent uuid import

// Configure FFmpeg path (Ensure ffmpeg/ffprobe are installed in environment or docker image)
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
  const ffmpegPath = ffmpegInstaller.path;
  const ffprobePath = ffprobeInstaller.path;

  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`[MediaTransform] Using ffmpeg installer at ${ffmpegPath}`);
  }
  if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
    console.log(`[MediaTransform] Using ffprobe installer at ${ffprobePath}`);
  }
} catch (e) {
  console.warn(
    "[MediaTransform] @ffmpeg-installer/ffmpeg or @ffprobe-installer/ffprobe not found, relying on system PATH. ffprobe errors may occur.",
    e.message
  );
}

/**
 * "Sci-Fi" Media Transform Service
 * Automatically fixes "Retention Killers" (Silence, Bad Audio, Wrong Aspect Ratio)
 */
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

async function downloadSourceMedia(data, destinationPath) {
  if (data.sourceStoragePath) {
    try {
      const bucket = admin.storage().bucket();
      const remoteFile = bucket.file(data.sourceStoragePath);
      await new Promise((resolve, reject) => {
        const readStream = remoteFile.createReadStream();
        const writeStream = fs.createWriteStream(destinationPath);

        readStream.on("error", reject);
        writeStream.on("error", reject);
        writeStream.on("finish", resolve);
        readStream.pipe(writeStream);
      });

      return;
    } catch (error) {
      console.warn(
        `[MediaTransform] Storage download failed for ${data.contentId} (${data.sourceStoragePath}): ${error.message}`
      );
    }
  }

  const fetchFn = global.fetch || require("node-fetch");
  const res = await fetchFn(data.sourceUrl);
  if (!res.ok) throw new Error(`download_failed(${res.status})`);

  const fileStream = fs.createWriteStream(destinationPath);
  const body = res.body;
  if (!body) throw new Error("download_failed(no_body)");

  if (typeof body.pipe === "function") {
    await new Promise((resolve, reject) => {
      body.pipe(fileStream);
      body.on("error", reject);
      fileStream.on("finish", resolve);
    });
    return;
  }

  if (typeof body.getReader === "function") {
    const nodeStream = Readable.fromWeb(body);
    await new Promise((resolve, reject) => {
      nodeStream.pipe(fileStream);
      nodeStream.on("error", reject);
      fileStream.on("finish", resolve);
    });
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destinationPath, buffer);
}

async function enqueueMediaTransformTask({ contentId, uid, meta, url, sourceStoragePath }) {
  if (!contentId) throw new Error("contentId required");
  const ref = db.collection("promotion_tasks").doc();
  const baseTask = {
    type: "media_transform",
    status: "queued",
    contentId,
    uid,
    meta: meta || {},
    sourceUrl: url || null,
    sourceStoragePath: sourceStoragePath || extractStoragePathFromUrl(url) || null,
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

function escapeDrawtext(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\\\'")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

function normalizePlatformKey(platform) {
  const normalized = String(platform || "default").toLowerCase();
  if (normalized.startsWith("youtube")) return "youtube";
  if (normalized.startsWith("instagram")) return "instagram";
  if (normalized.startsWith("tiktok")) return "tiktok";
  return normalized || "default";
}

function wrapText(text, maxLineLength = 24, maxLines = 3) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "";

  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const usedWords = lines.join(" ").split(" ").filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[. ]+$/g, "")}...`;
  }
  return lines.join("\n");
}

function getHookStyle(platform) {
  const styles = {
    tiktok: {
      badge: "TIKTOK COMEBACK",
      footer: "sound on • watch the turn",
      coverColor: "0x06080F@0.96",
      accentColor: "0x00F2EA@0.95",
      bannerColor: "0x101820@0.52",
      accentText: "white",
    },
    instagram: {
      badge: "REELS REFRESH",
      footer: "watch the payoff",
      coverColor: "0x14070C@0.95",
      accentColor: "0xF77737@0.95",
      bannerColor: "0x1A0E14@0.5",
      accentText: "white",
    },
    youtube: {
      badge: "SHORTS RETRY",
      footer: "the setup matters here",
      coverColor: "0x120405@0.95",
      accentColor: "0xFF0033@0.95",
      bannerColor: "0x18090B@0.56",
      accentText: "white",
    },
    default: {
      badge: "SMART REPOST",
      footer: "watch this closely",
      coverColor: "0x081018@0.95",
      accentColor: "0xF5C451@0.95",
      bannerColor: "0x10151C@0.5",
      accentText: "white",
    },
  };
  return styles[normalizePlatformKey(platform)] || styles.default;
}

function escapeSubtitlePath(filePath) {
  const normalizedPath = path.resolve(String(filePath || "")).replace(/\\/g, "/");
  if (!normalizedPath || /[\u0000-\u001f\u007f]/.test(normalizedPath)) {
    return "";
  }
  return normalizedPath.replace(/[':,;\[\]]/g, "\\$&");
}

function msToSrtTimestamp(ms) {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3600000)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((total % 3600000) / 60000)
    .toString()
    .padStart(2, "0");
  const s = Math.floor((total % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const msPart = (total % 1000).toString().padStart(3, "0");
  return `${h}:${m}:${s},${msPart}`;
}

function buildSrtFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return "";
  return segments
    .map((segment, index) => {
      const startMs = Number(segment.start || 0) * 1000;
      const endMs = Math.max(Number(segment.end || 0) * 1000, startMs + 900);
      const text = wrapText(segment.text || "", 26, 2);
      return `${index + 1}\n${msToSrtTimestamp(startMs)} --> ${msToSrtTimestamp(endMs)}\n${text}\n`;
    })
    .join("\n");
}

async function prepareCaptionFile({ inputPath, contentId, taskId, tmpDir, enabled }) {
  if (enabled === false)
    return { subtitlePath: null, captionBurnedIn: false, transcriptionError: null };
  try {
    const { generateTranscription } = require("./captionsService");
    const transcription = await generateTranscription(inputPath);
    const srtText = buildSrtFromSegments(transcription && transcription.segments);
    if (!srtText) {
      return { subtitlePath: null, captionBurnedIn: false, transcriptionError: null };
    }
    const subtitlePath = path.join(tmpDir, `repost-captions-${contentId}-${taskId}.srt`);
    await fs.promises.writeFile(subtitlePath, srtText, "utf8");
    return { subtitlePath, captionBurnedIn: true, transcriptionError: null };
  } catch (error) {
    console.warn(`[MediaTransform] Burned captions skipped: ${error.message}`);
    return { subtitlePath: null, captionBurnedIn: false, transcriptionError: error.message };
  }
}

function buildSubtitleOverlayFilter(subtitlePath, platform) {
  if (!subtitlePath) return "";
  const platformKey = normalizePlatformKey(platform);
  const marginV = platformKey === "youtube" ? 180 : 140;
  const escapedPath = escapeSubtitlePath(subtitlePath);
  if (!escapedPath) return "";
  const forceStyle = [
    "FontName=DejaVu Sans",
    "FontSize=20",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    "Outline=2",
    "Shadow=0",
    "Alignment=2",
    `MarginV=${marginV}`,
  ].join(",");
  return `subtitles='${escapedPath}':force_style='${forceStyle}'`;
}

function buildHookOverlayFilter(hookText, platform, options = {}) {
  if (!hookText) return "";
  const style = getHookStyle(platform);
  const safeText = escapeDrawtext(wrapText(hookText, 20, 3)).slice(0, 140);
  const introSeconds = Number.isFinite(options.introSeconds)
    ? options.introSeconds.toFixed(1)
    : "3.0";
  const bannerEnd = Number.isFinite(options.bannerEndSeconds)
    ? options.bannerEndSeconds.toFixed(1)
    : "5.8";

  return [
    `drawbox=x=0:y=0:w=iw:h=ih:color=${style.coverColor}:t=fill:enable='between(t,0,${introSeconds})'`,
    `drawbox=x=iw*0.1:y=ih*0.14:w=iw*0.8:h=ih*0.012:color=${style.accentColor}:t=fill:enable='between(t,0,${introSeconds})'`,
    `drawtext=text='${escapeDrawtext(style.badge)}':fontcolor=${style.accentText}:fontsize=h*0.028:x=(w-text_w)/2:y=h*0.2:enable='between(t,0,${introSeconds})'`,
    `drawtext=text='${safeText}':fontcolor=white:fontsize=h*0.068:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2-h*0.03:shadowcolor=black@0.85:shadowx=4:shadowy=4:enable='between(t,0,${introSeconds})'`,
    `drawtext=text='${escapeDrawtext(style.footer)}':fontcolor=white@0.92:fontsize=h*0.03:x=(w-text_w)/2:y=h*0.72:enable='between(t,0,${introSeconds})'`,
    `drawbox=x=iw*0.05:y=ih*0.06:w=iw*0.9:h=ih*0.11:color=${style.bannerColor}:t=fill:enable='between(t,${introSeconds},${bannerEnd})'`,
    `drawbox=x=iw*0.07:y=ih*0.085:w=iw*0.015:h=ih*0.06:color=${style.accentColor}:t=fill:enable='between(t,${introSeconds},${bannerEnd})'`,
    `drawtext=text='${safeText}':fontcolor=white:fontsize=h*0.036:line_spacing=8:x=w*0.11:y=h*0.095:shadowcolor=black@0.75:shadowx=3:shadowy=3:enable='between(t,${introSeconds},${bannerEnd})'`,
  ].join(",");
}

function processMedia(inputFile, outputFile, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      trimSilence = true,
      normalizeAudio = true,
      fixAspectRatio = true,
      targetAspectRatio = 9 / 16, // Default to TikTok/Reels vertical
      viralMutation = false, // ENABLE THE COMEBACK: Randomly mutate content to bypass hash/duplicate detection
      hookText = "",
      subtitlePath = "",
      platform = "default",
      introSeconds = 3,
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

    const subtitleOverlayFilter = buildSubtitleOverlayFilter(subtitlePath, platform);
    if (subtitleOverlayFilter) {
      videoFilterChain = videoFilterChain
        ? `${videoFilterChain},${subtitleOverlayFilter}`
        : subtitleOverlayFilter;
    }

    const hookOverlayFilter = buildHookOverlayFilter(hookText, platform, { introSeconds });
    if (hookOverlayFilter) {
      videoFilterChain = videoFilterChain
        ? `${videoFilterChain},${hookOverlayFilter}`
        : hookOverlayFilter;
    }

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

async function processMediaTransformTaskDoc(doc) {
  const data = doc.data();

  await doc.ref.update({ status: "processing", updatedAt: new Date().toISOString() });

  const tmpDir = os.tmpdir();
  const tmpIn = path.join(tmpDir, `in-${data.contentId}.mp4`);
  const tmpOut = path.join(tmpDir, `out-${data.contentId}.mp4`);
  let subtitlePath = null;

  try {
    if (!data.sourceUrl) throw new Error("sourceUrl missing");

    // 1. Download source
    console.log(`[MediaTransform] Downloading ${data.contentId}...`);
    await downloadSourceMedia(data, tmpIn);

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
    const targetPlatform = normalizePlatformKey(
      data.meta?.targetPlatform ||
        (Array.isArray(data.meta?.postAfterTransform) ? data.meta.postAfterTransform[0] : "default")
    );
    const captionPrep = await prepareCaptionFile({
      inputPath: tmpIn,
      contentId: data.contentId,
      taskId: doc.id,
      tmpDir,
      enabled: data.meta?.enableBurnedCaptions !== false,
    });
    subtitlePath = captionPrep.subtitlePath;

    console.log(
      `[MediaTransform] Processing ${data.contentId} (FixRatio: ${shouldFixRatio}, Normalize: true, ViralMode: ${viralMode}, Platform: ${targetPlatform}, BurnedCaptions: ${captionPrep.captionBurnedIn})...`
    );

    // Apply "Comeback" Logic (Protcol 7 Mutation) if requested
    await processMedia(tmpIn, tmpOut, {
      trimSilence: true, // Always clean the hook
      normalizeAudio: true, // Always professional audio
      fixAspectRatio: shouldFixRatio, // Intelligent formatting
      viralMutation: viralMode, // Change DNA if this is a "Remix" attempt
      hookText: data.meta?.hookText || "",
      subtitlePath,
      platform: targetPlatform,
      introSeconds: Number(data.meta?.hookIntroSeconds || 3),
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

    const followUpPosts = [];
    if (Array.isArray(data.meta?.postAfterTransform) && data.meta.postAfterTransform.length > 0) {
      const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
      const basePayload =
        data.meta.nextPayload && typeof data.meta.nextPayload === "object"
          ? { ...data.meta.nextPayload }
          : {};
      const basePlatformOptions = {
        ...((basePayload && basePayload.platformOptions) || {}),
        ...((data.meta && data.meta.platformOptions) || {}),
      };

      for (const platform of data.meta.postAfterTransform) {
        try {
          const enqueueResult = await enqueuePlatformPostTask({
            contentId: data.contentId,
            uid: data.uid,
            platform,
            reason: data.meta.repostReason || "decay_repost",
            payload: {
              ...basePayload,
              message: data.meta.nextMessage || basePayload.message,
              mediaUrl: finalUrl,
              platformOptions: basePlatformOptions,
              repostMetadata: {
                ...((basePayload && basePayload.repostMetadata) || {}),
                ...((data.meta && data.meta.repostMetadata) || {}),
                transformed: true,
                transformTaskId: doc.id,
              },
            },
            skipIfDuplicate: true,
            forceRepost: true,
          });

          followUpPosts.push({
            platform,
            queued: !enqueueResult || enqueueResult.skipped !== true,
            result: enqueueResult || null,
          });
        } catch (followUpErr) {
          console.warn(
            `[MediaTransform] Follow-up repost queue failed for ${data.contentId}/${platform}: ${followUpErr.message}`
          );
          followUpPosts.push({
            platform,
            queued: false,
            error: followUpErr.message,
          });
        }
      }
    }

    await doc.ref.update({
      status: "completed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      processingLog: `Auto-Fixed: Silence Trimmed, Audio Normalized (-16LUFS)${shouldFixRatio ? ", 9:16 Blur-Fill Applied" : ""}${data.meta?.hookText ? ", Hook Overlay Applied" : ""}`,
      wasOptimized: true,
      outputUrl: finalUrl,
      followUpPosts,
      creativeProfile: data.meta?.creativeProfile || null,
      creativeHook: data.meta?.hookText || null,
      targetPlatform,
      captionsBurnedIn: captionPrep.captionBurnedIn,
      transcriptionError: captionPrep.transcriptionError || null,
    });

    const contentUpdate = {
      lastTransformAt: new Date().toISOString(),
    };

    if (data.meta?.previewOnly) {
      contentUpdate.repostPreview = {
        taskId: doc.id,
        outputUrl: finalUrl,
        status: "completed",
        profile: data.meta?.creativeProfile || "smart_repost_polish_v1",
        hookText: data.meta?.hookText || null,
        title: data.meta?.creativeTitle || null,
        description: data.meta?.creativeDescription || null,
        hashtags: Array.isArray(data.meta?.creativeHashtags) ? data.meta.creativeHashtags : [],
        caption: data.meta?.creativeCaption || null,
        previewLabel: data.meta?.creativePreviewLabel || null,
        creatorLine: data.meta?.creativeCreatorLine || null,
        targetPlatform,
        introSeconds: Number(data.meta?.hookIntroSeconds || 3),
        captionsBurnedIn: captionPrep.captionBurnedIn,
        updatedAt: new Date().toISOString(),
      };
    } else {
      contentUpdate.processedUrl = finalUrl;
      contentUpdate.repostCreative = data.meta?.hookText
        ? {
            profile: data.meta?.creativeProfile || "smart_repost_polish_v1",
            hookText: data.meta.hookText,
            title: data.meta?.creativeTitle || null,
            description: data.meta?.creativeDescription || null,
            hashtags: Array.isArray(data.meta?.creativeHashtags) ? data.meta.creativeHashtags : [],
            caption: data.meta?.creativeCaption || null,
            previewLabel: data.meta?.creativePreviewLabel || null,
            creatorLine: data.meta?.creativeCreatorLine || null,
            targetPlatform,
            introSeconds: Number(data.meta?.hookIntroSeconds || 3),
            captionsBurnedIn: captionPrep.captionBurnedIn,
            updatedAt: new Date().toISOString(),
          }
        : admin.firestore.FieldValue.delete();
    }

    await db.collection("content").doc(data.contentId).set(contentUpdate, { merge: true });

    return { id: doc.id, success: true };
  } catch (e) {
    console.warn("[MediaTransform] Task Failed", e.message);
    await doc.ref.update({
      status: "failed",
      error: e.message,
      updatedAt: new Date().toISOString(),
    });

    if (data.meta?.previewOnly) {
      await db
        .collection("content")
        .doc(data.contentId)
        .set(
          {
            repostPreview: {
              taskId: doc.id,
              status: "failed",
              error: e.message,
              profile: data.meta?.creativeProfile || "smart_repost_polish_v1",
              hookText: data.meta?.hookText || null,
              title: data.meta?.creativeTitle || null,
              description: data.meta?.creativeDescription || null,
              hashtags: Array.isArray(data.meta?.creativeHashtags)
                ? data.meta.creativeHashtags
                : [],
              caption: data.meta?.creativeCaption || null,
              previewLabel: data.meta?.creativePreviewLabel || null,
              creatorLine: data.meta?.creativeCreatorLine || null,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
    }
    return null;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      if (subtitlePath && fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath);
    } catch (cleanupErr) {
      console.error("Cleanup error", cleanupErr);
    }
  }
}

async function processNextMediaTransformTask() {
  const snap = await db
    .collection("promotion_tasks")
    .where("type", "==", "media_transform")
    .where("status", "in", ["queued"])
    .orderBy("createdAt")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return processMediaTransformTaskDoc(snap.docs[0]);
}

async function processMediaTransformTaskById(taskId) {
  if (!taskId) throw new Error("taskId required");
  const doc = await db.collection("promotion_tasks").doc(taskId).get();
  if (!doc.exists) throw new Error("task_not_found");
  const data = doc.data() || {};
  if (data.type !== "media_transform") throw new Error("invalid_task_type");
  if (data.status && !["queued", "processing"].includes(data.status)) {
    return { id: doc.id, skipped: true, status: data.status };
  }
  return processMediaTransformTaskDoc(doc);
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

module.exports = {
  enqueueMediaTransformTask,
  processNextMediaTransformTask,
  processMediaTransformTaskById,
  __testables: {
    buildSubtitleOverlayFilter,
    escapeSubtitlePath,
  },
};

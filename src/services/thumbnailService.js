/**
 * Thumbnail Service - Frame extraction, text overlay, platform-specific thumbnail generation
 * Uses FFmpeg for frame extraction and compositing.
 */
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const { admin, db: _db } = require("../firebaseAdmin");
const { Readable } = require("stream");
void _db;

// ---------------------------------------------------------------------------
// FFmpeg path setup (reuse existing installer paths if available)
// ---------------------------------------------------------------------------
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
  if (ffmpegInstaller.path) ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  if (ffprobeInstaller.path) ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (_e) {
  /* rely on system PATH */
}

// ---------------------------------------------------------------------------
// Platform thumbnail spec
// ---------------------------------------------------------------------------
const PLATFORM_THUMBNAIL_SPECS = {
  tiktok:    { width: 1080, height: 1920, label: "TikTok / Reels / Shorts", ratio: "9:16" },
  youtube:   { width: 1280, height: 720,  label: "YouTube Thumbnail",       ratio: "16:9" },
  instagram: { width: 1080, height: 1080, label: "Instagram Square",         ratio: "1:1" },
  facebook:  { width: 1200, height: 628,  label: "Facebook Link Post",       ratio: "1.91:1" },
  linkedin:  { width: 1200, height: 627,  label: "LinkedIn Post",            ratio: "1.91:1" },
  twitter:   { width: 1200, height: 675,  label: "Twitter Card",             ratio: "16:9" },
  snapchat:  { width: 1080, height: 1920, label: "Snapchat Story",           ratio: "9:16" },
  pinterest: { width: 1000, height: 1500, label: "Pinterest Pin",            ratio: "2:3" },
  reddit:    { width: 1200, height: 630,  label: "Reddit Link",              ratio: "1.91:1" },
};

// ---------------------------------------------------------------------------
// Colour presets by mood / category
// ---------------------------------------------------------------------------
const MOOD_PALETTES = {
  energetic:  { bg: "#FF4500", text: "#FFFFFF", accent: "#FFD700" },
  calm:       { bg: "#2E86AB", text: "#FFFFFF", accent: "#A23B72" },
  luxurious:  { bg: "#1A1A1A", text: "#D4AF37", accent: "#8B7355" },
  playful:    { bg: "#FF6B6B", text: "#FFFFFF", accent: "#4ECDC4" },
  mysterious: { bg: "#0D0221", text: "#00FF41", accent: "#FF00FF" },
  educational:{ bg: "#003049", text: "#FFFFFF", accent: "#FCBF49" },
  minimal:    { bg: "#FFFFFF", text: "#111111", accent: "#E63946" },
};

function paletteForCategory(category) {
  const map = {
    fitness: "energetic", music: "energetic", sports: "energetic",
    gaming: "mysterious", tech: "educational", crypto: "mysterious",
    fashion: "luxurious", beauty: "luxurious", lifestyle: "playful",
    cooking: "playful", travel: "calm", nature: "calm",
    finance: "educational", business: "educational",
  };
  return MOOD_PALETTES[map[category] || "energetic"];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Download video to a temp file, returns local path */
async function downloadToTemp(videoUrl) {
  const tmpDir = os.tmpdir();
  const ext = ".mp4";
  const tmpPath = path.join(tmpDir, `thumb-${uuidv4()}${ext}`);

  // Firebase Storage URL?
  const storagePath = extractStoragePathFromUrl(videoUrl);
  if (storagePath) {
    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      await new Promise((resolve, reject) => {
        file.createReadStream()
          .on("error", reject)
          .pipe(fs.createWriteStream(tmpPath))
          .on("error", reject)
          .on("finish", resolve);
      });
      return tmpPath;
    } catch (_e) {
      /* fall through to HTTP download */
    }
  }

  // HTTP download
  const fetchFn = global.fetch || require("node-fetch");
  const res = await fetchFn(videoUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}

function extractStoragePathFromUrl(url) {
  try {
    const { extractOwnedStoragePathFromUrl } = require("../utils/cleanupSource");
    return extractOwnedStoragePathFromUrl(url);
  } catch (_e) {
    return null;
  }
}

/** Probe video duration (seconds) */
function probeDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Extract candidate frames from a video.
 * @param {string}  videoUrl   - URL or Firebase Storage path
 * @param {object}  [opts]
 * @param {number}  [opts.count=5]      - How many frames to extract
 * @param {string}  [opts.strategy="smart"] - "smart" | "uniform" | "beginning" | "middle" | "end"
 * @returns {Promise<{frames: Array<{time:number, dataUrl:string, width:number, height:number}>, duration:number}>}
 */
async function extractFrames(videoUrl, opts = {}) {
  const count = Math.min(opts.count || 5, 12);
  const strategy = opts.strategy || "smart";
  const videoPath = await downloadToTemp(videoUrl);
  const duration = await probeDuration(videoPath);

  // Compute extraction timestamps
  let timestamps;
  switch (strategy) {
    case "beginning":
      timestamps = Array.from({ length: count }, (_, i) => (duration * (i + 1)) / (count + 1) * 0.3);
      break;
    case "middle":
      timestamps = Array.from({ length: count }, (_, i) => duration * 0.35 + (duration * 0.3 * (i + 1)) / (count + 1));
      break;
    case "end":
      timestamps = Array.from({ length: count }, (_, i) => duration * 0.7 + (duration * 0.25 * (i + 1)) / (count + 1));
      break;
    case "uniform":
      timestamps = Array.from({ length: count }, (_, i) => (duration * (i + 1)) / (count + 1));
      break;
    case "smart":
    default: {
      // "Smart" – grab: start, 25%, 50%, 75%, and a few near the "golden ratio" points
      const base = [1, duration * 0.25, duration * 0.5, duration * 0.75, duration - 2];
      // Add a few extras around the 30-60 % zone (where faces usually appear)
      if (count > 5) {
        for (let i = 0; i < count - 5; i++) {
          base.push(duration * (0.3 + (0.3 * i) / (count - 5)));
        }
      }
      timestamps = base.filter(t => t > 0 && t < duration - 0.5).slice(0, count);
      break;
    }
  }

  // Extract frames as base64 JPEGs
  const frames = await Promise.all(
    timestamps.map(async (t) => {
      const framePath = path.join(os.tmpdir(), `thumb-frame-${uuidv4()}.jpg`);
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(t)
          .frames(1)
          .size("640x?") // Keep proportional; quality is enough for thumbnails
          .outputOptions(["-q:v", "3"])
          .output(framePath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      const buf = fs.readFileSync(framePath);
      const b64 = buf.toString("base64");
      fs.unlinkSync(framePath); // Clean up
      return {
        time: Math.round(t * 10) / 10,
        dataUrl: `data:image/jpeg;base64,${b64}`,
        width: 640,
        height: Math.round(640 / (16 / 9)), // Approximate
      };
    })
  );

  // Clean up temp video
  try { fs.unlinkSync(videoPath); } catch (_e) {}

  return { frames, duration: Math.round(duration * 10) / 10 };
}

/**
 * Generate a finished thumbnail with text overlay.
 * @param {string} videoUrl
 * @param {object} opts
 * @param {number} [opts.time]         - Timestamp in seconds for the base frame
 * @param {string} [opts.platform]     - "tiktok" | "youtube" | "instagram" | etc.
 * @param {string} [opts.headline]     - Headline text (e.g. "SHOCKING MOMENT!")
 * @param {string} [opts.subtitle]     - Smaller sub-text
 * @param {string} [opts.mood]         - "energetic" | "calm" | etc.
 * @param {string} [opts.textColor]    - Override headline colour
 * @param {string} [opts.bgColor]      - Override background colour
 * @param {boolean} [opts.showBrand]   - Add brand watermark
 * @returns {Promise<{dataUrl:string, width:number, height:number}>}
 */
async function generateThumbnail(videoUrl, opts = {}) {
  const {
    time = 1,
    platform = "tiktok",
    headline = "",
    subtitle = "",
    mood = "energetic",
    textColor,
    bgColor,
    showBrand = true,
  } = opts;

  const spec = PLATFORM_THUMBNAIL_SPECS[platform] || PLATFORM_THUMBNAIL_SPECS.tiktok;
  const palette = textColor && bgColor
    ? { bg: bgColor, text: textColor, accent: textColor }
    : MOOD_PALETTES[mood] || MOOD_PALETTES.energetic;

  const videoPath = await downloadToTemp(videoUrl);
  const framePath = path.join(os.tmpdir(), `thumb-gen-frame-${uuidv4()}.jpg`);
  const outputPath = path.join(os.tmpdir(), `thumb-gen-out-${uuidv4()}.png`);

  // 1. Extract the base frame at requested timestamp, scaled to platform size
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(time)
      .frames(1)
      .size(`${spec.width}x${spec.height}`)
      .outputOptions(["-q:v", "2"])
      .output(framePath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  // 2. Build FFmpeg drawtext filter chain for text overlays
  const filters = [];
  let filterChain = "";

  if (headline) {
    const fontSize = Math.round(spec.width * 0.065);
    const shadowColor = palette.bg === "#FFFFFF" ? "black@0.5" : "black@0.7";
    const escapedHeadline = headline
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "'\\\\\\''");

    // Headline at the bottom third
    filterChain += `drawtext=text='${escapedHeadline}':` +
      `fontcolor=${palette.text}:fontsize=${fontSize}:` +
      `x=(w-text_w)/2:y=h*0.72-text_h/2:` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
      `shadowcolor=${shadowColor}:shadowx=3:shadowy=3:` +
      `box=1:boxcolor=${palette.bg}@0.7:boxborderw=15`;

    if (subtitle) {
      filterChain += ",";
    }
  }

  if (subtitle) {
    const subFontSize = Math.round(spec.width * 0.035);
    const escapedSub = subtitle
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "'\\\\\\''");

    filterChain += `drawtext=text='${escapedSub}':` +
      `fontcolor=${palette.accent}:fontsize=${subFontSize}:` +
      `x=(w-text_w)/2:y=h*0.85-text_h/2:` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:` +
      `box=1:boxcolor=black@0.5:boxborderw=8`;
  }

  if (showBrand) {
    const brandFontSize = Math.round(spec.width * 0.025);
    filterChain += (filterChain ? "," : "") +
      `drawtext=text='AutoPromote':` +
      `fontcolor=white@0.6:fontsize=${brandFontSize}:` +
      `x=w-text_w-20:y=20:` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`;
  }

  // 3. Apply filters
  if (filterChain) {
    await new Promise((resolve, reject) => {
      ffmpeg(framePath)
        .videoFilters(filterChain)
        .output(outputPath)
        .on("end", resolve)
        .on("error", (err, _stdout, stderr) => {
          // If font is not found, fall back to sans-serif / default
          console.warn("[thumbnail] drawtext may have failed, falling back to base frame", stderr?.slice(0, 200));
          // Just copy the base frame as output
          fs.copyFileSync(framePath, outputPath);
          resolve();
        })
        .run();
    });
  } else {
    // No text, just use the frame as-is
    fs.copyFileSync(framePath, outputPath);
  }

  // 4. Read output and encode as base64
  const outBuf = fs.readFileSync(outputPath);
  const b64 = outBuf.toString("base64");

  // Cleanup
  try { fs.unlinkSync(videoPath); } catch (_e) {}
  try { fs.unlinkSync(framePath); } catch (_e) {}
  try { fs.unlinkSync(outputPath); } catch (_e) {}

  return {
    dataUrl: `data:image/png;base64,${b64}`,
    width: spec.width,
    height: spec.height,
    platform,
    spec: PLATFORM_THUMBNAIL_SPECS[platform],
  };
}

/**
 * Upload a base64 image to Firebase Storage and return the public URL.
 */
async function uploadThumbnailToStorage(userId, contentId, dataUrl, platform) {
  const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!matches) throw new Error("Invalid data URL");

  const ext = matches[1] === "png" ? "png" : "jpg";
  const buffer = Buffer.from(matches[2], "base64");
  const storagePath = `thumbnails/${userId}/${contentId}_${platform}_${Date.now()}.${ext}`;
  const bucket = admin.storage().bucket();
  const token = uuidv4();

  await bucket.file(storagePath).save(buffer, {
    resumable: false,
    contentType: `image/${ext}`,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        ownerUid: String(userId),
      },
    },
  });

  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${encodeURIComponent(token)}`;
}

/**
 * Generate platform-specific thumbnails for a content item.
 * Extracts one frame, then resizes+overlays for each platform.
 */
async function generateAllPlatformThumbnails(videoUrl, opts = {}) {
  const platforms = opts.platforms || ["tiktok", "youtube", "instagram"];
  const mood = opts.mood || "energetic";

  const results = {};
  for (const platform of platforms) {
    const spec = PLATFORM_THUMBNAIL_SPECS[platform];
    if (!spec) continue;
    results[platform] = await generateThumbnail(videoUrl, { ...opts, platform, mood });
  }

  return {
    thumbnails: results,
    platforms: Object.keys(results),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  extractFrames,
  generateThumbnail,
  generateAllPlatformThumbnails,
  uploadThumbnailToStorage,
  PLATFORM_THUMBNAIL_SPECS,
  paletteForCategory,
  MOOD_PALETTES,
};

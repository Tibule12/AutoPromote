const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const util = require("util");

const router = express.Router();
const upload = multer({ dest: "uploads/", limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit

const unlinkAsync = util.promisify(fs.unlink);

function safeUnlink(path) {
  try {
    if (fs.existsSync(path)) fs.unlinkSync(path);
  } catch {}
}

function analyzeMetadata(metadata) {
  const videoStream = metadata.streams.find(s => s.codec_type === "video");
  const audioStream = metadata.streams.find(s => s.codec_type === "audio");
  const width = videoStream ? videoStream.width : 0;
  const height = videoStream ? videoStream.height : 0;
  const videoBitrate = videoStream ? videoStream.bit_rate : 0;
  const audioBitrate = audioStream ? audioStream.bit_rate : 0;
  const feedback = [];
  let needsEnhancement = false;

  if (width < 1280 || height < 720) {
    feedback.push(`Resolution too low: ${width}x${height}. Recommended: 1280x720 or higher.`);
    needsEnhancement = true;
  }
  if (videoBitrate < 1000000) {
    feedback.push(`Video bitrate too low: ${videoBitrate}. Recommended: 1,000,000 or higher.`);
    needsEnhancement = true;
  }
  if (audioBitrate < 64000) {
    feedback.push(`Audio bitrate too low: ${audioBitrate}. Recommended: 64,000 or higher.`);
    needsEnhancement = true;
  }
  return { feedback, needsEnhancement, width, height, videoBitrate, audioBitrate };
}

// Accept JSON preview requests for preview:// URLs (used by frontend preview flow)
router.post("/quality-check", express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.url && typeof body.url === "string" && body.url.startsWith("preview://")) {
      // Preview: no real file available to analyze; return a conservative OK result
      return res.json({
        qualityScore: 100,
        feedback: ["Preview content - automated quality checks are skipped for preview."],
        enhanced: false,
      });
    }
  } catch (e) {
    // fall through to multipart handler
  }
  // If not a JSON preview request, defer to the multipart handler
  return res.status(400).json({ error: "No preview url provided" });
});

router.post("/quality-check", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  // Sanity check: ensure the resolved file path is inside the configured uploads directory
  try {
    const uploadsBase = require("path").resolve(process.cwd(), "uploads");
    const resolved = require("path").resolve(filePath);
    if (!resolved.startsWith(uploadsBase)) {
      safeUnlink(resolved);
      return res.status(400).json({ error: "invalid_file_path" });
    }
  } catch (_) {
    // If path checks fail for any reason, avoid continuing with the operation
    try {
      safeUnlink(filePath);
    } catch (_) {}
    return res.status(400).json({ error: "invalid_file_path" });
  }
  try {
    // Analyze original file
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
    });

    const { feedback, needsEnhancement, width, height, videoBitrate, audioBitrate } =
      analyzeMetadata(metadata);

    if (needsEnhancement) {
      const enhancedPath = filePath + "_enhanced.mp4";
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .videoCodec("libx264")
          .size("1280x720")
          .videoBitrate("1500k")
          .audioBitrate("128k")
          .output(enhancedPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      safeUnlink(filePath);

      // Analyze enhanced file
      try {
        const enhMetadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(enhancedPath, (err, data) => (err ? reject(err) : resolve(data)));
        });
        const enh = analyzeMetadata(enhMetadata);
        const qualityScore = enh.feedback.length === 0 ? 100 : 75;
        safeUnlink(enhancedPath);
        return res.json({
          qualityScore,
          feedback: enh.feedback.length
            ? enh.feedback
            : ["Content meets quality standards after enhancement."],
          enhanced: true,
        });
      } catch (enhErr) {
        safeUnlink(enhancedPath);
        return res.json({
          error: "Enhanced file analysis failed",
          qualityScore: 0,
          feedback: [...feedback, "Could not analyze enhanced file."],
          enhanced: false,
        });
      }
    } else {
      safeUnlink(filePath);
      return res.json({
        qualityScore: 100,
        feedback: feedback.length ? feedback : ["Content meets quality standards."],
        enhanced: false,
      });
    }
  } catch (err) {
    safeUnlink(filePath);
    return res.json({
      error: "FFmpeg analysis failed",
      qualityScore: 0,
      feedback: ["Could not analyze file. Upload allowed with warning."],
      enhanced: false,
    });
  }
});

module.exports = router;

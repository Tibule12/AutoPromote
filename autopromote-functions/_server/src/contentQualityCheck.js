const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const util = require("util");
const { checkTextForSafety, checkFileForSafety } = require("./services/contentModerationService");

const router = express.Router();
const upload = multer({ dest: "uploads/", limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit

// Reserved for async removal helper; kept for future use
/* eslint-disable-next-line no-unused-vars -- reserved for potential async unlink usage in future */
const _unlinkAsync = util.promisify(fs.unlink);

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
  let feedback = [];
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

// Accept JSON preview requests (or text-only checks)
router.post("/quality-check", express.json(), async (req, res, next) => {
  try {
    const body = req.body || {};
    
    // Check text safety regardless of file
    const textToScan = [body.title, body.description].filter(Boolean).join(" ");
    let textModeration = { safe: true, flags: [] };
    if (textToScan) {
      const { checkTextForSafety } = require("./services/contentModerationService");
      textModeration = checkTextForSafety(textToScan);
    }

    if (body.url && typeof body.url === "string" && body.url.startsWith("preview://")) {
      // Preview: no real file available to analyze; return a conservative OK result
      const flags = [...textModeration.flags];
      return res.json({
        qualityScore: flags.length > 0 ? 0 : 100,
        feedback: [
          "Preview content - automated file quality checks are skipped for preview.",
          ...(flags.length > 0 ? [`⚠️ Content Flagged: ${flags.join(", ")}`] : [])
        ],
        enhanced: false,
        moderation: {
            safe: flags.length === 0,
            flags
        }
      });
    }
    
    // If just text check (no file, no preview url)
    if (textToScan && !body.url && !req.headers["content-type"]?.includes("multipart")) {
         return res.json({
            qualityScore: textModeration.safe ? 100 : 0,
            feedback: textModeration.flags.length > 0 ? [`⚠️ Content Flagged: ${textModeration.flags.join(", ")}`] : ["Text content looks safe."],
            enhanced: false,
            moderation: textModeration
        });
    }
  } catch (e) {
    // fall through to multipart handler
  }
  // If not a JSON preview request, defer to the multipart handler
  if (!req.headers["content-type"]?.includes("multipart")) {
      return res.status(400).json({ error: "No preview url or file provided" });
  }
  next(); // Pass to next router
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

    const { feedback, needsEnhancement } = analyzeMetadata(metadata);

    // Perform Content Moderation (Safety Check)
    const textSafety = checkTextForSafety(
      [req.body.title, req.body.description].filter(Boolean).join(" ")
    );
    const fileSafety = await checkFileForSafety(filePath);

    const moderation = {
      safe: textSafety.safe && fileSafety.safe,
      flags: [...textSafety.flags, ...(fileSafety.reason ? [fileSafety.reason] : [])],
    };

    if (!moderation.safe) {
      feedback.push(`⚠️ Content Flagged: ${moderation.flags.join(", ")}`);
    }

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

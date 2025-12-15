const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/api/content/quality-check", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  // Validate file path to prevent path injection
  const filePath = req.file.path;
  if (typeof filePath !== "string" || filePath.includes("..") || !filePath.startsWith("uploads/")) {
    return res.status(400).json({ error: "Invalid file path" });
  }
  ffmpeg.ffprobe(filePath, (err, metadata) => {
    if (err) {
      console.error("FFmpeg analysis failed:", err);
      fs.unlinkSync(filePath);
      return res.json({
        error: "FFmpeg analysis failed",
        qualityScore: 0,
        feedback: ["Could not analyze file. Upload allowed with warning."],
        enhanced: false,
      });
    }

    const videoStream = metadata.streams.find(s => s.codec_type === "video");
    const audioStream = metadata.streams.find(s => s.codec_type === "audio");
    const width = videoStream ? videoStream.width : 0;
    const height = videoStream ? videoStream.height : 0;
    const videoBitrate = videoStream ? videoStream.bit_rate : 0;
    const audioBitrate = audioStream ? audioStream.bit_rate : 0;
    const duration = metadata.format.duration;

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

    // If enhancement is needed, attempt to upscale using FFmpeg
    if (needsEnhancement) {
      const enhancedPath = filePath + "_enhanced.mp4";
      ffmpeg(filePath)
        .videoCodec("libx264")
        .size("1280x720")
        .videoBitrate("1500k")
        .audioBitrate("128k")
        .output(enhancedPath)
        .on("end", () => {
          fs.unlinkSync(filePath);
          return res.json({
            resolution: `${width}x${height}`,
            videoBitrate,
            audioBitrate,
            duration,
            format: metadata.format.format_name,
            qualityScore: 0,
            feedback,
            enhanced: true,
            enhancedFile: enhancedPath, // You may want to upload this to storage and return a URL
          });
        })
        .on("error", err => {
          console.error("Enhancement failed:", err);
          fs.unlinkSync(filePath);
          // Allow upload with warnings if enhancement fails
          return res.json({
            resolution: `${width}x${height}`,
            videoBitrate,
            audioBitrate,
            duration,
            format: metadata.format.format_name,
            qualityScore: 0,
            feedback: [...feedback, "Enhancement failed: " + err.message],
            enhanced: false,
          });
        })
        .run();
    } else {
      fs.unlinkSync(filePath);
      return res.json({
        resolution: `${width}x${height}`,
        videoBitrate,
        audioBitrate,
        duration,
        format: metadata.format.format_name,
        qualityScore: 1,
        feedback,
        enhanced: false,
      });
    }
  });
});

module.exports = router;

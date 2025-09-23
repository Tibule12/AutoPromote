const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const util = require('util');

const router = express.Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit

const unlinkAsync = util.promisify(fs.unlink);

function safeUnlink(path) {
  try { if (fs.existsSync(path)) fs.unlinkSync(path); } catch {}
}

function analyzeMetadata(metadata) {
  const videoStream = metadata.streams.find(s => s.codec_type === 'video');
  const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
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

router.post('/quality-check', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  try {
    // Analyze original file
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => err ? reject(err) : resolve(data));
    });

    const { feedback, needsEnhancement, width, height, videoBitrate, audioBitrate } = analyzeMetadata(metadata);

    if (needsEnhancement) {
      const enhancedPath = filePath + '_enhanced.mp4';
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .videoCodec('libx264')
          .size('1280x720')
          .videoBitrate('1500k')
          .audioBitrate('128k')
          .output(enhancedPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      safeUnlink(filePath);

      // Analyze enhanced file
      try {
        const enhMetadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(enhancedPath, (err, data) => err ? reject(err) : resolve(data));
        });
        const enh = analyzeMetadata(enhMetadata);
        const qualityScore = enh.feedback.length === 0 ? 100 : 75;
        safeUnlink(enhancedPath);
        return res.json({
          qualityScore,
          feedback: enh.feedback.length ? enh.feedback : ['Content meets quality standards after enhancement.'],
          enhanced: true
        });
      } catch (enhErr) {
        safeUnlink(enhancedPath);
        return res.json({
          error: 'Enhanced file analysis failed',
          qualityScore: 0,
          feedback: [...feedback, 'Could not analyze enhanced file.'],
          enhanced: false
        });
      }
    } else {
      safeUnlink(filePath);
      return res.json({
        qualityScore: 100,
        feedback: feedback.length ? feedback : ['Content meets quality standards.'],
        enhanced: false
      });
    }
  } catch (err) {
    safeUnlink(filePath);
    return res.json({
      error: 'FFmpeg analysis failed',
      qualityScore: 0,
      feedback: ['Could not analyze file. Upload allowed with warning.'],
      enhanced: false
    });
  }
});

module.exports = router;
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/api/content/quality-check', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  ffmpeg.ffprobe(filePath, (err, metadata) => {
    if (err) {
      console.error('FFmpeg analysis failed:', err);
      fs.unlinkSync(filePath);
      return res.json({
        error: 'FFmpeg analysis failed',
        qualityScore: 0,
        feedback: ['Could not analyze file. Upload allowed with warning.'],
        enhanced: false
      });
    }

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
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
      const enhancedPath = filePath + '_enhanced.mp4';
      ffmpeg(filePath)
        .videoCodec('libx264')
        .size('1280x720')
        .videoBitrate('1500k')
        .audioBitrate('128k')
        .output(enhancedPath)
        .on('end', () => {
          fs.unlinkSync(filePath);
          return res.json({
            qualityScore: 50,
            feedback,
            enhanced: true,
            enhancedPath
          });
        })
        .on('error', (err) => {
          fs.unlinkSync(filePath);
          return res.json({
            error: 'Enhancement failed',
            qualityScore: 0,
            feedback: [...feedback, 'Enhancement failed. Upload allowed with warning.'],
            enhanced: false
          });
        })
        .run();
      return;
    }

    fs.unlinkSync(filePath);
    res.json({
      qualityScore: 100,
      feedback: feedback.length ? feedback : ['Content meets quality standards.'],
      enhanced: false
    });
  });
});

module.exports = router;

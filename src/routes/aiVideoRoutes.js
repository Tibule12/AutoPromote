const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const axios = require("axios");
const { createClient } = require("pexels");
const authMiddleware = require("../authMiddleware");
const MEDIA_WORKER_URL = process.env.MEDIA_WORKER_URL || "http://localhost:8000";

const pexels = process.env.PEXELS_API_KEY ? createClient(process.env.PEXELS_API_KEY) : null;

// Helper to find stock footage
async function findStockVideo(query) {
  if (!pexels) {
    console.warn("PEXELS_API_KEY missing. Using fallback video.");
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  }
  try {
    const result = await pexels.videos.search({ query, per_page: 1, orientation: "portrait" });
    if (result.videos && result.videos.length > 0) {
      // Find best quality file
      const file =
        result.videos[0].video_files.find(f => f.height >= 720 && f.height <= 1080) ||
        result.videos[0].video_files[0];
      return file.link;
    }
  } catch (e) {
    console.error("Pexels error:", e.message);
    // Fallback on error too
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  }
  return null;
}

router.use(authMiddleware);

router.post("/generate", async (req, res) => {
  try {
    const { topic, scenes } = req.body;
    console.log(`[IdeaVideo] Generating for topic: ${topic} (${scenes.length} scenes)`);

    // 1. Enrich Scenes with Video URLs (Pexels)
    const enrichedScenes = [];
    for (const text of scenes) {
      // Extract keyword (simple approach: first 2 words or use topic)
      // Real implementation: Use NLP keyword extraction
      const keywords = topic.split(" ").slice(0, 2).join(" "); // Fallback
      // Or try to infer from sentence
      const searchQ = text.length > 20 ? keywords : text;

      const videoUrl =
        (await findStockVideo(searchQ + " " + topic)) ||
        (await findStockVideo("abstract background"));

      if (videoUrl) {
        enrichedScenes.push({ text, video_url: videoUrl });
      } else {
        console.warn(`No video found for scene: ${text}`);
        // Fallback to generic url or skip
      }
    }

    if (enrichedScenes.length === 0)
      return res.status(400).json({ error: "Could not find stock footage." });

    // Removed explicit blocking mock for missing PEXELS_API_KEY to allow Python worker to run with fallback assets
    // If PEXELS_API_KEY is missing, findStockVideo provided fallback URLs.

    // 2. Call Python Worker - Requesting Stream
    // Using responseType: 'stream' to pipe directly to client
    const response = await axios({
      method: "post",
      url: `${MEDIA_WORKER_URL}/render-idea-video`,
      data: {
        scenes: enrichedScenes,
        music_file: "upbeat.mp3",
      },
      responseType: "stream",
      timeout: 600000, // 10 min timeout
    });

    // Set video headers
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="generated_video.mp4"');

    // Pipe directly to client response
    response.data.pipe(res);
  } catch (error) {
    console.error("Idea Generation Failed:", error.message);
    // If headers already sent (streaming started), we can't send json error
    if (!res.headersSent) {
      res.status(500).json({ error: "Generation failed: " + error.message });
    }
  }
});

module.exports = router;

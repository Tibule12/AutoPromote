const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const {
  searchTracks,
  getTracksBatch,
  createPlaylist,
  postToSpotify,
  addTracksToPlaylist,
} = require("../services/spotifyService");
const { createSpotifyCampaign } = require("../services/communityEngine");

// GET /search?q=query
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user.uid;
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Query required" });

    const results = await searchTracks({ uid, query: q });
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /batch-metrics
router.post("/batch-metrics", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user.uid;
    const { trackIds } = req.body;
    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({ error: "trackIds array required" });
    }

    const metrics = await getTracksBatch({ uid, trackIds });
    res.json({ success: true, metrics });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /campaigns
router.post("/campaigns", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user.uid;
    const { playlistId, brandName, rewardPerStream } = req.body;

    // In a real app, verify user is a Brand Account here
    // const user = await db.collection('users').doc(uid).get();
    // if (!user.data().isBrand) return res.status(403).json({ error: "Brands only" });

    const campaign = createSpotifyCampaign({
      brandName: brandName || "Self-Sponsored",
      playlistId,
      rewardPerStream: rewardPerStream || 0.05,
    });

    // Save to DB
    await db
      .collection("campaigns")
      .doc(campaign.campaignId)
      .set({
        ...campaign,
        creatorId: uid,
      });

    res.json({ success: true, campaign });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /publish (Create Playlist or Add to one)
router.post("/publish", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user.uid;
    const { contentId, payload } = req.body;

    const result = await postToSpotify({
      uid,
      contentId,
      payload,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

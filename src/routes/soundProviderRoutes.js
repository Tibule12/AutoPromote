const express = require("express");
const router = express.Router();
const { importFromProvider } = require("../services/soundService");

// dynamic provider map
const providers = {
  spotify: require("../services/providers/spotifyProvider"),
  tiktok: require("../services/providers/tiktokProvider"),
};

// POST /api/sounds/import-provider
// { provider: 'spotify'|'tiktok', options: { limit } }
router.post("/import-provider", async (req, res) => {
  try {
    // TODO: admin-only check
    const db = require("../firebaseAdmin").db;
    const { provider, options = {} } = req.body;
    if (!provider || !providers[provider])
      return res.status(400).json({ error: "provider required and must be supported" });
    const adapter = providers[provider];
    const feed = await adapter.fetchTrending(options);
    const added = await importFromProvider(db, provider, feed);
    res.json({ success: true, addedCount: added.length });
  } catch (err) {
    console.error("[soundProviderRoutes] import-provider error", err);
    res.status(500).json({ error: err.message || "import failed" });
  }
});

module.exports = router;

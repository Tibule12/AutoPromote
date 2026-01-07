const express = require("express");
const router = express.Router();
const { listSounds, importFromProvider } = require("../services/soundService");

// GET /api/sounds
router.get("/", async (req, res) => {
  try {
    const db = require("../firebaseAdmin").db;
    const filter = req.query.filter || "all";
    const q = req.query.q || undefined;
    const limit = parseInt(req.query.limit || "20", 10);
    const results = await listSounds(db, { filter, q, limit });
    res.json({ success: true, sounds: results });
  } catch (err) {
    console.error("[soundRoutes] list error", err);
    res.status(500).json({ error: err.message || "Failed to list sounds" });
  }
});

// POST /api/sounds/import (admin only)
router.post("/import", async (req, res) => {
  try {
    const db = require("../firebaseAdmin").db;
    const { providerName, feed } = req.body;
    if (!providerName || !Array.isArray(feed))
      return res.status(400).json({ error: "providerName and feed are required" });
    // TODO: auth check for admin
    const added = await importFromProvider(db, providerName, feed);
    res.json({ success: true, addedCount: added.length });
  } catch (err) {
    console.error("[soundRoutes] import error", err);
    res.status(500).json({ error: err.message || "Import failed" });
  }
});

module.exports = router;

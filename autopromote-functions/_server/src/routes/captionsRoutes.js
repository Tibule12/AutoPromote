const express = require("express");
const router = express.Router();
const { createCaptions } = require("../services/captionsService");
const { db } = require("../firebaseAdmin");
const { audit } = require("../services/auditLogger");

// POST /api/content/:id/captions
router.post("/content/:id/captions", async (req, res) => {
  const userId = req.user && req.user.uid;
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  const { transcript, format, burnIn } = req.body || {};
  try {
    const result = await createCaptions({
      contentId: req.params.id,
      userId,
      transcript,
      format,
      burnIn,
    });
    audit.log("captions.created", {
      userId,
      contentId: req.params.id,
      format: result.format,
      burnIn: !!burnIn,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/content/:id/captions
router.get("/content/:id/captions", async (req, res) => {
  const userId = req.user && req.user.uid;
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  try {
    const contentRef = db.collection("content").doc(req.params.id);
    const snap = await contentRef.get();
    if (!snap.exists) return res.status(404).json({ error: "not_found" });
    const data = snap.data();
    if (data.user_id && data.user_id !== userId)
      return res.status(403).json({ error: "forbidden" });
    res.json({ captions: data.captions || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET raw caption text: /api/content/:id/captions/raw?format=srt|vtt
router.get("/content/:id/captions/raw", async (req, res) => {
  const userId = req.user && req.user.uid;
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  const fmtReq = (req.query.format || "srt").toLowerCase();
  try {
    const contentRef = db.collection("content").doc(id);
    const snap = await contentRef.get();
    if (!snap.exists) return res.status(404).json({ error: "not_found" });
    const data = snap.data();
    if (data.user_id && data.user_id !== userId)
      return res.status(403).json({ error: "forbidden" });
    if (!data.captions || !data.captions.assetId)
      return res.status(404).json({ error: "no_captions" });
    const assetSnap = await contentRef.collection("assets").doc(data.captions.assetId).get();
    if (!assetSnap.exists) return res.status(404).json({ error: "asset_missing" });
    const asset = assetSnap.data();
    let body = null;
    let contentType = "text/plain";
    if (fmtReq === "vtt" && asset.vtt) {
      body = asset.vtt;
      contentType = "text/vtt";
    } else if (asset.srt) {
      body = asset.srt;
      contentType = "application/x-subrip";
    }
    if (!body) return res.status(404).json({ error: "format_unavailable" });
    res.setHeader("Content-Type", contentType + "; charset=utf-8");
    audit.log("captions.downloaded", { userId, contentId: id, format: fmtReq });
    return res.send(body);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;

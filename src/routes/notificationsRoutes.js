const express = require("express");
const { db } = require("../firebaseAdmin");
let authMiddleware;
try {
  authMiddleware = require("../authMiddleware");
} catch (_) {
  authMiddleware = (req, res, next) => next();
}
const { audit } = require("../services/auditLogger");
const router = express.Router();

// GET /api/notifications - list recent notifications for authenticated user
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ ok: false, error: "auth_required" });
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

    // Use a short per-process cache to reduce Firestore reads for frequent polls
    const { getCache, setCache, withCache } = require("../utils/simpleCache");
    const crypto = require("crypto");
    const cacheKey = `notifications_${req.userId}_${limit}`;

    // Reduced cache time to 1s to allow "Read All" to reflect quickly
    const result = await withCache(cacheKey, 1000, async () => {
      const q = db
        .collection("notifications")
        .where("user_id", "==", req.userId)
        .orderBy("created_at", "desc")
        .limit(limit);
      const snap = await q.get();
      const out = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Compute an ETag from the payload to support conditional GETs
      const etag = crypto.createHash("md5").update(JSON.stringify(out)).digest("hex");
      return { out, etag };
    });

    const incomingEtag =
      req.headers && (req.headers["if-none-match"] || req.headers["If-None-Match"]);
    if (incomingEtag && incomingEtag === result.etag) {
      res.status(304).end();
      return;
    }

    // Return ETag header and payload
    res.setHeader("ETag", result.etag);
    return res.json({ ok: true, notifications: result.out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/notifications/:id/read - mark single notification read
router.post("/:id/read", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ ok: false, error: "auth_required" });
    const ref = db.collection("notifications").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
    if (snap.data().user_id !== req.userId)
      return res.status(403).json({ ok: false, error: "forbidden" });
    await ref.update({ read: true, readAt: new Date().toISOString() });
    audit.log("notification.read", { userId: req.userId, notificationId: req.params.id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/notifications/read-all
router.post("/read-all", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ ok: false, error: "auth_required" });
    const snap = await db
      .collection("notifications")
      .where("user_id", "==", req.userId)
      .where("read", "==", false)
      .limit(200)
      .get();
    const batch = db.batch();
    snap.forEach(d => batch.update(d.ref, { read: true, readAt: new Date().toISOString() }));
    await batch.commit();
    audit.log("notification.read_all", { userId: req.userId, count: snap.size });
    return res.json({ ok: true, updated: snap.size });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

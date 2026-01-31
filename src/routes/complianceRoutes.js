const express = require("express");
const router = express.Router();
const { logComplianceEvent } = require("../services/complianceLogs");

// Basic admin check middleware (reuse real auth in integration later)
function adminOnly(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "forbidden" });
  next();
}

// POST /api/compliance/logs - record an event (internal use)
router.post("/logs", adminOnly, async (req, res) => {
  try {
    const body = req.body || {};
    const entry = await logComplianceEvent(body);
    res.status(201).json({ success: true, entry });
  } catch (e) {
    console.error("[compliance/logs] write failed", e && e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/compliance/health - lightweight endpoint to confirm route wired
router.get("/health", adminOnly, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;

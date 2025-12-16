const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");

// Accepts: { level: 'debug'|'info'|'warn'|'error', message: string, meta?: object }
router.post("/frontend-logs", (req, res) => {
  const { level, message, meta } = req.body || {};
  if (!level || typeof message !== "string") return res.status(400).json({ error: "invalid_payload" });
  const allowed = ["debug", "info", "warn", "error"];
  const lvl = allowed.includes(level) ? level : "info";
  try {
    logger[lvl] && logger[lvl]("frontend-log", { message, meta });
  } catch (e) {
    // swallow logging errors
  }
  return res.status(202).json({ accepted: true });
});

module.exports = router;

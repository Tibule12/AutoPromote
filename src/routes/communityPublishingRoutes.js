const express = require("express");
const auth = require("../authMiddleware");
const workspaceScope = require("../middlewares/workspaceScope");
const rateLimit = require("express-rate-limit");
const service = require("../services/communityPublishing");
const router = express.Router();
router.use(
  auth,
  workspaceScope,
  rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false })
);
router.use("/:platform", (req, res, next) =>
  ["telegram", "discord"].includes(req.params.platform)
    ? next()
    : res.status(404).json({ error: "unsupported_platform" })
);
router.get("/:platform", async (req, res) => {
  try {
    if (req.workspaceId && req.workspaceRole !== "owner" && !(req.workspace.sharedPlatforms || []).includes(req.params.platform)) return res.json({ destinations: [] });
    res
      .set("Cache-Control", "no-store")
      .json({ destinations: await service.listDestinations(require("../middlewares/workspaceScope").resourceUserId(req), req.params.platform) });
  } catch (_) {
    res.status(503).json({ error: "Destinations could not be loaded. Try again." });
  }
});
router.post("/telegram", async (req, res) => {
  try {
    res.json({ destination: await service.addTelegramDestination(req.user.uid, req.body?.chatId) });
  } catch (e) {
    res
      .status(e.status >= 400 && e.status < 600 ? e.status : 409)
      .json({ error: e.errorClass ? e.message : "Could not verify Telegram destination." });
  }
});
module.exports = router;

const express = require("express");
const router = express.Router();
const {
  handleDiscordInteractions,
  handleDiscordLinkedRoles,
  verifyDiscordRequest,
} = require("../controllers/discordController");

// Ensure you have DISCORD_PUBLIC_KEY in your .env file
const discordPublicKey = process.env.DISCORD_PUBLIC_KEY;

router.get("/linked-roles", handleDiscordLinkedRoles);

// The interactions endpoint requires verification
if (discordPublicKey) {
  router.post("/interactions", verifyDiscordRequest(discordPublicKey), handleDiscordInteractions);
} else {
  console.warn("⚠️ DISCORD_PUBLIC_KEY is not set. /api/discord/interactions endpoint is disabled.");
  router.post("/interactions", (req, res) => {
    res
      .status(503)
      .json({ error: "Service Unavailable: Discord interactions are not configured." });
  });
}

module.exports = router;

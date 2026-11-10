const express = require("express");
const auth = require("../authMiddleware");
const {
  createCreativePlanner,
  localInference,
} = require("../services/studioDirectorCreativePlanner");
const router = express.Router();
const enabled = () => process.env.STUDIO_DIRECTOR_LOCAL_PLANNER === "true";
const busy = new Set();
router.use(auth);
router.get("/", (_req, res) =>
  res.json({
    available: enabled(),
    provider: enabled() ? "local" : null,
    sourceUnderstanding: "brief_metadata_or_client_decoded_colour_samples",
    compositionVersion: 2,
    maxDuration: 30,
  })
);
router.post("/", async (req, res) => {
  if (!enabled())
    return res.status(503).json({ error: "Director planning is not enabled on this server." });
  const uid = req.user?.uid;
  if (!uid) return res.sendStatus(401);
  if (busy.has(uid) || busy.size >= 1)
    return res
      .status(429)
      .json({ error: "The Director is already planning an edit. Try again when it finishes." });
  busy.add(uid);
  try {
    const plan = await createCreativePlanner({ infer: localInference })(req.body);
    return res.json({ ok: true, plan });
  } catch (error) {
    return res
      .status(error.status || 503)
      .json({
        error: error.status
          ? error.message
          : "Director planning is unavailable. No edit was applied.",
      });
  } finally {
    busy.delete(uid);
  }
});
module.exports = router;

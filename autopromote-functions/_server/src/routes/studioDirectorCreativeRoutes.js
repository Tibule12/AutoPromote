const express = require("express");
const auth = require("../authMiddleware");
const {
  createCreativePlanner,
  localInference,
} = require("../services/studioDirectorCreativePlanner");
const router = express.Router();
const {
  directorProvider,
  createDirectorTransport,
  requireDirectorAccess,
} = require("../services/studioDirectorProvider");
const busy = new Set();
router.use(auth);
router.get("/", (_req, res) =>
  res.json({
    available: Boolean(directorProvider()),
    provider: directorProvider()?.provider || null,
    sourceUnderstanding: "brief_metadata_or_client_decoded_colour_samples",
    compositionVersion: 2,
    maxDuration: 30,
  })
);
router.post(
  "/",
  (req, res, next) => {
    if (!directorProvider())
      return res.status(503).json({ error: "Director planning is not enabled on this server." });
    return next();
  },
  requireDirectorAccess,
  async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.sendStatus(401);
    if (busy.has(uid) || busy.size >= 1)
      return res
        .status(429)
        .json({ error: "The Director is already planning an edit. Try again when it finishes." });
    busy.add(uid);
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", cancel);
    try {
      const { provider, model } = directorProvider();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(provider === "openai" ? 90000 : 450000),
      ]);
      const transport =
        provider === "openai"
          ? createDirectorTransport({ userId: uid, signal })
          : (payload, options = {}) =>
              require("../services/studioLocalModelTransport").requestLocalModel(payload, {
                ...options,
                signal: AbortSignal.any([signal, options.signal].filter(Boolean)),
              });
      const plan = await createCreativePlanner({
        infer: args => localInference({ ...args, transport }),
        transport,
        provider,
        model,
        compositionModel: model,
      })(req.body);
      return res.json({ ok: true, plan });
    } catch (error) {
      return res.status(error.status || 503).json({
        error: error.status
          ? error.message
          : "Director planning is unavailable. No edit was applied.",
      });
    } finally {
      res.removeListener("close", cancel);
      busy.delete(uid);
    }
  }
);
module.exports = router;

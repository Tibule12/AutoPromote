const express = require("express");
const authMiddleware = require("../authMiddleware");
const { getOwnedAnalysisArtifact } = require("../services/studioAnalysisArtifactService");

const router = express.Router();

router.get("/:artifactHash", authMiddleware, async (req, res) => {
  const uid = req.user?.uid;
  if (typeof uid !== "string" || req.userId !== uid)
    return res.status(401).json({ ok: false, error: "auth_required" });
  try {
    const artifact = await getOwnedAnalysisArtifact({ uid, artifactHash: req.params.artifactHash });
    if (!artifact)
      return res.status(404).json({
        ok: false,
        error: "STUDIO_ANALYSIS_ARTIFACT_MISSING",
      });
    return res.json({ ok: true, artifact });
  } catch (error) {
    return res.status(error?.statusCode || 503).json({
      ok: false,
      error: error?.code || "STUDIO_ANALYSIS_ARTIFACT_UNAVAILABLE",
    });
  }
});

module.exports = router;

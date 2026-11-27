const express = require("express");
const authMiddleware = require("../authMiddleware");
const {
  registerOwnedProjectIntelligence, getOwnedProjectIntelligence,
} = require("../services/studioProjectIntelligenceService");

const router = express.Router();
const validUid = value => typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/.test(value);
const authenticatedUid = req => validUid(req.user?.uid) && req.userId === req.user.uid
  ? req.user.uid : null;
const respondError = (res, error) => res.status(error?.statusCode || 503).json({
  ok: false, error: error?.code || "PROJECT_INTELLIGENCE_UNAVAILABLE",
});

router.post("/", authMiddleware, async (req, res) => {
  const uid = authenticatedUid(req);
  if (!uid) return res.status(401).json({ ok: false, error: "auth_required" });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, "revision"))
    return res.status(400).json({ ok: false, error: "PROJECT_INTELLIGENCE_INVALID" });
  try {
    const receipt = await registerOwnedProjectIntelligence({ uid, revision: body.revision });
    return res.status(receipt.duplicate ? 200 : 201).json(receipt);
  } catch (error) { return respondError(res, error); }
});

router.get("/:projectId", authMiddleware, async (req, res) => {
  const uid = authenticatedUid(req);
  if (!uid) return res.status(401).json({ ok: false, error: "auth_required" });
  try {
    const result = await getOwnedProjectIntelligence({ uid, projectId: req.params.projectId });
    if (!result) return res.status(404).json({ ok: false, error: "PROJECT_INTELLIGENCE_MISSING" });
    return res.json({ ok: true, receipt: {
      revisionId: result.record.revisionId,
      manifestHash: result.record.manifestHash,
      dependencyDigest: result.record.dependencyDigest,
      createdAt: result.record.createdAt,
    }, summary: result.summary });
  } catch (error) { return respondError(res, error); }
});

router.get("/:projectId/:revisionId", authMiddleware, async (req, res) => {
  const uid = authenticatedUid(req);
  if (!uid) return res.status(401).json({ ok: false, error: "auth_required" });
  try {
    const result = await getOwnedProjectIntelligence({ uid,
      projectId: req.params.projectId, revisionId: req.params.revisionId });
    if (!result) return res.status(404).json({ ok: false, error: "PROJECT_INTELLIGENCE_MISSING" });
    return res.json({ ok: true, revision: result.record.revision, summary: result.summary });
  } catch (error) { return respondError(res, error); }
});

module.exports = router;

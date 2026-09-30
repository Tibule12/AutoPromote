const express = require("express");
const authMiddleware = require("../authMiddleware");
const {
  registerOwnedStudioProjectRevision,
} = require("../services/studioProjectRevisionService");

const router = express.Router();
const validUid = value => typeof value === "string" && value.length > 0 &&
  value.length <= 160 && value === value.trim() && value !== "." && value !== ".." &&
  !/[\x00-\x1f\x7f/]/.test(value);

router.post("/", authMiddleware, async (req, res) => {
  const uid = req.user?.uid;
  if (!validUid(uid) || !req.userId || req.userId !== uid)
    return res.status(401).json({ ok: false, error: "auth_required" });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, "document")) {
    return res.status(400).json({ ok: false, error: "invalid_project_revision" });
  }
  try {
    const receipt = await registerOwnedStudioProjectRevision({ uid, document: body.document });
    return res.status(receipt.duplicate ? 200 : 201).json(receipt);
  } catch (error) {
    const errors = {
      STUDIO_PROJECT_REVISION_INVALID: "invalid_project_revision",
      STUDIO_PROJECT_REVISION_TOO_LARGE: "project_revision_too_large",
      STUDIO_PROJECT_REVISION_CONFLICT: "project_revision_conflict",
      STUDIO_PROJECT_REVISION_STALE: "project_revision_stale",
      STUDIO_PROJECT_REVISION_UNAVAILABLE: "project_revision_store_unavailable",
    };
    return res.status(error?.statusCode || 503).json({
      ok: false,
      error: errors[error?.code] || "project_revision_store_unavailable",
    });
  }
});

module.exports = router;

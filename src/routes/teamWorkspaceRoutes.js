const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router({ mergeParams: true });
router.use(require("../authMiddleware"));
router.use(rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false }));
router.use(require("../config/teamRollout").requireTeamCollaboration);
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.params.releaseId && !/^[a-f0-9]{64}$/.test(req.params.releaseId))
    return res.status(400).json({ error: "invalid_release" });
  next();
});
const messages = {
  workspace_read_only: "Your role can view and comment, but cannot change this workspace.",
  reviewer_required: "An Owner or Admin must approve and schedule this release.",
  owner_required: "Only the workspace owner can change these settings.",
  not_a_workspace_member: "You no longer have access to this workspace.",
  release_changed: "This release changed. Refresh and review its latest revision.",
  approval_required: "Approve the latest release revision before scheduling.",
  project_checkout_required: "Check out this shared project before saving a new version.",
  project_source_changed: "A shared source changed or expired. The original project is preserved.",
  project_version_not_found: "That shared project version is no longer available.",
};
const run = fn => async (req, res) => {
  try {
    res.json(await fn(require("../services/teamWorkspaceRuntime").service, req));
  } catch (error) {
    res.status(error.status || 503).json({
      error: error.code || "team_unavailable",
      message:
        messages[error.code] ||
        (error.status && error.message !== error.code
          ? error.message
          : "Team workspace is temporarily unavailable. Refresh and try again."),
    });
  }
};
const args = req => [req.params.id, req.user.uid];
router.get(
  "/",
  run((service, req) => service.list(...args(req)))
);
router.get(
  "/releases/:releaseId/preview",
  run((service, req) => service.preview(...args(req), req.params.releaseId))
);
router.put(
  "/connections",
  run((service, req) => service.settings(...args(req), req.body?.platforms))
);
router.post(
  "/releases",
  run((service, req) => service.submit(...args(req), req.body?.release, req.body?.requestId))
);
router.put(
  "/releases/:releaseId",
  run((service, req) =>
    service.revise(...args(req), req.params.releaseId, req.body?.release, req.body?.revision)
  )
);
router.post(
  "/releases/:releaseId/review",
  run((service, req) =>
    service.review(...args(req), req.params.releaseId, req.body?.revision, req.body?.decision)
  )
);
router.post(
  "/releases/:releaseId/comments",
  run((service, req) => service.comment(...args(req), req.params.releaseId, req.body?.text))
);
router.post(
  "/releases/:releaseId/dispatch",
  run((service, req) => service.dispatch(...args(req), req.params.releaseId, req.body?.revision))
);
const projectRun = fn =>
  run((_service, req) => fn(require("../services/teamProjectsRuntime"), req));
router.post(
  "/projects",
  express.json({ limit: "21mb" }),
  projectRun((service, req) =>
    service.save(...args(req), req.body?.backup, req.body?.revision, req.body?.projectId)
  )
);
router.post(
  "/projects/:projectId/checkout",
  projectRun((service, req) =>
    service.lock(...args(req), req.params.projectId, req.body?.release === true)
  )
);
router.post(
  "/projects/:projectId/copy",
  projectRun((service, req) =>
    service.personalCopy(...args(req), req.params.projectId, req.body?.versionId)
  )
);
module.exports = router;

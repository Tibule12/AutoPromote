const { isHostedRuntime } = require("../utils/authAuthority");

// The reviewed Team API needs coordinated Rules/index publication, historical
// authority review and live Storage qualification. Until those gates are met,
// enable it only in the owned loopback demo, never a hosted serving process.
function teamCollaborationAvailable(env = process.env) {
  return (
    !isHostedRuntime(env) &&
    env.NODE_ENV === "test" &&
    env.TEAM_WORKSPACE_QA === "true" &&
    /^demo-autopromote-(credits|team)$/.test(env.GCLOUD_PROJECT || "") &&
    /^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(env.FIRESTORE_EMULATOR_HOST || "")
  );
}

function assertTeamCollaborationAvailable() {
  if (!teamCollaborationAvailable())
    throw Object.assign(new Error("Team collaboration is not enabled for this release."), {
      status: 503,
      code: "team_rollout_pending",
    });
}

function requireTeamCollaboration(_req, res, next) {
  if (!teamCollaborationAvailable())
    return res.status(503).json({
      ok: false,
      error: "team_rollout_pending",
      message: "Shared publishing and project review are not available yet. Use your personal workspace.",
    });
  next();
}

module.exports = {
  teamCollaborationAvailable,
  assertTeamCollaborationAvailable,
  requireTeamCollaboration,
};

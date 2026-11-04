const { db } = require("../firebaseAdmin");
const inScope = (req, record) => (record?.workspace_id || null) === (req.workspaceId || null);
const READS = new Set(["GET", "HEAD"]);
module.exports = async function teamContentBoundary(req, res, next) {
  try {
    const path = req.path;
    if (req.workspaceId && ["/leaderboard", "/repost-activity", "/"].includes(path))
      return res.status(403).json({ error: "personal_resource" });
    if (
      req.workspaceId &&
      ![
        /^\/my-content$/,
        /^\/my-promotion-schedules$/,
        /^\/upload\/readiness$/,
        /^\/promotion-schedules\/[A-Za-z0-9_-]+\/pause$/,
        /^\/(?:status\/)?[A-Za-z0-9_-]+(?:\/(?:download|analytics))?$/,
      ].some(pattern => pattern.test(path))
    )
      return res.status(403).json({ error: "team_review_required" });
    if (
      [
        "/my-content",
        "/my-promotion-schedules",
        "/upload/readiness",
        "/upload",
        "/upload-source-url",
        "/repost-activity",
        "/leaderboard",
        "/",
      ].includes(path)
    )
      return next();
    let match = path.match(/^\/promotion-schedules\/([A-Za-z0-9_-]+)(?:\/|$)/);
    let collection = "promotion_schedules";
    if (!match) {
      match = path.match(/^\/(?:status\/)?([A-Za-z0-9_-]+)(?:\/|$)/);
      collection = "content";
    }
    if (!match) return next();
    const snapshot = await db.collection(collection).doc(match[1]).get();
    // Legacy handlers retain their existing missing-resource/idempotency checks.
    if (snapshot.exists && !inScope(req, snapshot.data()))
      return res.status(404).json({ error: "resource_not_in_workspace" });
    if (
      snapshot.exists &&
      snapshot.data().workspace_id &&
      !READS.has(req.method) &&
      !path.endsWith("/pause")
    )
      return res.status(409).json({ error: "team_review_required" });
    next();
  } catch (_) {
    res.status(503).json({ error: "workspace_resource_unavailable" });
  }
};
module.exports.inScope = inScope;

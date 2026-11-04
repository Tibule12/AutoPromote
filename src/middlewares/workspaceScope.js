const { db } = require("../firebaseAdmin");

const WRITE_ROLES = new Set(["owner", "admin", "editor"]);
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getWorkspaceId(req) {
  const raw = req.headers?.["x-workspace-id"] || req.query?.workspaceId || null;
  if (Array.isArray(raw)) return raw[0] || null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

async function workspaceScope(req, res, next) {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return next();

  const actorUid = req.user?.uid || req.userId;
  if (!actorUid) return res.status(401).json({ ok: false, error: "unauthorized" });

  try {
    const workspaceRef = db.collection("workspaces").doc(workspaceId);
    const workspaceDoc = await workspaceRef.get();
    if (!workspaceDoc.exists) {
      return res.status(404).json({ ok: false, error: "workspace_not_found" });
    }

    const workspace = workspaceDoc.data() || {};
    const isOwner = workspace.ownerUid === actorUid;
    const membership = isOwner
      ? { uid: actorUid, role: "owner", status: "active" }
      : (await workspaceRef.collection("members").doc(actorUid).get()).data();

    if (!membership || membership.status !== "active") {
      return res.status(403).json({ ok: false, error: "not_a_workspace_member" });
    }

    const role = isOwner ? "owner" : membership.role || "viewer";
    if (!READ_METHODS.has(req.method) && !WRITE_ROLES.has(role)) {
      return res.status(403).json({ ok: false, error: "workspace_read_only" });
    }

    const ownerUid = workspace.ownerUid;
    if (!ownerUid) {
      return res.status(409).json({ ok: false, error: "workspace_owner_missing" });
    }

    req.actorUserId = actorUid;
    req.actorUser = req.user;
    req.workspaceId = workspaceId;
    req.workspace = { ...workspace, id: workspaceId };
    req.workspaceMembership = { ...membership, role };
    req.workspaceRole = role;
    req.billingUserId = ownerUid;
    // Authentication remains the human actor. Resource ownership and billing
    // are explicit context, never an impersonated Firebase identity.
    if (String(req.baseUrl || "").endsWith("/analytics"))
      return res.status(403).json({ ok: false, error: "personal_resource" });
    req.workspaceOwnerId = ownerUid;
    req.userId = actorUid;
    if (!["owner", "admin", "editor", "viewer"].includes(role))
      return res.status(403).json({ ok: false, error: "invalid_workspace_role" });
    const provider = String(req.baseUrl || "").match(
      /\/(youtube|tiktok|instagram|facebook|telegram|spotify)$/
    )?.[1];
    if (provider && role !== "owner" && !(workspace.sharedPlatforms || []).includes(provider))
      return res.status(403).json({ ok: false, error: "destination_not_shared" });
    if (!READ_METHODS.has(req.method)) {
      const content = String(req.baseUrl || "").endsWith("/content");
      const safeContent =
        content &&
        (/^\/upload\/readiness$/.test(req.path) ||
          (/^[/]promotion-schedules[/][A-Za-z0-9_-]+[/]pause$/.test(req.path) &&
            ["owner", "admin"].includes(role)));
      const connection =
        /\/(platform|destinations|youtube|tiktok|instagram|facebook|telegram)$/.test(
          req.baseUrl || ""
        );
      const safeConnection =
        (connection || /\/auth\/prepare$/.test(req.path)) &&
        role === "owner" &&
        !/\/(upload|test-message|publish)(?:\/|$)/.test(req.path);
      if (!safeContent && !safeConnection)
        return res.status(403).json({
          ok: false,
          error: "team_review_required",
          message: "Submit this release through Team review before publishing.",
        });
    }

    return next();
  } catch (error) {
    console.error("[workspace-scope] failed:", error);
    return res.status(500).json({ ok: false, error: "workspace_scope_failed" });
  }
}

module.exports = workspaceScope;
module.exports.getWorkspaceId = getWorkspaceId;

module.exports.resourceUserId = req => req.workspaceOwnerId || req.userId || req.user?.uid;

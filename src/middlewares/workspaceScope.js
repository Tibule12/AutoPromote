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
      : (
          await workspaceRef.collection("members").doc(actorUid).get()
        ).data();

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
    req.userId = ownerUid;
    req.user = {
      ...(req.user || {}),
      uid: ownerUid,
      actorUid,
      workspaceId,
      workspaceRole: role,
    };

    return next();
  } catch (error) {
    console.error("[workspace-scope] failed:", error);
    return res.status(500).json({ ok: false, error: "workspace_scope_failed" });
  }
}

module.exports = workspaceScope;
module.exports.getWorkspaceId = getWorkspaceId;

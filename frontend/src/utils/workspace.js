const ACTIVE_WORKSPACE_KEY = "autopromote.activeWorkspaceId";
const ACTIVE_WORKSPACE_NAME_KEY = "autopromote.activeWorkspaceName";
const ACTIVE_WORKSPACE_ROLE_KEY = "autopromote.activeWorkspaceRole";

export function isTeamCollaborationAvailable() {
  return process.env.REACT_APP_TEAM_COLLABORATION_LOCAL === "true" &&
    process.env.REACT_APP_LOCAL_EMULATORS === "true" &&
    /^demo-autopromote-(credits|team)$/.test(process.env.REACT_APP_FIREBASE_PROJECT_ID || "");
}

export function getActiveWorkspaceId() {
  if (!isTeamCollaborationAvailable()) return "";
  try {
    return window.localStorage?.getItem(ACTIVE_WORKSPACE_KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveWorkspaceId(workspaceId) {
  try {
    const previous = window.localStorage?.getItem(ACTIVE_WORKSPACE_KEY) || "";
    if (workspaceId) window.localStorage?.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
    else window.localStorage?.removeItem(ACTIVE_WORKSPACE_KEY);
    const next = workspaceId || "";
    if (previous !== next) {
      window.localStorage?.removeItem(ACTIVE_WORKSPACE_ROLE_KEY);
      window.localStorage?.removeItem(ACTIVE_WORKSPACE_NAME_KEY);
    }
    if (previous !== next) {
      window.dispatchEvent(new CustomEvent("autopromote:workspace-change", { detail: { workspaceId: next } }));
    }
  } catch {
    // Local storage is optional; requests still work as personal-workspace requests.
  }
}

export function getActiveWorkspaceRole() {
  try {
    return window.localStorage?.getItem(ACTIVE_WORKSPACE_ROLE_KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveWorkspaceRole(role) {
  try {
    if (role) window.localStorage?.setItem(ACTIVE_WORKSPACE_ROLE_KEY, role);
    else window.localStorage?.removeItem(ACTIVE_WORKSPACE_ROLE_KEY);
  } catch {
    // Local storage is optional.
  }
}

export function withWorkspaceHeaders(headers = {}, workspaceId = getActiveWorkspaceId()) {
  // Explicit headers on workspace-management requests still select which team
  // to manage. Only the local build activates shared Publisher/Queue context.
  return workspaceId ? { ...headers, "X-Workspace-Id": workspaceId } : { ...headers };
}

export async function ensureActiveWorkspace(_endpoint, _token) {
  const existing = getActiveWorkspaceId();
  if (existing) return existing;
  // Team activation is explicit. Loading the personal dashboard must never
  // silently switch the owner into a shared namespace.
  return "";
}

export function setActiveWorkspaceName(name) {
  try { if (name) window.localStorage?.setItem(ACTIVE_WORKSPACE_NAME_KEY, name); else window.localStorage?.removeItem(ACTIVE_WORKSPACE_NAME_KEY); } catch (_) {}
}
export function getActiveWorkspaceName() {
  try { return window.localStorage?.getItem(ACTIVE_WORKSPACE_NAME_KEY) || "Team workspace"; } catch (_) { return "Team workspace"; }
}

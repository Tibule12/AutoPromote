const ACTIVE_WORKSPACE_KEY = "autopromote.activeWorkspaceId";
const ACTIVE_WORKSPACE_ROLE_KEY = "autopromote.activeWorkspaceRole";

export function getActiveWorkspaceId() {
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
    if (previous !== next) window.localStorage?.removeItem(ACTIVE_WORKSPACE_ROLE_KEY);
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
  return workspaceId ? { ...headers, "X-Workspace-Id": workspaceId } : { ...headers };
}

export async function ensureActiveWorkspace(endpoint, token) {
  const existing = getActiveWorkspaceId();
  if (existing) return existing;
  if (!endpoint || !token) return "";

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) return "";
    const data = await response.json();
    const workspaceId = data?.workspace?.id || "";
    if (workspaceId) {
      setActiveWorkspaceId(workspaceId);
      setActiveWorkspaceRole(data?.membership?.role || "");
    }
    return workspaceId;
  } catch {
    return "";
  }
}

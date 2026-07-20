import { API_BASE_URL } from "../config";

export const WORKSPACE_ENDPOINTS = {
  LIST: `${API_BASE_URL}/api/workspaces`,
  CURRENT: `${API_BASE_URL}/api/workspaces/current`,
  INVITE: workspaceId => `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/invite`,
  ACCEPT_INVITE: (workspaceId, inviteId) =>
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/invite/${encodeURIComponent(inviteId)}/accept`,
  PREVIEW_INVITE: (workspaceId, inviteId, token) =>
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/invite/${encodeURIComponent(inviteId)}/preview?token=${encodeURIComponent(token)}`,
  REVOKE_INVITE: (workspaceId, inviteId) =>
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
  MEMBER: (workspaceId, uid) =>
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(uid)}`,
  MEMBER_ROLE: (workspaceId, uid) =>
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(uid)}/role`,
  LEAVE: workspaceId => `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/leave`,
};

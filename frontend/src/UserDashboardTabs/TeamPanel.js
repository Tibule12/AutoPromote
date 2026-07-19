import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { auth } from "../firebaseClient";
import { WORKSPACE_ENDPOINTS } from "../config/workspaceApi";
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  setActiveWorkspaceRole,
  withWorkspaceHeaders,
} from "../utils/workspace";
import "./TeamPanel.css";

const ROLE_OPTIONS = ["admin", "editor", "viewer"];

function getInviteParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    workspaceId: params.get("workspace") || "",
    inviteId: params.get("invite") || "",
    token: params.get("token") || "",
  };
}

async function getToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in to manage a team workspace.");
  return currentUser.getIdToken();
}

async function workspaceFetch(url, options = {}) {
  const token = await getToken();
  const { workspaceId, ...requestOptions } = options;
  const response = await fetch(url, {
    ...requestOptions,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...withWorkspaceHeaders(options.headers || {}, workspaceId),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "workspace_request_failed");
    error.code = data.error;
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function friendlyError(error) {
  const messages = {
    seat_limit_reached: "Your plan has no open team seats. Upgrade or revoke a pending invite.",
    invite_already_pending: "That email already has a pending invitation.",
    invite_email_mismatch: "This invitation belongs to a different email address.",
    invite_expired: "This invitation has expired. Ask the workspace owner for a new one.",
    invite_token_invalid: "This invitation link is invalid.",
    owner_required_for_admin_role: "Only the workspace owner can manage admin roles.",
    owner_required_for_admin_invite: "Only the workspace owner can invite an admin.",
  };
  return messages[error?.code] || String(error?.message || "The workspace request failed.");
}

function TeamPanel({ onWorkspaceChanged, onNavigate }) {
  const onWorkspaceChangedRef = useRef(onWorkspaceChanged);
  onWorkspaceChangedRef.current = onWorkspaceChanged;
  const [loading, setLoading] = useState(true);
  const [workspaceData, setWorkspaceData] = useState(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState([]);
  const [workspaceMissing, setWorkspaceMissing] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      let activeWorkspaceId = getActiveWorkspaceId();
      let data;
      try {
        data = await workspaceFetch(WORKSPACE_ENDPOINTS.CURRENT, {
          workspaceId: activeWorkspaceId,
        });
      } catch (error) {
        if (!activeWorkspaceId || (error.status !== 403 && error.status !== 404)) throw error;
        setActiveWorkspaceId(null);
        activeWorkspaceId = "";
        data = await workspaceFetch(WORKSPACE_ENDPOINTS.CURRENT, { workspaceId: "" });
      }
      const listData = await workspaceFetch(WORKSPACE_ENDPOINTS.LIST);
      setWorkspaceData(data);
      setAvailableWorkspaces(listData.workspaces || []);
      setWorkspaceName(data.workspace?.name || "");
      setWorkspaceMissing(false);
      if (data.workspace?.id) {
        setActiveWorkspaceId(data.workspace.id);
        setActiveWorkspaceRole(data.membership?.role || "");
      }
      return data;
    } catch (error) {
      if (error.status === 404 || error.code === "workspace_not_found") {
        setWorkspaceData(null);
        setAvailableWorkspaces([]);
        setWorkspaceMissing(true);
        setActiveWorkspaceId(null);
        return null;
      }
      toast.error(friendlyError(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const acceptInvite = async () => {
      const invite = getInviteParams();
      if (!invite.workspaceId || !invite.inviteId || !invite.token) {
        await loadWorkspace();
        return;
      }

      setLoading(true);
      try {
        await workspaceFetch(
          WORKSPACE_ENDPOINTS.ACCEPT_INVITE(invite.workspaceId, invite.inviteId),
          { method: "POST", body: JSON.stringify({ token: invite.token }) }
        );
        setActiveWorkspaceId(invite.workspaceId);
        const url = new URL(window.location.href);
        ["workspace", "invite", "token"].forEach(key => url.searchParams.delete(key));
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        toast.success("You joined the workspace.");
        const data = await loadWorkspace();
        await onWorkspaceChangedRef.current?.(data?.workspace || null);
      } catch (error) {
        toast.error(friendlyError(error));
        setLoading(false);
      }
    };
    acceptInvite();
  }, [loadWorkspace]);

  const workspace = workspaceData?.workspace;
  const membership = workspaceData?.membership;
  const permissions = workspaceData?.permissions || {};
  const members = workspaceData?.members || [];
  const invites = workspaceData?.pendingInvites || [];
  const occupiedSeats = Number(workspace?.usedSeats || 0) + invites.length;
  const seatPercent = workspace?.seatLimit
    ? Math.min(100, Math.round((occupiedSeats / workspace.seatLimit) * 100))
    : 0;
  const currentUid = auth.currentUser?.uid;

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0)),
    [members]
  );

  const createWorkspace = async event => {
    event.preventDefault();
    setBusyKey("create");
    try {
      const created = await workspaceFetch(WORKSPACE_ENDPOINTS.LIST, {
        method: "POST",
        body: JSON.stringify({ name: workspaceName }),
      });
      setActiveWorkspaceId(created.workspaceId);
      const data = await loadWorkspace();
      await onWorkspaceChanged?.(data?.workspace || null);
      toast.success("Workspace created.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const renameWorkspace = async event => {
    event.preventDefault();
    if (!workspace?.id || !workspaceName.trim()) return;
    setBusyKey("rename");
    try {
      await workspaceFetch(`${WORKSPACE_ENDPOINTS.LIST}/${encodeURIComponent(workspace.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: workspaceName.trim() }),
      });
      await loadWorkspace();
      toast.success("Workspace renamed.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const inviteMember = async event => {
    event.preventDefault();
    setBusyKey("invite");
    setLatestInviteUrl("");
    try {
      const data = await workspaceFetch(WORKSPACE_ENDPOINTS.INVITE(workspace.id), {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setInviteEmail("");
      setLatestInviteUrl(data.inviteUrl || "");
      await loadWorkspace();
      toast.success(data.emailSent ? "Invitation emailed." : "Invitation created; copy the link below.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const updateRole = async (uid, role) => {
    setBusyKey(`role:${uid}`);
    try {
      await workspaceFetch(WORKSPACE_ENDPOINTS.MEMBER_ROLE(workspace.id, uid), {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await loadWorkspace();
      toast.success("Role updated.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const removeMember = async member => {
    if (!window.confirm(`Remove ${member.email || "this member"} from the workspace?`)) return;
    setBusyKey(`remove:${member.uid}`);
    try {
      await workspaceFetch(WORKSPACE_ENDPOINTS.MEMBER(workspace.id, member.uid), {
        method: "DELETE",
      });
      await loadWorkspace();
      toast.success("Member removed.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const revokeInvite = async inviteId => {
    setBusyKey(`invite:${inviteId}`);
    try {
      await workspaceFetch(WORKSPACE_ENDPOINTS.REVOKE_INVITE(workspace.id, inviteId), {
        method: "DELETE",
      });
      await loadWorkspace();
      toast.success("Invitation revoked.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const leaveWorkspace = async () => {
    if (!window.confirm("Leave this workspace? You will lose access to its content and queue.")) return;
    setBusyKey("leave");
    try {
      await workspaceFetch(WORKSPACE_ENDPOINTS.LEAVE(workspace.id), { method: "POST" });
      setActiveWorkspaceId(null);
      setActiveWorkspaceRole(null);
      setWorkspaceData(null);
      setWorkspaceMissing(true);
      await onWorkspaceChanged?.(null);
      toast.success("You left the workspace.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusyKey("");
    }
  };

  const switchWorkspace = async workspaceId => {
    setActiveWorkspaceId(workspaceId);
    const data = await loadWorkspace();
    await onWorkspaceChanged?.(data?.workspace || null);
  };

  if (loading) return <section className="team-panel"><p>Loading team workspace…</p></section>;

  if (workspaceMissing || !workspace) {
    return (
      <section className="team-panel">
        <div className="team-hero">
          <span>Team workspace</span>
          <h2>Create a shared AutoPromote workspace</h2>
          <p>Share content, publishing queues, analytics, and connected destinations with role-based access.</p>
        </div>
        <form className="team-card team-create" onSubmit={createWorkspace}>
          <label htmlFor="workspace-name">Workspace name</label>
          <input
            id="workspace-name"
            value={workspaceName}
            onChange={event => setWorkspaceName(event.target.value)}
            placeholder="My Creator Team"
            maxLength={80}
            required
          />
          <button type="submit" disabled={busyKey === "create"}>
            {busyKey === "create" ? "Creating…" : "Create Workspace"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="team-panel">
      <div className="team-hero team-hero-row">
        <div>
          <span>{workspace.planName} workspace</span>
          <h2>{workspace.name}</h2>
          <p>Your role: <strong>{membership?.role || "member"}</strong></p>
        </div>
        <div className="team-seat-summary">
          <strong>{occupiedSeats} / {workspace.seatLimit}</strong>
          <span>occupied seats</span>
        </div>
      </div>

      {availableWorkspaces.length > 1 ? (
        <label className="team-workspace-switcher" htmlFor="active-workspace">
          Active workspace
          <select
            id="active-workspace"
            value={workspace.id}
            onChange={event => switchWorkspace(event.target.value)}
          >
            {availableWorkspaces.map(item => (
              <option key={item.id} value={item.id}>{item.name} ({item.role})</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="team-seat-track" aria-label={`${seatPercent}% of seats occupied`}>
        <span style={{ width: `${seatPercent}%` }} />
      </div>
      {workspace.overSeatLimit ? <p className="team-warning">This workspace is over its current plan limit. Existing members retain access, but new invitations are blocked.</p> : null}

      {permissions.canManageMembers ? (
        <div className="team-grid">
          <form className="team-card" onSubmit={renameWorkspace}>
            <h3>Workspace details</h3>
            <label htmlFor="rename-workspace">Name</label>
            <input id="rename-workspace" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} maxLength={80} required />
            <button type="submit" disabled={busyKey === "rename"}>Save Name</button>
          </form>

          <form className="team-card" onSubmit={inviteMember}>
            <h3>Invite a teammate</h3>
            <label htmlFor="invite-email">Email</label>
            <input id="invite-email" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="teammate@example.com" required />
            <label htmlFor="invite-role">Role</label>
            <select id="invite-role" value={inviteRole} onChange={event => setInviteRole(event.target.value)}>
              {ROLE_OPTIONS.filter(role => membership?.role === "owner" || role !== "admin").map(role => <option key={role} value={role}>{role}</option>)}
            </select>
            <button type="submit" disabled={busyKey === "invite" || occupiedSeats >= workspace.seatLimit}>{busyKey === "invite" ? "Sending…" : "Send Invitation"}</button>
            {occupiedSeats >= workspace.seatLimit && permissions.canManageBilling ? <button type="button" className="team-secondary" onClick={() => onNavigate?.("billing")}>Upgrade for More Seats</button> : null}
            {occupiedSeats >= workspace.seatLimit && !permissions.canManageBilling ? <p className="team-muted">Ask the workspace owner to upgrade for more seats.</p> : null}
          </form>
        </div>
      ) : null}

      {latestInviteUrl ? (
        <div className="team-card team-invite-link">
          <strong>Invitation link</strong>
          <input readOnly value={latestInviteUrl} aria-label="Invitation link" />
          <button type="button" onClick={() => navigator.clipboard?.writeText(latestInviteUrl).then(() => toast.success("Invitation link copied."))}>Copy Link</button>
        </div>
      ) : null}

      <div className="team-card">
        <h3>Members</h3>
        <div className="team-table-wrap">
          <table className="team-table">
            <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {sortedMembers.map(member => {
                const isOwner = member.role === "owner";
                const canManageTarget = permissions.canManageMembers && !isOwner && (membership?.role === "owner" || member.role !== "admin");
                return (
                  <tr key={member.uid || member.id}>
                    <td>{member.email || member.uid}{member.uid === currentUid ? " (you)" : ""}</td>
                    <td>{canManageTarget ? <select value={member.role} disabled={busyKey === `role:${member.uid}`} onChange={event => updateRole(member.uid, event.target.value)}>{ROLE_OPTIONS.filter(role => membership?.role === "owner" || role !== "admin").map(role => <option key={role} value={role}>{role}</option>)}</select> : <span className="team-role-pill">{member.role}</span>}</td>
                    <td>{member.status}</td>
                    <td>{canManageTarget ? <button type="button" className="team-danger" disabled={busyKey === `remove:${member.uid}`} onClick={() => removeMember(member)}>Remove</button> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {permissions.canManageMembers && invites.length ? (
        <div className="team-card">
          <h3>Pending invitations</h3>
          {invites.map(invite => <div className="team-pending-row" key={invite.id}><span><strong>{invite.email}</strong><small>{invite.role}</small></span><button type="button" className="team-danger" disabled={busyKey === `invite:${invite.id}`} onClick={() => revokeInvite(invite.id)}>Revoke</button></div>)}
        </div>
      ) : null}

      {membership?.role !== "owner" ? <button type="button" className="team-leave" disabled={busyKey === "leave"} onClick={leaveWorkspace}>Leave Workspace</button> : null}
    </section>
  );
}

export default TeamPanel;

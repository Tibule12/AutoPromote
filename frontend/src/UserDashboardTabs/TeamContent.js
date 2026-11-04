import React, { useCallback, useEffect, useState } from "react";
import { auth } from "../firebaseClient";
import { WORKSPACE_ENDPOINTS } from "../config/workspaceApi";

import TeamProjects from "./TeamProjects";

const platforms = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "linkedin",
  "reddit",
  "telegram",
  "discord",
];
export default function TeamContent({ workspace, members = [], onNavigate, onRefreshDetails }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState({});
  const [editing, setEditing] = useState(null);
  const [comments, setComments] = useState({}),
    [connections, setConnections] = useState([]);
  const base = `${WORKSPACE_ENDPOINTS.LIST}/${encodeURIComponent(workspace.id)}/team`;
  const request = useCallback(
    async (path = "", method = "GET", body) => {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || value.error || "Team request failed.");
      return value;
    },
    [base]
  );
  const refresh = useCallback(async () => {
    try {
      const value = await request();
      setData(value);
      setConnections(value.sharedPlatforms || []);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, [request]);
  useEffect(() => {
    let active = true;
    request()
      .then(value => {
        if (active) {
          setData(value);
          setConnections(value.sharedPlatforms || []);
        }
      })
      .catch(failure => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const action = async (path, body, method = "POST") => {
    setBusy(true);
    setError("");
    try {
      await request(path, method, body);
      await refresh();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const nameFor = uid =>
    members.find(member => member.uid === uid)?.email ||
    (uid === workspace.ownerUid ? "Workspace owner" : "Former teammate");
  const reviewer = ["owner", "admin"].includes(data?.role);
  return (
    <div className="team-content">
      <div className="team-card">
        <h3>Team production</h3>
        <p>
          Create or edit your media in Studio, then prepare a release in Publisher. Team submissions
          wait here for approval before anything is scheduled.
        </p>
        <p>
          Personal projects stay private until you share them. Team publishing uses the owner’s
          existing plan and allowance.
        </p>
        {data?.role !== "viewer" && (
          <button type="button" className="team-primary" onClick={() => onNavigate?.("upload")}>
            Prepare a team release
          </button>
        )}
        <button
          type="button"
          className="team-secondary"
          disabled={busy}
          onClick={async () => {
            await onRefreshDetails?.();
            await refresh();
          }}
        >
          Refresh reviews
        </button>
      </div>
      {error && (
        <p role="alert" className="team-warning">
          {error}
        </p>
      )}
      {data?.role === "owner" && (
        <form
          className="team-card"
          onSubmit={event => {
            event.preventDefault();
            action("/connections", { platforms: connections }, "PUT");
          }}
        >
          <h3>Shared publishing connections</h3>
          <p>
            Choose which connected accounts the team may use. Sharing a platform authorises its
            connected destinations for approved releases. Passwords and tokens stay private.
          </p>
          <div className="team-connection-choices">
            {platforms.map(platform => (
              <label key={platform}>
                <input
                  type="checkbox"
                  checked={connections.includes(platform)}
                  onChange={event =>
                    setConnections(current =>
                      event.target.checked
                        ? [...current, platform]
                        : current.filter(value => value !== platform)
                    )
                  }
                />
                {platform}
              </label>
            ))}
          </div>
          <button type="submit" className="team-primary" disabled={busy}>
            Save shared connections
          </button>
        </form>
      )}
      {data && (
        <TeamProjects
          data={data}
          request={request}
          refresh={refresh}
          onNavigate={onNavigate}
          nameFor={nameFor}
        />
      )}
      <section className="team-card" aria-label="Team release reviews">
        <h3>Release reviews</h3>
        {!data?.releases?.length && <p>No team releases submitted yet.</p>}
        {data?.releases?.map(release => (
          <article key={release.id} className="team-release">
            <h4>{release.payload.title}</h4>
            <p>
              {release.status.replaceAll("_", " ")} · Revision {release.revision}
            </p>
            <p className="team-release-copy">{release.payload.description}</p>
            <p>
              Destinations: {release.payload.platforms.join(", ")} ·{" "}
              {release.payload.time
                ? new Date(release.payload.time).toLocaleString()
                : "Send after approval and scheduling"}
            </p>
            <button
              type="button"
              className="team-secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  const value = await request(`/releases/${release.id}/preview`);
                  setPreviews(current => ({ ...current, [release.id]: value }));
                } catch (failure) {
                  setError(failure.message);
                }
              }}
            >
              Review saved media
            </button>
            {previews[release.id] &&
              (previews[release.id].contentType.startsWith("image/") ? (
                <img
                  alt={release.payload.title}
                  src={previews[release.id].url}
                  style={{ maxWidth: "100%" }}
                />
              ) : (
                <video
                  controls
                  muted
                  preload="metadata"
                  src={previews[release.id].url}
                  style={{ width: "100%", maxHeight: "360px" }}
                />
              ))}
            <details>
              <summary>Destination copy and settings</summary>
              {Object.entries(release.payload.platformOptions).map(([platform, settings]) => (
                <div key={platform}>
                  <h5>{platform}</h5>
                  <dl>
                    {Object.entries(settings)
                      .filter(([key]) => !["meta", "file", "media_url", "videoUrl"].includes(key))
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{key.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}</dt>
                          <dd>
                            {typeof value === "object" ? JSON.stringify(value) : String(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ))}
            </details>
            {data.role !== "viewer" && release.status !== "scheduled" && (
              <button
                type="button"
                className="team-secondary"
                disabled={busy}
                onClick={() =>
                  setEditing({
                    id: release.id,
                    revision: release.revision,
                    payload: JSON.parse(JSON.stringify(release.payload)),
                  })
                }
              >
                Revise release
              </button>
            )}
            {editing?.id === release.id && (
              <form
                onSubmit={async event => {
                  event.preventDefault();
                  const saved = await action(
                    `/releases/${release.id}`,
                    { revision: editing.revision, release: editing.payload },
                    "PUT"
                  );
                  if (saved) setEditing(null);
                }}
              >
                <label htmlFor={`team-release-title-${release.id}`}>
                  Release title
                  <input
                    id={`team-release-title-${release.id}`}
                    maxLength={160}
                    value={editing.payload.title}
                    onChange={event =>
                      setEditing({
                        ...editing,
                        payload: { ...editing.payload, title: event.target.value },
                      })
                    }
                  />
                </label>
                <label htmlFor={`team-release-description-${release.id}`}>
                  Release description
                  <textarea
                    id={`team-release-description-${release.id}`}
                    maxLength={5000}
                    value={editing.payload.description}
                    onChange={event =>
                      setEditing({
                        ...editing,
                        payload: { ...editing.payload, description: event.target.value },
                      })
                    }
                  />
                </label>
                {Object.entries(editing.payload.platformOptions).map(([platform, options]) =>
                  ["title", "description", "caption", "message", "text", "commentary"]
                    .filter(key => typeof options[key] === "string")
                    .map(key => (
                      <label
                        key={`${platform}-${key}`}
                        htmlFor={`team-release-${release.id}-${platform}-${key}`}
                      >
                        {platform} {key}
                        <textarea
                          id={`team-release-${release.id}-${platform}-${key}`}
                          maxLength={5000}
                          value={options[key]}
                          onChange={event =>
                            setEditing({
                              ...editing,
                              payload: {
                                ...editing.payload,
                                platformOptions: {
                                  ...editing.payload.platformOptions,
                                  [platform]: { ...options, [key]: event.target.value },
                                },
                              },
                            })
                          }
                        />
                      </label>
                    ))
                )}
                <label>
                  Delivery time (UTC, leave empty to send after approval)
                  <input
                    type="datetime-local"
                    value={editing.payload.time?.slice(0, 16) || ""}
                    onChange={event =>
                      setEditing({
                        ...editing,
                        payload: {
                          ...editing.payload,
                          time: event.target.value
                            ? new Date(`${event.target.value}Z`).toISOString()
                            : null,
                        },
                      })
                    }
                  />
                </label>
                <p>Saving a revision clears the previous approval.</p>
                <button type="submit" className="team-primary" disabled={busy}>
                  Save revision for review
                </button>
                <button type="button" className="team-secondary" onClick={() => setEditing(null)}>
                  Cancel revision
                </button>
              </form>
            )}
            {reviewer &&
              ["pending_review", "changes_requested", "approved"].includes(release.status) && (
                <div className="team-review-actions">
                  <button
                    type="button"
                    className="team-primary"
                    disabled={busy || release.status === "approved"}
                    onClick={() =>
                      action(`/releases/${release.id}/review`, {
                        revision: release.revision,
                        decision: "approved",
                      })
                    }
                  >
                    Approve revision {release.revision}
                  </button>
                  <button
                    type="button"
                    className="team-secondary"
                    disabled={busy}
                    onClick={() =>
                      action(`/releases/${release.id}/review`, {
                        revision: release.revision,
                        decision: "changes_requested",
                      })
                    }
                  >
                    Request changes
                  </button>
                  {release.status === "approved" && (
                    <button
                      type="button"
                      className="team-primary"
                      disabled={busy}
                      onClick={() =>
                        action(`/releases/${release.id}/dispatch`, { revision: release.revision })
                      }
                    >
                      Schedule approved release
                    </button>
                  )}
                </div>
              )}
            {!!release.scheduleIds?.length && (
              <p>Scheduled once. View delivery receipts in Queue.</p>
            )}
            {release.comments?.map((comment, index) => (
              <blockquote key={index}>
                <p>{comment.text}</p>
                <small>
                  {comment.authorLabel || nameFor(comment.uid)} ·{" "}
                  {new Date(comment.at).toLocaleString()}
                </small>
              </blockquote>
            ))}
            <form
              onSubmit={async event => {
                event.preventDefault();
                const saved = await action(`/releases/${release.id}/comments`, {
                  text: comments[release.id] || "",
                });
                if (saved) setComments(current => ({ ...current, [release.id]: "" }));
              }}
            >
              <label htmlFor={`team-comment-${release.id}`}>
                Review comment
                <textarea
                  id={`team-comment-${release.id}`}
                  maxLength={2000}
                  value={comments[release.id] || ""}
                  onChange={event =>
                    setComments(current => ({ ...current, [release.id]: event.target.value }))
                  }
                />
              </label>
              <button
                type="submit"
                className="team-secondary"
                disabled={busy || !comments[release.id]?.trim()}
              >
                Add comment
              </button>
            </form>
          </article>
        ))}
      </section>
      <section className="team-card">
        <h3>Activity</h3>
        <ol>
          {data?.activity?.map(event => (
            <li key={event.id}>
              {event.action.replaceAll("_", " ")} · {event.actorLabel || nameFor(event.actorUid)} ·{" "}
              {new Date(event.at).toLocaleString()}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

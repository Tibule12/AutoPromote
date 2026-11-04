import React, { useState } from "react";

export default function TeamProjects({
  data,
  request,
  refresh,
  onNavigate,
  nameFor = () => "Teammate",
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState("");
  const canEdit = ["owner", "admin", "editor"].includes(data.role);
  const run = async fn => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const upload = file =>
    run(async () => {
      if (!file || file.size > 20 * 1024 * 1024)
        throw new Error("Choose a native Studio project backup smaller than 20 MB.");
      const project = data.projects.find(item => item.id === target);
      await request("/projects", "POST", {
        backup: JSON.parse(await file.text()),
        revision: project?.revision || 0,
        projectId: target || undefined,
      });
    });
  const copy = (project, version) =>
    run(async () => {
      const backup = await request(`/projects/${encodeURIComponent(project.id)}/copy`, "POST", {
        versionId: version.id,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.replace(/[^a-z0-9_-]/gi, "-")}.autopromote.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <section className="team-card" aria-label="Shared editable projects">
      <h3>Shared editable projects</h3>
      <p>
        In Studio, save your edit and download its native project backup. Share it here to retain
        versions with the team. Personal originals stay intact.
      </p>
      <p>
        Taking an editable copy creates private copies of its media. Restore the downloaded backup
        in Studio, edit normally, then check out the shared project before uploading a new version.
        Rendering keeps its existing billing behaviour.
      </p>
      {error && (
        <p role="alert" className="team-warning">
          {error}
        </p>
      )}
      {canEdit && (
        <div>
          <label htmlFor="team-project-target">
            Save as
            <select
              id="team-project-target"
              value={target}
              onChange={event => setTarget(event.target.value)}
            >
              <option value="">New shared project</option>
              {data.projects.map(project => (
                <option key={project.id} value={project.id}>
                  New version of {project.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="team-project-upload">
            Native project backup
            <input
              id="team-project-upload"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload(file);
              }}
            />
          </label>
        </div>
      )}
      {!data.projects.length && <p>No projects shared yet.</p>}
      {data.projects.map(project => (
        <article className="team-release" key={project.id}>
          <h4>{project.name}</h4>
          <p>
            Version {project.revision} · {new Date(project.updatedAt).toLocaleString()}
          </p>
          {project.lock && (
            <p>
              Checked out by {nameFor(project.lock.uid)} until{" "}
              {new Date(project.lock.expiresAt).toLocaleTimeString()}.
            </p>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                className="team-secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await request(
                      `/projects/${encodeURIComponent(project.id)}/checkout`,
                      "POST",
                      {}
                    );
                    setTarget(project.id);
                  })
                }
              >
                Check out for editing
              </button>
              <button
                type="button"
                className="team-secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    request(`/projects/${encodeURIComponent(project.id)}/checkout`, "POST", {
                      release: true,
                    })
                  )
                }
              >
                Release checkout
              </button>
              <details>
                <summary>Retained editable versions</summary>
                {[...project.versions].reverse().map(version => (
                  <div key={version.id}>
                    <span>
                      Version {version.revision} · {nameFor(version.savedBy)}
                    </span>
                    <button
                      type="button"
                      className="team-secondary"
                      disabled={busy}
                      onClick={() => copy(project, version)}
                    >
                      Take editable copy of version {version.revision}
                    </button>
                  </div>
                ))}
              </details>
            </>
          )}
        </article>
      ))}
      <button
        type="button"
        className="team-secondary"
        onClick={() => onNavigate?.("viral_clip_studio")}
      >
        Open Studio
      </button>
    </section>
  );
}

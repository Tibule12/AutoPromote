import { useEffect, useRef, useState } from "react";
import { validateSubjectVfxScene, subjectVfxRevision } from "./studioSubjectVfxContract";
import "./StudioSubjectVfxPanel.css";

const presets = {
  text_behind: duration => ({
    id: "title",
    type: "text_behind",
    start: 0,
    end: duration,
    text: "YOUR STORY",
    x: 50,
    y: 43,
    font_size: 100,
    color: "#f5f1ed",
  }),
  background_grade: duration => ({
    id: "grade",
    type: "background_grade",
    start: 0,
    end: duration,
    exposure: -0.4,
    saturation: 0.7,
    contrast: 1.05,
  }),
  kinetic_type: duration => ({
    id: "type",
    type: "kinetic_type",
    start: 0,
    end: duration,
    text: "YOUR VOICE",
    x: 7,
    y: 75,
    font_size: 72,
    color: "#c1a8ff",
    tracking: 2,
    travel: 35,
    align: "left",
  }),
  tracked_callout: duration => ({
    id: "callout",
    type: "tracked_callout",
    start: 0,
    end: duration,
    text: "THE STORY",
    offset_x: -150,
    offset_y: -130,
    font_size: 24,
    color: "#c1a8ff",
    avoid_subject: true,
  }),
  glow: duration => ({
    id: "rim",
    type: "glow",
    start: 0,
    end: duration,
    color: "#b397f5",
    strength: 0.05,
    radius: 14,
  }),
  depth: duration => ({ id: "depth", type: "depth", start: 0, end: duration, amount: 0.015 }),
  particles: duration => ({
    id: "particles",
    type: "particles",
    start: 0,
    end: duration,
    seed: 73,
    count: 18,
    color: "#b397f5",
    opacity: 0.18,
    speed: 12,
  }),
};
const names = {
  text_behind: "Text behind subject",
  background_grade: "Background grade",
  kinetic_type: "Kinetic typography",
  tracked_callout: "Tracked callout",
  glow: "Subject glow",
  depth: "Background parallax",
  particles: "Particles",
};
const limits = {
  x: [0, 100],
  y: [0, 100],
  font_size: [12, 320],
  tracking: [0, 40],
  travel: [0, 150],
  exposure: [-3, 1],
  saturation: [0, 2],
  contrast: [0.5, 2],
  offset_x: [-500, 500],
  offset_y: [-500, 500],
  strength: [0, 0.6],
  radius: [0, 40],
  amount: [0, 0.06],
  seed: [0, 2147483647],
  count: [1, 80],
  opacity: [0, 0.6],
  speed: [0, 100],
};
const sourceSelectionKey = source => JSON.stringify([source.id, source.start, source.end]);

export default function StudioSubjectVfxPanel({
  items,
  onChange,
  sources,
  getToken,
  apiBase,
  createId,
  proposal,
}) {
  const [selected, setSelected] = useState(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("idle");
  const [frameTime, setFrameTime] = useState(0),
    [pointLabel, setPointLabel] = useState(1),
    [layerType, setLayerType] = useState("text_behind");
  const [played, setPlayed] = useState(false),
    [pictureBox, setPictureBox] = useState(null);
  const video = useRef(null),
    pointX = useRef(null),
    pointY = useRef(null),
    latest = useRef(items),
    poll = useRef(null),
    mounted = useRef(true),
    operation = useRef(false),
    attemptedPreviewRefresh = useRef(new Set()),
    controller = useRef(null),
    activeJob = useRef(null),
    attempt = useRef(0);
  latest.current = items;
  const item = items.find(value => value.scene.id === selected) || items[0];
  const source = sources.find(value => value.id === item?.scene.sourceId &&
    value.start === item?.scene.sourceRange.start && value.end === item?.scene.sourceRange.end) ||
    sources.find(value => value.id === item?.scene.sourceId);
  const revision = (() => {
    try {
      return item && subjectVfxRevision(item.scene);
    } catch {
      return null;
    }
  })();
  const ready = !!item?.preview?.url && revision === item.preview.revision;
  useEffect(() => {
    setPlayed(false);
  }, [revision, item?.preview?.jobId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current += 1;
      clearTimeout(poll.current);
      controller.current?.abort();
    };
  }, []);
  const measurePicture = () => {
    const element = video.current;
    if (!element?.videoWidth) return;
    const scale = Math.min(
      element.clientWidth / element.videoWidth,
      element.clientHeight / element.videoHeight
    );
    const width = element.videoWidth * scale,
      height = element.videoHeight * scale;
    setPictureBox({
      left: (element.clientWidth - width) / 2,
      top: (element.clientHeight - height) / 2,
      width,
      height,
    });
  };
  useEffect(() => {
    if (video.current?.readyState >= 1) video.current.currentTime = item.scene.sourceRange.start;
    measurePicture();
    if (typeof ResizeObserver === "undefined" || !video.current) return;
    const observer = new ResizeObserver(measurePicture);
    observer.observe(video.current);
    return () => observer.disconnect();
  }, [item?.scene.id, item?.scene.sourceRange.start]);
  const update = scene =>
    onChange(
      items.map(value => (value === item ? { ...value, scene, preview: undefined } : value))
    );
  const request = async (method, path, body, signal) => {
    const token = await getToken();
    if (!token)
      throw Object.assign(new Error("Sign in to render and save subject effects."), {
        statusCode: 401,
      });
    const response = await fetch(`${apiBase}/api/media/studio-subject-vfx${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(data.message || "Subject renderer is unavailable."), {
        statusCode: response.status,
      });
    return data;
  };
  const add = source => {
    if (!source) return;
    if (items.length >= 8) {
      setMessage("Use up to eight subject scenes per project.");
      return;
    }
    const duration = source.end - source.start;
    if (duration > 10 || duration < 0.25) {
      setMessage("Split or trim this clip to 0.25–10 seconds before adding subject effects.");
      return;
    }
    const scene = {
      version: 1,
      id: createId("subject-vfx"),
      sourceId: source.id,
      sourceStoragePath: source.storagePath || "",
      sourceRange: { start: source.start, end: source.end },
      prompt: { points: [], labels: [], shotPrompts: [] },
      effects: [presets.text_behind(duration)],
    };
    onChange([...items, { scene, enabled: true }]);
    setSelected(scene.id);
    setFrameTime(0);
    setMessage(
      "Pause on the first frame and select the subject. Add another prompt at every camera cut."
    );
  };
  const choosePoint = event => {
    if (!item || !video.current?.videoWidth) return;
    const element = video.current,
      rect = element.getBoundingClientRect(),
      scale = Math.min(rect.width / element.videoWidth, rect.height / element.videoHeight);
    const width = element.videoWidth * scale,
      height = element.videoHeight * scale;
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width,
      y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return;
    const prompt = JSON.parse(JSON.stringify(item.scene.prompt));
    let target = prompt;
    const time = Math.round(frameTime * 24) / 24;
    if (time > 0.001) {
      target = prompt.shotPrompts.find(shot => Math.abs(shot.time - time) < 1 / 48);
      if (!target) {
        target = { time, points: [], labels: [] };
        prompt.shotPrompts.push(target);
        prompt.shotPrompts.sort((a, b) => a.time - b.time);
      }
    }
    if (target.points.length >= 16) {
      setMessage("This frame already has sixteen points.");
      return;
    }
    target.points.push([x, y]);
    target.labels.push(pointLabel);
    update({ ...item.scene, prompt });
    setMessage(
      `Added ${pointLabel ? "subject" : "background"} point at ${time.toFixed(2)} seconds.`
    );
  };
  const render = async () => {
    if (operation.current) return;
    let scene;
    try {
      scene = validateSubjectVfxScene(item.scene);
      if (!scene.sourceStoragePath)
        throw new Error(
          "Save or upload this source to your Studio project before rendering subject effects."
        );
    } catch (error) {
      setMessage(error.message);
      return;
    }
    operation.current = true;
    setBusy(true);
    setStatus("queued");
    setMessage("Submitting the source-bound subject render…");
    controller.current = new AbortController();
    const run = ++attempt.current,
      signal = controller.current.signal,
      isCurrent = () => mounted.current && attempt.current === run;
    const initialRevision = subjectVfxRevision(scene),
      deadline = Date.now() + 20 * 60000;
    const clientRequestId =
      item.pending?.revision === initialRevision
        ? item.pending.clientRequestId
        : createId("subject-render");
    onChange(
      latest.current.map(value =>
        value.scene.id === scene.id
          ? { ...value, pending: { clientRequestId, revision: initialRevision } }
          : value
      )
    );
    try {
      const savedJobId =
        item.pending?.revision === initialRevision
          ? item.pending.jobId
          : ready
            ? item.preview.jobId
            : null;
      const created = savedJobId
        ? { jobId: savedJobId }
        : await request("POST", "", { scene, clientRequestId,
            ...(item.modelArtifactRef?{modelArtifactRef:item.modelArtifactRef}:{}) }, signal);
      if (!isCurrent()) return;
      if (typeof created.jobId !== "string" || !/^[-A-Za-z0-9_]{8,128}$/.test(created.jobId))
        throw new Error("The renderer did not confirm this job. Retry the saved request.");
      activeJob.current = created.jobId;
      onChange(
        latest.current.map(value =>
          value.scene.id === scene.id
            ? {
                ...value,
                pending: { clientRequestId, revision: initialRevision, jobId: created.jobId },
              }
            : value
        )
      );
      const tick = async () => {
        let finished = false;
        poll.current = null;
        try {
          if (!isCurrent()) return;
          if (Date.now() > deadline)
            throw new Error("Subject render timed out. Check the saved job before retrying.");
          const state = await request("GET", `/${created.jobId}`, undefined, signal);
          if (!isCurrent()) return;
          if (state.jobId !== created.jobId)
            throw new Error("The renderer returned a different job. Check the saved request.");
          setStatus(state.status);
          if (state.status === "completed") {
            finished = true;
            const current = latest.current.find(value => value.scene.id === scene.id);
            let same = false;
            try {
              same = current && subjectVfxRevision(current.scene) === initialRevision;
            } catch {
              /* Invalid edits cannot receive old rendered frames. */
            }
            if (!same) {
              setMessage(
                "The render finished, but the scene changed. Render the current settings before exporting."
              );
              setStatus("stale");
              activeJob.current = null;
              return;
            }
            if (!state.url || !state.receipt?.pixel_sha256)
              throw new Error("The worker returned no verified subject frames.");
            onChange(
              latest.current.map(value =>
                value.scene.id === scene.id
                  ? {
                      ...value,
                      pending: undefined,
                      preview: {
                        jobId: created.jobId,
                        url: state.url,
                        revision: initialRevision,
                        reviewed: current.preview?.reviewed === true &&
                          current.preview?.jobId === created.jobId &&
                          current.preview?.receipt?.pixel_sha256 === state.receipt.pixel_sha256,
                        receipt: state.receipt,
                      },
                    }
                  : value
              )
            );
            setMessage(
              "Play the rendered clip with sound. Inspect the subject edges and camera cuts, then approve it for export."
            );
            activeJob.current = null;
          } else if (["failed", "cancelled"].includes(state.status)) {
            finished = true;
            activeJob.current = null;
            onChange(
              latest.current.map(value =>
                value.scene.id === scene.id ? { ...value, pending: undefined } : value
              )
            );
            throw new Error(state.error || `Subject render ${state.status}.`);
          } else if (["queued", "processing", "dispatch_uncertain"].includes(state.status)) {
            setMessage("NVIDIA is tracking the subject and rendering your layers…");
            poll.current = setTimeout(tick, 3000);
            return;
          } else
            throw new Error("The renderer returned an unknown job state. Check the saved request.");
        } catch (error) {
          finished = true;
          if (error.name !== "AbortError" && isCurrent()) {
            setStatus("error");
            setMessage(error.message);
          }
        } finally {
          if (finished && isCurrent()) {
            operation.current = false;
            setBusy(false);
          }
        }
      };
      await tick();
    } catch (error) {
      if (isCurrent()) {
        operation.current = false;
        setBusy(false);
        setStatus("error");
        setMessage(error.message);
        if ([400, 401, 403, 409, 422, 429, 503].includes(error.statusCode))
          onChange(
            latest.current.map(value =>
              value.scene.id === scene.id ? { ...value, pending: undefined } : value
            )
          );
      }
    }
  };
  const cancel = async () => {
    const savedJobId = activeJob.current || item?.pending?.jobId;
    if (!savedJobId) return;
    attempt.current += 1;
    clearTimeout(poll.current);
    controller.current?.abort();
    controller.current = new AbortController();
    operation.current = true;
    setBusy(true);
    try {
      const id = savedJobId;
      const response = await request("DELETE", `/${id}`, undefined, controller.current.signal);
      if (!mounted.current) return;
      if (response.jobId !== id || response.status !== "cancelled")
        throw new Error("Cancellation was not confirmed. Check the saved render before retrying.");
      onChange(
        latest.current.map(value =>
          value.pending?.jobId === id ? { ...value, pending: undefined } : value
        )
      );
      activeJob.current = null;
      setStatus("cancelled");
      setMessage("Subject render cancelled. Your effect settings are saved.");
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      if (mounted.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  };
  const proposalValid =
    proposal &&
    proposal.sourceId === source?.id &&
    proposal.sourceStoragePath === source?.storagePath &&
    proposal.sourceRange?.start === item?.scene.sourceRange.start &&
    proposal.sourceRange?.end === item?.scene.sourceRange.end;
  const currentPrompt =
    frameTime < 0.001
      ? item?.scene.prompt
      : item?.scene.prompt.shotPrompts.find(shot => Math.abs(shot.time - frameTime) < 1 / 48);
  return (
    <section className="studio-subject-vfx" aria-labelledby="subject-vfx-heading">
      <header>
        <span>SUBJECT & COMPOSITING</span>
        <h4 id="subject-vfx-heading">Make effects part of the shot.</h4>
        <p>
          Select the subject, build your layers, and review the rendered result with the original
          sound.
        </p>
      </header>
      <div className="subject-vfx-actions">
        <select
          aria-label="Subject effect source clip"
          defaultValue=""
          onChange={event => {
            add(sources.find(value => sourceSelectionKey(value) === event.target.value));
            event.target.value = "";
          }}
        >
          <option value="">Add effects to a clip…</option>
          {sources.map(value => (
            <option key={sourceSelectionKey(value)} value={sourceSelectionKey(value)}>
              {value.name} · {(value.end - value.start).toFixed(1)}s · {value.start.toFixed(1)}–{value.end.toFixed(1)}s
            </option>
          ))}
        </select>
      </div>
      {items.length > 0 && (
        <select
          aria-label="Subject effect scene"
          value={item.scene.id}
          onChange={event => {
            setSelected(event.target.value);
            setFrameTime(0);
          }}
        >
          {items.map(value => (
            <option key={value.scene.id} value={value.scene.id}>
              {sources.find(source => source.id === value.scene.sourceId)?.name ||
                value.scene.sourceId}
            </option>
          ))}
        </select>
      )}
      {item && (
        <>
          <label className="subject-vfx-toggle">
            <input
              type="checkbox"
              checked={item.enabled !== false}
              onChange={event =>
                onChange(
                  items.map(value =>
                    value === item ? { ...value, enabled: event.target.checked } : value
                  )
                )
              }
            />
            Apply these subject effects
          </label>
          <div className="subject-vfx-source">
            <video
              key={source?.url}
              ref={video}
              src={source?.url}
              preload="metadata"
              playsInline
              aria-label="Select subject in source footage"
              onClick={choosePoint}
              onLoadedMetadata={() => {
                video.current.currentTime = item.scene.sourceRange.start + frameTime;
                measurePicture();
              }}
            />
            {pictureBox &&
              currentPrompt?.points.map(([x, y], index) => (
                <i
                  key={index}
                  className={`subject-vfx-point ${currentPrompt.labels[index] ? "is-subject" : "is-background"}`}
                  aria-hidden="true"
                  style={{
                    left: pictureBox.left + x * pictureBox.width,
                    top: pictureBox.top + y * pictureBox.height,
                  }}
                >
                  {currentPrompt.labels[index] ? "+" : "−"}
                </i>
              ))}
            <span>Click the paused picture to select a point</span>
          </div>
          <label>
            Prompt frame{" "}
            <input
              type="range"
              aria-label="Subject prompt frame"
              min="0"
              max={Math.max(0, item.scene.sourceRange.end - item.scene.sourceRange.start - 1 / 24)}
              step={1 / 24}
              value={frameTime}
              onChange={event => {
                const value = Number(event.target.value);
                setFrameTime(value);
                if (video.current) video.current.currentTime = item.scene.sourceRange.start + value;
              }}
            />
            <small>{frameTime.toFixed(2)}s from clip start</small>
          </label>
          <div className="subject-vfx-actions">
            <button type="button" aria-pressed={pointLabel === 1} onClick={() => setPointLabel(1)}>
              Subject point
            </button>
            <button type="button" aria-pressed={pointLabel === 0} onClick={() => setPointLabel(0)}>
              Background point
            </button>
            <button
              type="button"
              onClick={() =>
                update({ ...item.scene, prompt: { points: [], labels: [], shotPrompts: [] } })
              }
            >
              Clear points
            </button>
          </div>
          <p className="subject-vfx-point-count">
            {item.scene.prompt.points.length} first-frame points ·{" "}
            {item.scene.prompt.shotPrompts.length} shot resets
          </p>
          <label>
            Point X / Y{" "}
            <div className="subject-vfx-actions">
              <input
                ref={pointX}
                aria-label="Subject point X"
                type="number"
                min="0"
                max=".999999"
                step=".01"
                defaultValue=".5"
              />
              <input
                ref={pointY}
                aria-label="Subject point Y"
                type="number"
                min="0"
                max=".999999"
                step=".01"
                defaultValue=".5"
              />
              <button
                type="button"
                onClick={() => {
                  const x = Number(pointX.current.value),
                    y = Number(pointY.current.value);
                  if (
                    !Number.isFinite(x) ||
                    !Number.isFinite(y) ||
                    x < 0 ||
                    x >= 1 ||
                    y < 0 ||
                    y >= 1
                  ) {
                    setMessage("Points must be between zero and one, inside the frame.");
                    return;
                  }
                  if (item.scene.prompt.points.length >= 16) return;
                  update({
                    ...item.scene,
                    prompt: {
                      ...item.scene.prompt,
                      points: [...item.scene.prompt.points, [x, y]],
                      labels: [...item.scene.prompt.labels, pointLabel],
                    },
                  });
                }}
              >
                Add first-frame point
              </button>
            </div>
          </label>
          {item.scene.effects.map((effect, index) => (
            <fieldset key={effect.id}>
              <legend>{names[effect.type]}</legend>
              {Object.entries(effect)
                .filter(([key]) => !["id", "type"].includes(key))
                .map(([key, value]) => (
                  <label key={key}>
                    {key.replaceAll("_", " ")}
                    {typeof value === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index ? { ...layer, [key]: event.target.checked } : layer
                            ),
                          })
                        }
                      />
                    ) : key === "align" ? (
                      <select
                        value={value}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index ? { ...layer, align: event.target.value } : layer
                            ),
                          })
                        }
                      >
                        {["left", "center", "right"].map(align => (
                          <option key={align}>{align}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          typeof value === "number" ? "number" : key === "color" ? "color" : "text"
                        }
                        value={value}
                        min={limits[key]?.[0] ?? 0}
                        max={
                          limits[key]?.[1] ??
                          (typeof value === "number"
                            ? item.scene.sourceRange.end - item.scene.sourceRange.start
                            : undefined)
                        }
                        step={key === "count" || key === "seed" ? 1 : 0.01}
                        maxLength={key === "text" ? 120 : undefined}
                        onChange={event =>
                          update({
                            ...item.scene,
                            effects: item.scene.effects.map((layer, i) =>
                              i === index
                                ? {
                                    ...layer,
                                    [key]:
                                      typeof value === "number"
                                        ? Number(event.target.value)
                                        : event.target.value,
                                  }
                                : layer
                            ),
                          })
                        }
                      />
                    )}
                  </label>
                ))}
              <button
                type="button"
                onClick={() =>
                  update({
                    ...item.scene,
                    effects: item.scene.effects.filter((_, i) => i !== index),
                  })
                }
              >
                Remove layer
              </button>
            </fieldset>
          ))}
          <div className="subject-vfx-actions">
            <select
              aria-label="Subject effect type"
              value={layerType}
              onChange={event => setLayerType(event.target.value)}
            >
              {Object.entries(names).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={item.scene.effects.length >= 12}
              onClick={() =>
                update({
                  ...item.scene,
                  effects: [
                    ...item.scene.effects,
                    {
                      ...presets[layerType](
                        item.scene.sourceRange.end - item.scene.sourceRange.start
                      ),
                      id: createId("subject-layer"),
                    },
                  ],
                })
              }
            >
              Add layer
            </button>
          </div>
          {proposal && (
            <div className="subject-vfx-proposal">
              <strong>Director subject suggestion</strong>
              <p>
                {proposal.reason || "Review these source-bound effect layers before applying them."}
              </p>
              <button
                type="button"
                disabled={!proposalValid}
                onClick={() => {
                  try {
                    const scene = validateSubjectVfxScene({
                      ...item.scene,
                      effects: proposal.effects,
                    });
                    update(scene);
                    setMessage(
                      "Director layers applied. Render and review the result before exporting."
                    );
                  } catch (error) {
                    setMessage(error.message);
                  }
                }}
              >
                Apply reviewed suggestion
              </button>
              {!proposalValid && <small>This suggestion targets another source or range.</small>}
            </div>
          )}
          <div className="subject-vfx-actions">
            <button type="button" disabled={busy || operation.current} onClick={render}>
              {item.pending?.jobId
                ? "Check saved render"
                : ready
                  ? "Refresh rendered preview"
                  : "Render subject preview"}
            </button>
            {(activeJob.current || item.pending?.jobId) && (
              <button type="button" onClick={cancel}>
                Cancel render
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(items.filter(value => value !== item))}
            >
              Remove scene
            </button>
          </div>
          {ready && (
            <div className="subject-vfx-result">
              <video
                controls
                playsInline
                preload="metadata"
                src={item.preview.url}
                aria-label="Rendered subject effects with original audio"
                onPlaying={() => setPlayed(true)}
                onError={() => {
                  setPlayed(false);
                  const refreshKey = `${item.preview.jobId}:${revision}`;
                  if (!operation.current && !attemptedPreviewRefresh.current.has(refreshKey)) {
                    attemptedPreviewRefresh.current.add(refreshKey);
                    setMessage("Refreshing the saved subject preview link…");
                    void render();
                    return;
                  }
                  setMessage(
                    "The preview could not load. Refresh the rendered preview to get a new playback link."
                  );
                }}
              />
              <label>
                <input
                  type="checkbox"
                  disabled={!played}
                  checked={item.preview.reviewed === true}
                  onChange={event =>
                    onChange(
                      items.map(value =>
                        value === item
                          ? {
                              ...value,
                              preview: { ...value.preview, reviewed: event.target.checked },
                            }
                          : value
                      )
                    )
                  }
                />
                I reviewed the sound, subject edges and camera cuts
              </label>
            </div>
          )}
          <p className="subject-vfx-limit">
            Subject previews cover clips up to 10 seconds. The final export uses these rendered
            frames, then applies your framing, captions and other finishing choices.
          </p>
        </>
      )}
      {message && (
        <p role="status" data-state={status}>
          {message}
        </p>
      )}
    </section>
  );
}

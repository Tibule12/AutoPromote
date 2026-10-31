import React, { useEffect, useRef, useState } from "react";
import { createCinematicParameters, validateCinematicScene, planCinematicIntent } from "./cinematicContract";
import { normalizeStudio3DScene, studio3DSceneRevision } from "./studio3DModel";
import "./studioCinematic.css";

export const cinematicLocalEnabled = () => process.env.REACT_APP_CINEMATIC_LOCAL === "true" &&
  typeof window !== "undefined" && window.location.hostname === "127.0.0.1";
export async function cinematicRequest(route, body, method = body ? "POST" : "GET") {
  if (!cinematicLocalEnabled()) throw new Error("Start the isolated local cinematic worker to use this scene");
  const response = await fetch(`/api/cinematic/${route}`, { method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Local cinematic request failed");
  return result;
}
const makeId = () => `cinematic-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
const assetUrl = id => `/api/cinematic/assets/${id}/media`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export default function StudioCinematicPanel({ scenes, onChange, focusId, onSelect, playhead = 0, duration = 60, onSeek, onUseLandscape, onReviewScene }) {
  const [assets, setAssets] = useState([]), [capabilities, setCapabilities] = useState(null);
  const [state, setState] = useState({ status: "idle" }), [error, setError] = useState("");
  const active = useRef(null), alive = useRef(true), current = useRef(scenes);
  current.current = scenes;
  const cinematics = scenes.filter(item => item.sceneType === "cinematic_evidence");
  const scene = cinematics.find(item => item.id === focusId) || cinematics[0];
  const busy = ["queued", "preparing", "rendering", "assembling"].includes(state.status);
  useEffect(() => {
    alive.current = true;
    if (cinematicLocalEnabled()) Promise.all([cinematicRequest("assets"), cinematicRequest("capabilities")])
      .then(([media, caps]) => { if (alive.current) { setAssets(media.assets); setCapabilities(caps); } })
      .catch(err => { if (alive.current) setError(err.message); });
    return () => { alive.current = false; };
  }, []);
  const updateScene = patch => {
    const next = normalizeStudio3DScene({ ...scene, ...patch });
    onChange(scenes.map(item => item.id === scene.id ? next : item));
  };
  const edit = (section, field, value) => updateScene({ cinematic: { ...scene.cinematic,
    [section]: { ...scene.cinematic[section], [field]: value } } });
  const add = useDirector => {
    try {
      const start = Math.min(Math.max(0, Number(playhead) || 0), Math.max(0, duration - 4));
      const length = Math.min(8, duration - start, assets[0]?.duration || 8);
      if (length < 4) throw new Error("A cinematic scene needs at least four seconds on the timeline");
      const cinematic = createCinematicParameters(assets[0]?.id || "");
      const next = normalizeStudio3DScene(useDirector ? planCinematicIntent({ version: 1,
        action: "reconstruct_clock_and_return", presenterId: assets[0]?.id, evidenceId: assets[0]?.id,
        startTime: start, duration: length, content: cinematic.content }, assets, makeId()).scene :
        { id: makeId(), sceneType: "cinematic_evidence", startTime: start, duration: length, cinematic });
      onChange([...scenes, next]); onSelect(next.id); onUseLandscape?.(); onSeek?.(start); setError("");
      setState({ status: useDirector ? "Validated Director plan added" : "Editable scene added" });
    } catch (err) { setError(err.message); }
  };
  const upload = async file => {
    if (!file) return;
    setError(""); setState({ status: "Importing local media" });
    try {
      if (!cinematicLocalEnabled()) throw new Error("Local worker unavailable");
      if (file.size > 128 * 1024 ** 2) throw new Error("Use a local source smaller than 128 MB");
      const response = await fetch("/api/cinematic/assets", { method: "POST", headers: {
        "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file });
      const asset = await response.json(); if (!response.ok) throw new Error(asset.error);
      const media = await cinematicRequest("assets"); setAssets(media.assets);
      if (scene) edit("sources", "presenter", asset.id);
      setState({ status: "Local media imported" });
    } catch (err) { setError(err.message); }
  };
  const render = async quality => {
    const selected = scene;
    try {
      setError(""); validateCinematicScene(selected);
      if (selected.endTime > duration + .001) throw new Error("Move or shorten the scene to fit this programme");
      const revision = studio3DSceneRevision(selected);
      setState({ status: "queued", progress: 0, quality });
      let job = await cinematicRequest("jobs", { scene: selected, quality });
      active.current = job.id;
      for (;;) {
        if (!alive.current) return;
        setState(job);
        if (["completed", "failed", "cancelled"].includes(job.status)) break;
        await wait(1000); if (!alive.current) return;
        job = await cinematicRequest(`jobs/${job.id}`);
      }
      if (job.status === "failed") throw new Error(job.error || "Local rendering failed");
      const latest = current.current.find(item => item.id === selected.id);
      if (job.status === "completed" && latest && studio3DSceneRevision(latest) === revision) {
        onChange(current.current.map(item => item.id === selected.id ? normalizeStudio3DScene({ ...item,
          ...(quality === "export" ? { localExport: { url: job.movieUrl, revision, jobId: job.id, sha256: job.outputSha256 } } :
            { hqPreviewUrl: job.movieUrl, hqPreviewRevision: revision, hqPreviewJobId: job.id }) }) : item));
        onSeek?.(selected.startTime + selected.duration * .51);
      } else if (job.status === "completed") setError("Scene changed during processing. Output retained; render the current revision to preview it.");
    } catch (err) { if (alive.current) { setError(err.message); setState({ status: "failed" }); } }
    finally { active.current = null; }
  };
  const cancel = async () => {
    try { if (active.current) setState(await cinematicRequest(`jobs/${active.current}`, null, "DELETE")); }
    catch (err) { setError(err.message); }
  };
  const numeric = (label, section, field, min, max, step = .01) => <label key={field}><span>{label}</span>
    <input type="number" value={scene.cinematic[section][field]} min={min} max={max} step={step}
      onChange={event => { if (event.target.value !== "") edit(section, field, Number(event.target.value)); }} /></label>;
  const revision = scene ? studio3DSceneRevision(scene) : "";
  const readyExport = scene?.localExport?.revision === revision ? scene.localExport : null;
  const readyPreview = scene?.hqPreviewRevision === revision && scene.hqPreviewUrl;
  return <section className="studio-cinematic" aria-label="Cinematic evidence scene">
    <div className="cinematic-heading"><span>BLENDER · LOCAL CPU</span><h3>Cinematic evidence</h3></div>
    <p>A physical 3D stage, moving video displays, reconstructed clock readings and a camera return. The scene remains editable on your Studio timeline.</p>
    {!cinematicLocalEnabled() ? <p role="note">Local preview only in this milestone. Start the isolated cinematic Studio with <code>node scripts/cinematic/build-local-studio.cjs</code> and <code>node src/cinematic/localServer.cjs /path/to/video.mp4</code>. Cloud execution is unavailable.</p> : <>
      <p className="cinematic-cost">External cost $0 · CPU only · maximum 10 seconds · {capabilities?.maxSeconds || 3600}s processing limit</p>
      <label className="cinematic-upload">Import local video (up to 128 MB)<input type="file" accept="video/*" disabled={busy} onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      <div className="cinematic-actions"><button type="button" disabled={busy || !assets.length} onClick={() => add(false)}>Add cinematic scene</button>
        <button type="button" disabled={busy || !assets.length} onClick={() => add(true)}>Apply Director clock plan</button></div>
    </>}
    {cinematics.length > 0 && <label>Scene<select aria-label="Cinematic scene" value={scene.id} onChange={event => onSelect(event.target.value)}>
      {cinematics.map(item => <option key={item.id} value={item.id}>{item.text} · {item.startTime.toFixed(2)}s</option>)}
    </select></label>}
    {scene && <>
      <fieldset disabled={busy}><legend>Evidence stage preset · v1</legend>
        <div className="cinematic-fields">{["presenter", "evidence"].map(role => <label key={role}><span>{role === "presenter" ? "Presenter source" : "Evidence source"}</span>
          <select value={scene.cinematic.sources[role]} onChange={event => edit("sources", role, event.target.value)}><option value="">Choose local media</option>
            {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.duration.toFixed(2)}s</option>)}</select></label>)}
          <label><span>Programme start (s)</span><input type="number" min={0} step={1/24} max={duration - scene.duration} value={scene.startTime} onChange={event => updateScene({ startTime: Number(event.target.value) })} /></label>
          <label><span>Duration (s)</span><input type="number" min={4} max={Math.min(10, duration - scene.startTime)} step={1/24} value={scene.duration} onChange={event => updateScene({ duration: Number(event.target.value) })} /></label>
          {numeric("Presenter in (s)", "sources", "presenterOffset", 0, 86400)}
          {numeric("Evidence in (s)", "sources", "evidenceOffset", 0, 86400)}
          {numeric("Focal length (mm)", "camera", "focalLength", 32, 65, 1)}
          {numeric("Camera push", "camera", "pushIn", 0, 1, .05)}
          {numeric("Screen yaw (°)", "camera", "screenYaw", -22, 0, 1)}
          {numeric("Push starts (fraction)", "timing", "pushAt", .18, .35)}
          {numeric("Hold until (fraction)", "timing", "holdUntil", .55, .72)}
          {numeric("Return by (fraction)", "timing", "returnAt", .82, .94)}
          {numeric("Key light (W)", "lighting", "key", 100, 2000, 50)}
          {numeric("Fill light (W)", "lighting", "fill", 50, 1500, 50)}
          {numeric("Frame roughness", "material", "roughness", .1, .9, .05)}
          {numeric("Frame metallic", "material", "metallic", 0, 1, .05)}
          <label><span>Frame colour</span><input type="color" value={scene.cinematic.material.color} onChange={event => edit("material", "color", event.target.value)} /></label>
          {[["Headline", "headline", 36], ["Forensic callout", "callout", 40], ["Clock A", "clockA", 8], ["Clock B", "clockB", 8]].map(([label, field, max]) => <label key={field}><span>{label}</span>
            <input value={scene.cinematic.content[field]} maxLength={max} onChange={event => edit("content", field, event.target.value)} /></label>)}
          <label><input type="checkbox" checked={scene.enabled} onChange={event => updateScene({ enabled: event.target.checked })} />Scene enabled</label>
        </div>
      </fieldset>
      <p role="note">16:9 evidence stage. {scene.cinematic.content.disclosure}. These readings are illustrative; no matching clock narration is claimed.</p>
      <p>{readyExport ? "Current 720p scene export ready." : readyPreview ? "Current 360p scene preview ready." : "Preview needs rendering for this revision."} Preview uses the same Blender scene and source clock as export; it is processed video, not real-time 3D.</p>
      <div className="cinematic-actions"><button type="button" disabled={busy || !capabilities?.available} onClick={() => render("preview")}>Render scene preview · 360p</button>
        <button type="button" disabled={busy || !capabilities?.available} onClick={() => render("export")}>Render scene export · 720p</button>
        {busy && <button type="button" onClick={cancel}>Cancel scene render</button>}
        {!busy && <button type="button" onClick={() => onChange(scenes.filter(item => item.id !== scene.id))}>Remove cinematic scene</button>}
      </div>
      {onReviewScene && (readyExport || readyPreview) && scene.startTime === 0 && Math.abs(scene.duration - duration) < .001 ? <>
        <button type="button" onClick={() => onReviewScene(scene, readyExport?.url || readyPreview)}>Review scene movie on programme</button>
        <p>The processed scene movie plays as one synchronized picture/audio file beside the editable timeline. This review excludes other programme effects. Edit a parameter to return to authoring.</p>
      </> : null}
      {readyExport && <a href={readyExport.url} download="cinematic-evidence.mp4">Download scene movie</a>}
      {readyPreview && <a href={readyPreview} download="cinematic-evidence-preview-360p.mp4">Download rendered preview · 360p</a>}
      {(readyExport || readyPreview) && <video aria-label="Rendered cinematic scene review" controls muted preload="metadata" src={readyExport?.url || readyPreview} />}
      <p className="cinematic-limits">Scene export covers this scene interval with original presenter audio. Full programme assembly with other effects, cloud rendering, arbitrary node editing and grounded narration timing remain unfinished. Ordinary Studio rendering remains available for projects without cinematic scenes.</p>
    </>}
    {busy && <progress aria-label="Cinematic render progress" max={1} value={state.progress || 0} />}
    <output aria-live="polite">{state.status}{busy ? ` · ${Math.round((state.progress || 0) * 100)}%` : ""}{state.reused ? " · cached output reused" : ""}</output>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function StudioCinematicPreview({ scenes, time, getTime, getPlaybackState, zIndex = 100 }) {
  const video = useRef(null), [active, setActive] = useState(null);
  const lastPlayingCorrection = useRef(0);
  useEffect(() => {
    let frame;
    const tick = () => {
      const now = getTime?.() ?? time;
      const scene = scenes.filter(item => item.enabled !== false && now >= item.startTime && now < item.endTime).at(-1);
      const revision = scene && studio3DSceneRevision(scene);
      const url = scene && (scene.localExport?.revision === revision ? scene.localExport.url : scene.hqPreviewRevision === revision ? scene.hqPreviewUrl : "");
      setActive(previous => previous?.id === scene?.id && previous?.url === url ? previous : scene ? { id: scene.id, url } : null);
      if (video.current && url) {
        const target = Math.max(0, now - scene.startTime);
        const playback = getPlaybackState?.() || { paused: true, rate: 1 };
        const node = video.current;
        node.playbackRate = playback.rate || 1;
        if (playback.paused) {
          if (!node.paused) node.pause();
          if (!node.seeking && Math.abs(node.currentTime - target) > 1 / 48) node.currentTime = target;
        } else {
          // Let the decoder present frames normally during playback. Repeated
          // seeks throttle video decoding and caused the old flat-frame look.
          if (!node.seeking && Math.abs(node.currentTime - target) > .4 &&
              performance.now() - lastPlayingCorrection.current > 1250) {
            node.currentTime = target;
            lastPlayingCorrection.current = performance.now();
          }
          if (node.paused && node.readyState >= 2) node.play().catch(() => {});
        }
      }
      frame = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(frame);
  }, [scenes, getTime, getPlaybackState, time]);
  if (!cinematicLocalEnabled() || !active) return null;
  return <div className="cinematic-programme-preview" style={{ zIndex }}>
    {active.url ? <video ref={video} src={active.url} muted playsInline preload="auto" aria-label="Cinematic programme preview" /> :
      <span>Cinematic scene needs a local rendered preview</span>}
  </div>;
}

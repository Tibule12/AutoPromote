import React, { useMemo, useState } from "react";
import {
  STUDIO_3D_ANIMATIONS, STUDIO_3D_EASINGS, STUDIO_3D_MATERIALS,
  STUDIO_3D_KEYFRAME_FIELDS, STUDIO_3D_TEMPLATES, createStudio3DScene, normalizeStudio3DScene,
} from "./studio3DModel";
import "./studio3D.css";

const uniqueId = () => `studio-3d-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

function NumberControl({ label, value, min, max, step = 0.01, onChange }) {
  return <label className="studio-3d-control">
    <span>{label}</span>
    <input type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

function SelectControl({ label, value, options, onChange }) {
  return <label className="studio-3d-control"><span>{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
    </select>
  </label>;
}

export default function Studio3DPanel({ scenes = [], onChange, focusId, onSelect, playhead = 0, duration = 60, onSeek, onUploadAsset, onGeneratePreview, previewState }) {
  const [mode, setMode] = useState("basic");
  const selected = useMemo(() => scenes.find(scene => scene.id === focusId) || scenes[0], [scenes, focusId]);
  const scene = selected ? normalizeStudio3DScene(selected) : null;
  const change = patch => {
    if (!scene) return;
    onChange(scenes.map(item => item.id === scene.id ? normalizeStudio3DScene({ ...item, ...patch }) : item));
  };
  const add = templateId => {
    const start = Math.max(0, Math.min(Number(playhead) || 0, Math.max(0, duration - 0.5)));
    const next = createStudio3DScene(templateId, start, uniqueId());
    onChange([...scenes, next]);
    onSelect(next.id);
    onSeek?.(start);
  };
  const duplicate = () => {
    if (!scene) return;
    const startTime = Math.min(duration, scene.startTime + 0.5);
    const shift = startTime - scene.startTime;
    const next = normalizeStudio3DScene({ ...scene, id: uniqueId(), name: `${scene.name} copy`, startTime,
      keyframes: scene.keyframes.map(frame => ({ ...frame, id: uniqueId(), time: frame.time + shift })),
      hqPreviewUrl: "", hqPreviewRevision: "", hqPreviewJobId: "" });
    onChange([...scenes, next]);
    onSelect(next.id);
  };
  const reset = () => {
    if (!scene) return;
    const fresh = createStudio3DScene(scene.template, scene.startTime, scene.id);
    change({ ...fresh, duration: scene.duration, layerOrder: scene.layerOrder });
  };
  const setEnd = endTime => {
    const safeEnd = Math.max(scene.startTime + 0.5, endTime);
    change({ duration: safeEnd - scene.startTime, keyframes: scene.keyframes.filter(frame => frame.time <= safeEnd) });
  };
  const setStart = startTime => {
    const safeStart = Math.max(0, Math.min(startTime, scene.endTime - 0.5));
    change({ startTime: safeStart, duration: scene.endTime - safeStart, keyframes: scene.keyframes.filter(frame => frame.time >= safeStart) });
  };
  const addPoseKeyframe = () => {
    const time = Math.max(scene.startTime, Math.min(scene.endTime, Number(playhead) || scene.startTime));
    const frame = {
      id: uniqueId(), time, easing: scene.easing,
      values: Object.fromEntries(STUDIO_3D_KEYFRAME_FIELDS.map(field => [field, scene[field]])),
    };
    change({ keyframes: [...scene.keyframes.filter(item => Math.abs(item.time - time) > 0.025), frame] });
    onSeek?.(time);
  };

  return <section className="studio-3d-panel" aria-label="3D Motion designer" data-testid="studio-3d-panel">
    <div className="studio-3d-heading"><span className="panel-kicker">Editable 3D on your timeline</span><h4>3D Motion Director</h4><p>Build the scene live. Generate a high-quality preview only when you want to check the final finish.</p></div>
    <div className="studio-3d-template-grid" role="group" aria-label="3D templates">
      {STUDIO_3D_TEMPLATES.map(template => <button type="button" key={template.id} onClick={() => add(template.id)} title={`Add ${template.name} at playhead`}>
        <span style={{ background: template.accent }} /><strong>{template.name}</strong><small>Add at playhead</small>
      </button>)}
    </div>
    {scenes.length ? <div className="studio-3d-scene-list" aria-label="3D timeline objects">
      {scenes.map(item => <button type="button" key={item.id} aria-pressed={item.id === scene?.id} onClick={() => { onSelect(item.id); onSeek?.(item.startTime); }}>
        <span>{item.text || item.name}</span><small>{Number(item.startTime).toFixed(2)}–{(Number(item.startTime) + Number(item.duration)).toFixed(2)}s</small>
      </button>)}
    </div> : <p className="studio-3d-empty">Choose a template to create your first 3D timeline object.</p>}
    {scene ? <>
      <div className="studio-3d-editor-head"><strong>{scene.name}</strong><div role="group" aria-label="3D control mode"><button type="button" aria-pressed={mode === "basic"} onClick={() => setMode("basic")}>Basic</button><button type="button" aria-pressed={mode === "advanced"} onClick={() => setMode("advanced")}>Advanced</button></div></div>
      <div className="studio-3d-fields">
        <label className="studio-3d-control wide"><span>Main text</span><input maxLength={80} value={scene.text} onChange={event => change({ text: event.target.value })} /></label>
        <label className="studio-3d-control wide"><span>Supporting line</span><input maxLength={100} value={scene.secondary} onChange={event => change({ secondary: event.target.value })} /></label>
        <SelectControl label="Material" value={scene.material} options={STUDIO_3D_MATERIALS} onChange={material => change({ material })} />
        <SelectControl label="Entrance" value={scene.entrance} options={STUDIO_3D_ANIMATIONS} onChange={entrance => change({ entrance })} />
        <label className="studio-3d-control"><span>Primary colour</span><input type="color" value={scene.primaryColor} onChange={event => change({ primaryColor: event.target.value })} /></label>
        <label className="studio-3d-control"><span>Glow colour</span><input type="color" value={scene.glowColor} onChange={event => change({ glowColor: event.target.value })} /></label>
        <NumberControl label="Start (s)" value={scene.startTime} min={0} max={duration} onChange={setStart} />
        <NumberControl label="End (s)" value={scene.endTime} min={scene.startTime + 0.5} max={duration} onChange={setEnd} />
        <label className="studio-3d-control wide"><span>Motion intensity · {Math.round(scene.intensity * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={scene.intensity} onChange={event => change({ intensity: Number(event.target.value) })} /></label>
        <label className="studio-3d-control wide"><span>Upload logo / image (PNG, JPEG, WebP; 5 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) onUploadAsset?.(scene.id, file); event.target.value = ""; }} /></label>
        {scene.assetName ? <small className="studio-3d-asset-name">Asset: {scene.assetName}</small> : null}
      </div>
      {mode === "advanced" ? <div className="studio-3d-fields studio-3d-advanced">
        <SelectControl label="Font family" value={scene.fontFamily} options={["studio", "sans", "serif"]} onChange={fontFamily => change({ fontFamily })} />
        <SelectControl label="Weight" value={scene.fontWeight} options={["regular", "bold", "black"]} onChange={fontWeight => change({ fontWeight })} />
        <SelectControl label="Alignment" value={scene.textAlign} options={["left", "center", "right"]} onChange={textAlign => change({ textAlign })} />
        <SelectControl label="Easing" value={scene.easing} options={STUDIO_3D_EASINGS} onChange={easing => change({ easing })} />
        <SelectControl label="Hold" value={scene.hold} options={["still", "float", "pulse", "orbit"]} onChange={hold => change({ hold })} />
        <SelectControl label="Exit" value={scene.exit} options={["fade", "dolly", "spin", "burst"]} onChange={exit => change({ exit })} />
        <SelectControl label="Background" value={scene.background} options={["transparent", "dark", "light"]} onChange={background => change({ background })} />
        <SelectControl label="Quality" value={scene.quality} options={["draft", "preview", "high"]} onChange={quality => change({ quality })} />
        {[ ["X (%)", "x", 5, 95, 1], ["Y (%)", "y", 5, 95, 1], ["Z", "z", -4, 4, 0.1], ["Scale", "scale", 0.2, 3, 0.01],
          ["Rotate X", "rotationX", -180, 180, 1], ["Rotate Y", "rotationY", -180, 180, 1], ["Rotate Z", "rotationZ", -180, 180, 1],
          ["Extrusion", "extrusionDepth", 0.01, 1.5, 0.01], ["Bevel", "bevel", 0, 0.2, 0.01], ["Line spacing", "lineSpacing", 0.7, 2, 0.01],
          ["Focal length", "focalLength", 24, 85, 1], ["Camera motion", "cameraMotion", 0, 1, 0.01],
          ["Light direction", "lightDirection", -180, 180, 1], ["Light intensity", "lightIntensity", 0, 5, 0.1],
          ["Bloom", "bloom", 0, 1, 0.01], ["Audio response", "audioReactiveIntensity", 0, 1, 0.01],
          ["Layer order", "layerOrder", 0, 100, 1] ].map(([label, field, min, max, step]) => <NumberControl key={field} label={label} value={scene[field]} min={min} max={max} step={step} onChange={value => change({ [field]: value })} />)}
        <label className="studio-3d-control"><span>Secondary colour</span><input type="color" value={scene.secondaryColor} onChange={event => change({ secondaryColor: event.target.value })} /></label>
        <label className="studio-3d-control"><span>Light colour</span><input type="color" value={scene.lightColor} onChange={event => change({ lightColor: event.target.value })} /></label>
        {[ ["Shadows", "shadows"], ["Reflections", "reflections"], ["Enabled", "enabled"] ].map(([label, field]) => <label className="studio-3d-check" key={field}><input type="checkbox" checked={scene[field]} onChange={event => change({ [field]: event.target.checked })} />{label}</label>)}
        <div className="studio-3d-keyframes wide">
          <button type="button" onClick={addPoseKeyframe}>Add pose keyframe at {Number(playhead).toFixed(2)}s</button>
          {scene.keyframes.length ? <div aria-label="3D pose keyframes">
            {scene.keyframes.map((frame, index) => <div key={frame.id}>
              <button type="button" onClick={() => onSeek?.(frame.time)}>Pose {index + 1} · {frame.time.toFixed(2)}s</button>
              <select aria-label={`Pose ${index + 1} easing`} value={frame.easing} onChange={event => change({ keyframes: scene.keyframes.map(item => item.id === frame.id ? { ...item, easing: event.target.value } : item) })}>
                {STUDIO_3D_EASINGS.map(easing => <option key={easing} value={easing}>{easing.replaceAll("_", " ")}</option>)}
              </select>
              <button type="button" aria-label={`Delete pose ${index + 1}`} onClick={() => change({ keyframes: scene.keyframes.filter(item => item.id !== frame.id) })}>Delete</button>
            </div>)}
          </div> : <small>No custom pose keyframes. The preset animation remains fully active.</small>}
        </div>
      </div> : null}
      <div className="studio-3d-actions"><button type="button" onClick={duplicate}>Duplicate</button><button type="button" onClick={reset}>Reset preset</button><button type="button" onClick={() => onChange(scenes.filter(item => item.id !== scene.id))}>Delete</button></div>
      <button className="studio-3d-hq" type="button" onClick={() => onGeneratePreview?.(scene)} disabled={!onGeneratePreview || ["queued", "rendering"].includes(previewState?.status)}>
        {previewState?.status === "queued" ? "HQ preview queued…" : previewState?.status === "rendering" ? "Rendering HQ preview…" : previewState?.status === "failed" ? "Retry HQ 3D Preview" : "Generate HQ 3D Preview"}
      </button>
      {previewState?.status === "failed" ? <p role="alert">{previewState.message || "Preview failed. Try again."}</p> : null}
      {previewState?.status === "completed" && previewState.url ? <div className="studio-3d-hq-result">
        <video className="studio-3d-hq-video" controls src={previewState.url} aria-label="HQ 3D preview" />
        <a className="studio-3d-download" href={previewState.url} target="_blank" rel="noreferrer" download={`autopromote-${scene.template}-motion.mp4`}>
          Download standalone motion
        </a>
        <small>This is the separate rendered animation. AutoPromote keeps its transparent alpha version private for timeline compositing.</small>
      </div> : null}
    </> : null}
  </section>;
}

import React, { useState, useEffect } from "react";
import { STUDIO_3D_SHAPES, STUDIO_3D_OBJECT_MATERIALS, OBJECT_POSE_FIELDS, objectBounds, createStudio3DObject } from "./studio3DObjects";
import { RIBBON_BOUNDS, normalizeRibbon } from "./studio3DRibbon";

const uniqueId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

function ObjectNumber({ field, value, playhead, onCommit }) {
  const [draft, setDraft] = useState(null);
  const [min, max] = objectBounds(field);
  useEffect(() => setDraft(null), [value, playhead]);
  const commit = () => {
    if (draft !== null && draft.trim() && Number.isFinite(Number(draft))) {
      const next = Math.max(min, Math.min(max, Number(draft)));
      if (next !== value) onCommit(next);
    }
    setDraft(null);
  };
  return <label className="studio-3d-control"><span>{field}</span>
    <input aria-label={`Object ${field}`} type="text" inputMode="decimal" title={`${min} to ${max}; Enter or leave the field to apply`}
      value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { event.preventDefault(); setDraft(null); }
        event.stopPropagation();
      }} />
  </label>;
}

export default function Studio3DObjectEditor({ scene, onChange, playhead, onSeek }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = scene.objects.find(item => item.id === selectedId) || scene.objects[0];
  const update = patch => onChange(scene.objects.map(item => item.id === selected.id ? { ...item, ...patch } : item));
  const local = Math.max(0, Math.min(scene.duration, playhead - scene.startTime));
  const selectKey = frame => { onSeek?.(scene.startTime + frame.time); update(frame.values); };
  const replacingKey = selected?.keyframes.some(frame => Math.abs(frame.time - local) <= .001);
  return <section className="studio-3d-object-editor" aria-label="Scene objects">
    <h5>Scene objects</h5>
    <p>Set a pose and add its key, then seek and set the next pose. Each object has its own keys, timed from this scene’s start.</p>
    <div role="group" aria-label="Add scene object">
      {STUDIO_3D_SHAPES.map(shape => <button type="button" key={shape} disabled={scene.objects.length >= 24}
        onClick={() => {
          const object = createStudio3DObject(shape, uniqueId("object"));
          onChange([...scene.objects, object]); setSelectedId(object.id);
        }}>Add {shape}</button>)}
    </div>
    <label>Selected object<select aria-label="Selected scene object" value={selected?.id || ""} onChange={event => setSelectedId(event.target.value)}>
      {scene.objects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {selected ? <>
      <label>Name<input aria-label="Object name" maxLength={80} value={selected.name} onChange={event => update({ name: event.target.value })} /></label>
      <label>Shape<select aria-label="Object shape" value={selected.shape} onChange={event => {
        const next = { ...selected, shape: event.target.value };
        if (next.shape === "ribbon") next.ribbon = normalizeRibbon(next.ribbon); else delete next.ribbon;
        onChange(scene.objects.map(item => item.id === selected.id ? next : item));
      }}>
        {STUDIO_3D_SHAPES.map(shape => <option key={shape}>{shape}</option>)}
      </select></label>
      <label>Colour<input aria-label="Object colour" type="color" value={selected.color} onChange={event => update({ color: event.target.value })} /></label>
      <label>Surface<select aria-label="Object surface" value={selected.material || "inherit"} onChange={event => {
        const next = { ...selected }; if (event.target.value === "inherit") delete next.material; else next.material = event.target.value;
        onChange(scene.objects.map(item => item.id === selected.id ? next : item));
      }}>{STUDIO_3D_OBJECT_MATERIALS.map(material => <option key={material} value={material}>{material === "inherit" ? "Scene material" : material}</option>)}</select></label>
      <label>Surface roughness<input aria-label="Object surface roughness" type="range" min="0.04" max="1" step="0.01"
        value={selected.roughness ?? ({ chrome: .16, glass: .045, gold: .21, brushed: .24, silk: .38 }[selected.material || scene.material] ?? .7)}
        onChange={event => update({ roughness: Number(event.target.value) })} /></label>
      {selected.shape === "ribbon" ? <fieldset className="studio-3d-ribbon-controls"><legend>Ribbon form</legend>
        <label>Path<select aria-label="Ribbon path" value={selected.ribbon.path} onChange={event => update({ ribbon: { ...selected.ribbon, path: event.target.value } })}>
          {["loop", "knot", "wave"].map(path => <option key={path}>{path}</option>)}
        </select></label>
        {Object.entries(RIBBON_BOUNDS).map(([field, [min, max, step]]) => <label key={field}>
          {field[0].toUpperCase() + field.slice(1)} · {selected.ribbon[field].toFixed(step === 1 ? 0 : 3)}
          <input aria-label={`Ribbon ${field}`} type="range" min={min} max={max} step={step} value={selected.ribbon[field]}
            onChange={event => update({ ribbon: { ...selected.ribbon, [field]: Number(event.target.value) } })} />
        </label>)}
        <p>Flow follows the scene clock. Width, thickness and rounded edges form a solid surface; speed zero holds the shape.</p>
      </fieldset> : null}
      {["box", "cylinder"].includes(selected.shape) ? <label>Edge bevel<input aria-label="Object edge bevel" type="range" min="0" max="0.15" step="0.01" value={selected.bevel || 0}
        onChange={event => update({ bevel: Number(event.target.value) })} /></label> : null}
      <div className="studio-3d-fields">
        {OBJECT_POSE_FIELDS.map(field => <ObjectNumber key={`${selected.id}-${field}`} field={field} value={selected[field]} playhead={playhead}
          onCommit={value => update({ [field]: value })} />)}
      </div>
      <button type="button" disabled={!replacingKey && (selected.keyframes.length >= 32 || scene.objects.reduce((sum, item) => sum + item.keyframes.length, 0) >= 256)}
        onClick={() => update({ keyframes: [...selected.keyframes.filter(frame => Math.abs(frame.time - local) > .001), {
          id: uniqueId("pose"), time: local, easing: "ease_in_out",
          values: Object.fromEntries(OBJECT_POSE_FIELDS.map(field => [field, selected[field]])),
        }] })}>{replacingKey ? "Update" : "Add"} object pose at {local.toFixed(2)}s</button>
      <div aria-label="Object pose keys">{selected.keyframes.map((frame, index) => <div key={frame.id}>
        <button type="button" onClick={() => selectKey(frame)}>Load object pose {index + 1} · {frame.time.toFixed(2)}s</button>
        <select aria-label={`Object pose ${index + 1} easing`} value={frame.easing} onChange={event => update({
          keyframes: selected.keyframes.map(key => key.id === frame.id ? { ...key, easing: event.target.value } : key),
        })}>{["linear", "ease_out", "ease_in_out", "spring"].map(easing => <option key={easing}>{easing}</option>)}</select>
        <button type="button" aria-label={`Delete object pose ${index + 1}`} onClick={() => update({ keyframes: selected.keyframes.filter(key => key.id !== frame.id) })}>Delete key</button>
      </div>)}</div>
      <button type="button" disabled={scene.objects.length <= 1} onClick={() => onChange(scene.objects.filter(item => item.id !== selected.id))}>Delete object</button>
    </> : null}
  </section>;
}

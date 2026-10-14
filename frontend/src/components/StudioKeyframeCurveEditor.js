import React, { useState } from "react";
import { interpolateAutomationValue, STUDIO_EASINGS } from "./studioAutomation";

const bound = (value, low, high) => Math.max(low, Math.min(high, value));
const defaultCurve = [0.33, 0, 0.67, 1];

// Edits ordinary motion keys. The plotted values use the same interpolation as
// the live composition; the existing render compiler consumes these keys.
export default function StudioKeyframeCurveEditor({ keyframes, focusId, onSelect, onUpdate, locked = false, kind = "motion", valueBounds }) {
  const [selection, setSelection] = useState(null);
  const [drag, setDrag] = useState(null);
  const selected = keyframes.find(key => key.id === (selection && selection.focusId === focusId ? selection.id : focusId)) || keyframes.at(-1);
  if (!selected) return null;
  const keys = keyframes.filter(key => key.property === selected.property).sort((a, b) => a.time - b.time);
  const index = keys.findIndex(key => key.id === selected.id);
  const left = keys[index - 1];
  const curve = drag?.id === selected.id ? drag.curve : (selected.curve || defaultCurve);
  const displayed = keys.map(key => key.id === selected.id ? { ...key, curve } : key);
  const interval = left ? Number(selected.time) - Number(left.time) : 0;
  const limits = valueBounds?.[selected.property];
  const values = left && interval > 0 ? Array.from({ length: 65 }, (_, i) =>
    { const value = interpolateAutomationValue({ keyframes: displayed, property: selected.property,
      time: Number(left.time) + interval * i / 64 }); return limits ? bound(value, ...limits) : value; }) : [];
  const first = Number(left?.value ?? selected.value), last = Number(selected.value);
  const low = Math.min(first, last, ...values, first + (last - first) * curve[1], first + (last - first) * curve[3]);
  const high = Math.max(first, last, ...values, first + (last - first) * curve[1], first + (last - first) * curve[3]);
  const span = Math.max(high - low, 0.01);
  const y = value => 156 - (value - low) / span * 132;
  const x = progress => 22 + progress * 256;
  const path = values.map((value, i) => `${i ? "L" : "M"}${x(i / 64).toFixed(3)},${y(value).toFixed(3)}`).join(" ");
  const updateCurve = next => onUpdate(selected.id, { easing: "bezier", curve: next });
  const move = event => {
    if (!drag || drag.id !== selected.id || locked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pointX = (event.clientX - rect.left) * 300 / rect.width;
    const pointY = (event.clientY - rect.top) * 180 / rect.height;
    const next = [...drag.curve];
    next[drag.handle * 2] = Number(bound((pointX - 22) / 256, 0, 1).toFixed(4));
    const value = drag.low + (156 - pointY) / 132 * drag.span;
    next[drag.handle * 2 + 1] = Number(bound((value - first) / (last - first), -2, 2).toFixed(4));
    setDrag({ ...drag, curve: next });
  };
  const finish = event => {
    if (!drag) return;
    if (!locked && drag.id === selected.id) updateCurve(drag.curve);
    setDrag(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className="studio-keyframe-curve" aria-label={`${kind === "audio" ? "Audio" : "Motion"} value curve editor`}>
    <label className="inspector-select-field"><span>Property keyframe</span><select aria-label="Curve keyframe"
      value={selected.id} onChange={event => {
        const key = keyframes.find(item => item.id === event.target.value);
        setDrag(null); setSelection({ focusId, id: key.id }); onSelect?.(key.id);
      }}>{keyframes.map(key => <option key={key.id} value={key.id}>{key.property} · {Number(key.time).toFixed(3)}s</option>)}</select></label>
    <div className="motion-position-grid">
      <label><span>{selected.property} value{kind === "audio" ? " (%)" : ""}</span><input aria-label={`Selected ${kind} key value`} type="number" step="0.01"
        min={limits?.[0] ?? (kind === "audio" ? 0 : undefined)} max={limits?.[1] ?? (kind === "audio" ? 200 : undefined)}
        disabled={locked} value={Number(selected.value)} onChange={event => {
          if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) onUpdate(selected.id, {
            value: limits ? bound(event.target.valueAsNumber, ...limits) : kind === "audio" ? bound(event.target.valueAsNumber, 0, 200) : event.target.valueAsNumber });
        }} /></label>
      <label><span>Easing into this key</span><select aria-label={`Selected ${kind} key easing`} disabled={locked}
        value={selected.easing || "ease_in_out"} onChange={event => onUpdate(selected.id, { easing: event.target.value })}>
        {STUDIO_EASINGS.map(easing => <option key={easing.id} value={easing.id}>{easing.label}</option>)}</select></label>
    </div>
    {left && interval > 0 ? <>
      <small>{selected.property}: {first} → {last} · {Number(left.time).toFixed(3)}–{Number(selected.time).toFixed(3)}s{locked ? " · Track locked" : ""}</small>
      <svg viewBox="0 0 300 180" role="img" aria-label={`${selected.property} value curve`} onPointerMove={move}
        onPointerUp={finish} onPointerCancel={() => setDrag(null)}>
        <path d="M22,24V156H278" className="curve-axis" />
        <path d={path} className="curve-values" data-testid="motion-value-curve" />
        {(selected.easing === "bezier" || drag) && [0, 1].map(handle => {
          const progress = curve[handle * 2], amount = curve[handle * 2 + 1];
          const cx = x(progress), cy = y(first + (last - first) * amount);
          const disabled = locked || last === first;
          return <g key={handle}>
            <path className="curve-handle-line" d={`M${x(handle)},${y(handle ? last : first)}L${cx},${cy}`} />
            <circle cx={cx} cy={cy} r="6" role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
              aria-label={`Bezier handle ${handle + 1}`} className="curve-handle" onPointerDown={event => {
                if (disabled) return;
                event.preventDefault(); event.currentTarget.ownerSVGElement.setPointerCapture?.(event.pointerId);
                setDrag({ id: selected.id, handle, curve: [...curve], low, span });
              }} onKeyDown={event => {
                if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault(); const next = [...curve], step = event.shiftKey ? .1 : .02;
                const axis = ["ArrowLeft", "ArrowRight"].includes(event.key) ? 0 : 1;
                const delta = ["ArrowLeft", "ArrowDown"].includes(event.key) ? -step : step;
                next[handle * 2 + axis] = Number(bound(next[handle * 2 + axis] + delta, axis ? -2 : 0, axis ? 2 : 1).toFixed(4));
                updateCurve(next);
              }} />
          </g>;
        })}
        <text x="22" y="173">{Number(left.time).toFixed(2)}s</text><text x="250" y="173">{Number(selected.time).toFixed(2)}s</text>
      </svg>
      {selected.easing === "bezier" ? <div className="motion-position-grid">{["Time 1", "Value 1", "Time 2", "Value 2"].map((label, i) =>
        <label key={label}><span>{label}</span><input aria-label={`Bezier ${label}`} type="number" step="0.01"
          min={i % 2 ? -2 : 0} max={i % 2 ? 2 : 1} disabled={locked} value={curve[i]} onChange={event => {
            if (event.target.value === "" || !Number.isFinite(event.target.valueAsNumber)) return;
            const next = [...curve]; next[i] = bound(event.target.valueAsNumber, i % 2 ? -2 : 0, i % 2 ? 2 : 1); updateCurve(next);
          }} /></label>)}</div> : null}
    </> : <small>This is the first {selected.property} key. Add another key to define a motion interval.</small>}
  </section>;
}

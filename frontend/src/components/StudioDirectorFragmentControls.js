import React, { useEffect, useState } from "react";

export default function StudioDirectorFragmentControls({
  value,
  duration,
  disabled,
  onDraftChange,
  onUpdate,
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const set = (key, val) => {
    setDraft(d => ({ ...d, [key]: val }));
    onDraftChange();
  };
  const numeric = [
    ["holdSeconds", "Opening hold (s)", 0.2, duration * 0.25, 0.1],
    ["fanSeconds", "Fan opens (s)", 0.5, duration * 0.45, 0.1],
    ["switchSeconds", "Shot changes (s)", 1, duration * 0.75, 0.1],
    ["resolveSeconds", "Picture settles (s)", 1.4, duration, 0.1],
    ["scale", "Fragment size", 0.65, 0.85, 0.01],
    ["spread", "Spacing (%)", 2, 7, 0.5],
    ["fanDegrees", "Fan angle step (°)", 3, 9, 1],
    ["staggerSeconds", "Stagger (s)", 0, 0.08, 0.01],
  ];
  return (
    <details
      open
      className="studio-director-fragment-controls"
      data-testid="director-fragment-settings"
    >
      <summary>Refine the fragment transition</summary>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <label>
          Strip layout
          <select
            className="ap-comp-select"
            aria-label="Strip layout"
            value={draft.axis}
            disabled={disabled}
            onChange={e => set("axis", e.target.value)}
          >
            <option value="x">Vertical strips</option>
            <option value="y">Horizontal bands</option>
          </select>
        </label>
        <label>
          Travel direction
          <select
            className="ap-comp-select"
            aria-label="Travel direction"
            value={draft.direction}
            disabled={disabled}
            onChange={e => set("direction", e.target.value)}
          >
            {["up", "down", "left", "right"].map(d => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fragments
          <select
            className="ap-comp-select"
            aria-label="Fragments"
            value={draft.count}
            disabled={disabled}
            onChange={e => set("count", Number(e.target.value))}
          >
            {[3, 4, 5, 6].map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Graphic field
          <input
            aria-label="Graphic field"
            type="color"
            value={draft.background}
            disabled={disabled}
            onChange={e => set("background", e.target.value)}
          />
        </label>
        {numeric.map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              className="ap-comp-select"
              type="number"
              aria-label={label}
              value={draft[key]}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              onChange={e => set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#a7b3c6" }}>
        Adjust the draft before applying it. The strips remain ordinary editable footage layers.
      </p>
      <button
        className="studio-director-create"
        type="button"
        disabled={disabled}
        onClick={() => {
          const next = { ...draft };
          for (const [key] of numeric)
            next[key] = String(next[key]).trim() ? Number(next[key]) : NaN;
          onUpdate(next);
        }}
      >
        Update motion settings
      </button>
    </details>
  );
}

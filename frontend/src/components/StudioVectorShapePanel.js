import React, { useEffect, useState } from "react";
import StudioVectorPathEditor from "./StudioVectorPathEditor";
import {
  createStudioVectorShape,
  splitStudioVectorSegment,
  studioVectorUri,
  studioVectorContours,
  studioVectorContour,
  replaceStudioVectorContour,
} from "./studioVectorShape";

export default function StudioVectorShapePanel({
  layers,
  selectedId,
  onSelect,
  onAdd,
  onChange,
  locked,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [point, setPoint] = useState(0),
    [contourIndex, setContourIndex] = useState(0);
  const layer = layers.find(l => l.id === selectedId),
    shape = layer?.vectorShape,
    contours = shape ? studioVectorContours(shape) : [],
    contour = shape
      ? studioVectorContour(shape, Math.min(contourIndex, contours.length - 1))
      : null;
  useEffect(() => {
    setPoint(0);
    setContourIndex(0);
  }, [selectedId]);
  const apply = async next => {
    if (busy || locked) return;
    setBusy(true);
    setError("");
    try {
      await (next ? onChange(layer.id, next) : onAdd(createStudioVectorShape()));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const applyContour = next =>
    apply(replaceStudioVectorContour(shape, Math.min(contourIndex, contours.length - 1), next));
  return (
    <details
      className="advanced-tool-section studio-vector-panel"
      data-testid="studio-vector-panel"
    >
      <summary>Vector artwork · editable paths</summary>
      <p>
        Shape the artwork, then animate its layer in Motion. Points and tangents remain editable
        after export.
      </p>
      <p>
        Use Motion → Stroke start, Stroke end and Stroke offset to draw, erase or loop an outline.
        Set a visible stroke width first. The fill stays in place.
      </p>
      <button type="button" disabled={busy || locked} onClick={() => apply(null)}>
        Add vector artwork
      </button>
      {!!layers.length && (
        <label>
          Artwork layer
          <select
            aria-label="Vector artwork layer"
            value={shape ? layer.id : ""}
            disabled={busy}
            onChange={e => onSelect(e.target.value)}
          >
            <option value="" disabled>
              Select artwork
            </option>
            {layers.map(l => (
              <option key={l.id} value={l.id}>
                {l.name || "Vector artwork"}
              </option>
            ))}
          </select>
        </label>
      )}
      {shape && (
        <>
          <label>
            Contour
            <select
              aria-label="Vector contour"
              value={Math.min(contourIndex, contours.length - 1)}
              onChange={e => {
                setContourIndex(Number(e.target.value));
                setPoint(0);
              }}
            >
              {contours.map((_, i) => (
                <option key={i} value={i}>
                  Contour {i + 1}
                </option>
              ))}
            </select>
          </label>
          <p>
            Overlapping closed contours cut through the fill. Edit counters inside letters without
            painting a background over them.
          </p>
          <div className="studio-vector-edit-box">
            <img src={studioVectorUri(shape)} alt="Editable vector artwork" />
            <StudioVectorPathEditor
              shape={contour}
              selected={Math.min(point, contour.nodes.length - 1)}
              onSelect={setPoint}
              locked={locked || busy}
              onChange={applyContour}
            />
          </div>
          <p>
            Drag a square point or its round tangents. Arrow keys nudge; Shift uses a larger step.
            Escape cancels a drag.
          </p>
          <div className="motion-position-grid">
            <label>
              Point
              <select
                aria-label="Selected vector point"
                value={point}
                onChange={e => setPoint(Number(e.target.value))}
                disabled={busy}
              >
                {contour.nodes.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={
                busy ||
                locked ||
                contour.nodes.length >= 64 ||
                (!contour.closed && point === contour.nodes.length - 1)
              }
              type="button"
              onClick={() => {
                try {
                  void applyContour(splitStudioVectorSegment(contour, point));
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Split after point
            </button>
            <button
              disabled={busy || locked || contour.nodes.length <= (contour.closed ? 3 : 2)}
              type="button"
              onClick={() => {
                const next = { ...contour, nodes: contour.nodes.filter((_, i) => i !== point) };
                setPoint(Math.max(0, point - 1));
                applyContour(next);
              }}
            >
              Remove point
            </button>
            <button
              disabled={busy || locked}
              type="button"
              onClick={() =>
                applyContour({
                  ...contour,
                  nodes: contour.nodes.map((n, i) =>
                    i === point ? { ...n, in: [0, 0], out: [0, 0] } : n
                  ),
                })
              }
            >
              Corner point
            </button>
            <button
              disabled={busy || locked}
              type="button"
              onClick={() => {
                const ns = contour.nodes,
                  a = ns[(point + ns.length - 1) % ns.length],
                  b = ns[(point + 1) % ns.length],
                  v = [(b.x - a.x) / 6, (b.y - a.y) / 6];
                applyContour({
                  ...contour,
                  nodes: ns.map((n, i) => (i === point ? { ...n, in: v.map(x => -x), out: v } : n)),
                });
              }}
            >
              Smooth point
            </button>
          </div>
          <label>
            <input
              aria-label="Close vector path"
              type="checkbox"
              checked={contour.closed}
              disabled={busy || locked}
              onChange={e => applyContour({ ...contour, closed: e.target.checked })}
            />
            Close path
          </label>
          <label>
            Fill
            <select
              aria-label="Vector fill"
              value={shape.fill.kind}
              disabled={busy || locked}
              onChange={e => apply({ ...shape, fill: { ...shape.fill, kind: e.target.value } })}
            >
              <option value="solid">Solid</option>
              <option value="linear">Linear gradient</option>
              <option value="none">No fill</option>
            </select>
          </label>
          <div className="motion-position-grid">
            {[
              ["color", "Vector first color"],
              ["endColor", "Vector second color"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  type="color"
                  value={shape.fill[key]}
                  disabled={busy || locked}
                  onChange={e =>
                    apply({ ...shape, fill: { ...shape.fill, [key]: e.target.value } })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Gradient direction
            <select
              aria-label="Vector gradient direction"
              disabled={busy || locked}
              value={JSON.stringify([shape.fill.start, shape.fill.end])}
              onChange={e => {
                const [start, end] = JSON.parse(e.target.value);
                apply({ ...shape, fill: { ...shape.fill, start, end } });
              }}
            >
              <option value="[[0,100],[100,0]]">Diagonal</option>
              <option value="[[0,50],[100,50]]">Horizontal</option>
              <option value="[[50,0],[50,100]]">Vertical</option>
            </select>
          </label>
          <label>
            Stroke width
            <input
              aria-label="Vector stroke width"
              type="number"
              min="0"
              max="20"
              step=".25"
              value={shape.stroke.width}
              disabled={busy || locked}
              onChange={e =>
                apply({ ...shape, stroke: { ...shape.stroke, width: Number(e.target.value) } })
              }
            />
          </label>
          <label>
            Stroke color
            <input
              aria-label="Vector stroke color"
              type="color"
              value={shape.stroke.color}
              disabled={busy || locked}
              onChange={e =>
                apply({ ...shape, stroke: { ...shape.stroke, color: e.target.value } })
              }
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Preparing artwork…</p>}
    </details>
  );
}

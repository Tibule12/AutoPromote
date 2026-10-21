import React, { useEffect, useRef, useState } from "react";
import { editStudioVectorNode, studioVectorPath } from "./studioVectorShape";

export default function StudioVectorPathEditor({ shape, onChange, locked, selected, onSelect }) {
  const [draft, setDraft] = useState(null),
    drag = useRef(null);
  const cancel = () => {
    drag.current = null;
    setDraft(null);
  };
  useEffect(() => {
    cancel();
  }, [shape, locked]);
  const current = draft || shape,
    node = current.nodes[selected] || current.nodes[0];
  const commit = event => {
    const next = drag.current?.next;
    cancel();
    if (next && !locked) onChange(next);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const start = (event, index, kind) => {
    event.stopPropagation();
    event.preventDefault();
    if (locked || event.button !== 0) return;
    onSelect(index);
    event.currentTarget.focus();
    drag.current = { index, kind };
    event.currentTarget.ownerSVGElement.setPointerCapture?.(event.pointerId);
  };
  const keyboard = (event, index, kind) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || locked) return;
    event.preventDefault();
    event.stopPropagation();
    const n = shape.nodes[index],
      p = kind === "anchor" ? [n.x, n.y] : [...n[kind]],
      axis = ["ArrowLeft", "ArrowRight"].includes(event.key) ? 0 : 1;
    p[axis] = Math.max(
      kind === "anchor" ? 0 : -200,
      Math.min(
        kind === "anchor" ? 100 : 200,
        p[axis] +
          (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 1 : 0.1)
      )
    );
    onChange(editStudioVectorNode(shape, index, kind, p));
  };
  return (
    <svg
      className="studio-vector-path-editor"
      data-testid="studio-vector-path-editor"
      viewBox="0 0 100 100"
      aria-label="Edit vector contour"
      onPointerDown={e => e.stopPropagation()}
      onPointerMove={event => {
        if (!drag.current || locked) return;
        const svg = event.currentTarget;
        let p;
        if (svg.createSVGPoint && svg.getScreenCTM?.()) {
          const point = svg.createSVGPoint();
          point.x = event.clientX;
          point.y = event.clientY;
          p = point.matrixTransform(svg.getScreenCTM().inverse());
        } else {
          const r = svg.getBoundingClientRect();
          p = {
            x: ((event.clientX - r.left) / r.width) * 100,
            y: ((event.clientY - r.top) / r.height) * 100,
          };
        }
        const { index, kind } = drag.current,
          n = shape.nodes[index];
        const values =
          kind === "anchor"
            ? [Math.max(0, Math.min(100, p.x)), Math.max(0, Math.min(100, p.y))]
            : [Math.max(-200, Math.min(200, p.x - n.x)), Math.max(-200, Math.min(200, p.y - n.y))];
        const next = editStudioVectorNode(shape, index, kind, values);
        drag.current.next = next;
        setDraft(next);
      }}
      onPointerUp={commit}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          cancel();
        }
      }}
    >
      <path d={studioVectorPath(current)} className="studio-vector-outline" />
      {["in", "out"].map(kind => {
        const x = node.x + node[kind][0],
          y = node.y + node[kind][1];
        return (
          <g key={kind}>
            <line x1={node.x} y1={node.y} x2={x} y2={y} />
            <circle
              cx={x}
              cy={y}
              r="1.5"
              role="button"
              tabIndex="0"
              aria-label={`Vector point ${selected + 1} ${kind} tangent`}
              aria-disabled={!!locked}
              onPointerDown={e => start(e, selected, kind)}
              onKeyDown={e => keyboard(e, selected, kind)}
            />
          </g>
        );
      })}
      {current.nodes.map((n, i) => (
        <rect
          key={i}
          x={n.x - 1.4}
          y={n.y - 1.4}
          width="2.8"
          height="2.8"
          className={i === selected ? "is-selected" : ""}
          role="button"
          tabIndex="0"
          aria-label={`Vector point ${i + 1}`}
          aria-disabled={!!locked}
          onFocus={() => onSelect(i)}
          onPointerDown={e => start(e, i, "anchor")}
          onKeyDown={e => keyboard(e, i, "anchor")}
        />
      ))}
    </svg>
  );
}

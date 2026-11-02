import React, { useRef } from 'react';

export const clampStudioCurve = value => [0, 1, 2, 3].map(i => {
  const n = Number(value?.[i]);
  return Number.isFinite(n) ? Math.max(i % 2 ? -2 : 0, Math.min(i % 2 ? 2 : 1, n)) : [0.33, 0, 0.67, 1][i];
});

// Edits the existing arriving key's cubic easing, in normalized time/value
// coordinates. Speed and Value Graphs share these exact canonical coefficients.
export default function StudioCurveHandles({ value, onChange, onInteractionStart, onInteractionEnd }) {
  const svg = useRef(null), gesture = useRef(null);
  const curve = clampStudioCurve(value);
  const x = n => 24 + n * 272, y = n => 96 - n * 40;
  const update = event => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = svg.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const next = [...drag.current];
    next[drag.index * 2] = ((event.clientX - rect.left) * 320 / rect.width - 24) / 272;
    next[drag.index * 2 + 1] = (96 - (event.clientY - rect.top) * 192 / rect.height) / 40;
    drag.current = clampStudioCurve(next).map(n => Number(n.toFixed(4)));
    onChange(drag.current);
  };
  const finish = (event, cancelled = false) => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    if (cancelled) onChange(drag.initial);
    else update(event);
    gesture.current = null;
    onInteractionEnd?.();
  };
  return <div className="ap-comp-curve-editor" data-testid="comp-curve-editor">
    <span>Segment easing · drag the handles</span>
    <svg ref={svg} viewBox="0 0 320 192" aria-label="Cubic Bezier easing handles"
      style={{ width: '100%', maxHeight: 160, touchAction: 'none', display: 'block' }}
      onPointerMove={update} onPointerUp={event => finish(event)}
      onPointerCancel={event => finish(event, true)}>
      <path d="M24 16V176 M296 16V176 M24 96H296 M24 56H296" stroke="#334155" fill="none" />
      <path d={`M24 96 C${x(curve[0])} ${y(curve[1])} ${x(curve[2])} ${y(curve[3])} 296 56`}
        stroke="#22d3ee" strokeWidth="2.5" fill="none" data-testid="comp-easing-path" />
      {[0, 1].map(index => <g key={index}>
        <line x1={index ? 296 : 24} y1={index ? 56 : 96}
          x2={x(curve[index * 2])} y2={y(curve[index * 2 + 1])} stroke="#94a3b8" />
        <circle cx={x(curve[index * 2])} cy={y(curve[index * 2 + 1])} r="8"
          fill={index ? '#fbbf24' : '#a78bfa'} stroke="#0f172a" strokeWidth="2"
          role="slider" tabIndex={0} aria-label={`Bezier handle ${index + 1}`}
          aria-valuetext={`${curve[index * 2]}, ${curve[index * 2 + 1]}`}
          data-testid={`comp-curve-handle-${index + 1}`} style={{ cursor: 'grab' }}
          onPointerDown={event => {
            if (event.button !== 0 || gesture.current) return;
            event.preventDefault(); event.stopPropagation();
            gesture.current = { index, pointerId: event.pointerId, initial: [...curve], current: [...curve] };
            svg.current.setPointerCapture?.(event.pointerId);
            onInteractionStart?.();
          }}
          onKeyDown={event => {
            const key = { ArrowLeft: [0, -.01], ArrowRight: [0, .01], ArrowDown: [1, -.01], ArrowUp: [1, .01] }[event.key];
            if (!key) return;
            event.preventDefault();
            const next = [...curve]; next[index * 2 + key[0]] += key[1] * (event.shiftKey ? 10 : 1);
            onChange(clampStudioCurve(next).map(n => Number(n.toFixed(4))));
          }} />
      </g>)}
    </svg>
    <output aria-label="Bezier coefficients">{curve.map(n => n.toFixed(4)).join(' / ')}</output>
  </div>;
}

import React, { useEffect, useRef, useState } from 'react';
import { buildMotionAutomationStyle } from './studioAutomation';
import { studioPositionPath } from './studioMotionEditing';

// The gesture previews path geometry locally and commits its X/Y pair once.
export default function StudioMotionPathEditor({ keyframes, target, time, locked, onCommit, onSeek, onPreview, toDisplay = p => p, fromDisplay = p => p }) {
  const [draft, setDraft] = useState(null), drag = useRef(null), suppressClick = useRef(false);
  const { points, samples } = studioPositionPath(keyframes, target, draft);
  const current = toDisplay({ ...buildMotionAutomationStyle(keyframes, time, target), time });
  const cancel = () => { drag.current = null; setDraft(null); onPreview?.(null); };
  useEffect(() => () => onPreview?.(null), [target.id]);
  const finish = event => {
    const value = drag.current?.next;
    suppressClick.current = !!drag.current?.moved;
    cancel();
    if (!locked && value) onCommit(value.time, { x: value.x, y: value.y });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <svg className="studio-motion-path" data-testid="studio-motion-path" viewBox="0 0 100 100" preserveAspectRatio="none"
    aria-label={`Motion path for ${target.name || 'selected layer'}`} onPointerMove={event => {
      if (!drag.current || locked) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (Math.hypot(event.clientX - drag.current.clientX, event.clientY - drag.current.clientY) < 3 && !drag.current.moved) return;
      const local = fromDisplay({ time: drag.current.time, x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }, rect);
      const next = { time: drag.current.time, x: Math.max(0, Math.min(100, local.x)), y: Math.max(0, Math.min(100, local.y)) };
      drag.current.next = next; drag.current.moved = true; setDraft(next); onPreview?.(next);
    }} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={event => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = true; cancel(); } }}>
    {samples.length > 1 && <polyline points={samples.map(point => { const p = toDisplay(point); return `${p.x},${p.y}`; }).join(' ')} />}
    {points.map(point => { const p = toDisplay(point); return <circle key={point.time} className="studio-motion-path-key"
      cx={p.x} cy={p.y} r="1.1" vectorEffect="non-scaling-stroke" role="button" tabIndex="0" aria-disabled={!!locked}
      aria-label={`Motion position at ${point.time.toFixed(3)} seconds`} onPointerDown={event => {
        event.stopPropagation(); suppressClick.current = false;
        if (locked || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus();
        onSeek(point.time);
        drag.current = { time: point.time, clientX: event.clientX, clientY: event.clientY };
        event.currentTarget.ownerSVGElement.setPointerCapture?.(event.pointerId);
      }} onClick={event => { event.stopPropagation(); if (!suppressClick.current) onSeek(point.time); suppressClick.current = false; }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSeek(point.time); return; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || locked) return;
        event.preventDefault(); event.stopPropagation(); const axis = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 'x' : 'y';
        const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        onCommit(point.time, { x: point.x, y: point.y, [axis]: Math.max(0, Math.min(100, point[axis] + delta * (event.shiftKey ? 1 : .1))) });
      }}><title>{`X ${point.x.toFixed(1)}, Y ${point.y.toFixed(1)} · drag to edit${locked ? ' · Track locked' : ''}`}</title></circle>; })}
    <circle className="studio-motion-path-current" cx={current.x} cy={current.y} r="1.5" vectorEffect="non-scaling-stroke" />
    {draft && <text className="studio-motion-path-coordinate" x="2" y="96">{draft.time.toFixed(3)}s · X {draft.x.toFixed(1)} · Y {draft.y.toFixed(1)}</text>}
  </svg>;
}

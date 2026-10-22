import React, { useEffect, useRef, useState } from 'react';
import { buildMotionAutomationStyle } from './studioAutomation';
import { studioPositionPath, studioPositionSegments, editStudioSpatialPath } from './studioMotionEditing';

// The gesture previews path geometry locally and commits its X/Y pair once.
export default function StudioMotionPathEditor({ keyframes, target, time, locked, onCommit, onPathChange, onSeek, onPreview, toDisplay = p => p, fromDisplay = p => p }) {
  const [draft, setDraft] = useState(null), drag = useRef(null), suppressClick = useRef(false);
  const { points, samples } = studioPositionPath(keyframes, target, draft);
  const effective = draft?.keys || keyframes;
  const current = toDisplay({ ...buildMotionAutomationStyle(effective, time, target), time });
  const segments = studioPositionSegments(effective, target.id);
  const segment = segments.find(item => time > item.start && time <= item.end) || segments.find(item => item.end >= time) || segments.at(-1);
  const cancel = () => { drag.current = null; setDraft(null); onPreview?.(null); };
  useEffect(() => () => onPreview?.(null), [target.id]);
  useEffect(() => { if (locked) { drag.current = null; setDraft(null); onPreview?.(null); } }, [locked, onPreview]);
  const finish = event => {
    const gesture = drag.current, value = gesture?.next;
    suppressClick.current = !!drag.current?.moved;
    cancel();
    if (!locked && value) {
      if (gesture.handle !== undefined) onPathChange?.(gesture.end, {handle: gesture.handle, position: value});
      else onCommit(value.time, { x: value.x, y: value.y });
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <><svg className="studio-motion-path" data-testid="studio-motion-path" viewBox="0 0 100 100" preserveAspectRatio="none"
    aria-label={`Motion path for ${target.name || 'selected layer'}`} onPointerMove={event => {
      if (!drag.current || locked) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (Math.hypot(event.clientX - drag.current.clientX, event.clientY - drag.current.clientY) < 3 && !drag.current.moved) return;
      const local = fromDisplay({ time: drag.current.time, x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }, rect);
      let next = { time: drag.current.time, x: Math.max(0, Math.min(100, local.x)), y: Math.max(0, Math.min(100, local.y)) }, preview = next;
      if (drag.current.handle !== undefined) {
        const anchor = drag.current.handle ? segment.last : segment.first;
        next = {time: drag.current.time, x: Math.max(anchor.x - 200, Math.min(anchor.x + 200, local.x)),
          y: Math.max(anchor.y - 200, Math.min(anchor.y + 200, local.y))};
        preview = {time: drag.current.time, keys: editStudioSpatialPath(keyframes, target.id, drag.current.end,
          {handle: drag.current.handle, position: next})};
      }
      drag.current.next = next; drag.current.moved = true; setDraft(preview); onPreview?.(preview);
    }} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={event => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = true; cancel(); } }}>
    {samples.length > 1 && <polyline points={samples.map(point => { const p = toDisplay(point); return `${p.x},${p.y}`; }).join(' ')} />}
    {onPathChange && segment?.curved && segment.coordinated && segment.controls.map((control, handle) => {
      const p = toDisplay(control), anchor = toDisplay(handle ? segment.last : segment.first);
      const label = `${handle ? 'Incoming' : 'Outgoing'} path handle at ${control.time.toFixed(3)} seconds`;
      return <g key={handle}><line className="studio-path-tangent" x1={anchor.x} y1={anchor.y} x2={p.x} y2={p.y}/>
        <circle className="studio-path-handle" cx={p.x} cy={p.y} r=".9" role="button" tabIndex="0" aria-label={label}
          aria-disabled={!!locked} onPointerDown={event => {
            event.stopPropagation(); suppressClick.current = false;
            if (locked || event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus();
            drag.current = {time: control.time, end: segment.end, handle, clientX: event.clientX, clientY: event.clientY};
            event.currentTarget.ownerSVGElement.setPointerCapture?.(event.pointerId);
          }} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || locked) return;
            event.preventDefault(); event.stopPropagation();
            const axis = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 'x' : 'y';
            const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
            const origin = (handle ? segment.last : segment.first)[axis];
            onPathChange(segment.end, {handle, position: {...control,
              [axis]: Math.max(origin - 200, Math.min(origin + 200, control[axis] + delta * (event.shiftKey ? 1 : .1)))}});
          }}><title>{label} · drag to shape the route</title></circle></g>;
    })}
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
    {draft && !draft.keys && <text className="studio-motion-path-coordinate" x="2" y="96">{draft.time.toFixed(3)}s · X {draft.x.toFixed(1)} · Y {draft.y.toFixed(1)}</text>}
  </svg>
  {onPathChange && segment && <div className="studio-motion-path-toolbar" onPointerDown={event => event.stopPropagation()}>
    <span>{segment.start.toFixed(2)}–{segment.end.toFixed(2)}s</span>
    <button type="button" disabled={locked} onClick={() => onPathChange(segment.end,
      {enabled: !(segment.curved && segment.coordinated)})}>{segment.curved && segment.coordinated ? 'Straighten path' : 'Curve path'}</button>
    <small>{segment.curved && segment.coordinated ? 'Drag the amber handles' : 'Shape the route between position keys'}</small>
  </div>}
  </>;
}

import React, { useRef, useState } from 'react';

// Commit one gesture, rather than writing history during each pointer sample.
export default function StudioGroupTimelineClip({ item, duration, frameStep, snapping, snapTargets = [], selected, onSelect, onEdit }) {
  const drag = useRef(null), [pending, setPending] = useState(null);
  const start = item.startTime, end = start + item.duration;
  const quantize = value => Math.max(0, Math.min(duration, Math.round(value / frameStep) * frameStep));
  const down = (event, action) => {
    event.stopPropagation(); onSelect?.(item.id);
    if (item.locked || event.button !== 0) return;
    drag.current = { action, x: event.clientX, value: action === 'trim-end' ? end : start,
      width: event.currentTarget.closest('.pro-track-lane').getBoundingClientRect().width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    if (!drag.current || item.locked) return;
    const d = drag.current;
    let value = quantize(d.value + (event.clientX - d.x) / Math.max(1, d.width) * duration);
    if (snapping) {
      const nearest = snapTargets.reduce((best, target) => Math.abs(target - value) < Math.abs(best - value) ? target : best, Infinity);
      if (Math.abs(nearest - value) <= Math.max(frameStep, duration * .006)) value = quantize(nearest);
    }
    d.next = value; setPending({ action: d.action, value });
  };
  const finish = event => {
    event.stopPropagation(); const d = drag.current; drag.current = null; setPending(null);
    if (!item.locked && d?.next !== undefined && Math.abs(d.next - d.value) > .000001) onEdit?.(item.id, d.action, d.next);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboard = (event, action) => {
    if (!['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { drag.current = null; setPending(null); return; }
    if (item.locked) return;
    const value = action === 'trim-end' ? end : start;
    onEdit?.(item.id, action, quantize(value + (event.key === 'ArrowRight' ? 1 : -1) * frameStep * (event.shiftKey ? 10 : 1)));
  };
  const handlers = action => ({ onPointerDown: event => down(event, action), onPointerMove: move, onPointerUp: finish,
    onPointerCancel: () => { drag.current = null; setPending(null); }, onKeyDown: event => keyboard(event, action) });
  const shownStart = pending && pending.action !== 'trim-end' ? pending.value : start;
  const shownEnd = pending?.action === 'trim-end' ? pending.value : pending?.action === 'move' ? pending.value + item.duration : end;
  return <div className={`pro-group-clip ${selected ? 'is-selected' : ''} ${item.locked ? 'is-locked' : ''}`}
    data-testid={`group-timeline-clip-${item.id}`} data-start={start} data-end={end}
    style={{ left: `${shownStart / duration * 100}%`, width: `${Math.max(.3, (shownEnd - shownStart) / duration * 100)}%` }}>
    <button type="button" className="pro-group-trim" aria-label={`Trim ${item.name} in`} disabled={item.locked} {...handlers('trim-start')}>▏</button>
    <button type="button" className="pro-group-body" aria-label={`Select ${item.name} group clip`} aria-pressed={selected}
      {...handlers('move')} onClick={event => { event.stopPropagation(); onSelect?.(item.id); }}>
      ▣ {item.name} <small>{item.childCount} layers</small>
    </button>
    <button type="button" className="pro-group-trim" aria-label={`Trim ${item.name} out`} disabled={item.locked} {...handlers('trim-end')}>▕</button>
  </div>;
}

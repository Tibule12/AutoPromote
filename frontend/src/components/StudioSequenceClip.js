import React, { useRef, useState } from 'react';

// Source gestures are provisional until pointer-up: one gesture, one history
// transaction. The editor rechecks locks, source handles and stale ranges.
export default function StudioSequenceClip({ children, item, index, start, duration, safeDuration,
  displayRate, editTool, locked, onEdit, onClick, style, label, ranges, canRollStart, canRollEnd,
  frameStep = 1 / 30, snapping, snapTargets = [], 'aria-label': accessibleLabel }) {
  const drag = useRef(null), suppressClick = useRef(false), [pending, setPending] = useState(null);
  const sourceDrag = (event, edge) => {
    if (locked || event.button !== 0 || editTool === 'razor' || editTool === 'hand') return;
    const mode = edge ? editTool === 'roll' ? 'roll' : 'ripple' : editTool;
    if (!edge && !['slip', 'slide'].includes(mode)) return;
    event.preventDefault(); event.stopPropagation();
    const lane = event.currentTarget.closest('.pro-track-lane');
    drag.current = { x: event.clientX, width: Math.max(1, lane.getBoundingClientRect().width),
      mode, edge, expectedRanges: ranges, delta: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    if (!drag.current) return;
    event.stopPropagation();
    const state = drag.current;
    let delta = Math.round((event.clientX - state.x) / state.width * safeDuration / frameStep) * frameStep;
    if (snapping && state.mode !== 'slip') {
      const origin = state.edge === 'end' ? start + duration : start;
      const target = snapTargets.filter(at => Math.abs(at - origin) > .000001)
        .find(at => Math.abs(at - origin - delta) <= Math.min(.15, frameStep * 2));
      if (target !== undefined) delta = target - origin;
    }
    state.delta = delta;
    setPending({ ...state });
  };
  const finish = event => {
    if (!drag.current) return;
    event.stopPropagation();
    const state = drag.current; drag.current = null; setPending(null);
    suppressClick.current = Math.abs(state.delta) > .000001;
    if (suppressClick.current && !locked) onEdit?.({ clipId: item.id, mode: state.mode, edge: state.edge,
      delta: state.delta, expectedRanges: state.expectedRanges });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handlers = edge => ({ onPointerDown: event => sourceDrag(event, edge), onPointerMove: move,
    onPointerUp: finish, onPointerCancel: () => { drag.current = null; setPending(null); suppressClick.current = true; },
    onKeyDown: event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key) || locked || ['razor','hand'].includes(editTool)) return;
      const mode = edge ? editTool === 'roll' ? 'roll' : 'ripple' : editTool;
      if (!edge && !['slip','slide'].includes(mode)) return;
      event.preventDefault(); event.stopPropagation();
      onEdit?.({ clipId:item.id, mode, edge, delta:frameStep*(event.shiftKey?10:1)*(event.key==='ArrowRight'?1:-1), expectedRanges:ranges });
    } });
  let left = start, length = duration;
  if (pending?.mode === 'slide') left += pending.delta;
  if (pending?.edge === 'start') { left += pending.delta; length -= pending.delta; }
  if (pending?.edge === 'end') length += pending.delta;
  return <div className="pro-track-clip pro-sequence-clip" data-testid={`pro-video-clip-${index + 1}`}
    aria-label={accessibleLabel || label} onClick={event => { if (event.target === event.currentTarget) onClick?.(event); }}
    data-start-time={start} data-end-time={start + duration}
    style={{ ...style, left: `${Math.max(0, left / safeDuration * 100)}%`, width: `${Math.max(.1, length / safeDuration * 100)}%` }}>
    <button type="button" className="pro-sequence-edge" data-testid={`source-trim-start-${item.id}`}
      aria-label={`Trim ${label} source in`} disabled={locked || editTool === 'razor' || editTool === 'hand' || (editTool === 'roll' && !canRollStart)}
      title={editTool === 'roll' ? 'Roll incoming cut with previous clip' : 'Ripple trim source in'} {...handlers('start')}>▏</button>
    <button type="button" className="pro-sequence-body" aria-label={accessibleLabel || label} title={label}
      {...handlers(null)} onClick={event => {
        if (suppressClick.current) { event.stopPropagation(); suppressClick.current = false; return; }
        onClick?.(event);
      }}>
      {children}
      {pending && <output className="pro-sequence-delta">{pending.mode} {pending.delta > 0 ? '+' : ''}{(pending.delta / displayRate).toFixed(3)}s</output>}
    </button>
    <button type="button" className="pro-sequence-edge" data-testid={`source-trim-end-${item.id}`}
      aria-label={`Trim ${label} source out`} disabled={locked || editTool === 'razor' || editTool === 'hand' || (editTool === 'roll' && !canRollEnd)}
      title={editTool === 'roll' ? 'Roll outgoing cut with next clip' : 'Ripple trim source out'} {...handlers('end')}>▕</button>
  </div>;
}

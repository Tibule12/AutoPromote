import { useEffect, useRef, useState } from 'react';

// Selection is UI state. Only subsequent key edits enter the project history.
export default function useStudioKeyframeMarquee(scrollRef, selected, onSelect, enabled) {
  const drag = useRef(null), callbacks = useRef({ selected, onSelect });
  callbacks.current = { selected, onSelect };
  const [box, setBox] = useState(null);
  const update = () => {
    const state = drag.current;
    if (!state) return;
    const rect = state.content.getBoundingClientRect();
    const x = state.clientX - rect.left, y = state.clientY - rect.top;
    const area = { left: Math.min(state.x, x), top: Math.min(state.y, y),
      width: Math.abs(x - state.x), height: Math.abs(y - state.y) };
    const next = state.extend || state.subtract ? new Set(state.before) : new Set();
    for (const key of state.content.querySelectorAll('.pro-motion-property .pro-motion-keyframe')) {
      const keyRect = key.getBoundingClientRect();
      const cx = keyRect.left + keyRect.width / 2 - rect.left;
      const cy = keyRect.top + keyRect.height / 2 - rect.top;
      if (cx >= area.left && cx <= area.left + area.width && cy >= area.top && cy <= area.top + area.height) {
        if (state.subtract) next.delete(key.dataset.keyId); else next.add(key.dataset.keyId);
      }
    }
    setBox(area); callbacks.current.onSelect(next);
  };
  const stop = (cancel = false) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null; cancelAnimationFrame(state.frame);
    if (cancel) callbacks.current.onSelect(state.before);
    if (state.content.hasPointerCapture?.(state.pointerId)) state.content.releasePointerCapture(state.pointerId);
    setBox(null);
  };
  useEffect(() => {
    const cancel = event => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); stop(true); } };
    document.addEventListener('keydown', cancel, true);
    return () => { document.removeEventListener('keydown', cancel, true); if (drag.current) cancelAnimationFrame(drag.current.frame); };
  }, []); // The active gesture and callbacks are read from refs.
  useEffect(() => { if (!enabled) stop(true); }, [enabled]);
  const autoScroll = () => {
    const state = drag.current, scroll = scrollRef.current;
    if (!state || !scroll) return;
    const rect = scroll.getBoundingClientRect();
    const speed = (p, low, high) => p < low + 28 ? -Math.min(14, (low + 28 - p) / 3)
      : p > high - 28 ? Math.min(14, (p - high + 28) / 3) : 0;
    const left = scroll.scrollLeft, top = scroll.scrollTop;
    scroll.scrollLeft += speed(state.clientX, rect.left, rect.right);
    scroll.scrollTop += speed(state.clientY, rect.top + 32, rect.bottom);
    if (left !== scroll.scrollLeft || top !== scroll.scrollTop) update();
    state.frame = requestAnimationFrame(autoScroll);
  };
  return { box, handlers: {
    onPointerDown: event => {
      if (!enabled || event.button !== 0 || !event.target.closest('.pro-motion-property .pro-track-lane') ||
          event.target.closest('button,input,select,textarea')) return;
      event.preventDefault();
      const content = event.currentTarget, rect = content.getBoundingClientRect();
      drag.current = { content, pointerId: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top,
        clientX: event.clientX, clientY: event.clientY, before: new Set(callbacks.current.selected),
        extend: event.shiftKey || event.ctrlKey || event.metaKey, subtract: event.altKey };
      content.focus({ preventScroll: true }); content.setPointerCapture?.(event.pointerId);
      update(); drag.current.frame = requestAnimationFrame(autoScroll);
    },
    onPointerMove: event => { if (drag.current) { drag.current.clientX = event.clientX; drag.current.clientY = event.clientY; update(); } },
    onPointerUp: () => { if (drag.current) { update(); stop(); } },
    onPointerCancel: () => stop(true),
    onLostPointerCapture: () => stop(true),
    onScroll: () => update(),
  } };
}

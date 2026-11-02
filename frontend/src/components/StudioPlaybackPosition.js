import React, { useLayoutEffect, useRef } from 'react';

function useClockPaint(clock, paint) {
  // Clock readouts are transient DOM, like a canvas playhead. Synchronous small
  // writes keep them out of React's expensive editor commit and its queue.
  useLayoutEffect(() => {
    if (!clock) return;
    paint();
    return clock.subscribe(paint);
  });
}

export function StudioPlaybackTime({ clock, fallback = 0, format, ...props }) {
  const ref = useRef(null);
  useClockPaint(clock, () => { if (ref.current) ref.current.textContent = format(clock.getSnapshot().outputTime); });
  return <span {...props} ref={ref}>{format(clock ? clock.getSnapshot().outputTime : fallback)}</span>;
}

export function StudioPlaybackRange({ clock, value, ...props }) {
  const ref = useRef(null);
  const bounded = time => Math.max(Number(props.min || 0), Math.min(Number(props.max), time));
  useClockPaint(clock, () => { if (ref.current) ref.current.value = String(bounded(clock.getSnapshot().outputTime)); });
  return <input {...props} ref={ref} step={clock ? 'any' : props.step}
    value={clock ? bounded(clock.getSnapshot().outputTime) : value}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      if (!clock || event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const step = Number(props.step);
      if (!(step > 0)) return;
      event.preventDefault();
      const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1;
      event.currentTarget.value = String(bounded(Number(event.currentTarget.value) + direction * step));
      props.onChange?.(event);
    }} />;
}

export function StudioTimelinePosition({ clock, playhead, displayRate, framingItems, format }) {
  const ref = useRef(null);
  const text = () => {
    const position = clock?.getSnapshot();
    const time = position ? position.programmeTime : playhead;
    const framing = framingItems.find(cut => time >= cut.time && time < cut.time + cut.duration);
    return format(position ? position.outputTime : playhead / displayRate) +
      (framing ? ` · ${framing.name} · ${format(framing.time / displayRate)}–${format((framing.time + framing.duration) / displayRate)}` : '');
  };
  useClockPaint(clock, () => { if (ref.current) ref.current.textContent = text(); });
  return <strong ref={ref} data-testid="pro-current-edit">{text()}</strong>;
}

// Update the few absolute markers, not an inherited CSS variable on the entire
// timeline. Inheritance invalidates the styles of every track/control/key.
// Layer/inspector React state stays on its ordinary authoring path.
export function useStudioPlayheadDisplay(ref, clock, duration) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!clock || !node) return;
    const paint = () => {
      const left = `${Math.max(0, Math.min(100, clock.getSnapshot().programmeTime / Math.max(.1, duration) * 100))}%`;
      for (const marker of node.querySelectorAll('.pro-playhead, .compact-timeline-playhead')) {
        if (marker.style.left !== left) marker.style.left = left;
      }
    };
    paint();
    const unsubscribe = clock.subscribe(paint);
    return unsubscribe;
  });
}

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
  const pendingSeek = useRef(null);
  const handlers = useRef(props);
  handlers.current = props;
  const bounded = time => Math.max(Number(props.min || 0), Math.min(Number(props.max), time));
  useLayoutEffect(() => { pendingSeek.current = null; }, [clock, props.min, props.max]);
  useClockPaint(clock, () => {
    if (!ref.current) return;
    const actual = bounded(clock.getSnapshot().outputTime);
    // Keep a user's seek target until the decoder acknowledges it. Rebinding
    // the clock can publish an older frame between rapid keyboard gestures.
    // It must not become the starting point of the next requested frame step.
    // Once verified playback resumes, its first sampled position can already
    // be past the requested tick. Keeping that target then freezes the thumb
    // forever, even while the timecode/timeline and actual media advance.
    if (pendingSeek.current !== null &&
        Math.abs(actual - pendingSeek.current) > 2 / 90000 && !clock.isAdvancing?.()) return;
    pendingSeek.current = null;
    ref.current.value = String(actual);
  });
  useLayoutEffect(() => {
    const input = ref.current;
    if (!clock || !input) return;
    let receivedInput = false;
    const seek = event => {
      receivedInput = true;
      pendingSeek.current = Number(input.value);
      handlers.current.onInput?.(event);
      handlers.current.onChange?.(event);
    };
    const change = event => {
      // A native range gesture emits input, then change. A clock paint while
      // the decoder seeks can already have changed the DOM value by then;
      // do not dispatch that trailing event as a second, different seek.
      if (receivedInput) { receivedInput = false; return; }
      pendingSeek.current = Number(input.value);
      handlers.current.onChange?.(event);
    };
    input.addEventListener('input', seek);
    input.addEventListener('change', change);
    return () => {
      input.removeEventListener('input', seek);
      input.removeEventListener('change', change);
    };
  }, [clock]);
  return <input {...props} ref={ref} step={clock ? 'any' : props.step}
    value={clock ? undefined : value}
    defaultValue={clock ? bounded(clock.getSnapshot().outputTime) : undefined}
    // Native listeners keep React's value tracker/restoration out of this
    // clock-painted input. Non-clock inputs keep their normal React handlers.
    onInput={clock ? undefined : props.onInput}
    onChange={clock ? undefined : props.onChange}
    onBlur={event => {
      pendingSeek.current = null;
      if (clock && ref.current) ref.current.value = String(bounded(clock.getSnapshot().outputTime));
      props.onBlur?.(event);
    }}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      if (!clock || event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const step = Number(props.step);
      if (!(step > 0)) return;
      event.preventDefault();
      const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1;
      // A source cut can sit between output frames. Step on the delivery grid,
      // rather than carrying that cut's fractional phase into every later key.
      // Decoder microsecond rounding must not repeat the current frame either.
      const position = (pendingSeek.current ?? Number(event.currentTarget.value)) / step;
      const tolerance=Math.max(.0001,2/90000/step);
      const frame = direction > 0 ? Math.floor(position + tolerance) + 1 : Math.ceil(position - tolerance) - 1;
      const target = bounded(frame * step);
      pendingSeek.current = target;
      event.currentTarget.value = String(target);
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

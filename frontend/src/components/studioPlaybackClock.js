import { getSafeMediaSource } from '../utils/security';
import { mapOutputTickToProgrammeTick, mapProgrammeTickToOutputTick,
  secondsToTicks, ticksToSeconds } from './studioTime';

// Read the existing programme decoder. This store only distributes its clock;
// it neither advances time nor changes playback, source selection or the edit.
export function createStudioPlaybackClock() {
  let snapshot = { sourceTime: 0, programmeTime: 0, outputTime: 0 };
  const listeners = new Set();
  let readPosition = () => null;
  let syncPosition = () => {};
  const publish = next => {
    if (!next || Object.keys(next).every(key => next[key] === snapshot[key])) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read: () => readPosition(),
    sync: () => syncPosition(),
    bind(video, { url, start = 0, end = 0, programmeStart = 0, timeMap,
      renderedOutput = false, fallbackSourceTime = start }) {
      const source = getSafeMediaSource(url);
      let disposed = false, waiting = false, stopFrames = () => {}, afterFrame;
      const position = sourceTime => {
        const bounded = Math.max(0, Number(sourceTime) || 0);
        const programmeEnd = timeMap?.at(-1)?.programmeRange.endTick || 0;
        const outputEnd = timeMap?.at(-1)?.outputRange.endTick || 0;
        const programmeTime = renderedOutput
          ? ticksToSeconds(mapOutputTickToProgrammeTick(timeMap,
              Math.min(outputEnd, secondsToTicks(bounded))) || 0)
          : programmeStart + Math.min(Math.max(0, bounded - start), Math.max(0, end - start));
        return { sourceTime: bounded, programmeTime,
          outputTime: renderedOutput ? bounded : ticksToSeconds(mapProgrammeTickToOutputTick(timeMap,
            Math.min(programmeEnd, secondsToTicks(programmeTime))) || 0) };
      };
      const read = () => {
        if (disposed || !video || !source || video.currentSrc !== source ||
            video.seeking || video.readyState < 2 || !Number.isFinite(video.currentTime) ||
            (!renderedOutput && (secondsToTicks(Math.max(0, video.currentTime)) < secondsToTicks(start) ||
              secondsToTicks(Math.max(0, video.currentTime)) > secondsToTicks(end)))) return null;
        // Native decoders round to microseconds; an exact domain-tick trim can
        // land fractionally outside its seconds representation after Home/End.
        return position(renderedOutput ? video.currentTime : Math.max(start, Math.min(end, video.currentTime)));
      };
      readPosition = read;
      publish(read() || position(fallbackSourceTime));
      const sync = () => { if (!waiting) publish(read()); };
      syncPosition = sync;
      const stopDisplay = () => { stopFrames(); clearTimeout(afterFrame); };
      const displayFrame = () => {
        sync();
        // Other paint callbacks can do substantial work after this callback.
        // Refresh once at the end of that turn using the same decoder, so the
        // next presented readout does not retain its pre-paint timestamp.
        clearTimeout(afterFrame); afterFrame = setTimeout(sync, 0);
      };
      const restart = () => {
        waiting = false; stopDisplay(); sync();
        // The lightweight UI follows the continuously advancing media clock at
        // display cadence. Canvas composition still uses decoded-picture events.
        let frame;
        const tick = () => {
          if (disposed || waiting || video.paused || video.ended) return;
          displayFrame();
          frame = window.requestAnimationFrame(tick);
        };
        if (!video?.paused && !video?.ended) frame = window.requestAnimationFrame(tick);
        stopFrames = () => window.cancelAnimationFrame(frame);
      };
      const suspend = () => { waiting = true; stopDisplay(); };
      const paused = () => { stopDisplay(); waiting = false; sync(); };
      const events = { play: restart, playing: restart, seeked: restart,
        loadeddata: restart, timeupdate: sync, pause: paused, ended: paused,
        waiting: suspend, seeking: suspend, emptied: suspend, error: suspend };
      if (video) {
        for (const [event, listener] of Object.entries(events)) video.addEventListener(event, listener);
        restart();
      }
      return () => {
        disposed = true; stopDisplay();
        if (readPosition === read) { readPosition = () => null; syncPosition = () => {}; }
        if (video) for (const [event, listener] of Object.entries(events)) video.removeEventListener(event, listener);
      };
    },
  };
}

import { applySafeMediaSource, getSafeMediaSource } from '../utils/security';
import { mapStudioContinuousSeconds } from './studioTime';

// This transient identity does not change an edit, source trim or asset. Keep
// it separate from the native audio clock and from persisted project data.
export function pausedStudioFrameRequest(clip, sourceTime, fps) {
  const storagePath = clip?.sourceStoragePath || clip?.storagePath;
  const sourceContentHash = clip?.contentHash;
  const start = Number(clip?.startRequest ?? clip?.start ?? 0);
  const end = Number(clip?.endRequest ?? clip?.end);
  const rate = Number(fps);
  if (!storagePath || !/^[a-f0-9]{64}$/.test(sourceContentHash || '') ||
      ![start, end, rate, sourceTime].every(Number.isFinite) || end <= start || end-start > 90 ||
      rate < 1 || rate > 120 || sourceTime < start || sourceTime >= end) return null;
  const frameIndex = Math.min(Math.ceil((end-start)*rate)-1,
    Math.max(0, Math.round((sourceTime-start)*rate)));
  return { storagePath, sourceContentHash, start, end, fps: rate, frameIndex };
}
export function pausedStudioFrameKey(request) {
  return request ? JSON.stringify(request) : '';
}

// The sequence worker first makes frame-aligned clips, maps their timestamps
// continuously and samples the output once. Select that same raw CFR picture
// for a paused ramp instead of the browser's nearest arbitrary source time.
// Fractional clip lengths and a frame that belongs to another occurrence stay
// on the native fallback until their concat boundary semantics are qualified.
export function pausedStudioMappedFrameRequest(clip, sourceTime, fps, timeline, timeMap) {
  const request = pausedStudioFrameRequest(clip, sourceTime, fps);
  if (!request || !Array.isArray(timeline) || !timeMap?.length) return null;
  let offset = 0, total = 0, found = false;
  for (const row of timeline) {
    const length = Number(row.endRequest ?? row.end) - Number(row.startRequest ?? row.start ?? 0);
    if (!(length > 0) || Math.abs(length * request.fps - Math.round(length * request.fps)) > .00001) return null;
    if (row.id === clip.id) { offset = total; found = true; }
    total += length;
  }
  if (!found || total > 90 || ![24,25,30,50,60].includes(request.fps) ||
      Math.abs(timeMap.at(-1).programmeRange.endTick / 90000 - total) > .00002) return null;
  const programme = offset + sourceTime - request.start;
  const frameAtProgramme = time => {
    const tick = Math.round(mapStudioContinuousSeconds(timeMap, time) * 90000);
    return Math.floor((2 * tick * request.fps + 90000) / 180000);
  };
  const outputFrame = frameAtProgramme(programme);
  const frames = Math.round(total * request.fps);
  let low = 0, high = frames - 1, selected = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const mapped = frameAtProgramme(middle / request.fps);
    if (mapped <= outputFrame) { selected = middle; low = middle + 1; }
    else high = middle - 1;
  }
  const frameIndex = selected - Math.round(offset * request.fps);
  if (frameIndex < 0 || frameIndex >= Math.round((request.end-request.start)*request.fps)) return null;
  return { ...request, frameIndex };
}

// A later ramp must not disable exact sampling of earlier, unchanged frames.
// After the first retimed interval the final CFR phase may differ; retain the
// native decoder there until that sampling path is separately qualified.
export function studioPausedFrameHasIdentityClock(timeMap, programmeTick) {
  if (!Array.isArray(timeMap) || !timeMap.length || !Number.isSafeInteger(programmeTick) || programmeTick < 0) return false;
  const preceding = timeMap.filter(row => row.programmeRange.startTick <= programmeTick);
  return preceding.length > 0 && preceding.every(row => row.rateNumerator === row.rateDenominator &&
    row.programmeRange.startTick === row.outputRange.startTick &&
    row.programmeRange.endTick === row.outputRange.endTick);
}

// Refreshing a logo or sound link must not rebuild the video sequence and
// dispose its prepared decoder. Only arrays containing that source change.
export function mapStudioSourceAccess(items, storagePath, update) {
  let changed = false;
  const next = items.map(item => {
    if ((item.sourceStoragePath || item.storagePath) !== storagePath) return item;
    const result = update(item);
    if (result !== item) changed = true;
    return result;
  });
  return changed ? next : items;
}

export function isStudioSourceClockCurrent(video, { activeVideo, url, start, end, hasNext }) {
  if (!video || video !== activeVideo || video.seeking || video.readyState < 2) return false;
  const source = getSafeMediaSource(url);
  if (!source || video.currentSrc !== source) return false;
  const time = Number(video.currentTime);
  return Number.isFinite(time) && time >= Number(start || 0) &&
    (!hasNext || time < Number(end));
}

export function waitForStudioAudio(media, { timeoutMs = 10000, signal } = {}) {
  if (!media) return Promise.reject(new Error('Background sound is unavailable.'));
  if (signal?.aborted) return Promise.reject(new DOMException('Playback preparation cancelled.', 'AbortError'));
  if (media.readyState >= 3 && !media.seeking) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      media.removeEventListener('canplay', ready);
      media.removeEventListener('seeked', ready);
      media.removeEventListener('error', failed);
      signal?.removeEventListener('abort', cancelled);
      error ? reject(error) : resolve();
    };
    const ready = () => { if (media.readyState >= 3 && !media.seeking) finish(); };
    const failed = () => finish(new Error('Background sound could not be loaded.'));
    const cancelled = () => finish(new DOMException('Playback preparation cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Background sound is still loading. Try playback again.')), timeoutMs);
    media.addEventListener('canplay', ready);
    media.addEventListener('seeked', ready);
    media.addEventListener('error', failed);
    signal?.addEventListener('abort', cancelled, { once: true });
    if (media.readyState === 0) media.load();
    ready();
  });
}

// Match viral_render_contract.build_segment_transition_filters: transitions
// affect the source segment before graphics/compositing, never a finished movie.
export function studioJoinFade({ duration, localTime, transitionIn, transitionOut, transitionDuration,
  renderedOutput = false }) {
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const length = Math.max(.05, finite(duration, .05));
  const span = Math.min(Math.max(0, finite(transitionDuration, 0)), length / 3, .35);
  const none = { mode: '', opacity: 0 };
  if (renderedOutput || span < .01) return none;
  // FFmpeg receives three-decimal durations and out-points from the contract.
  const fadeLength = Number(span.toFixed(3));
  const time = finite(localTime, 0);
  const incoming = String(transitionIn || '').trim().toLowerCase();
  const outgoing = String(transitionOut || '').trim().toLowerCase();
  const supported = mode => mode === 'soft_dip' || mode === 'energy_flash';
  if (supported(incoming) && time < fadeLength) {
    return { mode: incoming, opacity: Math.min(1, Math.max(0, 1 - time / fadeLength)) };
  }
  const outStart = Number((length - span).toFixed(3));
  if (supported(outgoing) && time > outStart) {
    return { mode: outgoing, opacity: Math.min(1, Math.max(0, (time - outStart) / fadeLength)) };
  }
  return none;
}

// Short audio cues cannot depend on timeupdate's roughly 250 ms cadence.
// Observe decoded programme frames without creating React state per frame.
export function watchStudioAudioClock(video, onFrame) {
  if (typeof video?.requestVideoFrameCallback !== 'function') return () => {};
  let frame, disposed = false;
  const tick = () => {
    if (disposed) return;
    if (!video.paused && !video.seeking && video.readyState >= 2) onFrame();
    if (!disposed) frame = video.requestVideoFrameCallback(tick);
  };
  frame = video.requestVideoFrameCallback(tick);
  return () => { disposed = true; video.cancelVideoFrameCallback(frame); };
}

// Canvas composition consumes decoded picture frames. Repainting a 24 fps
// source at the display's 60/120 Hz repeats expensive draw/filter work without
// adding motion. Paused edits and layout changes still paint through their
// ordinary events; older browsers retain the animation-frame fallback.
export function watchStudioProgrammeFrames(video, paint) {
  let frame, disposed = false;
  const decoded = typeof video?.requestVideoFrameCallback === 'function';
  const request = callback => decoded
    ? video.requestVideoFrameCallback(callback) : window.requestAnimationFrame(callback);
  const tick = () => {
    if (disposed) return;
    if (!video.paused && !video.ended && !video.seeking && video.readyState >= 2) paint();
    if (!disposed && !video.paused && !video.ended) frame = request(tick);
  };
  if (video && !video.paused && !video.ended) frame = request(tick);
  return () => {
    disposed = true;
    if (frame !== undefined) {
      if (decoded) video.cancelVideoFrameCallback(frame);
      else window.cancelAnimationFrame(frame);
    }
  };
}

// The existing programme element remains the source/audio clock. Only trigger
// its ordinary boundary handler more precisely than native timeupdate (4 Hz).
export function watchStudioClipBoundary(video, { end, enabled, onBoundary }) {
  if (!enabled || !Number.isFinite(end) || typeof video?.requestVideoFrameCallback !== 'function') return () => {};
  let frame, deadline, disposed = false, advanced = false;
  const source = video.currentSrc || video.src;
  const reachBoundary = () => {
    clearTimeout(deadline);
    if (disposed || advanced || video.paused || video.seeking ||
        (video.currentSrc || video.src) !== source) return;
    const remaining = end - video.currentTime;
    if (remaining > 0) {
      // A decoded frame can be queued ahead of the media/audio clock. Cutting
      // on its timestamp alone shortens every occurrence and eventually forces
      // a song restart. Wait for the actual trim, without the 4 Hz timeupdate
      // delay, and recheck readiness/identity when the timer wakes up.
      const rate = Number(video.playbackRate) > 0 ? Number(video.playbackRate) : 1;
      deadline = setTimeout(reachBoundary, Math.max(1, Math.ceil(remaining / rate * 1000)));
      return;
    }
    advanced = true;
    onBoundary(video.currentTime);
  };
  const tick = (_, metadata) => {
    if (disposed) return;
    // A trim can fall between source frames. Arm its source-clock deadline
    // from the preceding decoded frame instead of waiting for a later frame
    // to cross it; that repeated delay drifts picture behind continuous audio.
    const rate = Number(video.playbackRate) > 0 ? Number(video.playbackRate) : 1;
    if (!advanced && !video.paused && !video.seeking &&
        (metadata.mediaTime >= end || (end - video.currentTime) / rate <= .08)) {
      reachBoundary();
    }
    if (!disposed && !advanced) frame = video.requestVideoFrameCallback(tick);
  };
  frame = video.requestVideoFrameCallback(tick);
  return () => { disposed = true; clearTimeout(deadline); video.cancelVideoFrameCallback(frame); };
}

// Prepare only the existing inactive native programme element. Cancellation
// removes its pending seek listener; it must not clear a decoder just promoted
// to the active programme. Source ownership/identity remains the original URL.
export function primeStudioSourceVideo(video, { url, start }) {
  const source = getSafeMediaSource(url);
  if (!video || !source) return () => {};
  const seek = () => {
    if (video.src !== source || video.readyState < 1) return;
    const time = Math.max(0, Number(start) || 0);
    if (Math.abs(video.currentTime - time) > .001) video.currentTime = time;
  };
  video.pause(); video.muted = true; video.preload = 'auto';
  video.addEventListener('loadedmetadata', seek);
  applySafeMediaSource(video, source); seek();
  return () => video.removeEventListener('loadedmetadata', seek);
}

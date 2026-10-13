import { waitForStudioAudio } from './studioSourcePreview';

export function studioMusicBufferIdentity(projectId, track) {
  return projectId && track?.ownerUid && track?.storagePath &&
    /^[a-f0-9]{64}$/.test(track?.contentHash || '')
    ? JSON.stringify([projectId, track.ownerUid, track.storagePath, track.contentHash]) : '';
}

// Beat analysis and the native audio decoder load the same selected song.
// Either usable route is sufficient: do not delay Play for the other route.
// The caller pins the selected route for this playback intent.
export async function prepareStudioMusicPlayback({ media, decodePromise, hasDecodedBuffer }) {
  if (hasDecodedBuffer()) return;
  const controller = new AbortController();
  const nativeReady = waitForStudioAudio(media, { signal: controller.signal });
  try {
    const decodedReady = decodePromise
      ? Promise.resolve(decodePromise).catch(() => {}).then(() => hasDecodedBuffer() ? undefined : nativeReady)
      : nativeReady;
    await Promise.race([nativeReady, decodedReady]);
  } finally {
    controller.abort();
  }
}

// AudioBufferSourceNode offsets are fixed at start, while its context clock
// continues. Compare the running position, never that original offset.
export function musicBufferPosition(state, contextTime) {
  return Number(state.offset || 0) +
    Math.max(0, Number(contextTime) - Number(state.startedAt || 0)) * Number(state.playbackRate || 1);
}

export function musicBufferNeedsResync(state, { contextTime, programmeTime, playbackRate, sourceKey }) {
  return !state || state.sourceKey !== sourceKey ||
    Math.abs(Number(state.playbackRate || 1) - playbackRate) > .001 ||
    Math.abs(musicBufferPosition(state, contextTime) - programmeTime) > .08;
}

export function waitForMusicDecode(promise, timeoutMs = 10000) {
  if (!promise) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    Promise.resolve(promise).catch(() => {}).finally(() => { clearTimeout(timer); resolve(); });
  });
}

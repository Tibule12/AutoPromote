import { primeStudioSourceVideo, watchStudioProgrammeFrames, watchStudioClipBoundary, watchStudioAudioClock, studioJoinFade, mapStudioSourceAccess, isStudioSourceClockCurrent, waitForStudioAudio, pausedStudioFrameRequest, pausedStudioFrameKey } from '../studioSourcePreview';
import { studioPausedFrameHasIdentityClock, pausedStudioMappedFrameRequest } from '../studioSourcePreview';
import { createOutputTimeMap } from '../studioTime';
const rampMap = () => createOutputTimeMap(270000, [
  {programmeRange:{space:'programme',startTick:0,endTick:90000},rateNumerator:1,rateDenominator:1},
  {programmeRange:{space:'programme',startTick:90000,endTick:180000},rateNumerator:2,rateDenominator:1},
  {programmeRange:{space:'programme',startTick:180000,endTick:270000},rateNumerator:1,rateDenominator:1},
]);

test('paused ramps select actual CFR identities rather than nearest raw seek time', () => {
  const clip = { id:'whole',storagePath:'owned/video.mp4',contentHash:'a'.repeat(64),startRequest:0,endRequest:3 };
  const map = rampMap();
  expect(pausedStudioMappedFrameRequest(clip,16/24,24,[clip],map).frameIndex).toBe(16);
  // Worker frame-identity fixtures select34 at output29; native raw seek
  // selected33, one input picture behind during the ramp.
  expect(pausedStudioMappedFrameRequest(clip,33/24,24,[clip],map).frameIndex).toBe(34);
  expect(pausedStudioMappedFrameRequest(clip,48/24,24,[clip],map).frameIndex).toBe(48);
  expect(pausedStudioMappedFrameRequest(clip,57/24,24,[clip],map).frameIndex).toBe(57);
});

test('mapped sampling retains occurrence trim identity and rejects unqualified cut clocks', () => {
  const first={id:'first',storagePath:'owned/one',contentHash:'a'.repeat(64),startRequest:0,endRequest:1};
  const second={id:'second',storagePath:'owned/two',contentHash:'b'.repeat(64),startRequest:.125,endRequest:2.125};
  const map=rampMap();
  const frame=pausedStudioMappedFrameRequest(second,.125+9/24,24,[first,second],map);
  expect(frame).toEqual({storagePath:'owned/two',sourceContentHash:'b'.repeat(64),start:.125,end:2.125,fps:24,frameIndex:10});
  expect(pausedStudioMappedFrameRequest(second,.5,24,[{...first,endRequest:.99},second],map)).toBeNull();
  expect(pausedStudioMappedFrameRequest(second,.5,24,[first,second],createOutputTimeMap(180000))).toBeNull();
  const short={...second,endRequest:.375};
  const third={...second,id:'third',startRequest:.375,endRequest:2.125};
  expect(pausedStudioMappedFrameRequest(short,.37499,24,[first,short,third],map)).toBeNull();
});

test('a later ramp preserves earlier exact sampling without qualifying retimed CFR pictures', () => {
  const plain = { programmeRange:{startTick:0,endTick:90},outputRange:{startTick:0,endTick:90},rateNumerator:1,rateDenominator:1 };
  const ramp = { programmeRange:{startTick:90,endTick:180},outputRange:{startTick:90,endTick:135},rateNumerator:2,rateDenominator:1 };
  const resumed = { programmeRange:{startTick:180,endTick:270},outputRange:{startTick:135,endTick:225},rateNumerator:1,rateDenominator:1 };
  expect(studioPausedFrameHasIdentityClock([plain,ramp,resumed],89)).toBe(true);
  expect(studioPausedFrameHasIdentityClock([plain,ramp,resumed],90)).toBe(false);
  expect(studioPausedFrameHasIdentityClock([plain,ramp,resumed],240)).toBe(false);
  expect(studioPausedFrameHasIdentityClock([plain],10)).toBe(true);
  expect(studioPausedFrameHasIdentityClock([],0)).toBe(false);
});

test('accurate paused frames preserve source/trim identity and do not alter the programme clock', () => {
  const clip = { sourceStoragePath: 'owned/video.mp4', contentHash: 'a'.repeat(64), startRequest: .25, endRequest: 1 };
  const snapshot = JSON.stringify(clip);
  const frame = pausedStudioFrameRequest(clip, .25+4/24, '24');
  expect(frame).toEqual({ storagePath: clip.sourceStoragePath, sourceContentHash: clip.contentHash,
    start: .25, end: 1, fps: 24, frameIndex: 4 });
  expect(JSON.stringify(clip)).toBe(snapshot);
  expect(pausedStudioFrameKey(frame)).not.toBe(pausedStudioFrameKey({ ...frame, frameIndex: 5 }));
  for (const time of [0, 1, NaN]) expect(pausedStudioFrameRequest(clip, time, 24)).toBeNull();
  expect(pausedStudioFrameRequest({ ...clip, contentHash: '' }, .5, 24)).toBeNull();
});

test('programme waits for decoded music rather than advancing silently before canplay', async () => {
  const audio = document.createElement('audio');
  let state = 1; Object.defineProperty(audio, 'readyState', { get: () => state });
  const finished = jest.fn();
  const waiting = waitForStudioAudio(audio).then(finished);
  await Promise.resolve(); expect(finished).not.toHaveBeenCalled();
  state = 3; audio.dispatchEvent(new Event('canplay')); await waiting;
  expect(finished).toHaveBeenCalledTimes(1);
});
test('failed and stalled music readiness cleans up listeners and returns a bounded error', async () => {
  jest.useFakeTimers();
  try {
    const audio = document.createElement('audio'); audio.load = jest.fn();
    const remove = jest.spyOn(audio, 'removeEventListener');
    const failure = expect(waitForStudioAudio(audio)).rejects.toThrow('could not be loaded');
    audio.dispatchEvent(new Event('error')); await failure;
    expect(remove).toHaveBeenCalledWith('canplay', expect.any(Function));
    const stalled = expect(waitForStudioAudio(audio, { timeoutMs: 25 })).rejects.toThrow('still loading');
    jest.advanceTimersByTime(25); await stalled;
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('audio uses only the owned active decoder inside the current half-open clip window', () => {
  const video = { seeking: false, readyState: 3, currentTime: 1.9, currentSrc: 'https://media.example.com/a.mp4' };
  const options = { activeVideo: video, url: video.currentSrc, start: 1, end: 2, hasNext: true };
  expect(isStudioSourceClockCurrent(video, options)).toBe(true);
  video.currentTime = 2; expect(isStudioSourceClockCurrent(video, options)).toBe(false);
  video.currentTime = .9; expect(isStudioSourceClockCurrent(video, options)).toBe(false);
  video.currentTime = 1.2;
  expect(isStudioSourceClockCurrent(video, { ...options, activeVideo: {} })).toBe(false);
  expect(isStudioSourceClockCurrent(video, { ...options, url: 'https://media.example.com/b.mp4' })).toBe(false);
  video.seeking = true; expect(isStudioSourceClockCurrent(video, options)).toBe(false);
});

test('unrelated media refreshes preserve sequence/cue identity and do not call their updater', () => {
  const items = [{ id: 'first', sourceStoragePath: 'owned/video' },
    { id: 'second', sourceStoragePath: 'owned/video' }];
  const update = jest.fn(item => ({ ...item, url: 'new-access' }));
  expect(mapStudioSourceAccess(items, 'owned/logo', update)).toBe(items);
  expect(update).not.toHaveBeenCalled();
  expect(mapStudioSourceAccess(items, 'owned/video', item => item)).toBe(items);
});
test('all occurrences of the refreshed source change without touching another asset or authored data', () => {
  const items = [{ id: 'first', sourceStoragePath: 'owned/video', startRequest: .25 },
    { id: 'second', storagePath: 'owned/video', startRequest: 1.75 },
    { id: 'other', storagePath: 'owned/music' }];
  const next = mapStudioSourceAccess(items, 'owned/video', item => ({ ...item, url: 'new-access' }));
  expect(next[0]).toEqual({ ...items[0], url: 'new-access' });
  expect(next[1]).toEqual({ ...items[1], url: 'new-access' });
  expect(next[2]).toBe(items[2]); expect(items[0].url).toBeUndefined();
});

test('joins reach full black/white and select each edge independently', () => {
  const shot = { duration: 2, transitionIn: 'soft_dip', transitionOut: 'energy_flash', transitionDuration: .2 };
  expect(studioJoinFade({ ...shot, localTime: 0 })).toEqual({ mode: 'soft_dip', opacity: 1 });
  expect(studioJoinFade({ ...shot, localTime: .1 })).toEqual({ mode: 'soft_dip', opacity: .5 });
  expect(studioJoinFade({ ...shot, localTime: 1 })).toEqual({ mode: '', opacity: 0 });
  expect(studioJoinFade({ ...shot, localTime: 1.9 }).opacity).toBeCloseTo(.5);
  expect(studioJoinFade({ ...shot, localTime: 2 }).mode).toBe('energy_flash');
  expect(studioJoinFade({ ...shot, localTime: 2 }).opacity).toBeCloseTo(1);
});
test('short clips and excessive transition durations use the authoritative renderer bounds', () => {
  const shot = { duration: .3, transitionIn: 'soft_dip', transitionDuration: 10 };
  expect(studioJoinFade({ ...shot, localTime: .05 }).opacity).toBeCloseTo(.5);
  expect(studioJoinFade({ ...shot, duration: 3, localTime: .175 }).opacity).toBeCloseTo(.5);
  expect(studioJoinFade({ ...shot, localTime: .1 }).opacity).toBe(0);
});
test('finished exports, disabled joins and unsupported types cannot receive a second fade', () => {
  const shot = { duration: 1, localTime: 0, transitionIn: 'soft_dip', transitionDuration: .2 };
  for (const change of [{ renderedOutput: true }, { transitionDuration: .009 },
    { transitionDuration: NaN }, { transitionIn: 'unknown' }]) {
    expect(studioJoinFade({ ...shot, ...change })).toEqual({ mode: '', opacity: 0 });
  }
});

function decoder() {
  let next = 0;
  const callbacks = new Map();
  return { paused: false, seeking: false, readyState: 2, currentTime: 0, playbackRate: 1,
    requestVideoFrameCallback: jest.fn(fn => { callbacks.set(++next, fn); return next; }),
    cancelVideoFrameCallback: jest.fn(id => callbacks.delete(id)),
    frame(time, sourceTime = time) { this.currentTime = sourceTime;
      const [id, fn] = callbacks.entries().next().value; callbacks.delete(id); fn(0, { mediaTime: time }); },
  };
}
test('programme canvas paints decoded frames and never schedules a duplicate display-rate loop', () => {
  const video = decoder(), paint = jest.fn();
  const raf = jest.spyOn(window, 'requestAnimationFrame');
  const stop = watchStudioProgrammeFrames(video, paint);
  expect(paint).not.toHaveBeenCalled();
  video.frame(.25); video.frame(.25 + 1 / 24);
  expect(paint).toHaveBeenCalledTimes(2);
  expect(raf).not.toHaveBeenCalled();
  video.seeking = true; video.frame(.5);
  expect(paint).toHaveBeenCalledTimes(2);
  stop(); expect(video.cancelVideoFrameCallback).toHaveBeenCalled(); raf.mockRestore();
});
test('disposed and paused programme loops cannot keep painting the former shot', () => {
  const video = decoder(), paint = jest.fn();
  watchStudioProgrammeFrames(video, paint);
  video.paused = true; video.frame(1);
  expect(paint).not.toHaveBeenCalled();
  expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
  const paused = decoder(); paused.paused = true;
  watchStudioProgrammeFrames(paused, paint)();
  expect(paused.requestVideoFrameCallback).not.toHaveBeenCalled();
});
test('older programme decoders retain the existing animation fallback and cancellation', () => {
  let callback;
  const request = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { callback = fn; return 7; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const video = { paused: false, ended: false, seeking: false, readyState: 3 }, paint = jest.fn();
  const stop = watchStudioProgrammeFrames(video, paint);
  callback(); expect(paint).toHaveBeenCalledTimes(1);
  stop(); expect(cancel).toHaveBeenCalledWith(7);
  callback(); expect(paint).toHaveBeenCalledTimes(1);
  request.mockRestore(); cancel.mockRestore();
});
test('audio clock checks decoded frames and skips paused, seeking or unready media', () => {
  const video = decoder(), sync = jest.fn();
  const stop = watchStudioAudioClock(video, sync);
  video.frame(0); video.frame(.04); expect(sync).toHaveBeenCalledTimes(2);
  video.paused = true; video.frame(.08);
  video.paused = false; video.seeking = true; video.frame(.12);
  video.seeking = false; video.readyState = 1; video.frame(.16);
  expect(sync).toHaveBeenCalledTimes(2);
  video.readyState = 2; video.frame(.2); expect(sync).toHaveBeenCalledTimes(3);
  stop(); expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
});
test('unsupported audio frame clocks leave native media events authoritative', () => {
  const sync = jest.fn(); watchStudioAudioClock({}, sync)();
  expect(sync).not.toHaveBeenCalled();
});
test('frame-clock boundary fires once; ordinary frames do not trigger React updates', () => {
  const video = decoder(), onBoundary = jest.fn();
  const stop = watchStudioClipBoundary(video, { end: 1.5, enabled: true, onBoundary });
  video.frame(1.45); expect(onBoundary).not.toHaveBeenCalled();
  video.frame(1.5); expect(onBoundary).toHaveBeenCalledTimes(1);
  expect(onBoundary).toHaveBeenCalledWith(1.5);
  expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2); stop();
});
test('a queued end frame cannot shorten a cut; the timer follows the actual retimed source clock', () => {
  jest.useFakeTimers();
  const video = decoder(), onBoundary = jest.fn(); video.playbackRate = 2;
  const stop = watchStudioClipBoundary(video, { end: 1.5, enabled: true, onBoundary });
  try {
    video.frame(1.5, 1.45); expect(onBoundary).not.toHaveBeenCalled();
    jest.advanceTimersByTime(24); expect(onBoundary).not.toHaveBeenCalled();
    video.currentTime = 1.5; jest.advanceTimersByTime(2);
    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith(1.5);
    video.frame(1.55); expect(onBoundary).toHaveBeenCalledTimes(1);
  } finally { stop(); jest.useRealTimers(); }
});
test('an in-between-frame trim cuts on its source clock without waiting for the next decoded frame', () => {
  jest.useFakeTimers();
  const video = decoder(), onBoundary = jest.fn();
  const stop = watchStudioClipBoundary(video, { end: 1.375, enabled: true, onBoundary });
  try {
    video.frame(1.36, 1.36); expect(onBoundary).not.toHaveBeenCalled();
    video.currentTime = 1.375; jest.advanceTimersByTime(16);
    expect(onBoundary).toHaveBeenCalledTimes(1);
    expect(onBoundary).toHaveBeenCalledWith(1.375);
  } finally { stop(); jest.useRealTimers(); }
});
test.each(['paused', 'seeking', 'source', 'disposed'])('pending cut cannot advance after %s', change => {
  jest.useFakeTimers();
  const video = decoder(), onBoundary = jest.fn(); video.src = 'source-a';
  const stop = watchStudioClipBoundary(video, { end: 1.5, enabled: true, onBoundary });
  try {
    video.frame(1.5, 1.475);
    if (change === 'source') video.src = 'source-b';
    else if (change === 'disposed') stop();
    else video[change] = true;
    video.currentTime = 1.5; jest.advanceTimersByTime(30);
    expect(onBoundary).not.toHaveBeenCalled();
  } finally { stop(); jest.useRealTimers(); }
});
test('paused scrubbing and pending seeks cannot advance to another occurrence', () => {
  const video = decoder(), onBoundary = jest.fn();
  const stop = watchStudioClipBoundary(video, { end: 1.5, enabled: true, onBoundary });
  video.paused = true; video.frame(2);
  video.paused = false; video.seeking = true; video.frame(2);
  expect(onBoundary).not.toHaveBeenCalled();
  video.seeking = false; video.frame(2); expect(onBoundary).toHaveBeenCalledTimes(1); stop();
});
test('switching/disposal cancels the prior source callback', () => {
  const video = decoder(); const stop = watchStudioClipBoundary(video, { end: 2, enabled: true, onBoundary: jest.fn() });
  stop(); expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
});
test('finished movies and unsupported browsers retain the ordinary media-event path', () => {
  const video = decoder();
  watchStudioClipBoundary(video, { end: 2, enabled: false, onBoundary: jest.fn() })();
  expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
  expect(() => watchStudioClipBoundary({}, { end: 2, enabled: true, onBoundary: jest.fn() })()).not.toThrow();
});
function createVideo() {
  const video = document.createElement('video');
  video.load = jest.fn(); video.pause = jest.fn();
  Object.defineProperty(video, 'readyState', { value: 1 });
  return video;
}
test('standby preparation keeps original source identity and the requested in-point', () => {
  const video = createVideo();
  const cancel = primeStudioSourceVideo(video, { url: 'https://media.example.com/a.mp4', start: 5 });
  expect(video.src).toBe('https://media.example.com/a.mp4');
  expect(video.currentTime).toBe(5); expect(video.muted).toBe(true);
  expect(video.crossOrigin).toBe('anonymous'); cancel();
  // A prepared decoder promoted to the programme retains its decoded source.
  expect(video.hasAttribute('src')).toBe(true);
});
test('a cancelled standby seek cannot overwrite later user/source selection', () => {
  const video = createVideo();
  const cancel = primeStudioSourceVideo(video, { url: 'https://media.example.com/a.mp4', start: 5 });
  cancel(); video.currentTime = 2; video.dispatchEvent(new Event('loadedmetadata'));
  expect(video.currentTime).toBe(2);
});
test('unsafe standby sources do not replace the playable source', () => {
  const video = createVideo(); video.src = 'https://media.example.com/a.mp4';
  primeStudioSourceVideo(video, { url: 'javascript:alert(1)', start: 0 })();
  expect(video.src).toBe('https://media.example.com/a.mp4'); expect(video.load).not.toHaveBeenCalled();
});

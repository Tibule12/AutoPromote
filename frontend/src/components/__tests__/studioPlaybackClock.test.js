import { createStudioPlaybackClock } from '../studioPlaybackClock';
import { buildStudioOutputTimeMap } from '../studioProjectDocument';

afterEach(() => jest.restoreAllMocks());

function fixture({ decoded = true } = {}) {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { callbacks.set(++id, cb); return id; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(key => callbacks.delete(key));
  const video = document.createElement('video');
  let id = 0;
  const callbacks = new Map();
  Object.defineProperties(video, {
    currentSrc: { configurable: true, writable: true, value: 'https://example.com/source.mp4' },
    readyState: { configurable: true, writable: true, value: 4 },
    paused: { configurable: true, writable: true, value: false },
    seeking: { configurable: true, writable: true, value: false },
  });
  if (decoded) {
    video.requestVideoFrameCallback = jest.fn(cb => { callbacks.set(++id, cb); return id; });
    video.cancelVideoFrameCallback = jest.fn(key => callbacks.delete(key));
  }
  const clock = createStudioPlaybackClock();
  const config = { url: video.currentSrc, start: 10, end: 14, programmeStart: 4,
    timeMap: buildStudioOutputTimeMap({ durationTick: 720000, fallbackSpeed: 2 }) };
  video.currentTime = 10;
  const frame = time => {
    video.currentTime = time;
    const current = [...callbacks.values()]; callbacks.clear();
    current.forEach(callback => callback(0, { mediaTime: time + .1 }));
  };
  return { video, clock, config, frame, callbacks };
}

test('a repeated trimmed occurrence maps the actual decoder clock to programme/output without timeupdate', () => {
  const f = fixture(); const listener = jest.fn(); f.clock.subscribe(listener);
  const stop = f.clock.bind(f.video, f.config);
  f.frame(11.375);
  expect(f.clock.getSnapshot()).toEqual({ sourceTime: 11.375, programmeTime: 5.375, outputTime: 2.6875 });
  const stable = f.clock.getSnapshot(); f.frame(11.375);
  expect(f.clock.getSnapshot()).toBe(stable);
  // An edit samples now, even when no new frame/media event has arrived.
  f.video.currentTime = 11.625;
  expect(f.clock.read().programmeTime).toBe(5.625);
  f.clock.sync(); expect(f.clock.getSnapshot().programmeTime).toBe(5.625);
  stop(); expect(f.callbacks.size).toBe(0);
});

test('waiting/seeking hold the display; resumed playback reanchors and stale sources cannot publish', () => {
  const f = fixture(); const stop = f.clock.bind(f.video, f.config);
  f.frame(11); const held = f.clock.getSnapshot();
  f.video.dispatchEvent(new Event('waiting')); f.frame(12);
  f.video.dispatchEvent(new Event('timeupdate')); f.clock.sync();
  expect(f.clock.getSnapshot()).toBe(held);
  f.video.dispatchEvent(new Event('playing')); expect(f.clock.getSnapshot().sourceTime).toBe(12);
  f.video.seeking = true; f.video.dispatchEvent(new Event('seeking')); f.frame(13);
  expect(f.clock.read()).toBeNull(); expect(f.clock.getSnapshot().sourceTime).toBe(12);
  f.video.seeking = false; f.video.dispatchEvent(new Event('seeked'));
  expect(f.clock.getSnapshot().sourceTime).toBe(13);
  f.video.currentSrc = 'https://example.com/previous.mp4'; f.frame(13.5);
  expect(f.clock.getSnapshot().sourceTime).toBe(13); expect(f.clock.read()).toBeNull();
  stop(); f.video.dispatchEvent(new Event('playing')); expect(f.callbacks.size).toBe(0);
});

test('finished-video time is mapped back through the canonical variable speed map', () => {
  const f = fixture();
  const timeMap = buildStudioOutputTimeMap({ durationTick: 720000, fallbackSpeed: 1,
    programmeSpeedKeys: [{ atProgrammeTick: 0, rate: 1, easing: 'hold' },
      { atProgrammeTick: 360000, rate: 2, easing: 'hold' }] });
  f.video.currentTime = 5;
  const stop = f.clock.bind(f.video, { ...f.config, renderedOutput: true, timeMap });
  expect(f.clock.getSnapshot()).toEqual({ sourceTime: 5, outputTime: 5, programmeTime: 6 });
  f.video.paused = true; f.video.currentTime = 2.5; f.video.dispatchEvent(new Event('pause'));
  expect(f.clock.getSnapshot().programmeTime).toBe(2.5);
  stop();
});

test('an old decoder binding cannot replace the new occurrence or leave callbacks/listeners behind', () => {
  const f = fixture(); const stop = f.clock.bind(f.video, f.config);
  const late = [...f.callbacks.values()][0]; stop();
  const other = fixture(); const stopOther = f.clock.bind(other.video, { ...other.config, programmeStart: 0 });
  f.video.currentTime = 12; late(0, { mediaTime: 12 });
  f.video.dispatchEvent(new Event('seeked'));
  expect(f.clock.getSnapshot().programmeTime).toBe(0);
  stopOther(); expect(other.callbacks.size).toBe(0);
});

test('display sampling uses animation frames even when decoded callbacks are available', () => {
  const f = fixture({ decoded: false });
  const stop = f.clock.bind(f.video, f.config); f.frame(12);
  expect(f.clock.getSnapshot().programmeTime).toBe(6);
  expect(window.requestAnimationFrame).toHaveBeenCalled();
  stop(); expect(f.callbacks.size).toBe(0);
});

test('the end-of-frame refresh samples time advanced during painting and is cancelled on suspension', () => {
  jest.useFakeTimers();
  const f = fixture(); const stop = f.clock.bind(f.video, f.config);
  try {
    f.frame(11); f.video.currentTime = 11.03;
    jest.advanceTimersByTime(0);
    expect(f.clock.getSnapshot().sourceTime).toBe(11.03);
    f.frame(11.1); f.video.currentTime = 11.2;
    f.video.dispatchEvent(new Event('waiting'));
    jest.advanceTimersByTime(0);
    expect(f.clock.getSnapshot().sourceTime).toBe(11.1);
  } finally { stop(); jest.useRealTimers(); }
});

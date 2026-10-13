import { musicBufferPosition, musicBufferNeedsResync, waitForMusicDecode, prepareStudioMusicPlayback, studioMusicBufferIdentity } from '../studioMusicBufferClock';

test('owned decoded audio survives access refresh but cannot cross project/owner/asset boundaries', () => {
  const track = { ownerUid: 'owner-a', storagePath: 'owned/song.mp3', contentHash: 'a'.repeat(64), url: 'https://media.example.com/old' };
  const key = studioMusicBufferIdentity('project-a', track);
  expect(key).not.toBe('');
  expect(studioMusicBufferIdentity('project-a', { ...track, url: 'https://media.example.com/refreshed' })).toBe(key);
  expect(studioMusicBufferIdentity('project-b', track)).not.toBe(key);
  for (const update of [{ ownerUid: 'owner-b' }, { storagePath: 'owned/other.mp3' }, { contentHash: 'b'.repeat(64) }])
    expect(studioMusicBufferIdentity('project-a', { ...track, ...update })).not.toBe(key);
  for (const update of [{ ownerUid: '' }, { storagePath: '' }, { contentHash: '' }, { contentHash: 'untrusted' }])
    expect(studioMusicBufferIdentity('project-a', { ...track, ...update })).toBe('');
});

test('ready native music starts without waiting for stalled beat analysis', async () => {
  const media = document.createElement('audio');
  Object.defineProperty(media, 'readyState', { value: 3 });
  await prepareStudioMusicPlayback({ media, decodePromise: new Promise(() => {}), hasDecodedBuffer: () => false });
});

test('decoded music starts without requiring a second native decoder', async () => {
  jest.useFakeTimers();
  try {
    const media = document.createElement('audio'); media.load = jest.fn();
    const remove = jest.spyOn(media, 'removeEventListener');
    let decoded = false;
    await prepareStudioMusicPlayback({ media,
      decodePromise: Promise.resolve().then(() => { decoded = true; }), hasDecodedBuffer: () => decoded });
    expect(remove).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('failed beat analysis still waits for audible native music', async () => {
  const media = document.createElement('audio'); media.load = jest.fn();
  let ready = 1; Object.defineProperty(media, 'readyState', { get: () => ready });
  const done = jest.fn();
  const wait = prepareStudioMusicPlayback({ media,
    decodePromise: Promise.reject(new Error('decode failed')), hasDecodedBuffer: () => false }).then(done);
  await Promise.resolve(); await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  ready = 3; media.dispatchEvent(new Event('canplay')); await wait;
  expect(done).toHaveBeenCalledTimes(1);
});

test('unavailable music reports a bounded failure rather than starting silently', async () => {
  jest.useFakeTimers();
  try {
    const media = document.createElement('audio'); media.load = jest.fn();
    const wait = expect(prepareStudioMusicPlayback({ media,
      decodePromise: new Promise(() => {}), hasDecodedBuffer: () => false })).rejects.toThrow('still loading');
    jest.advanceTimersByTime(10000); await wait;
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('continuous decoded playback does not restart every350ms or at loop boundaries', () => {
  const state = { offset: 0, startedAt: 42, playbackRate: 1, sourceKey: 'music-a' };
  for (let frame = 0; frame < 480; frame++) {
    const programmeTime = frame / 24;
    expect(musicBufferNeedsResync(state, { contextTime: 42+programmeTime,
      programmeTime, playbackRate: 1, sourceKey: 'music-a' })).toBe(false);
  }
  expect(musicBufferPosition(state, 52)).toBe(10);
});

test('initial decode preparation settles or reaches a bounded fallback without retaining timers', async () => {
  jest.useFakeTimers();
  try {
    const completed = jest.fn(); let finish;
    const waiting = waitForMusicDecode(new Promise(resolve => { finish = resolve; })).then(completed);
    await Promise.resolve(); expect(completed).not.toHaveBeenCalled();
    finish(); await waiting; expect(jest.getTimerCount()).toBe(0);
    const fallback = waitForMusicDecode(new Promise(() => {}), 25);
    jest.advanceTimersByTime(25); await fallback;
    expect(jest.getTimerCount()).toBe(0);
    await waitForMusicDecode(Promise.reject(new Error('decode unavailable')));
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('pause gaps, explicit seeks, rate changes and replaced music invalidate the old anchor', () => {
  const state = { offset: 4, startedAt: 100, playbackRate: 2, sourceKey: 'music-a' };
  const clock = { contextTime: 101, programmeTime: 6, playbackRate: 2, sourceKey: 'music-a' };
  expect(musicBufferNeedsResync(state, clock)).toBe(false);
  for (const update of [{ programmeTime: 4 }, { playbackRate: 1 }, { sourceKey: 'music-b' }, { contextTime: 101.5 }])
    expect(musicBufferNeedsResync(state, { ...clock, ...update })).toBe(true);
  const resumed = { ...state, offset: 6, startedAt: 105 };
  expect(musicBufferPosition(resumed, 106)).toBe(8);
  expect(musicBufferPosition(resumed, 104)).toBe(6);
});

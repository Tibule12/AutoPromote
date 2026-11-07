import { studioVoiceBusRequest, studioDialogueBusRequest, scheduleStudioPreparedDuck, loadStudioVoiceBus } from '../studioPreparedVoiceBus';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import StudioVoiceoverPreview from '../StudioVoiceoverPreview';
const take = { id: 'voice', ownerUid: 'owner', sourceStoragePath: 'owned/take.wav', contentHash: 'a'.repeat(64),
  sourceDuration: 8, startTime: 1, trimStart: .25, duration: 2, volume: .7, fadeIn: .1, fadeOut: .2 };
const map = [{ programmeRange: { startTick: 0, endTick: 360000 }, outputRange: { startTick: 0, endTick: 180000 },
  rateNumerator: 2, rateDenominator: 1 }];

test('original dialogue binds all owned source cuts and rejects unqualified routing and speed clocks', () => {
  const timeline=[{id:'first',sourceStoragePath:'owned/source.mp4',contentHash:'a'.repeat(64),startRequest:0,endRequest:4.7},
    {id:'second',sourceStoragePath:'owned/source.mp4',contentHash:'a'.repeat(64),startRequest:4.7,endRequest:12}];
  const timeMap=[{programmeRange:{startTick:0,endTick:12*90000},outputRange:{startTick:0,endTick:12*90000},rateNumerator:1,rateDenominator:1}];
  const options={projectId:'source',timeline,outputTimeMap:timeMap,restoration:{enabled:true}};
  const request=studioDialogueBusRequest(options);
  expect(request.version).toBe(2);expect(request.voices.map(v=>[v.startTime,v.trimStart,v.duration])).toEqual([[0,0,4.7],[4.7,4.7,7.3]]);
  expect(request.ducking.enabled).toBe(false);
  expect(studioDialogueBusRequest({...options,timeline:timeline.map(c=>({...c,url:'changed-access-only'}))})).toEqual(request);
  for(const patch of [{contentHash:''},{endRequest:61},{audioDetached:true},{audioTrimOffsetStart:-.1},{audioTrimOffsetEnd:.1}])
    expect(studioDialogueBusRequest({...options,timeline:[{...timeline[0],...patch},timeline[1]]})).toBeNull();
  expect(studioDialogueBusRequest({...options,outputTimeMap:map})).toBeNull();
  expect(studioDialogueBusRequest({...options,restoration:{enabled:false}})).toBeNull();
});

test('rapid-edit busy retries are bounded and never repeat rate-limit failures', async () => {
  jest.useFakeTimers(); const before = global.fetch;
  try {
    global.fetch = jest.fn().mockResolvedValue({ status: 429, ok: false,
      json: async () => ({ code: 'STUDIO_VOICE_PREVIEW_BUSY', message: 'busy' }) });
    const run = loadStudioVoiceBus({ input: { projectId: 'phase' }, apiBase: '', getToken: async () => 'token' });
    const checked = expect(run).rejects.toThrow('busy');
    for (const delay of [250, 500, 1000, 1500, 2000]) { for (let i=0;i<8;i++) await Promise.resolve(); jest.advanceTimersByTime(delay); }
    await checked;
    expect(global.fetch).toHaveBeenCalledTimes(6);
    global.fetch.mockReset().mockResolvedValue({ status: 429, ok: false,
      json: async () => ({ code: 'RATE_LIMITED', message: 'rate limited' }) });
    await expect(loadStudioVoiceBus({ input: {}, apiBase: '', getToken: async () => 'token' })).rejects.toThrow('rate limited');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = before; jest.useRealTimers(); }
});

test('superseding an edit cancels its retry timer before any further request', async () => {
  jest.useFakeTimers(); const before = global.fetch, controller = new AbortController();
  try {
    global.fetch = jest.fn().mockResolvedValue({ status: 429, ok: false,
      json: async () => ({ code: 'STUDIO_VOICE_PREVIEW_BUSY' }) });
    const run = loadStudioVoiceBus({ input: {}, apiBase: '', getToken: async () => 'token', signal: controller.signal });
    const checked = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    for (let i=0;i<8;i++) await Promise.resolve(); controller.abort(); await checked;
    jest.runAllTimers(); expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally { global.fetch = before; jest.useRealTimers(); }
});
test('retimed requests retain owned trims and curves and ignore access-only URL renewal', () => {
  const options = { projectId: 'project', takes: [take], outputTimeMap: map,
    automation: [{ time: 1, value: 50, easing: 'bezier', curve: [.1, 0, .2, 1] }],
    ducking: { enabled: true, strength: .4 } };
  const request = studioVoiceBusRequest(options);
  expect(request.speedPlan).toEqual([{ start_time: 0, end_time: 4, rate: 2 }]);
  expect(request.voices[0]).toMatchObject({ startTime: 1, trimStart: .25, duration: 2, volume: .7 });
  expect(request).toEqual(studioVoiceBusRequest({ ...options, takes: [{ ...take, url: 'renewed-access' }] }));
  expect(studioVoiceBusRequest({ ...options, takes: [{ ...take, contentHash: '' }] })).toBeNull();
  expect(studioVoiceBusRequest({ ...options, takes: [{ ...take, sourceDuration: 7200 }] })).toBeNull();
});
test('ducking automation follows the same sample offset and future start as the song', () => {
  const param = { cancelScheduledValues: jest.fn(), setValueAtTime: jest.fn() };
  const buffer = { duration: 1.5 };
  const source = { connect: jest.fn(), start: jest.fn() };
  const context = { currentTime: 10, sampleRate: 48000, createBufferSource: () => source };
  const prepared = { sampleRate: 4, duckBuffer: buffer };
  expect(scheduleStudioPreparedDuck(context, param, prepared, { offset: .5, when: 10.01 })).toBe(source);
  expect(param.cancelScheduledValues).toHaveBeenCalledWith(10);
  expect(param.setValueAtTime).toHaveBeenCalledWith(0, 10);
  expect(source.buffer).toBe(buffer); expect(source.connect).toHaveBeenCalledWith(param);
  expect(source.start).toHaveBeenCalledWith(10.01, .5);
  scheduleStudioPreparedDuck(context, param, prepared, {offset:.500007,when:10.010007});
  expect(source.start).toHaveBeenLastCalledWith(10.01,.5);
});

test('the production voice component plays one prepared retimed bus; cut, mute, waiting and Pause retain transport authority', async () => {
  const previous = window.AudioContext;
  const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const video = document.createElement('video');
  Object.defineProperties(video, { paused: { configurable: true, value: false },
    readyState: { configurable: true, value: 4 }, seeking: { configurable: true, value: false } });
  const sources = [];
  const context = { currentTime: 20, sampleRate: 48000, destination: {}, resume: jest.fn(() => Promise.resolve()),
    createAnalyser: () => ({ connect: jest.fn(), disconnect: jest.fn() }),
    createGain: () => ({ gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() }),
    createBufferSource: () => { const node = { playbackRate: { value: 1 }, connect: jest.fn(), disconnect: jest.fn(),
      start: jest.fn(), stop: jest.fn() }; sources.push(node); return node; } };
  window.AudioContext = jest.fn(() => context);
  const buffer = { duration: 2 }, loaded = { key: 'correct-processed-bus', buffer };
  let reanchor=0, handoff=false;
  const props = { takes: [take], projectId: 'project', outputTimeMap: map, videoRef: { current: video },
    isHandoffPending: () => handoff,
    getTimelineTime: time => time, getAudioContext: () => context, getOutputPlan: () => ({ when: context.currentTime+.01,
      offset: .5+context.currentTime-20+reanchor }), loadPreparedBus: jest.fn(async () => loaded), muted: false, volume: .4 };
  let editor;const handle=React.createRef();
  try {
    editor = render(<StudioVoiceoverPreview {...props} ref={handle} />);
    await waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].buffer).toBe(buffer);
    expect(sources[0].start).toHaveBeenCalledWith(20.01, .5);
    expect(sources[0].playbackRate.value).toBe(1);
    expect(sources[0].connect.mock.calls[0][0].gain.value).toBe(.4);
    expect(play).not.toHaveBeenCalled(); // Never double the recorded speech.
    handoff=true;
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    fireEvent.pause(video); fireEvent.waiting(video);
    Object.defineProperty(video, 'seeking', { configurable: true, value: true });
    fireEvent.seeking(video);
    expect(sources[0].stop).not.toHaveBeenCalled();
    editor.rerender(<StudioVoiceoverPreview {...props} ref={handle} muted />);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(sources[0].connect.mock.calls[0][0].gain.value).toBe(0);
    editor.rerender(<StudioVoiceoverPreview {...props} ref={handle} />);
    expect(sources[0].stop).not.toHaveBeenCalled();
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    handoff=false;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.playing(video); expect(sources).toHaveLength(1);
    context.currentTime = 20.1;
    editor.rerender(<StudioVoiceoverPreview {...props} ref={handle} activeClip={1} muted />);
    expect(sources).toHaveLength(1);
    expect(sources[0].connect.mock.calls[0][0].gain.value).toBe(0);
    act(()=>handle.current.stage());expect(sources).toHaveLength(2);
    expect(sources[1].start).not.toHaveBeenCalled();
    const nextVideo=document.createElement('video');
    Object.defineProperties(nextVideo,{paused:{value:false},readyState:{value:4},seeking:{value:false}});
    props.videoRef.current=nextVideo;reanchor=.2;
    fireEvent.timeUpdate(video);expect(sources[1].start).not.toHaveBeenCalled();
    act(()=>handle.current.sync());expect(sources).toHaveLength(2);
    expect(sources[0].stop.mock.calls[0][0]).toBeCloseTo(20.11,12);
    expect(sources[0].disconnect).not.toHaveBeenCalled();
    expect(sources[1].start.mock.calls[0][1]).toBeCloseTo(.8);
    props.videoRef.current=video;
    fireEvent.waiting(video); expect(sources[0].stop).toHaveBeenCalledTimes(2);
    expect(sources[1].stop).toHaveBeenCalledTimes(1);
    fireEvent.playing(video); expect(sources).toHaveLength(3);
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    // The picture can already be paused during a prepared handoff. Explicit
    // Pause must stop speech even if the native element emits no new event.
    act(() => handle.current.pause()); expect(sources[2].stop).toHaveBeenCalledTimes(1);
  } finally { editor?.unmount(); window.AudioContext = previous; play.mockRestore(); pause.mockRestore(); }
});

test('a superseded CPU response cannot attach an old trim or duck envelope to the new edit', async () => {
  const previous = window.AudioContext;
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const context = { sampleRate: 48000, destination: {}, createAnalyser: () => ({ connect: jest.fn(), disconnect: jest.fn() }) };
  window.AudioContext = jest.fn(() => context);
  const resolve = [], onPreparedDucking = jest.fn();
  const load = jest.fn(() => new Promise(done => resolve.push(done)));
  const props = { takes: [take], projectId: 'project', outputTimeMap: map, videoRef: { current: null },
    getTimelineTime: time => time, loadPreparedBus: load, getAudioContext: () => context,
    onPreparedDucking, preparedDucking: { enabled: true, strength: .4 } };
  let editor;
  try {
    editor = render(<StudioVoiceoverPreview {...props} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    editor.rerender(<StudioVoiceoverPreview {...props} takes={[{ ...take, trimStart: .5 }]} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => resolve[0]({ key: 'old', buffer: { duration: 2 } }));
    expect(onPreparedDucking.mock.calls.filter(([value]) => value)).toHaveLength(0);
    await act(async () => resolve[1]({ key: 'new', buffer: { duration: 2 } }));
    expect(onPreparedDucking.mock.calls.filter(([value]) => value).map(([value]) => value.key)).toEqual(['new']);
  } finally { editor?.unmount(); window.AudioContext = previous; pause.mockRestore(); }
});

import { applyStudioMediaGain, disposeAudioRemixPreview, ensureAudioRemixPreview, updateAudioRemixPreview } from "./audioRemixPreview";
import { applyAudioRemixPreset, DEFAULT_AUDIO_REMIX } from "./audioRemixModel";
import { gainTestContext } from "../__tests__/fixtures/studioAudioGraph";

describe("Studio native media bus gain", () => {
  const previousContext = window.AudioContext;
  const previousWorklet = window.AudioWorkletNode;
  const previousFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true,
      arrayBuffer: async () => new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer }));
  });
  afterEach(() => { window.AudioContext = previousContext; window.AudioWorkletNode = previousWorklet; global.fetch = previousFetch; });

  test("Chipmunk uses one audio-thread pitch node and keeps the picture at 1x", async () => {
    const context = gainTestContext();
    context.audioWorklet = { addModule: jest.fn(() => Promise.resolve()) };
    window.AudioContext = jest.fn(() => context);
    const parameter = { value: 0 };
    window.AudioWorkletNode = jest.fn(() => ({ connect: jest.fn(), disconnect: jest.fn(), parameters: new Map([["semitones", parameter]]) }));
    const video = document.createElement("video");
    expect(await updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"))).toBe(true);
    expect(parameter.value).toBe(12); expect(video.playbackRate).toBe(1); expect(video.preservesPitch).toBe(true);
    await updateAudioRemixPreview(video, applyAudioRemixPreset("deep_voice"));
    expect(parameter.value).toBeCloseTo(-2.8);
    await updateAudioRemixPreview(video, DEFAULT_AUDIO_REMIX, true);
    expect(parameter.value).toBe(0);
    expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(window.AudioWorkletNode).toHaveBeenCalledTimes(1);
  });

  test("Before wins against a late pitch module and unsupported pitch keeps ordinary sound connected", async () => {
    const context = gainTestContext(); let finish;
    context.audioWorklet = { addModule: jest.fn(() => new Promise(resolve => { finish = resolve; })) };
    window.AudioContext = jest.fn(() => context);
    window.AudioWorkletNode = jest.fn();
    const video = document.createElement("video");
    const loading = updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"));
    await updateAudioRemixPreview(video, DEFAULT_AUDIO_REMIX, true);
    finish(); await loading;
    expect(window.AudioWorkletNode).not.toHaveBeenCalled();
    window.AudioWorkletNode = undefined;
    expect(await updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"))).toBe(false);
    expect(video.__audioRemixGraph.source.disconnect).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(1);
  });

  test("a WASM initialization failure restores ordinary sound and reports the pitch fallback", async () => {
    const context = gainTestContext();
    context.audioWorklet = { addModule: jest.fn(() => Promise.resolve()) };
    window.AudioContext = jest.fn(() => context);
    const node = { connect: jest.fn(), disconnect: jest.fn(), port: {},
      parameters: new Map([["semitones", { value: 0 }]]) };
    window.AudioWorkletNode = jest.fn(() => node);
    const video = document.createElement("video"), failed = jest.fn();
    video.addEventListener("studio-remix-pitch-error", failed);
    await updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"));
    const graph = video.__audioRemixGraph;
    node.port.onmessage({ data: { type: "ready", latencySeconds: .096 } });
    expect(graph.pitchLatencySeconds).toBe(.096);
    node.port.onmessage({ data: { type: "error" } });
    expect(graph.pitch).toBeNull();
    expect(graph.source.connect).toHaveBeenLastCalledWith(graph.bass);
    expect(failed).toHaveBeenCalledTimes(1);
    node.onprocessorerror();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  test("a failed pitch binary is retried without disconnecting the dry source", async () => {
    const context = gainTestContext();
    context.audioWorklet = { addModule: jest.fn(() => Promise.resolve()) };
    window.AudioContext = jest.fn(() => context);
    window.AudioWorkletNode = jest.fn(() => ({ connect: jest.fn(), disconnect: jest.fn(),
      parameters: new Map([["semitones", { value: 0 }]]) }));
    global.fetch.mockResolvedValueOnce({ ok: false });
    const video = document.createElement("video");
    expect(await updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"))).toBe(false);
    expect(video.__audioRemixGraph.source.disconnect).not.toHaveBeenCalled();
    expect(await updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"))).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("disposing a closed editor releases its audio context and rejects late pitch preparation", async () => {
    const context = gainTestContext(); let finish;
    context.close = jest.fn(() => Promise.resolve());
    context.audioWorklet = { addModule: jest.fn(() => new Promise(resolve => { finish = resolve; })) };
    window.AudioContext = jest.fn(() => context); window.AudioWorkletNode = jest.fn();
    const video = document.createElement("video");
    const pending = updateAudioRemixPreview(video, applyAudioRemixPreset("chipmunk"));
    disposeAudioRemixPreview(video); disposeAudioRemixPreview(video);
    finish(); await pending;
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(window.AudioWorkletNode).not.toHaveBeenCalled();
    expect(video.__audioRemixGraph.source.disconnect).toHaveBeenCalled();
  });

  test("an untreated prepared decoder retains its pacing rate without native rate resets", async () => {
    const video = document.createElement("video");
    let rate = 2;
    const writeRate = jest.fn(value => { rate = value; });
    Object.defineProperty(video, "playbackRate", { configurable: true,
      get: () => rate, set: writeRate });
    await updateAudioRemixPreview(video, DEFAULT_AUDIO_REMIX, true, { playbackRate: 2 });
    expect(video.playbackRate).toBe(2);
    expect(writeRate).not.toHaveBeenCalled();
    await updateAudioRemixPreview(video, DEFAULT_AUDIO_REMIX, true, { playbackRate: .5 });
    expect(writeRate.mock.calls).toEqual([[.5]]);
  });

  test("boosts through one neutral graph, resets attenuation, and stays independent of remix output", async () => {
    const context = gainTestContext();
    window.AudioContext = jest.fn(() => context);
    const audio = document.createElement("audio");
    expect(applyStudioMediaGain(audio, .4)).toBe(true);
    expect(audio.volume).toBe(.4);
    expect(window.AudioContext).not.toHaveBeenCalled();
    expect(applyStudioMediaGain(audio, 2)).toBe(true);
    const graph = audio.__audioRemixGraph;
    expect(audio.volume).toBe(1);
    expect(graph.trackGain.gain.value).toBe(2);
    expect(graph.compressor.ratio.value).toBe(1);
    expect(graph.wet.gain.value).toBe(0);
    expect(graph.output.connect).toHaveBeenCalledWith(graph.trackGain);
    expect(graph.trackGain.connect).toHaveBeenCalledWith(graph.analyser);
    await updateAudioRemixPreview(audio, { ...DEFAULT_AUDIO_REMIX, enabled: true,
      outputGain: -6, levelMatch: false });
    expect(graph.output.gain.value).toBeCloseTo(10 ** (-6 / 20));
    expect(graph.trackGain.gain.value).toBe(2);
    applyStudioMediaGain(audio, .25);
    expect(audio.volume).toBe(1);
    expect(graph.trackGain.gain.value).toBe(.25);
    await updateAudioRemixPreview(audio, DEFAULT_AUDIO_REMIX, true);
    expect(graph.output.gain.value).toBe(1);
    expect(graph.trackGain.gain.value).toBe(.25);
    applyStudioMediaGain(audio, 0);
    expect(graph.trackGain.gain.value).toBe(0);
    expect(ensureAudioRemixPreview(audio)).toBe(graph);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  test("reports unavailable boost without throwing an invalid HTML volume", () => {
    window.AudioContext = undefined;
    const audio = document.createElement("audio");
    expect(applyStudioMediaGain(audio, 1.6)).toBe(false);
    expect(audio.volume).toBe(1);
    expect(applyStudioMediaGain(audio, .6)).toBe(true);
    expect(audio.volume).toBe(.6);
    expect(applyStudioMediaGain(audio, NaN)).toBe(true);
    expect(audio.volume).toBe(0);
  });
});

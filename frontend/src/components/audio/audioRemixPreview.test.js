import { applyStudioMediaGain, ensureAudioRemixPreview, updateAudioRemixPreview } from "./audioRemixPreview";
import { DEFAULT_AUDIO_REMIX } from "./audioRemixModel";
import { gainTestContext } from "../__tests__/fixtures/studioAudioGraph";

describe("Studio native media bus gain", () => {
  const previousContext = window.AudioContext;
  afterEach(() => { window.AudioContext = previousContext; });

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

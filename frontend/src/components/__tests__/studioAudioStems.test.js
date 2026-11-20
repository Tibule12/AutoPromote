import {
  buildAudioStemPlan,
  buildStoreZipArchive,
  encodeStereoInt16Wav,
  exportStudioAudioStemsArchive,
  renderStemPlanToStereoBuffers,
} from "../studioAudioStems";
import { measureBufferLufs } from "../studioAudioDspEngine";

function makeStereoSine(ampL, ampR, frames = 48000, sr = 48000) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.sin((2 * Math.PI * 440 * i) / sr);
    left[i] = ampL * v;
    right[i] = ampR * v;
  }
  return { left, right };
}

describe("studioAudioStems", () => {
  test("builds identical-duration aligned stem plans respecting mute/solo and stereo pan", () => {
    const plan = buildAudioStemPlan({
      durationSeconds: 10,
      playbackRate: 2,
      timelineSegments: [{ id: "clip-1", url: "https://cdn/main.mp4", startTime: 0, endTime: 10 }],
      musicTrack: { url: "https://cdn/bgm.mp3", volume: 0.4, fadeIn: 0.5 },
      voiceovers: [{ url: "https://cdn/vo.wav", startTime: 2, duration: 3, volume: 0.9 }],
      soundEffects: [{ url: "https://cdn/hit.wav", startTime: 4, duration: 0.5, volume: 1 }],
      trackStates: {
        music: { pan: -100 },
        sfx: { muted: true },
      },
    });

    expect(plan.durationSeconds).toBe(5);
    expect(plan.stems.map(s => s.filename)).toEqual(["01_dialogue.wav", "03_music.wav", "04_voiceover.wav"]);
    expect(plan.stems.every(s => s.startSeconds === 0 && s.durationSeconds === 5)).toBe(true);
    expect(plan.stems.find(s => s.bus === "music").pan).toBe(-100);
  });

  test("mixes hard-panned stems, automation, and fades into valid 48kHz PCM WAV + PKZIP archive", async () => {
    const tone = makeStereoSine(0.5, 0.5, 48000, 48000);
    const archive = await exportStudioAudioStemsArchive({
      projectName: "Stem Mix Pack",
      durationSeconds: 2,
      timelineSegments: [{ id: "m1", url: "https://cdn/dlg.mp4", startTime: 0, endTime: 2 }],
      musicTrack: { url: "https://cdn/music.mp3", volume: 0.5 },
      trackStates: {
        originalAudio: { pan: -100 },
        music: { pan: 100 },
      },
      decodeAudioUrl: async () => tone,
    });

    expect(archive.filename).toBe("stem-mix-pack-stems.zip");
    expect(archive.stemCount).toBe(2);
    // PKZIP local header magic PK\x03\x04
    expect(archive.content[0]).toBe(0x50);
    expect(archive.content[1]).toBe(0x4b);

    // Also test raw buffer panning & WAV header output directly
    const plan = buildAudioStemPlan({
      durationSeconds: 1,
      timelineSegments: [{ id: "m1", url: "u", startTime: 0, endTime: 1 }],
      trackStates: { originalAudio: { pan: 100 } },
    });
    const rendered = renderStemPlanToStereoBuffers(plan.stems[0], { u: tone }, 48000);
    const interleaved = new Float32Array(rendered.frameCount * 2);
    for (let i = 0; i < rendered.frameCount; i += 1) {
      interleaved[i * 2] = rendered.left[i];
      interleaved[i * 2 + 1] = rendered.right[i];
    }
    expect(Math.max(...rendered.left.map(Math.abs))).toBeCloseTo(0, 4);
    expect(Math.max(...rendered.right.map(Math.abs))).toBeGreaterThan(0.45);
    expect(measureBufferLufs(interleaved, 48000, 2).integratedLufs).toBeGreaterThan(-12);

    const wav = encodeStereoInt16Wav(rendered.left, rendered.right, 48000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(wav.length).toBe(44 + 48000 * 4);
    expect(buildStoreZipArchive([{ filename: "test.wav", data: wav }]).length).toBeGreaterThan(wav.length);
  });
});

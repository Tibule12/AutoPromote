import {
  SPLIT_AUDIO_PRESETS,
  normalizeSplitAudioClip,
  buildAudioSplitSequence,
  applySplitAudioPreset,
  autoApplyDialoguePreLaps,
  calculateAudioProxyState,
} from "../studioAudioSplit";

describe("studioAudioSplit - J-Cut & L-Cut Split Audio Transitions", () => {
  const sampleTimeline = [
    {
      id: "clip-1",
      startRequest: 10,
      endRequest: 15,
      url: "https://example.com/clip1.mp4",
      audioTrimOffsetStart: 0,
      audioTrimOffsetEnd: 0,
    },
    {
      id: "clip-2",
      startRequest: 20,
      endRequest: 26,
      url: "https://example.com/clip2.mp4",
      audioTrimOffsetStart: 0,
      audioTrimOffsetEnd: 0,
    },
    {
      id: "clip-3",
      startRequest: 0,
      endRequest: 4,
      url: "https://example.com/clip3.mp4",
      audioTrimOffsetStart: 0,
      audioTrimOffsetEnd: 0,
    },
  ];

  test("normalizes straight cut clip without offsets", () => {
    const normalized = normalizeSplitAudioClip(sampleTimeline[0], 0, 0);
    expect(normalized.videoDuration).toBe(5.0);
    expect(normalized.audioTimelineStart).toBe(0.0);
    expect(normalized.audioTimelineDuration).toBe(5.0);
    expect(normalized.hasJCut).toBe(false);
    expect(normalized.hasLCut).toBe(false);
  });

  test("calculates J-Cut (dialogue pre-lap) accurately", () => {
    // Clip 2 starts at 5.0s on timeline. With 0.8s J-Cut, audio starts at 4.2s.
    const clipWithJCut = {
      ...sampleTimeline[1],
      audioTrimOffsetStart: -0.8,
    };
    const normalized = normalizeSplitAudioClip(clipWithJCut, 1, 5.0);
    expect(normalized.videoDuration).toBe(6.0);
    expect(normalized.audioTimelineStart).toBeCloseTo(4.2, 2);
    expect(normalized.audioTimelineDuration).toBeCloseTo(6.8, 2);
    expect(normalized.hasJCut).toBe(true);
    expect(normalized.hasLCut).toBe(false);
    expect(normalized.jCutDuration).toBe(0.8);
  });

  test("calculates L-Cut (dialogue trail) accurately", () => {
    // Clip 1 ends at 5.0s. With 1.0s L-Cut, audio extends to 6.0s.
    const clipWithLCut = {
      ...sampleTimeline[0],
      audioTrimOffsetEnd: 1.0,
    };
    const normalized = normalizeSplitAudioClip(clipWithLCut, 0, 0.0);
    expect(normalized.videoDuration).toBe(5.0);
    expect(normalized.audioTimelineStart).toBe(0.0);
    expect(normalized.audioTimelineDuration).toBe(6.0);
    expect(normalized.hasJCut).toBe(false);
    expect(normalized.hasLCut).toBe(true);
    expect(normalized.lCutDuration).toBe(1.0);
  });

  test("builds complete audio split sequence with cumulative start times", () => {
    const splitSequence = buildAudioSplitSequence([
      sampleTimeline[0], // 5s
      { ...sampleTimeline[1], audioTrimOffsetStart: -0.6 }, // 6s, starts at 5s, audio at 4.4s
      sampleTimeline[2], // 4s, starts at 11s
    ]);

    expect(splitSequence).toHaveLength(3);
    expect(splitSequence[0].outputStart).toBe(0);
    expect(splitSequence[1].outputStart).toBe(5);
    expect(splitSequence[1].audioTimelineStart).toBeCloseTo(4.4, 2);
    expect(splitSequence[2].outputStart).toBe(11);
  });

  test("applies presets correctly", () => {
    const updated = applySplitAudioPreset(sampleTimeline, 1, "cinematic_j");
    expect(updated[1].audioTrimOffsetStart).toBe(-0.8);
    expect(updated[1].audioTrimOffsetEnd).toBe(0);

    const updatedL = applySplitAudioPreset(sampleTimeline, 0, "reaction_l");
    expect(updatedL[0].audioTrimOffsetStart).toBe(0);
    expect(updatedL[0].audioTrimOffsetEnd).toBe(0.8);
  });

  test("auto applies dialogue pre-laps to all incoming cuts except the first", () => {
    const withPreLaps = autoApplyDialoguePreLaps(sampleTimeline, 0.6);
    expect(withPreLaps[0].audioTrimOffsetStart).toBe(0);
    expect(withPreLaps[1].audioTrimOffsetStart).toBe(-0.6);
    expect(withPreLaps[2].audioTrimOffsetStart).toBe(-0.6);
  });

  test("calculates audio proxy state for live preview sync", () => {
    // Clip 1 is 0-5s. Clip 2 is 5-11s with 0.8s J-Cut (audio 4.2-11s).
    const splitSequence = buildAudioSplitSequence([
      sampleTimeline[0],
      { ...sampleTimeline[1], audioTrimOffsetStart: -0.8 },
    ]);

    // When playhead is at 4.5s (before clip 2's video at 5.0s, but activeVideoIndex is 0):
    const proxies = calculateAudioProxyState(4.5, splitSequence, 0);
    expect(proxies).toHaveLength(1);
    expect(proxies[0].type).toBe("j-cut");
    expect(proxies[0].clipIndex).toBe(1);
    // Source seek time: 20 (clip 2 start) + (-0.8) + (4.5 - 4.2 = 0.3) = 19.5s
    expect(proxies[0].sourceSeekTime).toBeCloseTo(19.5, 2);
  });

  test("exports all required presets", () => {
    expect(SPLIT_AUDIO_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(SPLIT_AUDIO_PRESETS.map(p => p.id)).toContain("straight");
    expect(SPLIT_AUDIO_PRESETS.map(p => p.id)).toContain("cinematic_j");
    expect(SPLIT_AUDIO_PRESETS.map(p => p.id)).toContain("reaction_l");
  });
});


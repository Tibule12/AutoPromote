import {
  normalizeBeatMarkers,
  calculateBpm,
  findNearestBeat,
  alignTimelineCutsToMusicBeats,
  alignBRollToMusicBeats,
  generateBeatPunchIns,
} from "../studioBeatEngine";

describe("studioBeatEngine - Music Beat-Transient Auto-Snapping & Cut-to-Beat", () => {
  // Synthetic 120 BPM beat sequence (interval = 0.5s)
  const synthetic120Bpm = Array.from({ length: 20 }, (_, idx) => ({
    time: idx * 0.5,
    strength: idx % 4 === 0 ? 0.95 : 0.6,
  }));

  test("normalizes raw markers and flags downbeats and bars", () => {
    const normalized = normalizeBeatMarkers(synthetic120Bpm, 4);
    expect(normalized).toHaveLength(20);
    expect(normalized[0].isDownbeat).toBe(true);
    expect(normalized[0].barIndex).toBe(1);
    expect(normalized[0].beatIndex).toBe(1);

    expect(normalized[1].isDownbeat).toBe(false);
    expect(normalized[1].beatIndex).toBe(2);

    expect(normalized[4].isDownbeat).toBe(true);
    expect(normalized[4].barIndex).toBe(2);
  });

  test("calculates BPM accurately from beat intervals", () => {
    const normalized = normalizeBeatMarkers(synthetic120Bpm);
    const bpm = calculateBpm(normalized);
    expect(bpm).toBe(120);
  });

  test("finds nearest beat within threshold", () => {
    const normalized = normalizeBeatMarkers(synthetic120Bpm);

    // Target 2.12s -> nearest beat is 2.0s (delta 0.12s, inside 0.35s threshold)
    const res1 = findNearestBeat(2.12, normalized, 0.35);
    expect(res1.isSnapped).toBe(true);
    expect(res1.time).toBe(2.0);
    expect(res1.delta).toBeCloseTo(0.12, 2);

    // Target 2.25s -> exactly between 2.0 and 2.5s. If threshold is 0.1s, it should NOT snap
    const res2 = findNearestBeat(2.25, normalized, 0.1);
    expect(res2.isSnapped).toBe(false);
    expect(res2.time).toBe(2.25);
  });

  test("aligns timeline sequence cuts to music beats", () => {
    const normalized = normalizeBeatMarkers(synthetic120Bpm);

    // Timeline of 3 clips:
    // Clip 1: 0s to 3.85s (natural cut at 3.85s -> nearest beat is 4.0s)
    // Clip 2: starts after Clip 1, duration 4.2s (natural cut at 3.85 + 4.2 = 8.05s -> nearest beat is 8.0s)
    // Clip 3: duration 3.0s
    const sampleTimeline = [
      { id: "c1", startRequest: 0, endRequest: 3.85, duration: 3.85 },
      { id: "c2", startRequest: 10, endRequest: 14.2, duration: 4.2 },
      { id: "c3", startRequest: 20, endRequest: 23.0, duration: 3.0 },
    ];

    const result = alignTimelineCutsToMusicBeats(sampleTimeline, normalized, { threshold: 0.35 });
    expect(result.cutsAligned).toBeGreaterThanOrEqual(1);

    // First cut should have aligned to 4.0s (duration extended from 3.85 to 4.0)
    expect(result.updatedTimeline[0].duration).toBeCloseTo(4.0, 2);
    expect(result.updatedTimeline[0].endRequest).toBeCloseTo(4.0, 2);
  });

  test("aligns B-roll clips to musical beat markers", () => {
    const normalized = normalizeBeatMarkers(synthetic120Bpm);
    const broll = [
      { id: "b1", startTime: 1.85, duration: 2.2 }, // 1.85 -> 2.0s, end 4.05 -> 4.0s (dur: 2.0s)
    ];

    const result = alignBRollToMusicBeats(broll, normalized, 0.25);
    expect(result.alignedCount).toBe(1);
    expect(result.updatedBRoll[0].startTime).toBe(2.0);
    expect(result.updatedBRoll[0].duration).toBeCloseTo(2.0, 2);
  });

  test("generates punch-ins on musical beat drops", () => {
    const normalized = normalizeBeatMarkers(synthetic120Bpm);
    const punchKeyframes = generateBeatPunchIns(normalized, 10, "bars", 1.3);

    expect(punchKeyframes.length).toBeGreaterThanOrEqual(4);
    expect(punchKeyframes[0].value).toBe(1.3);
    expect(punchKeyframes[0].property).toBe("scale");
    expect(punchKeyframes[1].value).toBe(1.0);
  });
});


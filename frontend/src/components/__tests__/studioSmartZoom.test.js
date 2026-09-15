import {
  createSinglePunchKeyframes,
  generateSmartZoomKeyframes,
  extractPunchZonesFromKeyframes,
  isTimePunched,
  PUNCH_SCALES,
  PUNCH_STYLES,
  PUNCH_MODES,
} from "../studioSmartZoom";

describe("AI Smart Zoom & Dramatic Punch-Ins", () => {
  test("creates snap punch keyframes with hold easing", () => {
    const keys = createSinglePunchKeyframes({
      startTime: 3.0,
      duration: 2.0,
      punchScale: 1.25,
      punchStyle: "snap",
      baseScale: 1.0,
      punchId: "test-snap",
    });

    expect(keys.length).toBeGreaterThanOrEqual(2);
    const punchKey = keys.find(k => k.value === 1.25);
    expect(punchKey).toBeDefined();
    expect(punchKey.time).toBe(3.0);
    expect(punchKey.easing).toBe("hold");

    const returnKey = keys.find(k => k.time >= 5.0);
    expect(returnKey).toBeDefined();
    expect(returnKey.value).toBe(1.0);
  });

  test("creates dynamic fast punch keyframes with easing ramps", () => {
    const keys = createSinglePunchKeyframes({
      startTime: 2.0,
      duration: 2.5,
      punchScale: 1.3,
      punchStyle: "punch",
      baseScale: 1.0,
    });

    expect(keys.length).toBe(4);
    expect(keys[0].time).toBe(2.0);
    expect(keys[0].value).toBe(1.0);
    expect(keys[1].value).toBe(1.3);
    expect(keys[1].time).toBe(2.12);
    expect(keys[2].value).toBe(1.3);
    expect(keys[3].value).toBe(1.0);
    expect(keys[3].time).toBe(4.5);
  });

  test("generates rhythmic viral cadence punch-ins across a 30s timeline", () => {
    const keys = generateSmartZoomKeyframes({
      duration: 30,
      punchScale: 1.25,
      punchStyle: "punch",
      punchMode: "cadence",
      punchDuration: 2.5,
    });

    expect(keys.length).toBeGreaterThan(0);
    const zones = extractPunchZonesFromKeyframes(keys);
    // Across 30s with 2.5s punch + 3.2s gap, should yield ~4-5 punch zones
    expect(zones.length).toBeGreaterThanOrEqual(3);
    expect(zones[0].startTime).toBeGreaterThanOrEqual(2.0);
    expect(zones[0].maxScale).toBe(1.25);

    // Verify non-overlapping
    for (let i = 1; i < zones.length; i += 1) {
      expect(zones[i].startTime).toBeGreaterThan(zones[i - 1].endTime);
    }
  });

  test("generates opening hook punch", () => {
    const keys = generateSmartZoomKeyframes({
      duration: 20,
      punchScale: 1.35,
      punchMode: "hook",
    });

    const zones = extractPunchZonesFromKeyframes(keys);
    expect(zones.length).toBe(1);
    expect(zones[0].startTime).toBe(0);
    expect(zones[0].maxScale).toBe(1.35);
  });

  test("generates speech emphasis punch-ins from AI captions", () => {
    const captions = [
      { start: 0.5, end: 2.5, text: "Stop doing this right now!" },
      { start: 3.5, end: 5.5, text: "Most people fail because of this." },
      { start: 7.0, end: 9.5, text: "Here is the exact secret." },
    ];

    const keys = generateSmartZoomKeyframes({
      duration: 15,
      captionSegments: captions,
      punchScale: 1.25,
      punchMode: "emphasis",
    });

    const zones = extractPunchZonesFromKeyframes(keys);
    expect(zones.length).toBeGreaterThanOrEqual(1);
    expect(zones[0].startTime).toBe(0.5);
  });

  test("isTimePunched accurately detects if playhead is inside a punch", () => {
    const keys = createSinglePunchKeyframes({
      startTime: 5.0,
      duration: 2.0,
      punchScale: 1.25,
    });

    expect(isTimePunched(keys, 4.0)).toBe(false);
    expect(isTimePunched(keys, 5.5)).toBe(true);
    expect(isTimePunched(keys, 6.8)).toBe(true);
    expect(isTimePunched(keys, 8.0)).toBe(false);
  });

  test("exports standard scale presets and options", () => {
    expect(PUNCH_SCALES.length).toBe(3);
    expect(PUNCH_STYLES.length).toBe(3);
    expect(PUNCH_MODES.length).toBe(3);
  });
});


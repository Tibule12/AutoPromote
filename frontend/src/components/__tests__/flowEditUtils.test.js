import {
  buildAdaptiveEnergyZones,
  buildEnergyZones,
  buildFlowEditPlan,
  buildFlowTimelineDisplaySegments,
  buildSingleLensAutoPlan,
  classifyFlowAudio,
  detectAudioBeats,
  getFlowSegmentAtTime,
  getFlowSourceTimeAtPlayhead,
} from "../flowEditUtils";

describe("flowEditUtils", () => {
  const sources = [
    {
      id: "cam-1",
      label: "Camera 1",
      duration: 12,
      offsetSeconds: 0,
      uploadedUrl: "https://example.com/cam-1.mp4",
      videoWidth: 1920,
      videoHeight: 1080,
    },
    {
      id: "cam-2",
      label: "Camera 2",
      duration: 12,
      offsetSeconds: 0.4,
      uploadedUrl: "https://example.com/cam-2.mp4",
      videoWidth: 1280,
      videoHeight: 720,
    },
  ];

  test("detects musical beats from a rhythmic envelope", () => {
    const analysis = {
      envelope: [0.1, 0.2, 0.88, 0.21, 0.15, 0.89, 0.2, 0.14, 0.9, 0.18, 0.1],
      secondsPerBin: 0.25,
      duration: 2.75,
    };

    const beats = detectAudioBeats(analysis);
    expect(beats.beats.length).toBeGreaterThanOrEqual(1);
    expect(beats.beatStrength).toBeGreaterThan(0.4);
  });

  test("classifies choir-like audio as performance-led rather than purely beat-led", () => {
    const choirAnalysis = {
      envelope: [
        0.18, 0.22, 0.26, 0.42, 0.58, 0.74, 0.78, 0.82, 0.8, 0.76, 0.72, 0.68, 0.52, 0.36,
      ],
      secondsPerBin: 0.4,
      duration: 5.6,
    };

    const classification = classifyFlowAudio(choirAnalysis);
    expect(classification.type).toBe("choir");
    expect(classification.confidence).toBeGreaterThan(0.5);
  });

  test("builds energy zones across low, build, and high sections", () => {
    const zones = buildEnergyZones(
      {
        envelope: [0.12, 0.16, 0.18, 0.32, 0.46, 0.58, 0.7, 0.78, 0.81, 0.55, 0.3, 0.2],
        secondsPerBin: 0.5,
        duration: 6,
      },
      6
    );

    expect(zones.length).toBeGreaterThan(1);
    expect(zones.some(zone => zone.zone === "build" || zone.zone === "high")).toBe(true);
  });

  test("builds a flow edit plan with switches, speed ramps, and fallback warning when rhythm is weak", () => {
    const speechLikeAnalysis = {
      envelope: [0.12, 0.14, 0.16, 0.15, 0.18, 0.17, 0.16, 0.18, 0.17, 0.16],
      secondsPerBin: 0.5,
      duration: 5,
    };

    const plan = buildFlowEditPlan({
      sources,
      timelineDuration: 5,
      audioAnalysis: speechLikeAnalysis,
      sourceActivityByCameraId: {
        "cam-1": [{ time: 0.5, score: 0.62 }],
        "cam-2": [{ time: 2, score: 0.71 }],
      },
    });

    expect(plan.segments.length).toBeGreaterThan(0);
    expect(plan.switches[0]).toEqual(
      expect.objectContaining({
        cameraId: expect.any(String),
        startTime: 0,
      })
    );
    expect(plan.segments.some(segment => segment.playbackRate !== 1)).toBe(true);
    expect(plan.usedSmartTimingFallback || plan.warning.includes("No strong beat detected")).toBe(true);
    expect(plan.warning).toContain("Bring your boring audio");
  });

  test("activates rescue mode when the soundtrack overpowers the usable visual energy", () => {
    const plan = buildFlowEditPlan({
      sources,
      timelineDuration: 5,
      audioAnalysis: {
        envelope: [0.12, 0.24, 0.88, 0.22, 0.15, 0.9, 0.21, 0.18, 0.86, 0.2],
        secondsPerBin: 0.5,
        duration: 5,
      },
      sourceActivityByCameraId: {
        "cam-1": [{ time: 0.5, score: 0.18 }],
        "cam-2": [{ time: 2, score: 0.22 }],
      },
      frameQualityByCameraId: {
        "cam-1": { score: 0.46 },
        "cam-2": { score: 0.49 },
      },
      styleId: "hype",
    });

    expect(plan.rescueMode).toBe(true);
    expect(plan.rescueScore).toBeGreaterThan(0.39);
    expect(plan.warning).toContain("rescue");
    expect(plan.rescueSummary.toLowerCase()).toContain("rescue");
    expect(plan.segments.length).toBeGreaterThan(0);
  });

  test("designs synthetic mood zones when audio is too flat to drive natural contrast", () => {
    const zones = buildAdaptiveEnergyZones(
      {
        envelope: [0.12, 0.13, 0.12, 0.13, 0.12, 0.13, 0.12, 0.13],
        secondsPerBin: 0.5,
        duration: 4,
      },
      4,
      { audioType: "ambient" }
    );

    expect(zones.length).toBeGreaterThan(1);
    expect(zones.some(zone => zone.zone === "build" || zone.zone === "high")).toBe(true);
  });

  test("builds a single-lens auto plan with adaptive punch-ins", () => {
    const plan = buildSingleLensAutoPlan({
      source: sources[0],
      timelineDuration: 5,
      audioAnalysis: {
        envelope: [0.12, 0.2, 0.5, 0.78, 0.32, 0.18, 0.62, 0.82, 0.24, 0.12],
        secondsPerBin: 0.5,
        duration: 5,
      },
    });

    expect(plan.segments.length).toBeGreaterThan(1);
    expect(Object.keys(plan.framingMap).length).toBe(plan.segments.length);
    expect(plan.summary.length).toBeGreaterThan(10);
  });

  test("maps playhead into flow-aware source time", () => {
    const plan = buildFlowEditPlan({
      sources,
      timelineDuration: 4,
      audioAnalysis: {
        envelope: [0.12, 0.18, 0.7, 0.2, 0.74, 0.22, 0.76, 0.18],
        secondsPerBin: 0.5,
        duration: 4,
      },
    });

    const segment = getFlowSegmentAtTime(plan.segments, 1.2);
    const source = sources.find(item => item.id === segment.cameraId);
    const sourceTime = getFlowSourceTimeAtPlayhead(source, segment, 1.2, 0);
    expect(sourceTime).toBeGreaterThanOrEqual(0);
    expect(sourceTime).toBeLessThan(source.duration);
  });

  test("builds timeline display data for flow segments", () => {
    const displaySegments = buildFlowTimelineDisplaySegments(
      [
        { id: "seg-1", cameraId: "cam-1", startTime: 0, duration: 2 },
        { id: "seg-2", cameraId: "cam-2", startTime: 2, duration: 3 },
      ],
      sources,
      5
    );

    expect(displaySegments[0]).toEqual(
      expect.objectContaining({
        label: "Camera 1",
        startPercent: 0,
        widthPercent: 40,
      })
    );
    expect(displaySegments[1]).toEqual(
      expect.objectContaining({
        label: "Camera 2",
        startPercent: 40,
        widthPercent: 60,
      })
    );
  });
});

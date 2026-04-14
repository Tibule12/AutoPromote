import {
  buildAutoSwitchPlan,
  buildRenderSegments,
  buildSwitchDisplaySegments,
  formatDurationLabel,
  getAutoSwitchIntervalForAggressiveness,
  getActiveCameraAtTime,
  getSourceDurationBounds,
  normalizeSegments,
  normalizeSwitches,
} from "../multicamUtils";

describe("multicam utils", () => {
  const sources = [
    {
      id: "cam-1",
      label: "Camera 1",
      duration: 18,
      offsetSeconds: 0,
      uploadedUrl: "https://example.com/cam-1.mp4",
    },
    {
      id: "cam-2",
      label: "Camera 2",
      duration: 17,
      offsetSeconds: 1.5,
      uploadedUrl: "https://example.com/cam-2.mp4",
    },
  ];

  test("computes the synced overlap window from camera offsets", () => {
    expect(getSourceDurationBounds(sources)).toEqual(
      expect.objectContaining({
        overlapStart: 1.5,
        overlapEnd: 18,
        overlapDuration: 16.5,
        canRender: true,
      })
    );
  });

  test("normalizes switch points and injects the opening switch", () => {
    const switches = normalizeSwitches(
      [{ id: "late", cameraId: "cam-2", startTime: 3.2 }],
      sources,
      16.5
    );

    expect(switches[0]).toEqual(
      expect.objectContaining({
        cameraId: "cam-1",
        startTime: 0,
      })
    );
    expect(switches[1]).toEqual(
      expect.objectContaining({
        cameraId: "cam-2",
        startTime: 3.2,
      })
    );
  });

  test("builds render segments using overlap time mapped back to each source", () => {
    const segments = buildRenderSegments(
      [
        { id: "switch-1", cameraId: "cam-1", startTime: 0 },
        { id: "switch-2", cameraId: "cam-2", startTime: 4 },
      ],
      sources,
      1.5,
      10
    );

    expect(segments[0]).toEqual(
      expect.objectContaining({
        cameraId: "cam-1",
        sourceStart: 1.5,
        sourceEnd: 5.5,
        url: "https://example.com/cam-1.mp4",
      })
    );
    expect(segments[1]).toEqual(
      expect.objectContaining({
        cameraId: "cam-2",
        sourceStart: 4,
        sourceEnd: 10,
        url: "https://example.com/cam-2.mp4",
      })
    );
  });

  test("builds an interval auto-switch plan across available cameras", () => {
    const switches = buildAutoSwitchPlan(sources, 9, 3);

    expect(switches).toEqual([
      expect.objectContaining({ cameraId: "cam-1", startTime: 0 }),
      expect.objectContaining({ cameraId: "cam-2", startTime: 3 }),
      expect.objectContaining({ cameraId: "cam-1", startTime: 6 }),
    ]);
  });

  test("prefers the camera with stronger audio activity when guidance is available", () => {
    const switches = buildAutoSwitchPlan(sources, 9, 3, "balanced", {
      "cam-1": [
        { time: 0, score: 0.9 },
        { time: 3, score: 0.15 },
        { time: 6, score: 0.75 },
      ],
      "cam-2": [
        { time: 0, score: 0.2 },
        { time: 3, score: 0.85 },
        { time: 6, score: 0.1 },
      ],
    });

    expect(switches).toEqual([
      expect.objectContaining({ cameraId: "cam-1", startTime: 0 }),
      expect.objectContaining({ cameraId: "cam-2", startTime: 3 }),
      expect.objectContaining({ cameraId: "cam-1", startTime: 6 }),
    ]);
  });

  test("builds display segments for the visual switch timeline", () => {
    const displaySegments = buildSwitchDisplaySegments(
      [
        { id: "switch-1", cameraId: "cam-1", startTime: 0 },
        { id: "switch-2", cameraId: "cam-2", startTime: 4 },
      ],
      sources,
      10
    );

    expect(displaySegments[0]).toEqual(
      expect.objectContaining({
        cameraId: "cam-1",
        endTime: 4,
        widthPercent: 40,
        isLockedStart: true,
      })
    );
    expect(displaySegments[1]).toEqual(
      expect.objectContaining({
        cameraId: "cam-2",
        startPercent: 40,
        widthPercent: 60,
      })
    );
  });

  test("finds the active camera segment for a preview time", () => {
    const activeSegment = getActiveCameraAtTime(
      [
        { id: "switch-1", cameraId: "cam-1", startTime: 0 },
        { id: "switch-2", cameraId: "cam-2", startTime: 4 },
      ],
      sources,
      5.2,
      10
    );

    expect(activeSegment).toEqual(
      expect.objectContaining({
        cameraId: "cam-2",
        startTime: 4,
        endTime: 10,
      })
    );
  });

  test("adjusts generation interval based on aggressiveness", () => {
    expect(getAutoSwitchIntervalForAggressiveness(3, "low")).toBeCloseTo(4.05);
    expect(getAutoSwitchIntervalForAggressiveness(3, "balanced")).toBe(3);
    expect(getAutoSwitchIntervalForAggressiveness(3, "high")).toBeCloseTo(2.16);
  });

  test("formats long durations using hours minutes and seconds", () => {
    expect(formatDurationLabel(3723.4)).toBe("01:02:03");
  });
});

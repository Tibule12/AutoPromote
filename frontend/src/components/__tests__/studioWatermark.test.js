import { buildWatermarkMovementSchedule, getActiveWatermarkCue } from "../studioWatermark";

describe("studio watermark movement", () => {
  test("moves between timed safe positions and avoids a live PIP", () => {
    const schedule = buildWatermarkMovementSchedule({
      duration: 12,
      destination: "tiktok",
      overlays: [
        {
          id: "pip",
          bRollMode: "pip",
          startTime: 0,
          duration: 4,
          x: 84,
          y: 28,
          width: 28,
          height: 20,
        },
      ],
    });

    expect(schedule).toHaveLength(4);
    expect(new Set(schedule.map(cue => cue.position)).size).toBeGreaterThan(1);
    expect(schedule[0].position).not.toBe("top_right");
    expect(schedule[0]).toEqual(
      expect.objectContaining({ startTime: 0, endTime: 3.75, left: expect.any(Number) })
    );
  });

  test("returns the same active cue preview and export can address by time", () => {
    const schedule = buildWatermarkMovementSchedule({ duration: 9 });
    expect(getActiveWatermarkCue(schedule, 0)).toBe(schedule[0]);
    expect(getActiveWatermarkCue(schedule, 4)).toBe(schedule[1]);
    expect(getActiveWatermarkCue(schedule, 99)).toBe(schedule[schedule.length - 1]);
  });
});

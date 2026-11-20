import {
  formatSmpteTimecode,
  normalizeFrameRate,
  parseStudioTimecode,
  resolveDropFrameMode,
} from "../studioTimecode";

describe("studioTimecode", () => {
  test("normalizes fractional NTSC, fraction strings, and integer frame rates", () => {
    expect(normalizeFrameRate(24)).toMatchObject({ fps: 24, nominalFps: 24, label: "24", dropFrameCapable: false });
    expect(normalizeFrameRate("29.97")).toMatchObject({ nominalFps: 30, label: "29.97", dropFrameCapable: true });
    expect(normalizeFrameRate("30000/1001")).toMatchObject({ nominalFps: 30, label: "29.97", dropFrameCapable: true });
    expect(normalizeFrameRate("60000/1001")).toMatchObject({ nominalFps: 60, label: "59.94", dropFrameCapable: true });
    expect(normalizeFrameRate("24000/1001")).toMatchObject({ nominalFps: 24, label: "23.976", dropFrameCapable: false });
  });

  test("formats non-drop-frame SMPTE HH:MM:SS:FF accurately across rates", () => {
    expect(formatSmpteTimecode(0, 30)).toBe("00:00:00:00");
    expect(formatSmpteTimecode(1.5, 24)).toBe("00:00:01:12");
    expect(formatSmpteTimecode(65 + 15 / 30, 30)).toBe("00:01:05:15");
    expect(formatSmpteTimecode(3661 + 45 / 60, 60)).toBe("01:01:01:45");
    expect(formatSmpteTimecode(10 / 24, 24)).toBe("00:00:00:10");
  });

  test("formats 29.97 and 59.94 drop-frame timecode skipping dropped frames cleanly", () => {
    expect(resolveDropFrameMode(29.97, "auto")).toBe(true);
    // Frame 1799 (last frame of minute 0 at 29.97) -> 00:00:59;29
    const fps2997 = 30000 / 1001;
    expect(formatSmpteTimecode(1799 / fps2997, 29.97)).toBe("00:00:59;29");
    // Frame 1800 skips :00 and :01 -> 00:01:00;02
    expect(formatSmpteTimecode(1800 / fps2997, 29.97)).toBe("00:01:00;02");
    // 10-minute mark frame 17982 keeps :00 -> 00:10:00;00
    expect(formatSmpteTimecode(17982 / fps2997, 29.97)).toBe("00:10:00;00");
    // Explicit NDF override at 29.97 uses colon separator and frame 1800 = 00:01:00:00
    expect(formatSmpteTimecode(1800 / fps2997, 29.97, { dropFrame: false })).toBe("00:01:00:00");

    // 59.94 drops 4 frames (:00-:03) on non-10th minutes
    const fps5994 = 60000 / 1001;
    expect(formatSmpteTimecode(3599 / fps5994, 59.94)).toBe("00:00:59;59");
    expect(formatSmpteTimecode(3600 / fps5994, 59.94)).toBe("00:01:00;04");
  });

  test("parses absolute SMPTE, MM:SS, seconds, frame counts, and relative offsets", () => {
    expect(parseStudioTimecode("00:01:05:15", 30)).toMatchObject({ valid: true, frameIndex: 1965, seconds: 65.5 });
    expect(parseStudioTimecode("01:05:12", 24)).toMatchObject({ valid: true, frameIndex: 1572, seconds: 65.5 });
    expect(parseStudioTimecode("1:23.5", 30)).toMatchObject({ valid: true, seconds: 83.5 });
    expect(parseStudioTimecode("45f", 30)).toMatchObject({ valid: true, frameIndex: 45, seconds: 1.5 });
    expect(parseStudioTimecode("+12f", 24, { currentSeconds: 1 })).toMatchObject({ valid: true, seconds: 1.5, frameIndex: 36 });
    expect(parseStudioTimecode("-2s", 30, { currentSeconds: 1 })).toMatchObject({ valid: true, seconds: 0 });
    expect(parseStudioTimecode("99:99:99:99", 30, { maxSeconds: 10 }).valid).toBe(false);

    // Drop-frame round trip
    const dfParsed = parseStudioTimecode("00:01:00;02", 29.97);
    expect(dfParsed.valid).toBe(true);
    expect(dfParsed.frameIndex).toBe(1800);
    expect(formatSmpteTimecode(dfParsed.seconds, 29.97)).toBe("00:01:00;02");
  });
});

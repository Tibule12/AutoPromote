import {
  buildCaptionSidecarFilename,
  buildTimelineSidecarCues,
  exportStudioCaptionSidecar,
  formatSrtTimestamp,
  formatVttTimestamp,
} from "../studioCaptionSidecar";

describe("studioCaptionSidecar", () => {
  test("formats SRT and WebVTT timestamps cleanly without millisecond overflow", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(65.125)).toBe("00:01:05,125");
    expect(formatSrtTimestamp(3661.9999)).toBe("01:01:02,000");
    expect(formatVttTimestamp(65.125)).toBe("00:01:05.125");
  });

  test("maps edited, trimmed, split, and reordered captions onto post-edit SRT and VTT timelines", () => {
    const timelineSegments = [
      { id: "c1-a", sourceClipId: "cam-a", url: "https://cdn.example/a.mp4", startTime: 10, endTime: 12, duration: 2 },
      { id: "c1-b", sourceClipId: "cam-a", url: "https://cdn.example/a.mp4", startTime: 12, endTime: 15, duration: 3 },
      { id: "c2", sourceClipId: "cam-b", url: "https://cdn.example/b.mp4", startTime: 5, endTime: 9, duration: 4 },
    ];
    const captionSegments = [
      { id: "cut-out", sourceClipId: "cam-a", start_time: 2, end_time: 4, text: "Excluded intro", speaker: "Host" },
      // Spans razor split at source 12 -> should merge seamlessly to [1..4] on output timeline
      { id: "split-cue", sourceClipId: "cam-a", start_time: 11, end_time: 14, text: "Continuous\n\nline", speaker: "Host" },
      { id: "guest-cue", sourceClipId: "cam-b", start_time: 6, end_time: 8.5, text: "Guest reply", speaker: "Guest <1>" },
    ];

    const srt = exportStudioCaptionSidecar({
      format: "srt",
      projectName: "Podcast Episode #12!",
      captionSegments,
      timelineSegments,
      includeSpeakers: true,
    });

    expect(srt.filename).toBe("podcast-episode-12.srt");
    expect(srt.cueCount).toBe(2);
    expect(srt.content).toBe(
      [
        "1",
        "00:00:01,000 --> 00:00:04,000",
        "Host: Continuous\nline",
        "",
        "2",
        "00:00:06,000 --> 00:00:08,500",
        "Guest 1: Guest reply",
        "",
      ].join("\n")
    );

    const vtt = exportStudioCaptionSidecar({
      format: "vtt",
      title: "Podcast Episode",
      captionSegments,
      timelineSegments,
      includeSpeakers: true,
    });

    expect(vtt.filename).toBe("viral-clip.vtt");
    expect(vtt.content.startsWith("WEBVTT - Podcast Episode\n\n")).toBe(true);
    expect(vtt.content).toContain("00:00:01.000 --> 00:00:04.000\n<v Host>Continuous\nline</v>");
    expect(vtt.content).toContain("00:00:06.000 --> 00:00:08.500\n<v Guest 1>Guest reply</v>");
  });

  test("applies uniform playbackRate and variable speedSegments to exported sidecar timing", () => {
    const timelineSegments = [
      { id: "clip-1", sourceClipId: "src-1", url: "https://cdn.example/s.mp4", startTime: 0, endTime: 10, duration: 10 },
    ];
    const captionSegments = [
      { id: "fast", sourceClipId: "src-1", start_time: 0, end_time: 4, text: "Fast hook", speaker: "Host" },
      { id: "normal", sourceClipId: "src-1", start_time: 4, end_time: 8, text: "Normal beat", speaker: "Host" },
    ];

    const fastCues = buildTimelineSidecarCues({
      captionSegments,
      timelineSegments,
      playbackRate: 2,
    });
    expect(fastCues.map(cue => [cue.startTime, cue.endTime])).toEqual([
      [0, 2],
      [2, 4],
    ]);

    const rampedCues = buildTimelineSidecarCues({
      captionSegments,
      timelineSegments,
      speedSegments: [
        { startTime: 0, endTime: 4, rate: 2 }, // 4s programme -> 2s output
        { startTime: 4, endTime: 10, rate: 1 }, // 4s..8s programme -> 2s..6s output
      ],
    });
    expect(rampedCues.map(cue => [cue.startTime, cue.endTime])).toEqual([
      [0, 2],
      [2, 6],
    ]);
  });

  test("supports pre-mapped programme cues without re-filtering by source clips and omits speakers by default", () => {
    const result = exportStudioCaptionSidecar({
      format: "srt",
      alreadyMappedToTimeline: true,
      captionSegments: [
        { id: "c1", start_time: 0.5, end_time: 2.25, text: " Clean line ", speaker: "Host" },
        { id: "empty", start_time: 3, end_time: 4, text: "   " },
      ],
    });
    expect(buildCaptionSidecarFilename("My_Cut", "vtt")).toBe("my_cut.vtt");
    expect(result.cueCount).toBe(1);
    expect(result.content).toBe("1\n00:00:00,500 --> 00:00:02,250\nClean line\n");
  });
});

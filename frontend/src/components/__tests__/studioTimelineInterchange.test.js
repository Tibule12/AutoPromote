import {
  buildInterchangeTranslationReport,
  buildStudioCmx3600Edl,
  buildStudioOtioDocument,
  exportStudioTimelineInterchange,
} from "../studioTimelineInterchange";

describe("studioTimelineInterchange", () => {
  const sampleProject = {
    title: "Founder Podcast Ep 14",
    projectName: "Founder Podcast Ep 14",
    frameRate: 24,
    playbackRate: 1,
    timelineSegments: [
      {
        id: "clip-1",
        name: "Host Wide",
        sourceClipId: "CAM_A",
        url: "https://cdn.example/cam_a.mp4",
        startTime: 10,
        endTime: 15,
        sourceDuration: 120,
        audioTrimOffsetEnd: 1.0, // L-cut trailing into clip-2
        transition_out: { type: "cross_dissolve", duration: 0.5 },
      },
      {
        id: "clip-2",
        name: "Guest Close",
        sourceClipId: "CAM_B",
        url: "blob:http://localhost/local-guest",
        startTime: 20,
        endTime: 26,
        sourceDuration: 90,
        audioTrimOffsetStart: -0.5, // J-cut pre-lap over clip-1 -> checkerboards onto A2
      },
    ],
    overlays: [
      { id: "broll-1", type: "video", bRollMode: "cutaway", name: "Chart Cutaway", url: "https://cdn.example/chart.mp4", startTime: 2, duration: 3 },
      { id: "title-1", type: "text", name: "Lower Third", startTime: 1, duration: 4 },
    ],
    voiceovers: [
      { id: "vo-1", name: "Intro VO", url: "https://cdn.example/vo.wav", startTime: 0.5, duration: 2 },
    ],
    soundEffects: [
      { id: "sfx-1", name: "Whoosh", url: "https://cdn.example/whoosh.wav", startTime: 5, duration: 0.5 },
    ],
    musicTrack: { id: "bgm", name: "LoFi Pulse", url: "https://cdn.example/music.mp3", duration: 11 },
    captionSegments: [{ id: "cap-1", start_time: 10.5, end_time: 12, text: "Hello world" }],
    finishFx: { lutName: "Kodak2383" },
    silenceRegions: [{ start: 3, duration: 0.8 }],
  };

  test("builds valid OpenTimelineIO Timeline.1 with V1/V2 B-roll, checkerboard J/L audio splits, stems, markers, and translation report", () => {
    const res = exportStudioTimelineInterchange({ format: "otio", ...sampleProject });
    expect(res.filename).toBe("founder-podcast-ep-14.otio");

    const otio = buildStudioOtioDocument(sampleProject);
    expect(otio.OTIO_SCHEMA).toBe("Timeline.1");
    expect(otio.global_start_time).toEqual({ OTIO_SCHEMA: "RationalTime.1", value: 0, rate: 24 });

    const trackNames = otio.tracks.children.map(t => t.name);
    expect(trackNames).toContain("V1");
    expect(trackNames).toContain("V2 B-Roll");
    expect(trackNames).toContain("A1 Dialogue");
    expect(trackNames).toContain("A2 Dialogue Split");
    expect(trackNames.some(n => n.includes("Voiceover"))).toBe(true);
    expect(trackNames.some(n => n.includes("SFX"))).toBe(true);
    expect(trackNames.some(n => n.includes("Music"))).toBe(true);

    const v1 = otio.tracks.children.find(t => t.name === "V1");
    expect(v1.children.map(c => c.OTIO_SCHEMA)).toEqual(["Clip.1", "Transition.1", "Clip.1"]);
    expect(v1.children[0].media_reference).toMatchObject({
      OTIO_SCHEMA: "ExternalReference.1",
      target_url: "https://cdn.example/cam_a.mp4",
    });
    // Blob media URL falls back cleanly to MissingReference rather than invalid external link
    expect(v1.children[2].media_reference.OTIO_SCHEMA).toBe("MissingReference.1");
    expect(v1.children[0].markers).toHaveLength(1);

    const v2 = otio.tracks.children.find(t => t.name === "V2 B-Roll");
    expect(v2.children[0].OTIO_SCHEMA).toBe("Gap.1");
    expect(v2.children[0].source_range.duration.value).toBe(48); // 2s * 24fps
    expect(v2.children[1].name).toBe("Chart Cutaway");

    const report = buildInterchangeTranslationReport(sampleProject);
    expect(report.transfersDirectly.length).toBeGreaterThanOrEqual(4);
    expect(report.requiresBakeOrRecreate.some(r => r.includes("title"))).toBe(true);
    expect(report.requiresBakeOrRecreate.some(r => r.includes(".srt or .vtt"))).toBe(true);
    expect(report.requiresBakeOrRecreate.some(r => r.includes("color grade"))).toBe(true);
    expect(report.relinkWarnings.some(w => w.includes("blob:"))).toBe(true);
  });

  test("generates standard CMX 3600 EDL with SMPTE timecode, reel IDs, dissolves, and drop-frame FCM", () => {
    const edlRes = exportStudioTimelineInterchange({ format: "edl", ...sampleProject });
    expect(edlRes.filename).toBe("founder-podcast-ep-14.edl");
    expect(edlRes.content).toContain("TITLE: Founder Podcast Ep 14");
    expect(edlRes.content).toContain("FCM: NON-DROP FRAME");
    expect(edlRes.content).toContain("001  CAM_A    AA/V  C        00:00:10:00 00:00:15:00 00:00:00:00 00:00:05:00");
    expect(edlRes.content).toContain("* FROM CLIP NAME: Host Wide");
    expect(edlRes.content).toContain("* SOURCE FILE: https://cdn.example/cam_a.mp4");
    expect(edlRes.content).toContain("002  CAM_A    V     D    012");

    const dfEdl = buildStudioCmx3600Edl({
      title: "NTSC Show",
      frameRate: 29.97,
      timelineSegments: [{ id: "a", name: "Clip A", startTime: 0, endTime: 10 }],
    });
    expect(dfEdl).toContain("FCM: DROP FRAME");
  });

  test("exports the exact fractional frame rate and uses presentation durations for a retimed sequence", () => {
    const frameRate = 24000 / 1001;
    const otio = buildStudioOtioDocument({
      frameRate: "24000/1001",
      playbackRate: 1.25,
      timelineSegments: [
        { id: "first", startTime: 2, endTime: 4.5 },
        { id: "second", startTime: 10, endTime: 65.56 },
      ],
      overlays: [{ type: "video", name: "Cutaway", startTime: 2.5, duration: 3 }],
      musicTrack: { name: "Music", startTime: 0, duration: 60 },
    });
    const [picture, broll, dialogue, music] = otio.tracks.children;
    expect(otio.global_start_time.rate).toBe(frameRate);
    const pictureFrames = picture.children.map(clip => clip.source_range.duration.value);
    expect(pictureFrames).toEqual([48, Math.round(58.06 / 1.25 * frameRate) - 48]);
    expect(picture.children[0].source_range.start_time.value).toBe(Math.round(2 * frameRate));
    expect(picture.children[0].effects[0].time_scalar).toBe(1.25);
    expect(broll.children[0].source_range.duration.value).toBe(48);
    expect(dialogue.children[0].effects[0].time_scalar).toBe(1.25);
    expect(music.children[0].source_range.duration.value).toBe(pictureFrames[0] + pictureFrames[1]);
    expect(music.children[0].effects).toEqual([]);
    const edl = buildStudioCmx3600Edl({
      frameRate: "24000/1001",
      playbackRate: 1.25,
      timelineSegments: [
        { id: "first", startTime: 2, endTime: 4.5 },
        { id: "second", startTime: 10, endTime: 65.56 },
      ],
    });
    expect(edl).toContain("00:00:46:10");
    expect(edl).toContain("29.970");
  });
});

import { splitCaptionSegmentsForReadability } from "../captionReadability";

describe("splitCaptionSegmentsForReadability", () => {
  test("splits a coarse podcast paragraph into short timed subtitle cues", () => {
    const words = "Molweni my lovely viewers at home welcome back to the show today"
      .split(" ")
      .map((word, index) => ({ word, start: index * 0.5, end: (index + 1) * 0.5 }));

    const cues = splitCaptionSegmentsForReadability([
      { id: "speech-1", start: 0, end: 6, text: words.map(word => word.word).join(" "), words },
    ]);

    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      id: "speech-1-cue-1",
      sourceSegmentId: "speech-1",
      start: 0,
      end: 3.5,
      text: "Molweni my lovely viewers at home welcome",
    });
    expect(cues[1].text).toBe("back to the show today");
    expect(cues.every(cue => cue.text.split(/\s+/).length <= 7)).toBe(true);
  });

  test("uses proportional timings when the provider has no word timestamps", () => {
    const cues = splitCaptionSegmentsForReadability([
      {
        id: "speech-2",
        start: 10,
        end: 18,
        text: "One two three four five six seven eight nine ten eleven twelve",
      },
    ]);

    expect(cues).toHaveLength(3);
    expect(cues[0].start).toBe(10);
    expect(cues[0].end).toBeCloseTo(13.333, 2);
    expect(cues[1].start).toBeCloseTo(13.333, 2);
    expect(cues[2].end).toBe(18);
  });

  test("leaves an already readable cue unchanged", () => {
    const source = { id: "short", start: 1, end: 2.4, text: "Welcome back creators" };
    expect(splitCaptionSegmentsForReadability([source])).toEqual([source]);
  });
});

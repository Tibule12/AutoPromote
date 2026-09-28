import { buildTimedScriptDraft } from "../captionDrafts";

test("spreads a long choir lyric sheet through the selected 3:30 source window", () => {
  const lyrics = Array.from({ length: 70 }, (_, index) => `Choir line ${index + 1} with words`).join("\n");
  const draft = buildTimedScriptDraft(lyrics, { start: 12, duration: 210 });
  expect(draft).toHaveLength(70);
  expect(draft[0].start).toBe(12);
  expect(draft.at(-1).end).toBe(222);
  expect(draft.every((line, index) =>
    line.end > line.start && (index === 0 || line.start >= draft[index - 1].end - 0.001)
  )).toBe(true);
});

test("keeps a short script fragment from covering a whole long clip", () => {
  const [line] = buildTimedScriptDraft("One short lyric", { start: 30, duration: 210 });
  expect(line.start).toBe(30);
  expect(line.end).toBeLessThan(40);
});

test("splits long source lines and refuses a draft too dense to review", () => {
  const draft = buildTimedScriptDraft("one two three four five six seven eight nine ten", {
    duration: 15,
  });
  expect(draft.map(line => line.text)).toEqual([
    "one two three four five six seven eight",
    "nine ten",
  ]);
  expect(() => buildTimedScriptDraft(Array(30).fill("one line").join("\n"), {
    duration: 5,
  })).toThrow(/too many lyric lines/i);
});

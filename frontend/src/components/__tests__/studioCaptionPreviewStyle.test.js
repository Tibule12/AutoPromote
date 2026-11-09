import { execFileSync } from "child_process";
import path from "path";
import {
  captionAssColor, getCaptionPreviewStyles, buildCaptionRenderPreviewChunks,
  getCaptionPreviewOutputClock,
} from "../studioCaptionPreviewStyle";
import { createOutputTimeMap, createTimeRange, secondsToTicks } from "../studioTime";

test.each([.5, 2])("Minimal fade remains 100/150ms of output at %sx speed", rate => {
  const timeMap = createOutputTimeMap(secondsToTicks(12), [{
    programmeRange: createTimeRange("programme", 0, secondsToTicks(12)), rate,
  }]);
  const chunk = { start: 3, end: 5 };
  const sample = time => getCaptionPreviewStyles("minimal", 1, "#fff", {
    chunk, time, outputClock: getCaptionPreviewOutputClock({ chunk, time, timeMap }),
  }).pill.opacity;
  expect(sample(3 + .05 * rate)).toBeCloseTo(.5, 4);
  expect(sample(5 - .075 * rate)).toBeCloseTo(.5, 4);
  expect(sample(3)).toBe(0);
  expect(sample(5)).toBe(0);
});

test("caption clock follows its trimmed repeated occurrence across a speed boundary", () => {
  const timeMap = createOutputTimeMap(secondsToTicks(12), [
    { programmeRange: createTimeRange("programme", 0, secondsToTicks(4)), rate: 2 },
    { programmeRange: createTimeRange("programme", secondsToTicks(4), secondsToTicks(12)), rate: .5 },
  ]);
  const chunk = { start: 11, end: 13 };
  const clock = getCaptionPreviewOutputClock({ chunk, time: 12.025, timeMap,
    sourceStart: 10, sourceEnd: 14, programmeStart: 2 });
  expect(clock).toEqual({ start: 1.5, end: 4, time: 2.05 });
  const clipped = getCaptionPreviewOutputClock({ chunk: { start: 9, end: 15 }, time: 12,
    timeMap, sourceStart: 10, sourceEnd: 14, programmeStart: 2 });
  expect(clipped).toEqual({ start: 1, end: 6, time: 2 });
});

test("preview definitions match all existing Python renderer styles", () => {
  expect(execFileSync("python3", [path.resolve(__dirname, "../../../../scripts/sync-studio-caption-styles.py"), "--check"],
    { encoding: "utf8" })).toContain("21 existing caption styles match");
});

test("ASS BGR colour and transparency are converted to browser colour", () => {
  expect(captionAssColor("&H003DB3FF")).toBe("rgba(255, 179, 61, 1)");
  expect(captionAssColor("&H80000000")).toBe("rgba(0, 0, 0, 0.498)");
});

test("caption metric receipts bind identical browser/worker font bytes and real ASS dimensions", () => {
  const fs = require("fs"), crypto = require("crypto");
  const metrics = require("../studioCaptionFontMetrics.json");
  for (const family of Object.values(metrics)) for (const receipt of Object.values(family)) {
    const data = fs.readFileSync(path.resolve(__dirname, "../motion/fonts", receipt.file));
    expect(data.equals(fs.readFileSync(path.resolve(__dirname, "../../../../python_media_worker/assets/fonts", receipt.file)))).toBe(true);
    expect(crypto.createHash("sha256").update(data).digest("hex")).toBe(receipt.sha256);
    const tables = {};
    for (let n = 0; n < data.readUInt16BE(4); n++) {
      const offset = 12 + n * 16;
      tables[data.toString("ascii", offset, offset + 4)] = data.readUInt32BE(offset + 8);
    }
    expect(data.readUInt16BE(tables.head + 18)).toBe(receipt.unitsPerEm);
    expect(data.readUInt16BE(tables["OS/2"] + 74)).toBe(receipt.winAscent);
    expect(data.readUInt16BE(tables["OS/2"] + 76)).toBe(receipt.winDescent);
    expect(receipt.cssSizePerAssSize).toBe(receipt.unitsPerEm / (receipt.winAscent + receipt.winDescent));
  }
});

test("minimal captions have no moving per-word accent and preserve the exported icon/no-icon colour", () => {
  const withIcon = getCaptionPreviewStyles("minimal", 1, "#123456", { hasIcon: true });
  expect(withIcon.word.color).toBe("rgba(255, 255, 255, 1)");
  expect(withIcon.activeWord.color).toBe(withIcon.word.color);
  const withoutIcon = getCaptionPreviewStyles("minimal", 1, "#123456");
  expect(withoutIcon.word.color).toBe("#123456");
  expect(withoutIcon.activeWord.color).toBe(withoutIcon.word.color);
});

test("Bold Pop does not invent a caption card or purple active-word background", () => {
  const visual = getCaptionPreviewStyles("bold_pop", 1, "#ffb33d");
  expect(visual.pill.background).toBe("transparent");
  expect(visual.pill.fontFamily).toContain("DejaVu Sans");
  expect(visual.pill.textTransform).toBe("none");
  expect(visual.word.background).toBe("transparent");
  expect(visual.activeWord.color).toBe("#ffb33d");
});

test("renderer card and serif styles retain their distinct treatment", () => {
  expect(getCaptionPreviewStyles("story_pop").pill.background).not.toBe("transparent");
  expect(getCaptionPreviewStyles("editorial").pill.fontFamily).toContain("DejaVu Serif");
  expect(getCaptionPreviewStyles("editorial").pill.fontStyle).toBe("italic");
});

test("seven-word cue advances to the last two words on the exported word clock", () => {
  const chunks = buildCaptionRenderPreviewChunks([{ id: "cue", start: 2, end: 9,
    text: "one two three four five six seven", captionIcon: "none" }], "bold_pop");
  expect(chunks.map(c => [c.start, c.end, c.words.join(" ")])).toEqual([
    [2, 7, "one two three four five"], [7, 9, "six seven"],
  ]);
  expect(chunks[1].id).toBe("cue");
  expect(chunks[1].captionIcon).toBe("none");
});

test("Story Pop groups never exceed four words and preserve the source cue", () => {
  const chunks = buildCaptionRenderPreviewChunks([{ id: "cue", start: 0, end: 8,
    text: "You know we travelled through the entire journey" }], "story_pop", 1.3);
  expect(chunks.every(chunk => chunk.words.length <= 4)).toBe(true);
  expect(chunks.flatMap(chunk => chunk.words).join(" ")).toBe("You know we travelled through the entire journey");
  expect(chunks[chunks.length - 1].end).toBe(8);
});

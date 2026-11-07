import { sourceDialoguePreviewEnabled } from "../studioSourceDialoguePolicy";

test("only an explicitly enrolled signed-in identity enables the audition", () => {
  expect(sourceDialoguePreviewEnabled("owner", "true", " owner, other ")).toBe(true);
  for (const args of [
    ["owner", "false", "owner"],
    ["owner", "true", ""],
    [null, "true", "owner"],
    ["not-enrolled", "true", "owner"],
    ["owner", "true", "*"],
    ["owner", "true", "owner,*"],
    ["owner", "true", ["owner"]],
    ["owner", "true", "x".repeat(4097)],
    ["owner", "true", ["owner", ...Array.from({ length: 32 }, (_, i) => `user-${i}`)].join(",")],
  ])
    expect(sourceDialoguePreviewEnabled(...args)).toBe(false);
});

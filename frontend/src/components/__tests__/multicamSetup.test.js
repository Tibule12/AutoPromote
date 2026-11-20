import { normalizeMulticamSetup, buildMulticamDirectorSettings } from "../multicamSetup";
test("both entry paths have the same defaults and invalid legacy settings cannot escape supported controls", () => {
  expect(normalizeMulticamSetup()).toEqual({
    speakerDetection: true,
    reactionShots: true,
    useMasterAudio: true,
    minimumShotLengthSeconds: 3,
    renderTier: "premium",
  });
  expect(
    normalizeMulticamSetup({ minimumShotLength: "8 seconds", outputQuality: "4K" })
  ).toMatchObject({ minimumShotLengthSeconds: 8, renderTier: "studio" });
  expect(
    normalizeMulticamSetup({ minimumShotLengthSeconds: 999, renderTier: "unbounded" })
  ).toMatchObject({ minimumShotLengthSeconds: 3, renderTier: "premium" });
});
test("disabling speaker detection preserves manual camera cuts and all shot lengths reach the worker contract", () => {
  expect(
    buildMulticamDirectorSettings({ speakerDetection: false, minimumShotLengthSeconds: 8 }, 3)
  ).toEqual({ autoSwitch: false, audioBasedAutoSwitch: false, autoSwitchInterval: 8 });
  for (const hold of [2, 3, 5, 8])
    expect(
      buildMulticamDirectorSettings({ minimumShotLengthSeconds: hold }, 2).autoSwitchInterval
    ).toBe(hold);
  expect(buildMulticamDirectorSettings({}, 1).autoSwitch).toBe(false);
});

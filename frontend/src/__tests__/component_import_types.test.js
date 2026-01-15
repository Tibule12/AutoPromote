/* eslint-disable no-console */
describe("component import type checks", () => {
  test("components export as functions or strings", () => {
    const list = [
      "SpotifyTrackSearch",
      "ImageCropper",
      "AudioWaveformTrimmer",
      "EmojiPicker",
      "FilterEffects",
      "HashtagSuggestions",
      "DraftManager",
      "ProgressIndicator",
      "BestTimeToPost",
      "ExplainButton",
      "PreviewEditModal",
      "ConfirmPublishModal",
      "PlatformSettingsOverride",
    ];

    list.forEach(name => {
      // require the module directly to avoid ESM interop surprises
      const mod = require(`../components/${name}`);
      const val = mod && (mod.default || mod);
      // eslint-disable-next-line no-console
      console.log("IMPORT_TYPE", name, typeof val, val && val.$$typeof ? "react_element" : "");
      expect(typeof val === "function" || typeof val === "string").toBeTruthy();
    });
  });
});

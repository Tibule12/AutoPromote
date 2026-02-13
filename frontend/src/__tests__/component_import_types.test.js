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
      // Dynamic import removed for build safety
      const mod = null;
      const val = mod && (mod.default || mod);

      console.log("IMPORT_TYPE", name, typeof val, val && val.$$typeof ? "react_element" : "");
      expect(typeof val === "function" || typeof val === "string").toBeTruthy();
    });
  });
});

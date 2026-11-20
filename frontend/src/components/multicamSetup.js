export const MULTICAM_SHOT_LENGTHS = [2, 3, 5, 8];
export const MULTICAM_RENDER_TREATMENTS = [
  { id: "simple", label: "Simple · clean cuts" },
  { id: "premium", label: "Premium · podcast polish" },
  { id: "studio", label: "Studio · heavy render" },
];

export function normalizeMulticamSetup(settings = {}) {
  const hold = Number.parseFloat(settings.minimumShotLengthSeconds ?? settings.minimumShotLength);
  const legacyTier = { "720p": "simple", "1080p": "premium", "4K": "studio" }[
    settings.outputQuality
  ];
  const tier = settings.renderTier ?? legacyTier;
  return {
    speakerDetection: settings.speakerDetection !== false,
    reactionShots: settings.reactionShots !== false,
    useMasterAudio: settings.useMasterAudio !== false,
    minimumShotLengthSeconds: MULTICAM_SHOT_LENGTHS.includes(hold) ? hold : 3,
    renderTier: MULTICAM_RENDER_TREATMENTS.some(item => item.id === tier) ? tier : "premium",
  };
}

// Both entry routes use these same settings in the existing editor and worker.
export function buildMulticamDirectorSettings(settings, sourceCount) {
  const value = normalizeMulticamSetup(settings);
  return {
    autoSwitch: sourceCount >= 2 && value.speakerDetection,
    audioBasedAutoSwitch: value.speakerDetection,
    autoSwitchInterval: value.minimumShotLengthSeconds,
  };
}

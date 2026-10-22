// Incremental migration boundary: older visual/media v1 documents must keep
// these legacy decisions until they have been reconciled once. Never infer
// deletion of an unmigrated field from its absence in an old document.
export const STUDIO_EDIT_SETTING_FIELDS = [
  "creativeTemplateInstance",
  "captionCoverageMode", "contentProfile", "joinTransition", "joinTransitionDuration",
  "silenceRemoval", "silenceThreshold", "minSilenceDuration", "silencePreview",
  "removeWatermark", "watermarkMode", "brandWatermark", "manualWatermarkRegions",
  "addHook", "hookText", "hookTemplate", "hookIntroSeconds", "hookStartTime", "hookEndTime",
  "hookBlurBackground", "hookDarkOverlay", "hookFreezeFrame", "hookZoomScale",
  "hookTextAnimation", "hookFocusPoint", "bRollCadence", "bRollGenerationJobId", "compoundClips",
  "creatorPreview", "splitExportEnabled", "splitExportHooks", "proxySettings",
];

export const STUDIO_SOURCE_DECISION_FIELDS = [
  "id", "name", "duration", "sourceClipId", "sourceMediaId", "sourceStoragePath",
  "storagePath", "contentHash", "sha256", "angleGroupId", "sharedStart", "sharedEnd",
  "sourceTimeOffset", "isPrimary", "mediaType", "mimeType", "width", "height", "fps",
  "generationRef", "provenanceRef", "generationProvenance",
];
export const STUDIO_ADDITIONAL_LAYER_FIELDS = [
  "textAnimator", "textProgress",
  "vectorShape", "strokeStart", "strokeEnd", "strokeOffset",
  "mask", "chromaKey", "backgroundRemoval", "tracking", "presenterPolish",
  "sourceMediaId", "generationRef", "provenanceRef", "generationProvenance", "parentId", "clipOwnerId",
];
export const STUDIO_LAYER_BINDING_FIELDS = ["titlePreset", "clipId", "mixAudio"];

export const STUDIO_OCCURRENCE_PARAMETER_FIELDS = [
  "name", "duration", "sourceMediaId", "angleGroupId", "sharedStart", "sharedEnd",
  "transitionIn", "transitionOut", "transitionDuration", "audioTrimOffsetStart", "audioTrimOffsetEnd",
];
export const STUDIO_MUSIC_MIX_FIELDS = ["ducking", "duckingStrength", "duckingMode", "startTime"];
export const STUDIO_EXTRACTED_AUDIO_FIELDS = [
  "id", "name", "duration", "enabled", "mode", "volume", "duckingStrength",
  "trimStart", "fadeIn", "fadeOut", "sourceClipId", "sourceStoragePath", "storagePath",
  "contentHash", "sha256",
];

export const cloneStudioDecisionFields = (value, fields) => JSON.parse(JSON.stringify(
  Object.fromEntries(fields.filter(field => value?.[field] !== undefined)
    .map(field => [field, value[field]]))
));

export const buildStudioEditGraph = snapshot => ({
  parameterSchemaVersion: 1,
  settings: cloneStudioDecisionFields(snapshot, STUDIO_EDIT_SETTING_FIELDS),
  media: (snapshot.projectMedia || []).map(source => cloneStudioDecisionFields(source, STUDIO_SOURCE_DECISION_FIELDS)),
  sources: (snapshot.orderedClips || []).map(source => cloneStudioDecisionFields(source, STUDIO_SOURCE_DECISION_FIELDS)),
  musicMix: snapshot.musicTrack ? cloneStudioDecisionFields(snapshot.musicTrack, STUDIO_MUSIC_MIX_FIELDS) : null,
  hookBinding: snapshot.addHook ? { occurrenceId: String(snapshot.timeline?.[snapshot.activeTimelineIndex || 0]?.id || "") } : null,
  angleGroups: JSON.parse(JSON.stringify(snapshot.angleGroups || [])),
  extractedAudio: snapshot.extractedAudio
    ? cloneStudioDecisionFields(snapshot.extractedAudio, STUDIO_EXTRACTED_AUDIO_FIELDS) : null,
});

// Carry access transport only when the complete owned binding still matches.
// Changing/removing a path or hash must not retain pixels from another asset.
export const projectStudioOwnedMedia = (decisions, prior, fields) => {
  const transport = { ...prior };
  const binding = item => [item?.id, item?.sourceStoragePath || item?.storagePath,
    item?.contentHash || item?.sha256];
  if (JSON.stringify(binding(decisions)) !== JSON.stringify(binding(prior))) {
    for (const key of ["url", "src", "previewUrl", "poster", "file", "isLocal"])
      delete transport[key];
  }
  for (const field of fields) delete transport[field];
  return { ...transport, ...JSON.parse(JSON.stringify(decisions)) };
};

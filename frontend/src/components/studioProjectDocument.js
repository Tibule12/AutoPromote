import {
  createOutputTimeMap,
  createTimeRange,
  secondsToTicks,
  ticksToSeconds,
  TICKS_PER_SECOND,
} from "./studioTime";
import { createSemanticAnalysisReference } from "./studioSemanticTimeline";
import { createModelArtifactReference } from "./studioModelArtifactReference";
import { buildSpeedSegmentsFromKeyframes } from "./studioCreatorRecipes";
import { studioLayerEntries } from "./studioLayerOrder";
import { validateSpatialCurve } from "./studioAutomation";
import { validateStudioTextAnimation } from "./studioTextAnimator";
import { validateStudioVectorShape, validateStudioVectorTrim } from "./studioVectorShape";

import {
  STUDIO_EDIT_SETTING_FIELDS, STUDIO_SOURCE_DECISION_FIELDS,
  STUDIO_ADDITIONAL_LAYER_FIELDS, STUDIO_LAYER_BINDING_FIELDS, STUDIO_EXTRACTED_AUDIO_FIELDS,
  STUDIO_OCCURRENCE_PARAMETER_FIELDS, STUDIO_MUSIC_MIX_FIELDS,
  buildStudioEditGraph, projectStudioOwnedMedia, cloneStudioDecisionFields,
} from "./studioEditDecisions";

export const STUDIO_DOCUMENT_VERSION = 1;

// Canonical server JSON sorts keys; object ordering must not count as an edit.
const stableStringify = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
);

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const sourceWindow = (clip, selectedClip) => {
  const main = clip?.id === "main" && selectedClip;
  const start = clip?.startRequest ?? (main ? selectedClip.start : 0);
  const end = clip?.endRequest ?? (main ? selectedClip.end : clip?.duration);
  if (
    !Number.isFinite(Number(start)) ||
    !Number.isFinite(Number(end)) ||
    Number(end) <= Number(start)
  ) {
    fail("INVALID_SOURCE_RANGE", `Clip ${clip?.id || "unknown"} has no valid source range.`);
  }
  return { startTick: secondsToTicks(Number(start)), endTick: secondsToTicks(Number(end)) };
};

const assetReference = clip => {
  const sourceId = String(clip.sourceClipId || clip.id);
  const contentHash = clip.contentHash || clip.sha256 || null;
  if (contentHash && !/^[a-f0-9]{64}$/i.test(contentHash)) {
    fail("INVALID_CONTENT_HASH", `Source ${sourceId} has an invalid content hash.`);
  }
  return {
    assetId: `source:${sourceId}${contentHash ? `:sha256:${contentHash.toLowerCase()}` : ""}`,
    sourceId,
    ...(clip.sourceStoragePath || clip.storagePath
      ? { storagePath: clip.sourceStoragePath || clip.storagePath }
      : {}),
    ...(contentHash ? { contentHash: contentHash.toLowerCase() } : {}),
    identityState: contentHash ? "hash_verified" : "legacy_reference_unverified",
  };
};

const LAYER_PARAMETER_FIELDS = [
  "version", "name", "secondary", "endTime", "assetStoragePath", "assetName",
  "sourceStoragePath", "storagePath", "sourceClipId", "contentHash", "sha256",
  "hqPreviewRevision", "hqPreviewJobId",
  "textAlign", "lineSpacing", "primaryColor", "secondaryColor",
  "extrusionDepth", "bevel", "rotationX", "rotationY", "rotationZ",
  "hold", "intensity", "audioReactiveIntensity", "cameraMotion", "focalLength",
  "lightDirection", "lightColor", "lightIntensity", "shadows", "reflections",
  "bloom", "background",
  "bg", "anchorX", "anchorY", "blendMode", "glow", "layerShadow", "motionBlur",
  "cropX", "cropY", "blur", "sourceDuration", "aspectRatio",
  "isCaption",
  "shadow", "strokeWidth", "strokeColor",
  "frameShape", "frame_shape", "borderRadius", "border_radius", "mediaFit", "media_fit",
  "b_roll_mode", "coverMainVideo", "muteMainAudio", "useOverlayAudio",
  "overlayAudioVolume", "sourceEndBehavior", "audioDucking", "audioDuckingStrength",
  "kenBurns", "ken_burns", "placementMode", "placement_mode",
  "isRainbow", "rainbowOffset", "bRollPlaceholder", "bRollApprovalStatus",
  "sound", "soundVolume", "value", "prefix", "endX", "endY", "endScale",
  "endRotation", "canvasMode", "canvasColor", "design",
  "text",
  "subtext",
  "supportingText",
  "fontFamily",
  "fontWeight",
  "fontSize",
  "color",
  "textColor",
  "backgroundColor",
  "glowColor",
  "material",
  "opacity",
  "x",
  "y",
  "z",
  "width",
  "height",
  "rotation",
  "scale",
  "transform",
  "startTime",
  "duration",
  "sourceStartTime",
  "trimStart",
  "trimEnd",
  "bRollMode",
  "audioMode",
  "volume",
  "fadeIn",
  "fadeOut",
  "soundOffset",
  "layout",
  "animation",
  "entrance",
  "exit",
  "easing",
  "keyframes",
  "poseKeyframes",
  "templateId",
  "template",
  "preset",
  "enabled",
  "layerOrder",
  "quality",
];

const layerParameterFields = version => version === 3
  ? [...LAYER_PARAMETER_FIELDS, ...STUDIO_ADDITIONAL_LAYER_FIELDS, ...STUDIO_LAYER_BINDING_FIELDS]
  : version === 2 ? [...LAYER_PARAMETER_FIELDS, ...STUDIO_ADDITIONAL_LAYER_FIELDS] : LAYER_PARAMETER_FIELDS;

// Access URLs and File/Blob payloads stay in the media store/snapshot. Persist
// the owned reference and hash (when available), never an expiring URL identity.
const cloneParameters = (item, fields) => JSON.parse(JSON.stringify(Object.fromEntries(
  fields.filter(field => item[field] !== undefined).map(field => [field, item[field]])
)));

const AUDIO_CUE_PARAMETER_FIELDS = [
  "enabled", "builtIn", "kind", "tone", "name", "label", "sourceClipId",
  "sourceStoragePath", "storagePath", "contentHash", "sha256", "volume",
  "muted", "fadeIn", "fadeOut", "pan", "audioMode", "rate", "pitchPreserved",
];
const cueParameterFields = collection => collection === "adjustmentLayers"
  ? ["enabled", "name", "label", "preset", "opacity", "finishFx", "effects", "intensity"]
  : AUDIO_CUE_PARAMETER_FIELDS;
const AUDIO_SETTING_FIELDS = [
  "addMusic", "musicSelection", "musicSearchMode", "safeSearch", "musicVolume",
  "musicDucking", "musicDuckingStrength", "muteOriginalAudio", "audioRemix",
  "musicLoop", "musicFadeIn", "musicFadeOut",
  "audioRestoration", "audioAutomationSource",
];
const MUSIC_PARAMETER_FIELDS = [
  "id", "name", "title", "sourceClipId", "sourceStoragePath", "storagePath",
  "contentHash", "sha256", "volume", "fadeIn", "fadeOut", "loop",
  "duration", "trimStart", "sourceStartTime", "enabled",
];

const VISUAL_SETTING_FIELDS = [
  "mainTransform", "finishFx", "mainFrame", "advancedColor", "podcastVisualizer",
  "videoFit", "safeFaceFraming", "faceAnchorPreset", "autoCaptions", "captionStyle",
  "captionPosition", "captionScale", "captionTextOverride", "translateCaptionsToEnglish",
  "smartCrop", "smartCropMode", "reframeAspect", "speakerTrackZoom",
  "speakerStackFraming", "speakerStackSourceIds", "speakerStackOffsets",
  "speakerStackCameraCount", "speakerStackLayout", "speakerStackSyncConfirmed",
  "exportSettings", "stabilization", "enhanceQuality", "beatSnapEnabled",
  "creativeIntent", "creativeEffectsEnabled", "creativePreset", "creativeIntensity", "pacingLevel",
];
const CAMERA_SOURCE_FIELDS = [
  "id", "name", "duration", "sourceClipId", "sourceMediaId", "sourceStoragePath",
  "storagePath", "contentHash", "sha256", "isProgrammeSource", "start", "end",
  "startRequest", "endRequest", "offsetSeconds", "syncConfirmed",
];
const CAPTION_PARAMETER_FIELDS = [
  "text", "reviewRequired", "textReviewed", "textReviewRequired", "speaker", "speakerLabel",
  "language", "languageLabel", "languages", "languageConfidence", "transcriptConfidence",
  "transcriptionReviewReasons", "translatedToEnglish", "captionPlacement", "captionIcon",
  "captionAccent", "captionX", "captionY", "placement",
];
const CAMERA_SLOTS = ["top", "bottom", "third", "fourth"];
const CAMERA_KEY_FIELDS = ["keyframes", "sourceTimeOffsetKeyframes", "source_time_offset_keyframes"];

// Camera animation belongs to linked programme timing. Keeping a second copy
// inside visual settings would restore pre-trim key times during reopening.
const buildStudioVisualGraph = snapshot => {
  const settings = cloneParameters(snapshot, VISUAL_SETTING_FIELDS);
  for (const slot of CAMERA_SLOTS) {
    for (const field of CAMERA_KEY_FIELDS) {
      if (settings.speakerStackFraming?.[slot]) delete settings.speakerStackFraming[slot][field];
    }
  }
  return { parameterSchemaVersion: 1, settings,
    cameraSources: (snapshot.speakerStackSources || []).map(source => cloneParameters(source, CAMERA_SOURCE_FIELDS)),
  };
};

const layerReference = (item, type, index) => ({
  layerId: String(item.id || `${type}-${index + 1}`),
  type,
  legacyType: item.type || null,
  legacyCollection:
    type === "three_d" ? "threeDScenes" : type === "motion" ? "motionScenes" : "overlays",
  ...(Number.isFinite(Number(item.startTime)) && Number.isFinite(Number(item.duration))
    ? {
        programmeRange: {
          space: "programme",
          startTick: secondsToTicks(Number(item.startTime)),
          endTick: secondsToTicks(Number(item.startTime) + Number(item.duration)),
        },
      }
    : {}),
  compositionStage:
    type === "three_d" ? "final_alpha" : type === "motion" ? "worker_motion" : "worker_overlay",
  parameterSchemaVersion: 3,
  parameters: cloneParameters(item, layerParameterFields(3)),
});

export const buildStudioLayersFromSnapshot = snapshot => {
  const layers = [
  ...(snapshot.overlays || []).map((item, index) =>
    layerReference(item, item.type === "text" ? "title" : "b_roll", index)
  ),
  ...(snapshot.motionScenes || []).map((item, index) => layerReference(item, "motion", index)),
  ...(snapshot.threeDScenes || []).map((item, index) => layerReference(item, "three_d", index)),
  ...(snapshot.subjectVfxScenes || []).map(item => ({
    layerId: item.scene.id, type: "subject_vfx", legacyCollection: "subjectVfxScenes",
    compositionStage: "source_subject_vfx", parameters: {
      scene: JSON.parse(JSON.stringify(item.scene)), enabled: item.enabled !== false,
      ...(item.modelArtifactRef ? { modelArtifactRef: createModelArtifactReference(item.modelArtifactRef) } : {}),
      ...(item.trackingArtifactRef ? { trackingArtifactRef: createModelArtifactReference(item.trackingArtifactRef) } : {}),
      ...(item.preview ? { preview: cloneStudioDecisionFields(item.preview, ["jobId", "revision", "reviewed", "receipt"]) } : {}),
      ...(item.pending ? { pending: cloneStudioDecisionFields(item.pending, ["clientRequestId", "revision", "jobId"]) } : {}),
    },
  })),
  ...(snapshot.captionSegments || []).map(captionLayerReference),
  ];
  if (!Array.isArray(snapshot.compositionOrder)) return layers;
  const rank = new Map(studioLayerEntries(snapshot).map((entry, index) => [entry.id, index]));
  return layers.sort((a, b) => (rank.get(a.layerId) ?? rank.size) - (rank.get(b.layerId) ?? rank.size));
};

const LINKED_CUE_COLLECTIONS = ["soundEffects", "voiceovers", "adjustmentLayers"];
const LINKED_KEY_COLLECTIONS = [
  "motionKeyframes",
  "finishKeyframes",
  "reframeKeyframes",
  "reframeModeCuts",
  "speakerFocusCuts",
];

const timedCueReference = (item, index, collection) => {
  const start = Number(item.startTime ?? item.start_time);
  const duration = Number(item.duration);
  return {
    cueId: String(item.id || `${collection}-${index + 1}`),
    type: item.type || null,
    parameterSchemaVersion: 1,
    parameters: cloneParameters(item, cueParameterFields(collection)),
    programmeRange:
      Number.isFinite(start) && Number.isFinite(duration) && start >= 0 && duration > 0
        ? createTimeRange("programme", secondsToTicks(start), secondsToTicks(start + duration))
        : null,
    ...(item.trimStart !== undefined
      ? { trimStartTick: secondsToTicks(Number(item.trimStart || 0)) }
      : {}),
    ...(item.sourceStartTime !== undefined
      ? { sourceStartTick: secondsToTicks(Number(item.sourceStartTime || 0)) }
      : {}),
  };
};

const timedKeyReference = key => {
  const time = Number(key.time);
  const { time: _time, ...parameters } = key;
  return {
    atProgrammeTick: Number.isFinite(time) && time >= 0 ? secondsToTicks(time) : null,
    parameters: JSON.parse(JSON.stringify(parameters)),
  };
};

// The canonical document keeps small timing references for legacy tracks.
// Actual media and source-timed caption payloads remain in the legacy snapshot.
export const buildStudioLinkedTimingFromSnapshot = snapshot => {
  const cues = Object.fromEntries(
    LINKED_CUE_COLLECTIONS.map(collection => [
      collection,
      (snapshot[collection] || []).map((item, index) => timedCueReference(item, index, collection)),
    ])
  );
  const keys = Object.fromEntries(
    LINKED_KEY_COLLECTIONS.map(collection => [
      collection,
      (snapshot[collection] || []).map(timedKeyReference),
    ])
  );
  for (const slot of CAMERA_SLOTS) {
    for (const field of [
      "keyframes",
      "sourceTimeOffsetKeyframes",
      "source_time_offset_keyframes",
    ]) {
      const frames = snapshot.speakerStackFraming?.[slot]?.[field];
      if (Array.isArray(frames))
        keys[`speakerStackFraming.${slot}.${field}`] = frames.map(timedKeyReference);
    }
  }
  for (const [bus, frames] of Object.entries(snapshot.audioKeyframes || {})) {
    if (Array.isArray(frames)) keys[`audioKeyframes.${bus}`] = frames.map(timedKeyReference);
  }
  return { cues, keys };
};

// A small legacy-shaped projection lets the command executor use the same
// ripple rules as the editor without retaining media payloads in the document.
export const projectStudioLinkedTimingToSnapshot = document => {
  const snapshot = {
    overlays: [],
    motionScenes: [],
    threeDScenes: [],
    subjectVfxScenes: [],
    ...(document.compatibility?.layerComposition === "ordered_flat_layers" ? {
      compositionOrder: document.layers.filter(layer => ["motion", "three_d"].includes(layer.type) ||
        (layer.legacyCollection === "overlays" && !layer.parameters.isCaption)).map(layer => layer.layerId),
    } : {}),
    speedKeyframes: (document.programmeSpeedKeys || []).map(key => ({
      ...(key.id !== undefined ? { id: key.id } : {}),
      property: "speed",
      time: ticksToSeconds(key.atProgrammeTick),
      value: key.rate,
      easing: key.easing,
    })),
  };
  for (const layer of document.layers || []) {
    if (layer.type === "caption") continue;
    const collection = layer.legacyCollection;
    if (!["overlays", "motionScenes", "threeDScenes", "subjectVfxScenes"].includes(collection)) continue;
    const item = {
      ...JSON.parse(JSON.stringify(layer.parameters)),
      id: layer.layerId,
      ...(layer.legacyType ? { type: layer.legacyType } : {}),
      ...(layer.programmeRange
        ? {
            startTime: layer.parameters.startTime ?? ticksToSeconds(layer.programmeRange.startTick),
            duration:
              layer.parameters.duration ??
              ticksToSeconds(layer.programmeRange.endTick - layer.programmeRange.startTick),
          }
        : {}),
    };
    snapshot[collection].push(item);
  }
  for (const collection of LINKED_CUE_COLLECTIONS) {
    snapshot[collection] = (document.linkedTiming?.cues?.[collection] || []).map(cue => ({
      ...JSON.parse(JSON.stringify(cue.parameters || {})),
      id: cue.cueId,
      ...(cue.type ? { type: cue.type } : {}),
      ...(cue.programmeRange
        ? {
            startTime: ticksToSeconds(cue.programmeRange.startTick),
            duration: ticksToSeconds(cue.programmeRange.endTick - cue.programmeRange.startTick),
          }
        : {}),
      ...(cue.trimStartTick !== undefined ? { trimStart: ticksToSeconds(cue.trimStartTick) } : {}),
      ...(cue.sourceStartTick !== undefined
        ? { sourceStartTime: ticksToSeconds(cue.sourceStartTick) }
        : {}),
    }));
  }
  for (const [track, keys] of Object.entries(document.linkedTiming?.keys || {})) {
    const projected = keys.map(key => ({
      ...JSON.parse(JSON.stringify(key.parameters)),
      time: key.atProgrammeTick === null ? NaN : ticksToSeconds(key.atProgrammeTick),
    }));
    if (track.startsWith("speakerStackFraming.")) {
      const [, slot, field] = track.split(".");
      snapshot.speakerStackFraming ||= {};
      snapshot.speakerStackFraming[slot] ||= {};
      snapshot.speakerStackFraming[slot][field] = projected;
    } else if (track.startsWith("audioKeyframes.")) {
      snapshot.audioKeyframes ||= {};
      snapshot.audioKeyframes[track.slice("audioKeyframes.".length)] = projected;
    } else {
      snapshot[track] = projected;
    }
  }
  return snapshot;
};

// Shared editable projection for preview/export adapters. The caller supplies
// transport only (URLs/files); all migrated creative decisions come from the
// canonical document. Older v1 documents still use their intact saved snapshot.
export const projectStudioEditableStateToSnapshot = (document, transportSnapshot = {}) => {
  validateStudioProjectDocument(document);
  if (document.compatibility?.editableStateVersion !== 1) return { ...transportSnapshot };
  const projected = projectStudioLinkedTimingToSnapshot(document);
  const result = { ...transportSnapshot };
  delete result.compositionOrder;
  if (projected.compositionOrder) result.compositionOrder = projected.compositionOrder;
  result.analysisRefs = JSON.parse(JSON.stringify(document.analysisRefs));
  if (document.compatibility?.editStateVersion === 1) {
    for (const field of STUDIO_EDIT_SETTING_FIELDS) delete result[field];
    Object.assign(result, JSON.parse(JSON.stringify(document.editGraph.settings)));
    for (const [collection, graphKey] of [["projectMedia", "media"], ["orderedClips", "sources"]]) {
      const prior = new Map((transportSnapshot[collection] || []).map(item => [String(item.id), item]));
      result[collection] = document.editGraph[graphKey].map(item =>
        projectStudioOwnedMedia(item, prior.get(String(item.id)), STUDIO_SOURCE_DECISION_FIELDS));
    }
    if (document.editGraph.hookBinding) {
      const index = document.clipOccurrences.findIndex(item => item.occurrenceId === document.editGraph.hookBinding.occurrenceId);
      if (index >= 0) result.activeTimelineIndex = index;
    }
    result.angleGroups = JSON.parse(JSON.stringify(document.editGraph.angleGroups));
    result.extractedAudio = document.editGraph.extractedAudio === null ? null
      : projectStudioOwnedMedia(document.editGraph.extractedAudio, transportSnapshot.extractedAudio, STUDIO_EXTRACTED_AUDIO_FIELDS);
  }
  if (document.compatibility?.visualStateVersion === 1) {
    for (const field of VISUAL_SETTING_FIELDS) delete result[field];
    Object.assign(result, JSON.parse(JSON.stringify(document.visualGraph.settings)));
    result.captionSegments = document.layers.filter(layer => layer.type === "caption").map(layer => ({
      ...JSON.parse(JSON.stringify(layer.parameters)), id: layer.layerId,
      sourceClipId: layer.sourceId,
      ...(layer.sourceRange ? {
        start: ticksToSeconds(layer.sourceRange.startTick), end: ticksToSeconds(layer.sourceRange.endTick),
        duration: ticksToSeconds(layer.sourceRange.endTick - layer.sourceRange.startTick),
      } : {}),
    }));
    const prior = new Map((transportSnapshot.speakerStackSources || []).map(source => [String(source.id), source]));
    result.speakerStackSources = document.visualGraph.cameraSources.map(source => {
      const transport = { ...prior.get(String(source.id)) };
      const oldPath = transport.sourceStoragePath || transport.storagePath;
      const oldHash = transport.contentHash || transport.sha256;
      for (const field of CAMERA_SOURCE_FIELDS) delete transport[field];
      if ((source.sourceStoragePath || source.storagePath) !== oldPath ||
        (source.contentHash || source.sha256) !== oldHash) {
        for (const field of ["url", "src", "previewUrl", "file"]) delete transport[field];
      }
      return { ...transport, ...JSON.parse(JSON.stringify(source)) };
    });
  }
  result.timeline = projectDocumentToLegacyTimeline(document, transportSnapshot.timeline || []);
  result.speedKeyframes = projected.speedKeyframes;
  result.previewSpeed = document.fallbackSpeed;
  for (const track of Object.keys(document.linkedTiming.keys)) {
    const base = track.split(".")[0];
    if (!track.includes(".")) result[base] = projected[base];
    else {
      const [, slot, field] = track.split(".");
      result[base] = { ...result[base] };
      if (base === "audioKeyframes") result[base][slot] = projected[base][slot];
      else result[base][slot] = { ...result[base][slot], [field]: projected[base][slot][field] };
    }
  }
  for (const collection of ["overlays", "motionScenes", "threeDScenes", "subjectVfxScenes",
    ...LINKED_CUE_COLLECTIONS]) {
    const prior = new Map((transportSnapshot[collection] || []).map(item => [
      String(item.id || item.scene?.id), item,
    ]));
    result[collection] = projected[collection].map(item => {
      const old = prior.get(String(item.id));
      if (collection === "subjectVfxScenes") {
        // Old graph versions did not own job/review state. Preserve that legacy
        // evidence until the explicit edit migration boundary is present.
        if (document.compatibility?.editStateVersion !== 1) return { ...old, ...item };
        const restored = { ...old, ...item };
        for (const field of ["preview", "pending"]) {
          if (!item[field]) delete restored[field];
          else restored[field] = { ...JSON.parse(JSON.stringify(item[field])),
            ...(item[field].jobId === old?.[field]?.jobId && item[field].revision === old?.[field]?.revision && old?.[field]?.url
              ? { url: old[field].url } : {}) };
        }
        return restored;
      }
      const fields = LINKED_CUE_COLLECTIONS.includes(collection)
        ? cueParameterFields(collection) : layerParameterFields(document.layers.find(layer => layer.layerId === item.id)?.parameterSchemaVersion);
      // Delete covered legacy decisions first: removing a canonical field must
      // not resurrect a stale value from a prior render/save snapshot.
      const transport = { ...old };
      for (const key of [...fields, "startTime", "duration", "trimStart", "sourceStartTime"])
        delete transport[key];
      const path = item.assetStoragePath || item.sourceStoragePath || item.storagePath;
      const oldPath = old?.assetStoragePath || old?.sourceStoragePath || old?.storagePath;
      const hash = item.contentHash || item.sha256;
      const oldHash = old?.contentHash || old?.sha256;
      if ((path && path !== oldPath) || (hash && hash !== oldHash)) {
        for (const key of ["src", "url", "previewUrl", "assetUrl", "file", "isLocal"]) delete transport[key];
      }
      if (item.hqPreviewJobId !== old?.hqPreviewJobId ||
        item.hqPreviewRevision !== old?.hqPreviewRevision) delete transport.hqPreviewUrl;
      return { ...transport, ...item };
    });
  }
  if (document.audioGraph?.parameterSchemaVersion === 1) {
    for (const field of AUDIO_SETTING_FIELDS) delete result[field];
    Object.assign(result, JSON.parse(JSON.stringify(document.audioGraph.settings)));
    result.trackStates = Object.fromEntries(document.audioGraph.routes.map(({ trackId, state }) =>
      [trackId, typeof state === "object" && state !== null ? JSON.parse(JSON.stringify(state)) : state]));
    const music = document.audioGraph.music;
    const old = transportSnapshot.musicTrack;
    result.musicTrack = music === null ? null : {
      ...old, ...music,
    };
    if (music !== null) {
      for (const field of MUSIC_PARAMETER_FIELDS) {
        if (!(field in music)) delete result.musicTrack[field];
      }
      if (music.id !== old?.id ||
        (music.storagePath || music.sourceStoragePath) !== (old?.storagePath || old?.sourceStoragePath) ||
        (music.contentHash || music.sha256) !== (old?.contentHash || old?.sha256)) {
        delete result.musicTrack.url;
        delete result.musicTrack.file;
      }
    }
  }
  if (document.compatibility?.editStateVersion === 1 && result.musicTrack) {
    for (const field of STUDIO_MUSIC_MIX_FIELDS) delete result.musicTrack[field];
    Object.assign(result.musicTrack, JSON.parse(JSON.stringify(document.editGraph.musicMix || {})));
  }
  return result;
};

const captionLayerReference = (segment, index) => {
  const start = Number(segment.start ?? segment.start_time ?? segment.startTime);
  const end = Number(segment.end ?? segment.end_time ?? segment.endTime);
  const sourceRange =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? { space: "source", startTick: secondsToTicks(start), endTick: secondsToTicks(end) }
      : null;
  return {
    layerId: String(segment.id || `caption-${index + 1}`),
    type: "caption",
    legacyCollection: "captionSegments",
    compositionStage: "worker_caption",
    ...(sourceRange ? { sourceRange } : {}),
    sourceId: segment.sourceClipId || segment.source_clip_id || null,
    parameterSchemaVersion: 1,
    parameters: {
      ...cloneParameters(segment, CAPTION_PARAMETER_FIELDS),
      text: String(segment.text || ""),
      reviewRequired: !!(segment.reviewRequired ?? segment.review_required),
      textReviewed: !!(segment.textReviewed ?? segment.text_reviewed),
      speaker: segment.speaker || segment.speaker_id || null,
      placement: segment.captionPlacement || segment.caption_placement || null,
      ...(segment.captionPlacement !== undefined || segment.caption_placement !== undefined
        ? { captionPlacement: segment.captionPlacement ?? segment.caption_placement } : {}),
      ...(segment.textReviewRequired !== undefined || segment.text_review_required !== undefined
        ? { textReviewRequired: !!(segment.textReviewRequired ?? segment.text_review_required) } : {}),
    },
  };
};

const sameOccurrenceProjection = (left, right) =>
  left.length === right.length &&
  left.every((item, index) => {
    const other = right[index];
    return (
      item.occurrenceId === other.occurrenceId &&
      item.assetId === other.assetId &&
      item.sourceRange.startTick === other.sourceRange.startTick &&
      item.sourceRange.endTick === other.sourceRange.endTick &&
      item.programmeRange.startTick === other.programmeRange.startTick &&
      item.programmeRange.endTick === other.programmeRange.endTick
    );
  });

export const buildStudioOutputTimeMap = ({
  durationTick,
  programmeSpeedKeys = [],
  fallbackSpeed = 1,
}) => {
  if (!durationTick) return [];
  const segments = buildSpeedSegmentsFromKeyframes({
    keyframes: programmeSpeedKeys.map(key => ({
      property: "speed",
      time: ticksToSeconds(key.atProgrammeTick),
      value: key.rate,
      easing: key.easing || "linear",
    })),
    duration: ticksToSeconds(durationTick),
    fallback: fallbackSpeed,
  });
  return createOutputTimeMap(
    durationTick,
    segments.map(segment => ({
      programmeRange: createTimeRange(
        "programme",
        secondsToTicks(segment.startTime),
        secondsToTicks(segment.endTime)
      ),
      rate: segment.rate,
    }))
  );
};

export const adaptStudioSnapshotToDocument = ({ snapshot, projectId, previousDocument = null }) => {
  if (!snapshot || !Array.isArray(snapshot.timeline))
    fail("INVALID_SNAPSHOT", "A Studio timeline is required.");
  if (previousDocument?.projectId !== projectId) previousDocument = null;
  const selectedClip =
    (snapshot.orderedClips || []).find(clip => clip.id === snapshot.selectedClipId) ||
    (snapshot.orderedClips || [])[0] ||
    null;
  const assets = new Map();
  let programmeTick = 0;
  const clipOccurrences = snapshot.timeline.map(clip => {
    const sourceRange = sourceWindow(clip, selectedClip);
    const durationTick = sourceRange.endTick - sourceRange.startTick;
    const asset = assetReference(clip);
    const prior = assets.get(asset.assetId);
    if (
      prior &&
      prior.contentHash &&
      asset.contentHash &&
      prior.contentHash !== asset.contentHash
    ) {
      fail("ASSET_ID_COLLISION", `Source ${asset.sourceId} has conflicting content hashes.`);
    }
    assets.set(asset.assetId, { ...prior, ...asset });
    const occurrence = {
      occurrenceId: String(clip.id),
      assetId: asset.assetId,
      sourceRange: { space: "source", ...sourceRange },
      programmeRange: {
        space: "programme",
        startTick: programmeTick,
        endTick: programmeTick + durationTick,
      },
      timeMapId: `map:${clip.id}`,
      parameterSchemaVersion: 1,
      parameters: cloneParameters(clip, STUDIO_OCCURRENCE_PARAMETER_FIELDS),
      playback: { direction: "forward", freeze: false, rate: { numerator: 1, denominator: 1 } },
    };
    // Older native projects stored full-source duration in these parameters.
    // Hydration can supply occurrence duration instead. Preserve the existing
    // value when the owned source and authored range did not change; merely
    // opening the same project must not invalidate its completed export.
    const previousOccurrence = previousDocument?.clipOccurrences?.find(item=>item.occurrenceId===occurrence.occurrenceId);
    const previousAsset = previousDocument?.assets?.find(item=>item.assetId===asset.assetId);
    if (previousOccurrence?.assetId === asset.assetId &&
        previousAsset?.contentHash === asset.contentHash && previousAsset?.storagePath === asset.storagePath &&
        stableStringify(previousOccurrence.sourceRange) === stableStringify(occurrence.sourceRange) &&
        Number.isFinite(previousOccurrence.parameters?.duration)) {
      occurrence.parameters.duration = previousOccurrence.parameters.duration;
    }
    programmeTick += durationTick;
    return occurrence;
  });
  const layers = buildStudioLayersFromSnapshot(snapshot);
  const linkedTiming = buildStudioLinkedTimingFromSnapshot(snapshot);
  const visualGraph = buildStudioVisualGraph(snapshot);
  const editGraph = buildStudioEditGraph(snapshot);
  const output = {
    aspectRatio: snapshot.reframeAspect || "9:16",
    requestedResolution: snapshot.exportSettings?.resolution || "1080p",
    frameRate:
      snapshot.exportSettings?.fps === "source"
        ? { mode: "source" }
        : { numerator: Number(snapshot.exportSettings?.fps || 30), denominator: 1 },
    codec: snapshot.exportSettings?.codec || "h264",
    audioCodec: snapshot.exportSettings?.audioCodec || "aac",
    audioSampleRate: null,
    audioSampleRatePolicy: "worker_selected",
  };
  const audioGraph = {
    legacySnapshotRef: "audioRemix",
    parameterSchemaVersion: 1,
    settings: cloneParameters(snapshot, AUDIO_SETTING_FIELDS),
    music: snapshot.musicTrack ? cloneParameters(snapshot.musicTrack, MUSIC_PARAMETER_FIELDS) : null,
    routes: Object.entries(snapshot.trackStates || {}).map(([trackId, state]) => ({
      trackId,
      state: typeof state === "object" && state !== null ? JSON.parse(JSON.stringify(state)) : state,
    })),
    routing: {
      muteOriginalAudio: !!snapshot.muteOriginalAudio,
      musicDucking: !!snapshot.musicDucking,
      musicDuckingStrength: Number(snapshot.musicDuckingStrength ?? 0),
      musicTrackId: snapshot.musicTrack?.id || null,
    },
  };
  const analysisRefs = (snapshot.analysisRefs || previousDocument?.analysisRefs || []).map(ref =>
    ref.kind === "model_capability" ? createModelArtifactReference(ref) : createSemanticAnalysisReference(ref)
  );
  const projectIntelligenceRefs = snapshot.projectIntelligenceRefs ||
    previousDocument?.projectIntelligenceRefs || [];
  const styleRef = snapshot.styleRef || previousDocument?.styleRef || null;
  const programmeSpeedKeys = (snapshot.speedKeyframes || [])
    .map(key => ({
      ...key,
      atProgrammeTick: secondsToTicks(Number(key.time || 0)),
      rate: Number(key.value ?? key.rate ?? 1),
    }))
    .filter(key => key.property === "speed" && Number.isFinite(key.rate))
    .map(({ id, atProgrammeTick, rate, easing }) => ({
      ...(id !== undefined ? { id: String(id) } : {}),
      atProgrammeTick,
      rate,
      easing: easing || "linear",
    }));
  const fallbackSpeed = Number(snapshot.previewSpeed ?? 1);
  if (!Number.isFinite(fallbackSpeed) || fallbackSpeed <= 0) {
    fail("INVALID_SPEED", "Preview speed must be a positive finite number.");
  }
  const isSame =
    !!previousDocument &&
    sameOccurrenceProjection(previousDocument.clipOccurrences || [], clipOccurrences) &&
    stableStringify((previousDocument.clipOccurrences || []).map(item => item.parameters)) ===
      stableStringify(clipOccurrences.map(item => item.parameters)) &&
    stableStringify(
      previousDocument.assets.map(
        ({ assetId, sourceId, storagePath, contentHash, identityState }) => ({
          assetId,
          sourceId,
          storagePath,
          contentHash,
          identityState,
        })
      )
    ) ===
      stableStringify(
        [...assets.values()].map(
          ({ assetId, sourceId, storagePath, contentHash, identityState }) => ({
            assetId,
            sourceId,
            storagePath,
            contentHash,
            identityState,
          })
        )
      ) &&
    stableStringify(previousDocument.layers) === stableStringify(layers) &&
    stableStringify(previousDocument.linkedTiming) === stableStringify(linkedTiming) &&
    stableStringify(previousDocument.output) === stableStringify(output) &&
    stableStringify(previousDocument.audioGraph) === stableStringify(audioGraph) &&
    stableStringify(previousDocument.visualGraph) === stableStringify(visualGraph) &&
    stableStringify(previousDocument.editGraph) === stableStringify(editGraph) &&
    stableStringify(previousDocument.analysisRefs) === stableStringify(analysisRefs) &&
    stableStringify(previousDocument.projectIntelligenceRefs || []) ===
      stableStringify(projectIntelligenceRefs) &&
    stableStringify(previousDocument.programmeSpeedKeys) === stableStringify(programmeSpeedKeys) &&
    previousDocument.fallbackSpeed === fallbackSpeed &&
    previousDocument.compatibility?.layerComposition === (Array.isArray(snapshot.compositionOrder) ? "ordered_flat_layers" : "separate_worker_stages") &&
    stableStringify(previousDocument.styleRef) === stableStringify(styleRef);
  const document = {
    schemaVersion: STUDIO_DOCUMENT_VERSION,
    projectId: String(projectId),
    revision: isSame
      ? previousDocument.revision
      : (previousDocument?.revision || 0) + (previousDocument ? 1 : 0),
    clock: { ticksPerSecond: TICKS_PER_SECOND, interval: "half_open" },
    output,
    assets: [...assets.values()],
    clipOccurrences,
    timeMaps: clipOccurrences.map(occurrence => ({
      timeMapId: occurrence.timeMapId,
      occurrenceId: occurrence.occurrenceId,
      segments: [
        {
          sourceRange: occurrence.sourceRange,
          clipLocalRange: {
            space: "clip_local",
            startTick: 0,
            endTick: occurrence.sourceRange.endTick - occurrence.sourceRange.startTick,
          },
          programmeRange: occurrence.programmeRange,
          rate: { numerator: 1, denominator: 1 },
          direction: "forward",
          freeze: false,
        },
      ],
    })),
    layers,
    linkedTiming,
    audioGraph,
    visualGraph,
    editGraph,
    constraints: {
      locks: (previousDocument?.constraints?.locks || []).filter(lock =>
        clipOccurrences.some(
          item =>
            item.occurrenceId === lock.occurrenceId &&
            lock.sourceRange.startTick >= item.sourceRange.startTick &&
            lock.sourceRange.endTick <= item.sourceRange.endTick
        )
      ),
    },
    styleRef,
    analysisRefs,
    projectIntelligenceRefs,
    programmeSpeedKeys,
    fallbackSpeed,
    outputTimeMap: buildStudioOutputTimeMap({
      durationTick: programmeTick,
      programmeSpeedKeys,
      fallbackSpeed,
    }),
    journal: isSame ? previousDocument.journal : previousDocument?.journal || [],
    idempotency: isSame ? previousDocument.idempotency : previousDocument?.idempotency || {},
    directorReviewJournal: previousDocument?.directorReviewJournal || [],
    compatibility: {
      legacySnapshotVersion: 1,
      projection: "clip_occurrences_canonical_other_fields_legacy",
      editableStateVersion: 1,
      visualStateVersion: 1,
      editStateVersion: 1,
      layerComposition: Array.isArray(snapshot.compositionOrder) ? "ordered_flat_layers" : "separate_worker_stages",
    },
  };
  validateStudioProjectDocument(document);
  return document;
};

export const reconcileStudioDocument = ({ snapshot, projectId, storedDocument = null }) => {
  if (storedDocument) validateStudioProjectDocument(storedDocument);
  return adaptStudioSnapshotToDocument({ snapshot, projectId, previousDocument: storedDocument });
};

// The existing React history owns UI Undo/Redo during migration. Restoring an
// older snapshot must still advance the canonical revision, so a command based
// on a pre-undo state cannot be accepted as a fresh write.
export const rebaseStudioHistoryRestore = ({ currentDocument, restoredSnapshot, projectId }) => {
  const restored = reconcileStudioDocument({
    snapshot: restoredSnapshot,
    projectId,
    storedDocument: restoredSnapshot.studioDocument || null,
  });
  if (!currentDocument || currentDocument.projectId !== projectId) return restored;
  validateStudioProjectDocument(currentDocument);
  const newRevision = currentDocument.revision + 1;
  const rebased = {
    ...restored,
    revision: newRevision,
    journal: [
      ...currentDocument.journal,
      {
        journalId: `revision:${newRevision}`,
        baseRevision: currentDocument.revision,
        newRevision,
        actor: { type: "human", id: "viral-studio-history" },
        operations: [{ type: "history_restore" }],
        affectedNodes: restored.clipOccurrences.map(item => item.occurrenceId),
        inverse: null,
      },
    ],
    idempotency: currentDocument.idempotency,
    directorReviewJournal: currentDocument.directorReviewJournal || [],
    projectIntelligenceRefs: currentDocument.projectIntelligenceRefs || [],
  };
  validateStudioProjectDocument(rebased);
  return rebased;
};

// Restore checkpoint content onto the newest matching revision and audit history.
export const restoreStudioProjectCheckpoint = ({
  projectId, restoredSnapshot, currentDocument, savedDocument,
}) => {
  const latest = [currentDocument, savedDocument, restoredSnapshot.studioDocument]
    .filter(document => document?.projectId === projectId)
    .sort((left, right) => right.revision - left.revision)[0] || null;
  return {
    ...restoredSnapshot,
    studioDocument: rebaseStudioHistoryRestore({
      currentDocument: latest, restoredSnapshot, projectId,
    }),
  };
};

export const projectDocumentToLegacyTimeline = (document, priorTimeline) => {
  validateStudioProjectDocument(document);
  const prior = new Map((priorTimeline || []).map(clip => [String(clip.id), clip]));
  return document.clipOccurrences.map(occurrence => {
    const source = [occurrence.occurrenceId, ...(occurrence.legacyParentIds || [])]
      .map(id => prior.get(id))
      .find(Boolean);
    if (!source)
      fail(
        "MISSING_LEGACY_CLIP",
        `Cannot project ${occurrence.occurrenceId} without source media.`
      );
    const asset = document.assets.find(item => item.assetId === occurrence.assetId);
    const projected = {
      ...source,
      id: occurrence.occurrenceId,
      sourceClipId: asset?.sourceId || source.sourceClipId || source.id,
      startRequest: ticksToSeconds(occurrence.sourceRange.startTick),
      endRequest: ticksToSeconds(occurrence.sourceRange.endTick),
    };
    if (occurrence.parameterSchemaVersion === 1) {
      for (const field of STUDIO_OCCURRENCE_PARAMETER_FIELDS) delete projected[field];
      Object.assign(projected, JSON.parse(JSON.stringify(occurrence.parameters)));
    }
    const priorPath = source.sourceStoragePath || source.storagePath;
    const priorHash = source.contentHash || source.sha256;
    if (asset.sourceId !== String(source.sourceClipId || source.id) ||
      (asset.storagePath && asset.storagePath !== priorPath) ||
      (asset.contentHash && asset.contentHash !== priorHash)) {
      for (const key of ["url", "src", "previewUrl", "file", "isLocal"]) delete projected[key];
    }
    if (asset.storagePath) {
      if (source.sourceStoragePath || !source.storagePath) projected.sourceStoragePath = asset.storagePath;
      if (source.storagePath) projected.storagePath = asset.storagePath;
    }
    if (asset.contentHash) {
      projected.contentHash = asset.contentHash;
      if (source.sha256) projected.sha256 = asset.contentHash;
    }
    return projected;
  });
};

export const validateStudioProjectDocument = document => {
  if (!document || document.schemaVersion !== STUDIO_DOCUMENT_VERSION)
    fail("UNSUPPORTED_DOCUMENT_VERSION", "Unsupported Studio document version.");
  if (!document.projectId || !Number.isSafeInteger(document.revision) || document.revision < 0)
    fail("INVALID_DOCUMENT", "Invalid project identity or revision.");
  if (
    document.clock?.ticksPerSecond !== TICKS_PER_SECOND ||
    document.clock?.interval !== "half_open"
  )
    fail("INVALID_CLOCK", "Invalid Studio clock.");
  if (!Array.isArray(document.assets) || !Array.isArray(document.clipOccurrences))
    fail("INVALID_DOCUMENT", "Missing assets or clip occurrences.");
  (document.visualGraph?.settings?.motionKeyframes || []).forEach(validateSpatialCurve);
  const vectorMotionKeys = [...(document.visualGraph?.settings?.motionKeyframes || []),
    ...(document.linkedTiming?.keys?.motionKeyframes || []).map(key => ({ ...key.parameters,
      time: key.atProgrammeTick === null ? NaN : ticksToSeconds(key.atProgrammeTick) }))];
  (document.layers || []).forEach(layer => {
    validateStudioTextAnimation({ ...layer.parameters, type: layer.legacyType }, vectorMotionKeys.filter(key => key.targetId === layer.layerId));
    if (layer.parameters?.vectorShape !== undefined) validateStudioVectorShape(layer.parameters.vectorShape);
    validateStudioVectorTrim(layer.parameters || {}, vectorMotionKeys
      .filter(key => key.targetId === layer.layerId));
  });
  const validParameters = (parameters, fields) => parameters &&
    typeof parameters === "object" && !Array.isArray(parameters) &&
    Object.keys(parameters).every(key => fields.includes(key));
  if (document.compatibility?.editStateVersion !== undefined) {
    const graph = document.editGraph;
    if (document.compatibility.editStateVersion !== 1 || graph?.parameterSchemaVersion !== 1 ||
      !validParameters(graph.settings, STUDIO_EDIT_SETTING_FIELDS) ||
      (graph.musicMix !== null && !validParameters(graph.musicMix, STUDIO_MUSIC_MIX_FIELDS)) ||
      (graph.hookBinding !== null && (!validParameters(graph.hookBinding, ["occurrenceId"]) ||
        !document.clipOccurrences.some(item => item.occurrenceId === graph.hookBinding.occurrenceId))) ||
      document.clipOccurrences.some(item => item.parameterSchemaVersion !== 1 ||
        !validParameters(item.parameters, STUDIO_OCCURRENCE_PARAMETER_FIELDS)) ||
      ![graph.media, graph.sources].every(items => Array.isArray(items) &&
        items.every(item => validParameters(item, STUDIO_SOURCE_DECISION_FIELDS))) ||
      !Array.isArray(graph.angleGroups) || graph.angleGroups.some(group =>
        !validParameters(group, ["id", "name", "angles", "sharedStart", "sharedEnd"]) ||
        !Array.isArray(group.angles) || group.angles.some(angle => !validParameters(angle, ["assetId", "offsetSeconds"]))) ||
      (graph.extractedAudio !== null && !validParameters(graph.extractedAudio, STUDIO_EXTRACTED_AUDIO_FIELDS)))
      fail("INVALID_EDIT_STATE", "Unsupported or malformed remaining edit decisions.");
  }
  if (document.compatibility?.visualStateVersion !== undefined) {
    if (document.compatibility.visualStateVersion !== 1 ||
      document.visualGraph?.parameterSchemaVersion !== 1 ||
      !validParameters(document.visualGraph.settings, VISUAL_SETTING_FIELDS) ||
      !Array.isArray(document.visualGraph.cameraSources) ||
      document.visualGraph.cameraSources.some(source => !validParameters(source, CAMERA_SOURCE_FIELDS)) ||
      !Array.isArray(document.layers) || document.layers.some(layer => layer.type === "caption" &&
        (layer.parameterSchemaVersion !== 1 || !validParameters(layer.parameters, CAPTION_PARAMETER_FIELDS)))) {
      fail("INVALID_VISUAL_STATE", "Unsupported or malformed canonical visual state.");
    }
  }
  if (document.compatibility?.editableStateVersion !== undefined) {
    if (document.compatibility.editableStateVersion !== 1 ||
      !Array.isArray(document.layers) ||
      document.layers.some(layer => layer.type !== "caption" && layer.type !== "subject_vfx" &&
        (![1, 2, 3].includes(layer.parameterSchemaVersion) || !validParameters(layer.parameters, layerParameterFields(layer.parameterSchemaVersion)))) ||
      document.audioGraph?.parameterSchemaVersion !== 1 ||
      !validParameters(document.audioGraph.settings, AUDIO_SETTING_FIELDS) ||
      (document.audioGraph.music !== null &&
        !validParameters(document.audioGraph.music, MUSIC_PARAMETER_FIELDS))) {
      fail("INVALID_EDITABLE_STATE", "Unsupported or malformed editable parameter projection.");
    }
    for (const collection of document.linkedTiming === undefined ? [] : LINKED_CUE_COLLECTIONS) {
      if (!Array.isArray(document.linkedTiming?.cues?.[collection]) ||
        document.linkedTiming.cues[collection].some(cue =>
          cue.parameterSchemaVersion !== 1 || !validParameters(cue.parameters, cueParameterFields(collection))))
        fail("INVALID_EDITABLE_STATE", "Unsupported or malformed editable cue parameters.");
    }
  }
  if (document.linkedTiming !== undefined) {
    if (
      !document.linkedTiming ||
      typeof document.linkedTiming.cues !== "object" ||
      typeof document.linkedTiming.keys !== "object" ||
      Array.isArray(document.linkedTiming.cues) ||
      Array.isArray(document.linkedTiming.keys)
    ) {
      fail("INVALID_LINKED_TIMING", "Linked timeline timing must name cue and key tracks.");
    }
    Object.values(document.linkedTiming.cues).forEach(cues => {
      if (!Array.isArray(cues)) fail("INVALID_LINKED_TIMING", "Cue track must be an array.");
      cues.forEach(cue => {
        const range = cue.programmeRange;
        if (
          !cue.cueId ||
          (range !== null &&
            (range?.space !== "programme" ||
              !Number.isSafeInteger(range.startTick) ||
              !Number.isSafeInteger(range.endTick) ||
              range.startTick < 0 ||
              range.endTick <= range.startTick)) ||
          (cue.trimStartTick !== undefined &&
            (!Number.isSafeInteger(cue.trimStartTick) || cue.trimStartTick < 0)) ||
          (cue.sourceStartTick !== undefined &&
            (!Number.isSafeInteger(cue.sourceStartTick) || cue.sourceStartTick < 0))
        ) {
          fail("INVALID_LINKED_TIMING", "Cue timing must use half-open programme ticks.");
        }
      });
    });
    Object.values(document.linkedTiming.keys).forEach(keys => {
      if (!Array.isArray(keys)) fail("INVALID_LINKED_TIMING", "Key track must be an array.");
      keys.forEach(key => {
        if (
          (key.atProgrammeTick !== null &&
            (!Number.isSafeInteger(key.atProgrammeTick) || key.atProgrammeTick < 0)) ||
          !key.parameters ||
          typeof key.parameters !== "object" ||
          Array.isArray(key.parameters)
        ) {
          fail("INVALID_LINKED_TIMING", "Key timing must use programme ticks.");
        }
      });
    });
  }
  document.assets.forEach(asset => {
    if (
      !asset.assetId ||
      !asset.sourceId ||
      (asset.identityState === "hash_verified" &&
        !/^[a-f0-9]{64}$/i.test(asset.contentHash || "")) ||
      (asset.identityState !== "hash_verified" &&
        asset.identityState !== "legacy_reference_unverified")
    ) {
      fail(
        "INVALID_ASSET",
        "Asset identity must be a source reference with an optional verified SHA-256."
      );
    }
  });
  if (!Number.isFinite(document.fallbackSpeed) || document.fallbackSpeed <= 0)
    fail("INVALID_SPEED", "Invalid fallback speed.");
  if (new Set(document.assets.map(asset => asset.assetId)).size !== document.assets.length)
    fail("DUPLICATE_ASSET", "Asset IDs must be unique.");
  const ids = new Set();
  let expectedProgrammeStart = 0;
  document.clipOccurrences.forEach(occurrence => {
    if (!occurrence.occurrenceId || ids.has(occurrence.occurrenceId))
      fail("DUPLICATE_OCCURRENCE", "Every clip occurrence needs a unique ID.");
    ids.add(occurrence.occurrenceId);
    if (!document.assets.some(asset => asset.assetId === occurrence.assetId))
      fail("MISSING_ASSET", `Missing asset for ${occurrence.occurrenceId}.`);
    const source = occurrence.sourceRange;
    const programme = occurrence.programmeRange;
    if (
      source?.space !== "source" ||
      programme?.space !== "programme" ||
      !Number.isSafeInteger(source.startTick) ||
      !Number.isSafeInteger(source.endTick) ||
      !Number.isSafeInteger(programme.startTick) ||
      !Number.isSafeInteger(programme.endTick) ||
      source.startTick < 0 ||
      source.endTick <= source.startTick ||
      programme.startTick !== expectedProgrammeStart ||
      programme.endTick <= programme.startTick
    ) {
      fail(
        "INVALID_TIME_RANGE",
        `Invalid or discontinuous time range for ${occurrence.occurrenceId}.`
      );
    }
    expectedProgrammeStart = programme.endTick;
  });
  if (
    !Array.isArray(document.timeMaps) ||
    document.timeMaps.length !== document.clipOccurrences.length
  ) {
    fail("INVALID_TIME_MAP", "Every occurrence needs one source-to-programme time map.");
  }
  document.clipOccurrences.forEach(occurrence => {
    const maps = document.timeMaps.filter(map => map.occurrenceId === occurrence.occurrenceId);
    if (
      maps.length !== 1 ||
      maps[0].timeMapId !== occurrence.timeMapId ||
      maps[0].segments?.length !== 1
    ) {
      fail("INVALID_TIME_MAP", `Invalid time map for ${occurrence.occurrenceId}.`);
    }
    const segment = maps[0].segments[0];
    const duration = occurrence.sourceRange.endTick - occurrence.sourceRange.startTick;
    if (
      stableStringify(segment.sourceRange) !== stableStringify(occurrence.sourceRange) ||
      stableStringify(segment.programmeRange) !== stableStringify(occurrence.programmeRange) ||
      segment.clipLocalRange?.space !== "clip_local" ||
      segment.clipLocalRange.startTick !== 0 ||
      segment.clipLocalRange.endTick !== duration ||
      segment.rate?.numerator !== 1 ||
      segment.rate?.denominator !== 1 ||
      segment.direction !== "forward" ||
      segment.freeze !== false
    ) {
      fail(
        "INVALID_TIME_MAP",
        `Time map for ${occurrence.occurrenceId} disagrees with its source range.`
      );
    }
  });
  if (
    !Array.isArray(document.outputTimeMap) ||
    (expectedProgrammeStart > 0 && document.outputTimeMap.length === 0)
  ) {
    fail("INVALID_OUTPUT_MAP", "Output time map is missing.");
  }
  let programmeCursor = 0;
  let outputCursor = 0;
  document.outputTimeMap.forEach(segment => {
    if (
      segment.programmeRange?.space !== "programme" ||
      segment.programmeRange.startTick !== programmeCursor ||
      !Number.isSafeInteger(segment.programmeRange.endTick) ||
      segment.programmeRange.endTick <= programmeCursor ||
      segment.outputRange?.space !== "output" ||
      segment.outputRange.startTick !== outputCursor ||
      !Number.isSafeInteger(segment.outputRange.endTick) ||
      segment.outputRange.endTick <= outputCursor ||
      !Number.isSafeInteger(segment.rateNumerator) ||
      segment.rateNumerator <= 0 ||
      !Number.isSafeInteger(segment.rateDenominator) ||
      segment.rateDenominator <= 0
    ) {
      fail("INVALID_OUTPUT_MAP", "Output map has a gap, overlap or invalid rate.");
    }
    programmeCursor = segment.programmeRange.endTick;
    outputCursor = segment.outputRange.endTick;
  });
  if (programmeCursor !== expectedProgrammeStart)
    fail("INVALID_OUTPUT_MAP", "Output map does not cover the programme.");
  const expectedOutputMap = buildStudioOutputTimeMap({
    durationTick: expectedProgrammeStart,
    programmeSpeedKeys: document.programmeSpeedKeys,
    fallbackSpeed: document.fallbackSpeed,
  });
  if (stableStringify(document.outputTimeMap) !== stableStringify(expectedOutputMap)) {
    fail("INVALID_OUTPUT_MAP", "Output map disagrees with the saved speed plan.");
  }
  if (!Array.isArray(document.constraints?.locks)) fail("INVALID_LOCK", "Locks must be an array.");
  const lockIds = new Set();
  document.constraints.locks.forEach(lock => {
    const occurrence = document.clipOccurrences.find(
      item => item.occurrenceId === lock.occurrenceId
    );
    if (
      !lock.lockId ||
      lockIds.has(lock.lockId) ||
      lock.mode !== "preserve" ||
      !occurrence ||
      lock.sourceRange?.space !== "source" ||
      !Number.isSafeInteger(lock.sourceRange.startTick) ||
      !Number.isSafeInteger(lock.sourceRange.endTick) ||
      lock.sourceRange.startTick < occurrence.sourceRange.startTick ||
      lock.sourceRange.endTick > occurrence.sourceRange.endTick ||
      lock.sourceRange.endTick <= lock.sourceRange.startTick
    ) {
      fail("INVALID_LOCK", "Lock must name an occurrence and a contained source range.");
    }
    lockIds.add(lock.lockId);
  });
  if (!Array.isArray(document.analysisRefs))
    fail("INVALID_ANALYSIS_REF", "Analysis references must be an array.");
  if (document.projectIntelligenceRefs !== undefined) {
    if (!Array.isArray(document.projectIntelligenceRefs) ||
        document.projectIntelligenceRefs.length > 1 ||
        new Set(document.projectIntelligenceRefs.map(ref => ref?.revisionId)).size !==
          document.projectIntelligenceRefs.length ||
        !document.projectIntelligenceRefs.every(ref =>
          ref && typeof ref === "object" && !Array.isArray(ref) &&
          Object.keys(ref).sort().join(",") ===
            "dependencyDigest,manifestHash,revisionId" &&
          [ref.revisionId, ref.manifestHash, ref.dependencyDigest]
            .every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)))) {
      fail("INVALID_PROJECT_INTELLIGENCE_REF", "Invalid Project Intelligence reference.");
    }
  }
  if (
    !Array.isArray(document.journal) ||
    !document.idempotency ||
    typeof document.idempotency !== "object" ||
    Array.isArray(document.idempotency)
  ) {
    fail("INVALID_REVISION_STATE", "Command journal and idempotency receipts are required.");
  }
  // Review records are separate from command journal entries. A rejection
  // advances the document revision without changing timeline content.
  // The reviewer ID is a client claim until a server verifies the identity.
  if (document.directorReviewJournal !== undefined) {
    if (!Array.isArray(document.directorReviewJournal))
      fail("INVALID_DIRECTOR_REVIEW", "Director review journal must be an array.");
    const proposalIds = new Set();
    document.directorReviewJournal.forEach(record => {
      const receipt = record?.receipt;
      if (
        !receipt ||
        receipt.schemaVersion !== 1 ||
        typeof receipt.proposalId !== "string" ||
        !receipt.proposalId ||
        !/^[a-f0-9]{64}$/.test(receipt.proposalFingerprint || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.receiptFingerprint || "") ||
        typeof receipt.reviewerId !== "string" ||
        !receipt.reviewerId ||
        !["approve", "reject"].includes(receipt.decision) ||
        typeof receipt.reviewedAt !== "string" ||
        Number.isNaN(Date.parse(receipt.reviewedAt)) ||
        receipt.identityStatus !== "client_claim_unverified" ||
        record.identityStatus !== "client_claim_unverified" ||
        proposalIds.has(receipt.proposalId)
      ) {
        fail("INVALID_DIRECTOR_REVIEW", "Director review record is invalid or duplicated.");
      }
      proposalIds.add(receipt.proposalId);
      if (record.serverReview !== undefined) {
        const server = record.serverReview;
        const serverFields = ["serverReviewId", "projectId", "proposalId", "baseRevision",
          "proposalFingerprint", "decision", "reviewerUid", "reviewedAt"];
        if (
          !server ||
          stableStringify(Object.keys(server).sort()) !== stableStringify(serverFields.sort()) ||
          !/^[a-f0-9]{64}$/i.test(server.serverReviewId || "") ||
          server.projectId !== document.projectId ||
          server.proposalId !== receipt.proposalId ||
          !Number.isSafeInteger(server.baseRevision) ||
          server.baseRevision < 0 ||
          server.proposalFingerprint !== receipt.proposalFingerprint ||
          server.decision !== receipt.decision ||
          server.reviewerUid !== receipt.reviewerId ||
          server.reviewedAt !== receipt.reviewedAt
        ) {
          fail("INVALID_DIRECTOR_REVIEW", "Server review reference must match the local receipt.");
        }
      }
      if (receipt.decision === "reject") {
        if (record.commandJournalId !== null ||
            (record.reviewRevision !== undefined &&
              (!Number.isSafeInteger(record.reviewRevision) || record.reviewRevision < 1 ||
                record.reviewRevision > document.revision)))
          fail("INVALID_DIRECTOR_REVIEW", "A rejected proposal cannot name a command.");
      } else {
        if (record.reviewRevision !== undefined)
          fail("INVALID_DIRECTOR_REVIEW", "An approved review cannot name a rejection revision.");
        const command = document.journal.find(entry => entry.journalId === record.commandJournalId);
        if (
          !command ||
          command.actor?.type !== "ai" ||
          command.directorReview?.proposalId !== receipt.proposalId ||
          command.directorReview?.proposalFingerprint !== receipt.proposalFingerprint ||
          command.directorReview?.receiptFingerprint !== receipt.receiptFingerprint
        ) {
          fail("INVALID_DIRECTOR_REVIEW", "An approved review must link to its AI command.");
        }
      }
    });
  }
  document.layers.filter(layer => layer.type === "subject_vfx").forEach(layer => {
    for (const [field, capability] of [["modelArtifactRef", "segment_subject"], ["trackingArtifactRef", "track_object"]]) {
      const ref = layer.parameters[field];
      if (!ref) continue;
      createModelArtifactReference(ref);
      const scene = layer.parameters.scene;
      if (ref.capability !== capability || ref.sourceAssetId !== scene?.sourceId ||
          ref.sourceRange.startTick !== secondsToTicks(scene?.sourceRange?.start) ||
          ref.sourceRange.endTick !== secondsToTicks(scene?.sourceRange?.end))
        fail("INVALID_MODEL_LAYER_REF", "A subject artifact must match its editable source and range.");
    }
  });
  document.analysisRefs.forEach(ref => {
    if (ref.kind === "model_capability") {
      createModelArtifactReference(ref);
      return;
    }
    const normalized = createSemanticAnalysisReference(ref);
    const fields = [
      "kind",
      "schemaVersion",
      "artifactId",
      "manifestContentHash",
      "sourceContentHash",
      "cacheKey",
    ];
    if (
      Object.keys(ref).some(key => !fields.includes(key)) ||
      fields.some(key => ref[key] !== normalized[key])
    ) {
      fail(
        "INVALID_ANALYSIS_REF",
        "Project analysis references must contain only immutable artifact identity."
      );
    }
  });
  return document;
};

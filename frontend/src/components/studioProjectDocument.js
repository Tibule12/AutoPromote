import {
  createOutputTimeMap,
  createTimeRange,
  secondsToTicks,
  ticksToSeconds,
  TICKS_PER_SECOND,
} from "./studioTime";
import { createSemanticAnalysisReference } from "./studioSemanticTimeline";
import { buildSpeedSegmentsFromKeyframes } from "./studioCreatorRecipes";

export const STUDIO_DOCUMENT_VERSION = 1;

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
  parameters: Object.fromEntries(
    LAYER_PARAMETER_FIELDS.filter(field => item[field] !== undefined).map(field => [
      field,
      item[field],
    ])
  ),
});

export const buildStudioLayersFromSnapshot = snapshot => [
  ...(snapshot.overlays || []).map((item, index) =>
    layerReference(item, item.type === "text" ? "title" : "b_roll", index)
  ),
  ...(snapshot.motionScenes || []).map((item, index) => layerReference(item, "motion", index)),
  ...(snapshot.threeDScenes || []).map((item, index) => layerReference(item, "three_d", index)),
  ...(snapshot.captionSegments || []).map(captionLayerReference),
];

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
    parameters,
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
  for (const slot of ["top", "bottom"]) {
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
    speedKeyframes: (document.programmeSpeedKeys || []).map(key => ({
      property: "speed",
      time: ticksToSeconds(key.atProgrammeTick),
      value: key.rate,
      easing: key.easing,
    })),
  };
  for (const layer of document.layers || []) {
    if (layer.type === "caption") continue;
    const collection = layer.legacyCollection;
    if (!["overlays", "motionScenes", "threeDScenes"].includes(collection)) continue;
    const item = {
      ...layer.parameters,
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
      ...key.parameters,
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
    parameters: {
      text: String(segment.text || ""),
      reviewRequired: !!(segment.reviewRequired ?? segment.review_required),
      textReviewed: !!(segment.textReviewed ?? segment.text_reviewed),
      speaker: segment.speaker || segment.speaker_id || null,
      placement: segment.captionPlacement || segment.caption_placement || null,
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
      playback: { direction: "forward", freeze: false, rate: { numerator: 1, denominator: 1 } },
    };
    programmeTick += durationTick;
    return occurrence;
  });
  const layers = buildStudioLayersFromSnapshot(snapshot);
  const linkedTiming = buildStudioLinkedTimingFromSnapshot(snapshot);
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
    routes: Object.entries(snapshot.trackStates || {}).map(([trackId, state]) => ({
      trackId,
      state: typeof state === "object" && state !== null ? { ...state } : state,
    })),
    routing: {
      muteOriginalAudio: !!snapshot.muteOriginalAudio,
      musicDucking: !!snapshot.musicDucking,
      musicDuckingStrength: Number(snapshot.musicDuckingStrength ?? 0),
      musicTrackId: snapshot.musicTrack?.id || null,
    },
  };
  const analysisRefs = (snapshot.analysisRefs || previousDocument?.analysisRefs || []).map(ref =>
    createSemanticAnalysisReference(ref)
  );
  const styleRef = snapshot.styleRef || previousDocument?.styleRef || null;
  const programmeSpeedKeys = (snapshot.speedKeyframes || [])
    .map(key => ({
      ...key,
      atProgrammeTick: secondsToTicks(Number(key.time || 0)),
      rate: Number(key.value ?? key.rate ?? 1),
    }))
    .filter(key => key.property === "speed" && Number.isFinite(key.rate))
    .map(({ atProgrammeTick, rate, easing }) => ({
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
    JSON.stringify(
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
      JSON.stringify(
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
    JSON.stringify(previousDocument.layers) === JSON.stringify(layers) &&
    JSON.stringify(previousDocument.linkedTiming) === JSON.stringify(linkedTiming) &&
    JSON.stringify(previousDocument.output) === JSON.stringify(output) &&
    JSON.stringify(previousDocument.audioGraph) === JSON.stringify(audioGraph) &&
    JSON.stringify(previousDocument.analysisRefs) === JSON.stringify(analysisRefs) &&
    JSON.stringify(previousDocument.programmeSpeedKeys) === JSON.stringify(programmeSpeedKeys) &&
    previousDocument.fallbackSpeed === fallbackSpeed &&
    JSON.stringify(previousDocument.styleRef) === JSON.stringify(styleRef);
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
      layerComposition: "separate_worker_stages",
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
  };
  validateStudioProjectDocument(rebased);
  return rebased;
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
    return {
      ...source,
      id: occurrence.occurrenceId,
      sourceClipId: asset?.sourceId || source.sourceClipId || source.id,
      startRequest: ticksToSeconds(occurrence.sourceRange.startTick),
      endRequest: ticksToSeconds(occurrence.sourceRange.endTick),
    };
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
      JSON.stringify(segment.sourceRange) !== JSON.stringify(occurrence.sourceRange) ||
      JSON.stringify(segment.programmeRange) !== JSON.stringify(occurrence.programmeRange) ||
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
  if (JSON.stringify(document.outputTimeMap) !== JSON.stringify(expectedOutputMap)) {
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
          JSON.stringify(Object.keys(server).sort()) !== JSON.stringify(serverFields.sort()) ||
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
  document.analysisRefs.forEach(ref => {
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

import {
  buildStudioLayersFromSnapshot,
  buildStudioLinkedTimingFromSnapshot,
  buildStudioOutputTimeMap,
  filterStudioLayerParameters,
  projectStudioLinkedTimingToSnapshot,
} from "./studioProjectDocument";
import { secondsToTicks, ticksToSeconds } from "./studioTime";
import { rippleProgrammeSpeedKeys, rippleStudioSnapshotLinkedTimeline } from "./studioTrimTransaction";

export const MIGRATED_PROGRAMME_OPERATIONS = Object.freeze([
  "remove_range",
  "caption_segments",
  "text_overlay",
  "video_overlay",
  "audio_ducking",
  "motion_scene",
  "speed_segments",
  "creative_plan",
]);

const isPlainObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function validateMigratedOperation(operation, helpers) {
  const { commandError, expectKeys, validTick, validRange, checkId } = helpers;
  switch (operation.type) {
    case "remove_range": {
      expectKeys(
        operation,
        ["type", "range", "transition", "transitionDuration", "preconditions"],
        "remove_range"
      );
      validRange(operation.range, "programme");
      if (operation.transition !== undefined && typeof operation.transition !== "string") {
        commandError("INVALID_COMMAND", "transition must be a string.");
      }
      if (
        operation.transitionDuration !== undefined &&
        (!Number.isFinite(Number(operation.transitionDuration)) ||
          Number(operation.transitionDuration) < 0)
      ) {
        commandError("INVALID_COMMAND", "transitionDuration must be a non-negative number.");
      }
      return true;
    }
    case "caption_segments": {
      expectKeys(
        operation,
        ["type", "segments", "style", "position", "scale", "preconditions"],
        "caption_segments"
      );
      if (!Array.isArray(operation.segments)) {
        commandError("INVALID_COMMAND", "caption_segments requires a segments array.");
      }
      operation.segments.forEach((seg, idx) => {
        if (!isPlainObject(seg)) {
          commandError("INVALID_COMMAND", `Caption segment ${idx} must be an object.`);
        }
        if (typeof seg.text !== "string") {
          commandError("INVALID_COMMAND", `Caption segment ${idx} requires text.`);
        }
      });
      if (operation.style !== undefined && typeof operation.style !== "string") {
        commandError("INVALID_COMMAND", "Caption style must be a string.");
      }
      if (operation.position !== undefined && typeof operation.position !== "string") {
        commandError("INVALID_COMMAND", "Caption position must be a string.");
      }
      if (
        operation.scale !== undefined &&
        (!Number.isFinite(Number(operation.scale)) || Number(operation.scale) <= 0)
      ) {
        commandError("INVALID_COMMAND", "Caption scale must be positive.");
      }
      return true;
    }
    case "text_overlay": {
      expectKeys(
        operation,
        ["type", "layerId", "action", "text", "placement", "startTick", "endTick", "style", "preconditions"],
        "text_overlay"
      );
      if (operation.action !== undefined && !["upsert", "remove"].includes(operation.action)) {
        commandError("INVALID_COMMAND", "text_overlay action must be upsert or remove.");
      }
      if (operation.layerId !== undefined) checkId(operation.layerId, "layerId");
      if (operation.action !== "remove" && (typeof operation.text !== "string" || !operation.text.trim())) {
        commandError("INVALID_COMMAND", "text_overlay requires non-empty text.");
      }
      if (operation.startTick !== undefined && !validTick(operation.startTick)) {
        commandError("INVALID_TIME_POINT", "text_overlay startTick must be a valid tick.");
      }
      if (operation.endTick !== undefined && !validTick(operation.endTick)) {
        commandError("INVALID_TIME_POINT", "text_overlay endTick must be a valid tick.");
      }
      if (
        operation.startTick !== undefined &&
        operation.endTick !== undefined &&
        operation.endTick <= operation.startTick
      ) {
        commandError("INVALID_TIME_RANGE", "text_overlay endTick must follow startTick.");
      }
      if (operation.placement !== undefined && !isPlainObject(operation.placement)) {
        commandError("INVALID_COMMAND", "text_overlay placement must be an object.");
      }
      if (operation.style !== undefined && !isPlainObject(operation.style)) {
        commandError("INVALID_COMMAND", "text_overlay style must be an object.");
      }
      return true;
    }
    case "video_overlay": {
      expectKeys(
        operation,
        [
          "type",
          "layerId",
          "action",
          "assetId",
          "programmeRange",
          "mode",
          "trimStartTick",
          "volume",
          "audioDucking",
          "preconditions",
        ],
        "video_overlay"
      );
      if (operation.action !== undefined && !["upsert", "remove"].includes(operation.action)) {
        commandError("INVALID_COMMAND", "video_overlay action must be upsert or remove.");
      }
      if (operation.layerId !== undefined) checkId(operation.layerId, "layerId");
      if (operation.action !== "remove") {
        checkId(operation.assetId, "assetId");
        validRange(operation.programmeRange, "programme");
      }
      if (
        operation.mode !== undefined &&
        !["fullscreen", "pip", "split"].includes(operation.mode)
      ) {
        commandError("INVALID_COMMAND", "video_overlay mode must be fullscreen, pip, or split.");
      }
      if (operation.trimStartTick !== undefined && !validTick(operation.trimStartTick)) {
        commandError("INVALID_TIME_POINT", "video_overlay trimStartTick must be a valid tick.");
      }
      return true;
    }
    case "audio_ducking": {
      expectKeys(
        operation,
        ["type", "strength", "programmeRange", "enabled", "preconditions"],
        "audio_ducking"
      );
      const strength = Number(operation.strength);
      if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
        commandError("INVALID_COMMAND", "audio_ducking strength must be between 0 and 1.");
      }
      if (operation.programmeRange !== undefined) {
        validRange(operation.programmeRange, "programme");
      }
      return true;
    }
    case "motion_scene": {
      expectKeys(
        operation,
        ["type", "layerId", "action", "scene", "preconditions"],
        "motion_scene"
      );
      if (operation.action !== undefined && !["upsert", "remove"].includes(operation.action)) {
        commandError("INVALID_COMMAND", "motion_scene action must be upsert or remove.");
      }
      if (operation.layerId !== undefined) checkId(operation.layerId, "layerId");
      if (operation.action !== "remove" && !isPlainObject(operation.scene)) {
        commandError("INVALID_COMMAND", "motion_scene requires a scene object.");
      }
      return true;
    }
    case "speed_segments": {
      expectKeys(
        operation,
        [
          "type",
          "segments",
          "target",
          "direction",
          "freeze",
          "anchorSourceTick",
          "fallbackSpeed",
          "preconditions",
        ],
        "speed_segments"
      );
      if (!Array.isArray(operation.segments)) {
        commandError("INVALID_COMMAND", "speed_segments requires a segments array.");
      }
      operation.segments.forEach((seg, idx) => {
        if (!isPlainObject(seg)) {
          commandError("INVALID_COMMAND", `Speed segment ${idx} must be an object.`);
        }
        const rate = Number(seg.rate ?? seg.value ?? 1);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 16) {
          commandError("INVALID_SPEED", `Speed segment ${idx} requires a positive rate <= 16.`);
        }
        const time = Number(seg.time ?? (seg.atProgrammeTick !== undefined ? ticksToSeconds(seg.atProgrammeTick) : 0));
        if (!Number.isFinite(time) || time < 0) {
          commandError("INVALID_TIME_POINT", `Speed segment ${idx} requires a non-negative time.`);
        }
      });
      if (operation.target !== undefined) {
        expectKeys(operation.target, ["occurrenceId"], "target");
        checkId(operation.target.occurrenceId, "occurrenceId");
      }
      if (
        operation.direction !== undefined &&
        !["forward", "reverse"].includes(operation.direction)
      ) {
        commandError("INVALID_SPEED", "Speed direction must be forward or reverse.");
      }
      if (
        operation.anchorSourceTick !== undefined &&
        !validTick(operation.anchorSourceTick)
      ) {
        commandError("INVALID_TIME_POINT", "anchorSourceTick must be a valid tick.");
      }
      if (
        operation.fallbackSpeed !== undefined &&
        (!Number.isFinite(Number(operation.fallbackSpeed)) || Number(operation.fallbackSpeed) <= 0)
      ) {
        commandError("INVALID_SPEED", "fallbackSpeed must be a positive number.");
      }
      return true;
    }
    case "creative_plan": {
      expectKeys(operation, ["type", "plan", "preconditions"], "creative_plan");
      if (!isPlainObject(operation.plan)) {
        commandError("INVALID_COMMAND", "creative_plan requires a plan object.");
      }
      return true;
    }
    default:
      return false;
  }
}

export function applyMigratedOperation(document, operation, idempotencyKey, helpers) {
  const { commandError, assertUnlocked, reflow } = helpers;

  if (operation.type === "remove_range") {
    const { startTick, endTick } = operation.range;
    const totalTick = document.clipOccurrences.at(-1)?.programmeRange?.endTick || 0;
    if (startTick >= totalTick || endTick <= 0) {
      commandError("INVALID_TIME_RANGE", "Removal range does not intersect the programme.");
    }
    const clampedStart = Math.max(0, startTick);
    const clampedEnd = Math.min(totalTick, endTick);
    if (clampedEnd <= clampedStart || totalTick - (clampedEnd - clampedStart) <= 0) {
      commandError("INVALID_TIME_RANGE", "Removal must leave non-empty video in the programme.");
    }

    let sequence = 0;
    const nextOccurrenceId = () => `kept:${idempotencyKey}:${++sequence}`;
    const nextOccurrences = [];

    for (const occurrence of document.clipOccurrences) {
      const pStart = occurrence.programmeRange.startTick;
      const pEnd = occurrence.programmeRange.endTick;
      if (clampedEnd <= pStart || clampedStart >= pEnd) {
        nextOccurrences.push(occurrence);
        continue;
      }
      const cutStartLocal = Math.max(0, clampedStart - pStart);
      const cutEndLocal = Math.min(pEnd - pStart, clampedEnd - pStart);
      const cutSourceRange = {
        space: "source",
        startTick: occurrence.sourceRange.startTick + cutStartLocal,
        endTick: occurrence.sourceRange.startTick + cutEndLocal,
      };
      assertUnlocked(document.constraints.locks, occurrence.occurrenceId, cutSourceRange);

      const leftDuration = cutStartLocal;
      const rightStartOffset = cutEndLocal;
      const fullDuration = occurrence.sourceRange.endTick - occurrence.sourceRange.startTick;

      if (leftDuration > 0) {
        nextOccurrences.push({
          ...occurrence,
          sourceRange: {
            space: "source",
            startTick: occurrence.sourceRange.startTick,
            endTick: occurrence.sourceRange.startTick + leftDuration,
          },
          ...(operation.transition
            ? {
                parameters: {
                  ...occurrence.parameters,
                  transitionOut: operation.transition,
                  ...(operation.transitionDuration !== undefined
                    ? { transitionDuration: Number(operation.transitionDuration) }
                    : {}),
                },
              }
            : {}),
        });
      }
      if (rightStartOffset < fullDuration) {
        const splitRight = leftDuration > 0;
        nextOccurrences.push({
          ...occurrence,
          occurrenceId: splitRight ? nextOccurrenceId() : occurrence.occurrenceId,
          ...(splitRight
            ? {
                inheritedFromOccurrenceId: occurrence.occurrenceId,
                legacyParentIds: [occurrence.occurrenceId, ...(occurrence.legacyParentIds || [])],
              }
            : {}),
          sourceRange: {
            space: "source",
            startTick: occurrence.sourceRange.startTick + rightStartOffset,
            endTick: occurrence.sourceRange.endTick,
          },
          ...(operation.transition
            ? {
                parameters: {
                  ...occurrence.parameters,
                  transitionIn: operation.transition,
                  ...(operation.transitionDuration !== undefined
                    ? { transitionDuration: Number(operation.transitionDuration) }
                    : {}),
                },
              }
            : {}),
        });
      }
    }

    const migratedLocks = document.constraints.locks.flatMap(lock => {
      const surviving = nextOccurrences.filter(
        occ =>
          occ.occurrenceId === lock.occurrenceId ||
          occ.inheritedFromOccurrenceId === lock.occurrenceId
      );
      return surviving
        .filter(
          occ =>
            lock.sourceRange.startTick >= occ.sourceRange.startTick &&
            lock.sourceRange.endTick <= occ.sourceRange.endTick
        )
        .map(occ => ({ ...lock, occurrenceId: occ.occurrenceId }));
    });

    const gap = { fromTick: clampedStart, toTick: clampedEnd };
    let linkedSnapshot = projectStudioLinkedTimingToSnapshot(document);
    linkedSnapshot = rippleStudioSnapshotLinkedTimeline(linkedSnapshot, gap, idempotencyKey);
    const programmeSpeedKeys = rippleProgrammeSpeedKeys(
      document.programmeSpeedKeys,
      gap,
      idempotencyKey
    );
    const layers = [
      ...buildStudioLayersFromSnapshot(linkedSnapshot),
      ...document.layers.filter(layer => layer.type === "caption"),
    ];

    return reflow({
      ...document,
      clipOccurrences: nextOccurrences,
      constraints: { ...document.constraints, locks: migratedLocks },
      layers,
      ...(linkedSnapshot.compoundClips && document.editGraph
        ? {
            editGraph: {
              ...document.editGraph,
              settings: {
                ...document.editGraph.settings,
                compoundClips: linkedSnapshot.compoundClips,
              },
            },
          }
        : {}),
      linkedTiming: buildStudioLinkedTimingFromSnapshot(linkedSnapshot),
      programmeSpeedKeys,
    });
  }

  if (operation.type === "caption_segments") {
    const captionLayers = operation.segments.map((segment, index) => {
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
          text: String(segment.text || ""),
          reviewRequired: !!(segment.reviewRequired ?? segment.review_required),
          textReviewed: !!(segment.textReviewed ?? segment.text_reviewed),
          speaker: segment.speaker || segment.speaker_id || null,
          placement: segment.captionPlacement || segment.caption_placement || null,
          ...(segment.speakerLabel ? { speakerLabel: segment.speakerLabel } : {}),
          ...(segment.captionPlacement !== undefined || segment.caption_placement !== undefined
            ? { captionPlacement: segment.captionPlacement ?? segment.caption_placement }
            : {}),
        },
      };
    });
    const nonCaptionLayers = document.layers.filter(layer => layer.type !== "caption");
    const nextSettings = {
      ...document.visualGraph.settings,
      ...(operation.style !== undefined ? { captionStyle: operation.style } : {}),
      ...(operation.position !== undefined ? { captionPosition: operation.position } : {}),
      ...(operation.scale !== undefined ? { captionScale: Number(operation.scale) } : {}),
    };
    return {
      ...document,
      layers: [...nonCaptionLayers, ...captionLayers],
      visualGraph: {
        ...document.visualGraph,
        settings: nextSettings,
      },
    };
  }

  if (operation.type === "text_overlay") {
    const layerId = String(operation.layerId || `title:${idempotencyKey}`);
    const nonCaptionLayers = document.layers.filter(layer => layer.type !== "caption");
    const captions = document.layers.filter(layer => layer.type === "caption");
    if (operation.action === "remove") {
      return {
        ...document,
        layers: [
          ...nonCaptionLayers.filter(layer => layer.layerId !== layerId),
          ...captions,
        ],
      };
    }
    const totalTick = document.clipOccurrences.at(-1)?.programmeRange?.endTick || secondsToTicks(6);
    const startTick = operation.startTick ?? 0;
    const endTick = operation.endTick ?? Math.max(startTick + secondsToTicks(2), Math.min(totalTick, startTick + secondsToTicks(4)));
    const existing = nonCaptionLayers.find(layer => layer.layerId === layerId);
    const startTime = ticksToSeconds(startTick);
    const duration = ticksToSeconds(endTick - startTick);
    const nextLayer = {
      layerId,
      type: "title",
      legacyType: "text",
      legacyCollection: "overlays",
      programmeRange: { space: "programme", startTick, endTick },
      compositionStage: "worker_overlay",
      parameterSchemaVersion: 3,
      parameters: filterStudioLayerParameters({
        ...(existing?.parameters || {}),
        ...(operation.style || {}),
        ...(operation.placement || {}),
        text: operation.text,
        startTime,
        duration,
      }),
    };
    const updatedNonCaptions = existing
      ? nonCaptionLayers.map(layer => (layer.layerId === layerId ? nextLayer : layer))
      : [...nonCaptionLayers, nextLayer];
    return {
      ...document,
      layers: [...updatedNonCaptions, ...captions],
    };
  }

  if (operation.type === "video_overlay") {
    const layerId = String(operation.layerId || `broll:${idempotencyKey}`);
    const nonCaptionLayers = document.layers.filter(layer => layer.type !== "caption");
    const captions = document.layers.filter(layer => layer.type === "caption");
    if (operation.action === "remove") {
      return {
        ...document,
        layers: [
          ...nonCaptionLayers.filter(layer => layer.layerId !== layerId),
          ...captions,
        ],
      };
    }
    const existing = nonCaptionLayers.find(layer => layer.layerId === layerId);
    const { startTick, endTick } = operation.programmeRange;
    const startTime = ticksToSeconds(startTick);
    const duration = ticksToSeconds(endTick - startTick);
    const trimStart =
      operation.trimStartTick !== undefined
        ? ticksToSeconds(operation.trimStartTick)
        : existing?.parameters?.trimStart;
    const nextLayer = {
      layerId,
      type: "b_roll",
      legacyType: "video",
      legacyCollection: "overlays",
      programmeRange: { space: "programme", startTick, endTick },
      compositionStage: "worker_overlay",
      parameterSchemaVersion: 3,
      parameters: filterStudioLayerParameters({
        ...(existing?.parameters || {}),
        sourceMediaId: operation.assetId,
        bRollMode: operation.mode || existing?.parameters?.bRollMode || "pip",
        startTime,
        duration,
        ...(trimStart !== undefined ? { trimStart } : {}),
        ...(operation.volume !== undefined ? { volume: Number(operation.volume) } : {}),
        ...(operation.audioDucking !== undefined ? { audioDucking: !!operation.audioDucking } : {}),
      }),
    };
    const updatedNonCaptions = existing
      ? nonCaptionLayers.map(layer => (layer.layerId === layerId ? nextLayer : layer))
      : [...nonCaptionLayers, nextLayer];
    return {
      ...document,
      layers: [...updatedNonCaptions, ...captions],
    };
  }

  if (operation.type === "motion_scene") {
    const layerId = String(operation.layerId || operation.scene?.id || `motion:${idempotencyKey}`);
    const nonCaptionLayers = document.layers.filter(layer => layer.type !== "caption");
    const captions = document.layers.filter(layer => layer.type === "caption");
    if (operation.action === "remove") {
      return {
        ...document,
        layers: [
          ...nonCaptionLayers.filter(layer => layer.layerId !== layerId),
          ...captions,
        ],
      };
    }
    const existing = nonCaptionLayers.find(layer => layer.layerId === layerId);
    const scene = operation.scene;
    const startTime = Number(scene.startTime ?? 0);
    const duration = Number(scene.duration ?? 2);
    const startTick = secondsToTicks(Math.max(0, startTime));
    const endTick = secondsToTicks(Math.max(0.1, startTime + duration));
    const nextLayer = {
      layerId,
      type: "motion",
      legacyType: scene.type || null,
      legacyCollection: "motionScenes",
      programmeRange: { space: "programme", startTick, endTick },
      compositionStage: "worker_motion",
      parameterSchemaVersion: 3,
      parameters: filterStudioLayerParameters({
        ...(existing?.parameters || {}),
        ...JSON.parse(JSON.stringify(scene)),
        startTime,
        duration,
      }),
    };
    const updatedNonCaptions = existing
      ? nonCaptionLayers.map(layer => (layer.layerId === layerId ? nextLayer : layer))
      : [...nonCaptionLayers, nextLayer];
    return {
      ...document,
      layers: [...updatedNonCaptions, ...captions],
    };
  }

  if (operation.type === "audio_ducking") {
    const enabled = operation.enabled !== undefined ? !!operation.enabled : operation.strength > 0;
    const strength = Number(operation.strength);
    return {
      ...document,
      audioGraph: {
        ...document.audioGraph,
        settings: {
          ...document.audioGraph.settings,
          musicDucking: enabled,
          musicDuckingStrength: strength,
        },
        routing: {
          ...document.audioGraph.routing,
          musicDucking: enabled,
          musicDuckingStrength: strength,
        },
      },
    };
  }

  if (operation.type === "speed_segments") {
    const nextSpeedKeys = operation.segments.map((seg, idx) => {
      const timeSec =
        seg.atProgrammeTick !== undefined ? ticksToSeconds(seg.atProgrammeTick) : Number(seg.time || 0);
      return {
        id: String(seg.id || `speed:${idempotencyKey}:${idx + 1}`),
        atProgrammeTick: secondsToTicks(timeSec),
        rate: Number(seg.rate ?? seg.value ?? 1),
        easing: seg.easing || "linear",
        ...(Array.isArray(seg.curve) ? { curve: [...seg.curve] } : {}),
      };
    });

    let nextOccurrences = document.clipOccurrences;
    if (operation.target?.occurrenceId) {
      const idx = nextOccurrences.findIndex(
        item => item.occurrenceId === operation.target.occurrenceId
      );
      if (idx < 0) {
        commandError(
          "OCCURRENCE_NOT_FOUND",
          `Occurrence ${operation.target.occurrenceId} does not exist.`
        );
      }
      const occ = nextOccurrences[idx];
      const nextPlayback = {
        ...(occ.playback || { direction: "forward", freeze: false, rate: { numerator: 1, denominator: 1 } }),
        ...(operation.direction !== undefined ? { direction: operation.direction } : {}),
        ...(operation.freeze !== undefined ? { freeze: !!operation.freeze } : {}),
        ...(operation.anchorSourceTick !== undefined
          ? { anchorSourceTick: operation.anchorSourceTick }
          : {}),
      };
      if (
        nextPlayback.freeze &&
        nextPlayback.anchorSourceTick !== undefined &&
        (nextPlayback.anchorSourceTick < occ.sourceRange.startTick ||
          nextPlayback.anchorSourceTick >= occ.sourceRange.endTick)
      ) {
        commandError("INVALID_TIME_POINT", "Freeze anchor must lie inside the occurrence source range.");
      }
      nextOccurrences = nextOccurrences.map((item, i) =>
        i === idx ? { ...item, playback: nextPlayback } : item
      );
    }

    const fallbackSpeed =
      operation.fallbackSpeed !== undefined ? Number(operation.fallbackSpeed) : document.fallbackSpeed;
    const durationTick = nextOccurrences.at(-1)?.programmeRange?.endTick || 0;
    return reflow({
      ...document,
      clipOccurrences: nextOccurrences,
      programmeSpeedKeys: nextSpeedKeys,
      fallbackSpeed,
      outputTimeMap: buildStudioOutputTimeMap({
        durationTick,
        programmeSpeedKeys: nextSpeedKeys,
        fallbackSpeed,
      }),
    });
  }

  if (operation.type === "creative_plan") {
    const allowedTopFields = [
      "finishFx",
      "advancedColor",
      "creativeIntent",
      "creativeEffectsEnabled",
      "creativePreset",
      "creativeIntensity",
    ];
    const nextSettings = { ...document.visualGraph.settings };
    for (const field of allowedTopFields) {
      if (operation.plan[field] !== undefined) {
        nextSettings[field] =
          isPlainObject(operation.plan[field]) && isPlainObject(nextSettings[field])
            ? { ...nextSettings[field], ...JSON.parse(JSON.stringify(operation.plan[field])) }
            : JSON.parse(JSON.stringify(operation.plan[field]));
      }
    }
    return {
      ...document,
      visualGraph: {
        ...document.visualGraph,
        settings: nextSettings,
      },
    };
  }

  return null;
}

export function collectMigratedReadWriteSets(operation) {
  switch (operation.type) {
    case "remove_range":
      return {
        read: ["programme:timeline", "constraints:locks", "programme:layers"],
        write: [
          "programme:timeline",
          "time_maps",
          "programme:layers",
          "programme:linked_timing",
          "programme:speed_keys",
        ],
      };
    case "caption_segments":
      return { read: ["programme:captions"], write: ["programme:captions", "visual:settings"] };
    case "text_overlay":
    case "video_overlay":
      return { read: ["programme:layers"], write: ["programme:layers"] };
    case "motion_scene":
      return { read: ["programme:motion"], write: ["programme:layers", "programme:motion"] };
    case "audio_ducking":
      return { read: ["audio:routing"], write: ["audio:settings", "audio:routing"] };
    case "speed_segments":
      return {
        read: ["programme:speed_keys", "programme:timeline"],
        write: ["programme:speed_keys", "time_maps"],
      };
    case "creative_plan":
      return { read: ["visual:settings"], write: ["visual:settings"] };
    default:
      return { read: [], write: [] };
  }
}

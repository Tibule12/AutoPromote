import { projectStudioLinkedTimingToSnapshot } from "./studioProjectDocument";
import { interpolateReframeKeyframes } from "./studioReframeInterpolation";
import { soloTrackingCoordinates } from "./studioTrackingCoordinates";
import { ticksToSeconds } from "./studioTime";

const fail = message => { throw Object.assign(new Error(message), { code: "INVALID_REFRAME_COMMAND" }); };
const exact = (value, keys, optional = []) => value && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).every(key => [...keys, ...optional].includes(key)) &&
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const bounded = (value, low, high) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

// Source-centred points remain distinct from CSS object-position. Both browser
// review and authenticated server replay call this same bounded command.
export const validateStudioReframeOperation = operation => {
  if (!exact(operation, ["type", "target", "aspect", "zoom", "sourceAspect", "keyframes"], ["preconditions"]) ||
      operation.type !== "reframe" || !exact(operation.target, ["occurrenceId"]) ||
      typeof operation.target.occurrenceId !== "string" || !operation.target.occurrenceId.trim() ||
      operation.target.occurrenceId.length > 160 ||
      !["9:16", "16:9", "1:1", "4:5"].includes(operation.aspect) ||
      !bounded(operation.zoom, 1, 1.5) || !bounded(operation.sourceAspect, .2, 5) ||
      !Array.isArray(operation.keyframes) || operation.keyframes.length < 2 || operation.keyframes.length > 128) {
    fail("Reframe requires an owned occurrence, supported aspect and bounded source tracking points.");
  }
  operation.keyframes.forEach((point, index) => {
    if (!exact(point, ["sourceTick", "x", "y", "cut"]) ||
        !Number.isSafeInteger(point.sourceTick) || point.sourceTick < 0 ||
        !bounded(point.x, 0, 100) || !bounded(point.y, 0, 100) || typeof point.cut !== "boolean" ||
        (index > 0 && point.sourceTick <= operation.keyframes[index - 1].sourceTick)) {
      fail("Reframe points must have ordered source ticks and finite image coordinates.");
    }
  });
  return operation;
};

export const applyStudioReframeOperation = (document, operation) => {
  validateStudioReframeOperation(operation);
  const occurrence = document.clipOccurrences.find(item => item.occurrenceId === operation.target.occurrenceId);
  if (!occurrence || document.compatibility?.visualStateVersion !== 1 ||
      occurrence.playback.freeze || occurrence.playback.direction !== "forward" ||
      occurrence.playback.rate.numerator !== occurrence.playback.rate.denominator) {
    fail("Reframe requires a reconciled forward source occurrence at its original programme rate.");
  }
  const points = operation.keyframes, source = occurrence.sourceRange;
  if (points[0].sourceTick !== source.startTick || points.at(-1).sourceTick !== source.endTick) {
    fail("Tracking must cover the complete selected source range.");
  }
  const settings = document.visualGraph.settings, state = projectStudioLinkedTimingToSnapshot(document);
  const singleClip = document.clipOccurrences.length === 1;
  if (!singleClip && (operation.zoom !== Number(settings.speakerTrackZoom || 1) ||
      operation.aspect !== (settings.reframeAspect || document.output.aspectRatio)))
    fail("Keep the existing project zoom and aspect when reframing one occurrence in a multi-clip edit.");
  const startTick = occurrence.programmeRange.startTick, endTick = occurrence.programmeRange.endTick;
  const start = ticksToSeconds(startTick), end = ticksToSeconds(endTick);
  const total = document.clipOccurrences.at(-1).programmeRange.endTick;
  const modeAt = time => [...(state.reframeModeCuts || [])].sort((a, b) => a.time - b.time)
    .reduce((active, cut) => cut.time <= time ? cut : active,
      { mode: settings.smartCrop ? settings.smartCropMode : "off" });
  const oldKeys = state.reframeKeyframes || [];
  const preserveKey = time => ({ ...interpolateReframeKeyframes(oldKeys, time), time, cut: true });
  const [w, h] = operation.aspect.split(":").map(Number);
  const coordinates = soloTrackingCoordinates({ x: 50, y: 50 }, operation.sourceAspect, w / h, operation.zoom);
  const frames = points.map((point, index) => ({
    ...coordinates.toPosition({ x: point.x, y: point.y }),
    time: ticksToSeconds(startTick + point.sourceTick - source.startTick),
    id: `director-follow-${occurrence.occurrenceId}-${index}`,
    cut: index === 0 || point.cut,
    sourceFocus: { x: point.x, y: point.y, aspect: operation.sourceAspect },
  }));
  // Preserve neighbouring framing; a boundary cut cannot pan into this edit.
  const keyframes = [
    ...oldKeys.filter(key => key.time < start || key.time > end),
    ...(start > 0 ? [preserveKey(0), preserveKey(Math.max(0, start - 1 / 90000))] : []),
    ...frames.filter(key => key.time < end || endTick === total),
    ...(endTick < total ? [preserveKey(end)] : []),
  ].sort((a, b) => a.time - b.time);
  const cuts = [
    ...(state.reframeModeCuts || []).filter(cut => cut.time < start || cut.time > end),
    ...(start > 0 && !(state.reframeModeCuts || []).some(cut => cut.time === 0) ? [{ ...modeAt(0), time: 0 }] : []),
    // The editor's canonical mode-cut normalizer omits the default zoom=1.
    // Emit that representation now so Redo/reopen cannot change the receipt.
    { id: `director-follow-${occurrence.occurrenceId}`, time: start, mode: "speaker_track" },
    ...(endTick < total ? [{ ...modeAt(end), time: end }] : []),
  ].sort((a, b) => a.time - b.time);
  const toKeys = values => [...new Map(values.map(({ time, ...parameters }) => ({
    atProgrammeTick: Math.round(time * 90000), parameters,
  })).map(key => [key.atProgrammeTick, key])).values()];
  return { ...document, output: { ...document.output, aspectRatio: operation.aspect },
    visualGraph: { ...document.visualGraph, settings: { ...settings,
      reframeAspect: operation.aspect, speakerTrackZoom: operation.zoom,
      smartCrop: true, smartCropMode: settings.smartCrop ? settings.smartCropMode : "off",
      ...(singleClip ? { videoFit: "cover", safeFaceFraming: false } : {}) } },
    linkedTiming: { ...document.linkedTiming, keys: { ...document.linkedTiming.keys,
      reframeKeyframes: toKeys(keyframes), reframeModeCuts: toKeys(cuts) } } };
};

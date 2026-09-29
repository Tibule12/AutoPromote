import { cutMotion } from "./motion/motionModel";
import { cutStudio3DScenes } from "./threeD/studio3DModel";
import { rippleTimedItems, rippleTimelineKeys } from "./studioTimelineEdits";
import { ticksToSeconds } from "./studioTime";

// A trim removes programme time. Caption segments stay in source time and are
// mapped through the retained occurrences by the existing caption compiler.
export const studioTrimGaps = (occurrence, keep) => {
  const removedStart = keep.startTick - occurrence.sourceRange.startTick;
  const removedEnd = occurrence.sourceRange.endTick - keep.endTick;
  const gaps = [];
  // The end is cut first so both gaps keep their original programme coordinates.
  if (removedEnd > 0) {
    gaps.push({
      fromTick: occurrence.programmeRange.endTick - removedEnd,
      toTick: occurrence.programmeRange.endTick,
    });
  }
  if (removedStart > 0) {
    gaps.push({
      fromTick: occurrence.programmeRange.startTick,
      toTick: occurrence.programmeRange.startTick + removedStart,
    });
  }
  return gaps;
};

export const rippleStudioSnapshotLinkedTimeline = (
  snapshot,
  { fromTick, toTick },
  idempotencyKey
) => {
  if (!(toTick > fromTick)) return snapshot;
  const from = ticksToSeconds(fromTick);
  const to = ticksToSeconds(toTick);
  const existingIds = new Set(
    [
      ...(snapshot.overlays || []),
      ...(snapshot.soundEffects || []),
      ...(snapshot.voiceovers || []),
      ...(snapshot.adjustmentLayers || []),
    ].map(item => String(item.id))
  );
  let continuation = 0;
  const nextId = () => {
    let id;
    do {
      continuation += 1;
      id = `retained-layer:${idempotencyKey}:${fromTick}:${toTick}:${continuation}`;
    } while (existingIds.has(id));
    existingIds.add(id);
    return id;
  };
  const retimeItems = items => rippleTimedItems(items, from, to, nextId);
  const retimeKeys = (keys, preserveRightState = false) =>
    rippleTimelineKeys(keys, from, to, { preserveRightState });
  const next = { ...snapshot };
  for (const field of ["overlays", "soundEffects", "voiceovers", "adjustmentLayers"]) {
    if (Array.isArray(snapshot[field])) next[field] = retimeItems(snapshot[field]);
  }
  if (Array.isArray(snapshot.motionScenes))
    next.motionScenes = cutMotion(snapshot.motionScenes, from, to);
  if (Array.isArray(snapshot.threeDScenes))
    next.threeDScenes = cutStudio3DScenes(snapshot.threeDScenes, from, to);
  for (const field of ["motionKeyframes", "speedKeyframes", "finishKeyframes"]) {
    if (Array.isArray(snapshot[field])) next[field] = retimeKeys(snapshot[field]);
  }
  for (const field of ["reframeKeyframes", "reframeModeCuts", "speakerFocusCuts"]) {
    if (Array.isArray(snapshot[field])) next[field] = retimeKeys(snapshot[field], true);
  }
  if (snapshot.speakerStackFraming && typeof snapshot.speakerStackFraming === "object") {
    next.speakerStackFraming = { ...snapshot.speakerStackFraming };
    for (const slot of ["top", "bottom"]) {
      const framing = snapshot.speakerStackFraming[slot];
      if (!framing) continue;
      next.speakerStackFraming[slot] = { ...framing };
      for (const field of [
        "keyframes",
        "sourceTimeOffsetKeyframes",
        "source_time_offset_keyframes",
      ]) {
        if (Array.isArray(framing[field]))
          next.speakerStackFraming[slot][field] = retimeKeys(framing[field], true);
      }
    }
  }
  if (snapshot.audioKeyframes && typeof snapshot.audioKeyframes === "object") {
    next.audioKeyframes = Object.fromEntries(
      Object.entries(snapshot.audioKeyframes).map(([bus, keys]) => [
        bus,
        Array.isArray(keys) ? retimeKeys(keys) : keys,
      ])
    );
  }
  return next;
};

export const rippleProgrammeSpeedKeys = (keys, { fromTick, toTick }) => {
  if (!(toTick > fromTick)) return keys;
  const removed = toTick - fromTick;
  return keys
    .filter(key => key.atProgrammeTick < fromTick || key.atProgrammeTick >= toTick)
    .map(key =>
      key.atProgrammeTick >= toTick
        ? { ...key, atProgrammeTick: key.atProgrammeTick - removed }
        : key
    );
};

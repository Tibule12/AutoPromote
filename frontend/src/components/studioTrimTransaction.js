import { cutMotion } from "./motion/motionModel";
import { cutStudio3DScenes } from "./threeD/studio3DModel";
import { rippleTimedItems, rippleTimelineKeys } from "./studioTimelineEdits";
import { ticksToSeconds, secondsToTicks } from "./studioTime";
import { GROUP_KIND, removeStudioGroupMembers } from "./studioGroups";
import { rippleStudioGroupTiming } from "./studioGroupTiming";
import { sliceStudioAutomation, rippleStudioAutomation } from "./studioAutomationSlice";

// Splitting one graphic/video occurrence retains its parent, paint position,
// source phase and editable animation. No programme time is removed.
export function splitStudioOverlayAtProgrammeTime(snapshot, layerId, at, rightId) {
  const overlay = snapshot.overlays.find(item => item.id === layerId);
  if (!overlay || !Number.isFinite(at)) throw Error("Choose an existing layer and split time.");
  const start = Number(overlay.startTime ?? overlay.start_time ?? 0);
  const end = start + Number(overlay.duration);
  const time = ticksToSeconds(secondsToTicks(at));
  if (!(time > start && time < end)) throw Error("Split point must be inside the layer.");
  const usedIds = new Set([...(snapshot.overlays || []), ...(snapshot.motionScenes || []),
    ...(snapshot.threeDScenes || []), ...(snapshot.compoundClips || []), ...(snapshot.motionKeyframes || [])].map(item => item.id));
  if (!rightId || usedIds.has(rightId)) throw Error("Split needs a new unique layer ID.");
  usedIds.add(rightId);
  let sequence = 0;
  const createId = () => {
    let id;
    do { id = `${rightId}:key:${++sequence}`; } while (usedIds.has(id));
    usedIds.add(id); return id;
  };
  const keys = (snapshot.motionKeyframes || []).filter(key => key.targetId === layerId);
  const left = { ...overlay, duration: time - start };
  const right = { ...overlay, id: rightId, startTime: time, duration: end - time,
    ...(overlay.type === "video" ? { sourceStartTime: Number(overlay.sourceStartTime || 0) + time - start } : {}),
    ...(overlay.trimStart !== undefined ? { trimStart: Number(overlay.trimStart || 0) + time - start } : {}),
  };
  const replace = ids => ids.flatMap(id => id === layerId ? [layerId, rightId] : [id]);
  return { ...snapshot, overlays: snapshot.overlays.flatMap(item => item.id === layerId ? [left, right] : [item]),
    ...(Array.isArray(snapshot.compositionOrder) ? { compositionOrder: replace(snapshot.compositionOrder) } : {}),
    compoundClips: (snapshot.compoundClips || []).map(group => group.kind !== GROUP_KIND ? group : {
      ...group, layerIds: replace(group.layerIds),
    }),
    motionKeyframes: [...(snapshot.motionKeyframes || []).filter(key => key.targetId !== layerId),
      ...sliceStudioAutomation(keys, { end: time, createId }),
      ...sliceStudioAutomation(keys, { start: time, createId }).map(key => ({ ...key, id: createId(), targetId: rightId }))],
  };
}

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
      ...(snapshot.motionScenes || []),
      ...(snapshot.threeDScenes || []),
      ...(snapshot.compoundClips || []),
      ...(snapshot.motionKeyframes || []),
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
  const replacements = new Map();
  const splitRanges = new Map();
  const retimeItems = (items, cut = rippleTimedItems, options) => {
    // Canonical layers are paint-ordered; legacy collections can be in intake
    // order. Allocate continuation IDs by identity, then keep each view's order.
    const ordered = [...items].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    const byId = new Map(ordered.map(item => {
      const pieces = cut([item], from, to, nextId, options);
      replacements.set(item.id, pieces.map(piece => piece.id));
      if (cut === rippleTimedItems && Number(item.startTime) < to && Number(item.startTime) + Number(item.duration) > from) {
        splitRanges.set(item.id, pieces.map(piece => ({ id: piece.id,
          ...(Number(piece.startTime) < from ? { start: 0, end: from, offset: 0 }
            : { start: to, end: Infinity, offset: to - from }),
        })));
      }
      return [item.id, pieces];
    }));
    return items.flatMap(item => byId.get(item.id));
  };
  const retimeKeys = (keys, preserveRightState = false, markCut = true) =>
    rippleTimelineKeys(keys, from, to, { preserveRightState, markCut });
  const next = { ...snapshot };
  for (const field of ["overlays", "soundEffects", "voiceovers", "adjustmentLayers"]) {
    if (Array.isArray(snapshot[field])) next[field] = retimeItems(snapshot[field], rippleTimedItems,
      { preserveVoiceFade: field === "voiceovers" });
  }
  if (Array.isArray(snapshot.motionScenes))
    next.motionScenes = retimeItems(snapshot.motionScenes, cutMotion);
  if (Array.isArray(snapshot.threeDScenes))
    next.threeDScenes = retimeItems(snapshot.threeDScenes, cutStudio3DScenes);
  if (Array.isArray(snapshot.compositionOrder)) {
    next.compositionOrder = snapshot.compositionOrder.flatMap(id => replacements.get(id) || [id]);
  }
  if (Array.isArray(snapshot.compoundClips)) {
    const expanded = snapshot.compoundClips.map(group => group.kind !== GROUP_KIND ? group : {
      ...group, layerIds: group.layerIds.flatMap(id => replacements.get(id) || [id]),
    });
    next.compoundClips = rippleStudioGroupTiming(removeStudioGroupMembers(expanded, []), from, to);
    const activeGroups = new Set(next.compoundClips.map(group => group.id));
    for (const group of snapshot.compoundClips) {
      if (group.kind === GROUP_KIND && !activeGroups.has(group.id)) replacements.set(group.id, []);
    }
  }
  for (const field of ["motionKeyframes", "speedKeyframes", "finishKeyframes"]) {
    if (!Array.isArray(snapshot[field])) continue;
    next[field] = field === "speedKeyframes" ? retimeKeys(snapshot[field]) :
      rippleStudioAutomation(snapshot[field].filter(key => field !== "motionKeyframes" || !splitRanges.has(key.targetId)), from, to, nextId);
    if (field === "motionKeyframes") next[field] = next[field].filter(key => !splitRanges.has(key.targetId)).flatMap(key => {
      const targets = replacements.get(key.targetId);
      return targets ? targets.map(targetId => targetId === key.targetId ? key : {
        ...key, id: nextId(), targetId,
      }) : [key];
    });
    if (field === "motionKeyframes") for (const [targetId, ranges] of splitRanges) {
      const keys = snapshot[field].filter(key => key.targetId === targetId);
      if (!keys.length) continue;
      for (const range of ranges) next[field].push(...sliceStudioAutomation(keys, { ...range, createId: nextId })
        .map(key => ({ ...key, targetId: range.id, ...(range.id !== targetId ? { id: nextId() } : {}) })));
    }
  }
  for (const field of ["reframeKeyframes", "reframeModeCuts", "speakerFocusCuts"]) {
    if (Array.isArray(snapshot[field])) next[field] = retimeKeys(snapshot[field], true, field === "reframeKeyframes");
  }
  if (snapshot.speakerStackFraming && typeof snapshot.speakerStackFraming === "object") {
    next.speakerStackFraming = { ...snapshot.speakerStackFraming };
    for (const slot of ["top", "bottom", "third", "fourth"]) {
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
        Array.isArray(keys) ? rippleStudioAutomation(keys, from, to, nextId) : keys,
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

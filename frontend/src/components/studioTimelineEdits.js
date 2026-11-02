// Ripple edits use the retained programme clock; captions remain source-timed
// and are remapped separately by mapCaptionSegmentsToTimeline.
import { retainStudioVoiceoverFade } from "./studioAudioFades";

export const rippleTimedItems = (items, from, to, createId, { preserveVoiceFade = false } = {}) => {
  if (!(to > from)) return items;
  const removed = to - from;
  return items.flatMap(item => {
    const start = Number(item.startTime ?? item.start_time);
    const duration = Number(item.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration)) return [item];
    const end = start + duration;
    if (end <= from) return [item];
    if (start >= to) return [{ ...item, startTime: start - removed }];
    const pieces = [];
    if (start < from) pieces.push({ ...item, duration: from - start,
      ...(preserveVoiceFade ? retainStudioVoiceoverFade(item, 0) : {}),
    });
    if (end > to) {
      const skipped = to - start;
      pieces.push({
        ...item,
        id: pieces.length ? createId() : item.id,
        startTime: from,
        duration: end - to,
        ...(item.type === "video"
          ? { sourceStartTime: Number(item.sourceStartTime || 0) + skipped }
          : {}),
        ...(item.trimStart !== undefined || preserveVoiceFade
          ? { trimStart: Number(item.trimStart || 0) + skipped }
          : {}),
        ...(preserveVoiceFade ? retainStudioVoiceoverFade(item, skipped) : {}),
      });
    }
    return pieces;
  });
};

export const rippleTimelineKeys = (keys, from, to, { preserveRightState = false, markCut = true } = {}) => {
  if (!(to > from)) return keys;
  const retained = keys
    .filter(key => Number(key.time) < from || Number(key.time) >= to)
    .map(key => (Number(key.time) >= to ? { ...key, time: Number(key.time) - (to - from) } : key));
  if (!preserveRightState || keys.some(key => Number(key.time) === to)) {
    return retained;
  }
  // A camera direction chosen inside the deleted section can still be live
  // at its right edge. Start the joined shot with that direction immediately.
  const lastRemoved = keys
    .filter(key => Number(key.time) >= from && Number(key.time) < to)
    .sort((left, right) => Number(right.time) - Number(left.time))[0];
  return lastRemoved
    ? [...retained, { ...lastRemoved, time: from, ...(markCut ? { cut: true } : {}) }].sort((left, right) => Number(left.time) - Number(right.time))
    : retained;
};
// Decoder metadata describes the complete source, never the edited occurrence.
export function applyStudioClipMetadata(clip, sourceDuration, fallback = {}) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return clip;
  const start = clip.startRequest ?? fallback.start ?? 0;
  const end = clip.endRequest ?? fallback.end ?? sourceDuration;
  return { ...clip, sourceDuration, startRequest: start, endRequest: end,
    duration: Math.max(0, end - start) };
}

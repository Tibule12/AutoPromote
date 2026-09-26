// Ripple edits use the retained programme clock; captions remain source-timed
// and are remapped separately by mapCaptionSegmentsToTimeline.
export const rippleTimedItems = (items, from, to, createId) => {
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
    if (start < from) pieces.push({ ...item, duration: from - start });
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
        ...(item.trimStart !== undefined
          ? { trimStart: Number(item.trimStart || 0) + skipped }
          : {}),
      });
    }
    return pieces;
  });
};

export const rippleTimelineKeys = (keys, from, to, { preserveRightState = false } = {}) => {
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
    ? [...retained, { ...lastRemoved, time: from, cut: true }].sort((left, right) => Number(left.time) - Number(right.time))
    : retained;
};

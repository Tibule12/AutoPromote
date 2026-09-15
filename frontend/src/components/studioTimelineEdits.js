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

export const rippleTimelineKeys = (keys, from, to) =>
  keys
    .filter(key => Number(key.time) < from || Number(key.time) >= to)
    .map(key => (Number(key.time) >= to ? { ...key, time: Number(key.time) - (to - from) } : key));

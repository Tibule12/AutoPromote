// A moving preview can lower its raster cost; a paused inspection stays exact.
export function studioPreviewScale(fullCost, moving) {
  if (!moving || !(fullCost > 8)) return 1;
  return Math.max(.25, Math.min(1, Math.sqrt(8 / fullCost)));
}

export function studioNextPreviewPaint(started, finished, fps = 30, previousDeadline = started) {
  const interval = 1000 / Math.min(30, Math.max(1, Number(fps) || 30));
  // The paint already consumed its cost. Do not add 150% of that cost again.
  // A slow frame yields briefly to input rather than accumulating clock lag.
  const nextDeadline = previousDeadline > 0 ? previousDeadline + interval : started + interval;
  return Math.max(Math.min(started + interval, nextDeadline), finished + 2);
}

export const STUDIO_PREVIEW_QUALITIES = [
  { value: 'full', label: 'Full detail · 100%' },
  { value: 'auto', label: 'Auto · smoother playback' },
  { value: 'half', label: 'Half · 50%' },
  { value: 'quarter', label: 'Quarter · 25%' },
];

export const normalizeStudioPreviewQuality = value =>
  STUDIO_PREVIEW_QUALITIES.some(option => option.value === value) ? value : 'full';

// Only Auto may trade detail for speed. Inspection always uses full detail.
export function studioPreviewScale(fullCost, moving, quality = 'auto') {
  if (!moving) return 1;
  const selected = normalizeStudioPreviewQuality(quality);
  if (selected !== 'auto') return { full: 1, half: .5, quarter: .25 }[selected];
  if (!moving || !(fullCost > 8)) return 1;
  return Math.max(.25, Math.min(1, Math.sqrt(8 / fullCost)));
}

// Full detail is based on the project raster, not a tiny CSS monitor. Keep
// aspect and bound pathological source/display sizes without creating proxies.
export function studioPreviewDimensions({ width, height, referenceWidth = width,
  pixelRatio = 1, scale = 1, quality = 'full' }) {
  const ratio = Math.max(.01, Number(width) || 1) / Math.max(.01, Number(height) || 1);
  const displayWidth = Math.max(2, Number(width) || 2) * Math.max(1, Math.min(3, Number(pixelRatio) || 1));
  const fullWidth = normalizeStudioPreviewQuality(quality) === 'auto' ? displayWidth
    : Math.max(displayWidth, Number(referenceWidth) || displayWidth);
  const boundedWidth = Math.min(fullWidth, 4096, 4096 * ratio);
  return { width: Math.max(2, Math.round(boundedWidth * scale)),
    height: Math.max(2, Math.round(boundedWidth / ratio * scale)) };
}

// Decoder timestamps identify pictures. Wall-clock callback jitter must not
// discard a 24/25/30fps picture just before a display deadline.
export function studioPreviewFrameDue(sourceTime, deadline) {
  return !Number.isFinite(deadline)||sourceTime>=deadline-.0001;
}
export function studioNextPreviewFrame(sourceTime, fps=30, deadline=sourceTime) {
  const interval=1/Math.min(60,Math.max(1,Number(fps)||30));
  return Math.min(sourceTime+interval,deadline+interval);
}

export function studioNextPreviewPaint(started, finished, fps = 30, previousDeadline = started) {
  const interval = 1000 / Math.min(60, Math.max(1, Number(fps) || 30));
  // The paint already consumed its cost. Do not add 150% of that cost again.
  // A slow frame yields briefly to input rather than accumulating clock lag.
  const nextDeadline = previousDeadline > 0 ? previousDeadline + interval : started + interval;
  return Math.max(Math.min(started + interval, nextDeadline), finished + 2);
}

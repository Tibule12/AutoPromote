// A source-camera cut changes framing on the cut, never with a pan beforehand.
export function interpolateReframeKeyframes(keyframes, time) {
  const ordered = [...(keyframes || [])]
    .filter(keyframe => Number.isFinite(Number(keyframe.time)))
    .sort((left, right) => Number(left.time) - Number(right.time));
  if (!ordered.length) return { x: 50, y: 50 };
  const currentTime = Math.max(0, Number(time || 0));
  if (currentTime <= Number(ordered[0].time)) return ordered[0];
  if (currentTime >= Number(ordered[ordered.length - 1].time)) return ordered[ordered.length - 1];
  const rightIndex = ordered.findIndex(keyframe => Number(keyframe.time) >= currentTime);
  const right = ordered[rightIndex];
  const left = ordered[Math.max(0, rightIndex - 1)];
  if (right.cut === true) return currentTime < Number(right.time) ? left : right;
  const span = Math.max(0.001, Number(right.time) - Number(left.time));
  const progress = Math.max(0, Math.min(1, (currentTime - Number(left.time)) / span));
  return {
    x: Number(left.x) + (Number(right.x) - Number(left.x)) * progress,
    y: Number(left.y) + (Number(right.y) - Number(left.y)) * progress,
  };
}

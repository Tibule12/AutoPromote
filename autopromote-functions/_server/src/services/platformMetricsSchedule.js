// Keep observation windows independent of the first day's reach. A quiet post
// still needs its 48/72-hour samples to make an age-matched comparison possible.
function computeNextAnalyticsCheck(publishedAtMs, nowMs) {
  if (!Number.isFinite(publishedAtMs) || !Number.isFinite(nowMs)) return null;
  const ageMinutes = (nowMs - publishedAtMs) / 60000;
  for (const minutes of [10, 30, 60, 180, 360, 720, 1440, 2880, 4320, 7200, 10080]) {
    if (ageMinutes < minutes) return new Date(publishedAtMs + minutes * 60000).toISOString();
  }
  return null;
}

module.exports = { computeNextAnalyticsCheck };

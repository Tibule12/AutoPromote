// Same half-open coverage policy as viral_render_contract.py. Coverage is an
// audio-activity check, not proof that a transcript contains the correct words.
export const findUncoveredCaptionSpeechRanges = (segments, silences, duration) => {
  const limit = Math.max(0, Number(duration) || 0);
  const covered = [
    ...segments.map(segment => [Math.max(0, Number(segment.start ?? segment.start_time) - .18),
      Math.min(limit, Number(segment.end ?? segment.end_time) + .18)]),
    ...silences.map(interval => [Math.max(0, Number(interval[0])), Math.min(limit, Number(interval[1]))]),
  ].filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of covered) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + .04) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const gaps = [];
  const add = (start, end) => {
    if (end - start >= 1.1) gaps.push({ start: Number(start.toFixed(3)), end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3)) });
  };
  let cursor = 0;
  for (const [start, end] of merged) { add(cursor, start); cursor = Math.max(cursor, end); }
  add(cursor, limit);
  return gaps;
};

export const mapCaptionSilencesToProgramme = (timeline, analyses) => {
  const silences = [];
  let cursor = 0;
  for (const clip of timeline) {
    const start = Number(clip.start_time), end = Number(clip.end_time);
    const sourceId = String(clip.source_clip_id || clip.id);
    for (const interval of analyses.get(sourceId) || []) {
      const from = Math.max(start, Number(interval.start)), to = Math.min(end, Number(interval.end));
      if (to > from) silences.push([cursor + from - start, cursor + to - start]);
    }
    cursor += end - start;
  }
  return { silences, duration: cursor };
};

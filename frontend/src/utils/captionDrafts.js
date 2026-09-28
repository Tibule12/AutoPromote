// A script is a creator-supplied draft, not a speech-recognition result. Keep
// its timing inside the selected source window so preview and export agree.
export const buildTimedScriptDraft = (text, { start = 0, duration = 0 } = {}) => {
  const source = String(text || "").replace(/\r\n?/g, "\n").trim();
  const windowStart = Math.max(0, Number(start) || 0);
  const windowDuration = Math.max(0, Number(duration) || 0);
  if (!source || !windowDuration) return [];
  if (source.length > 20000) throw new Error("Use 20,000 characters or fewer for one caption draft.");

  const lines = [];
  for (const rawLine of source.split("\n")) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    let chunk = [];
    for (const word of words) {
      if (chunk.length && (chunk.length >= 8 || [...chunk, word].join(" ").length > 64)) {
        lines.push(chunk.join(" "));
        chunk = [];
      }
      chunk.push(word);
    }
    if (chunk.length) lines.push(chunk.join(" "));
  }
  if (!lines.length) return [];
  if (lines.length > 240 || lines.length * 0.4 > windowDuration) {
    throw new Error("There are too many lyric lines for this clip. Shorten the text or use a longer clip.");
  }

  const weights = lines.map(line => Math.max(1, line.split(/\s+/).length / 4));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  // A short fragment should not sit on screen for an entire long video.
  const estimatedSpan = weights.reduce((total, weight) => total + Math.min(5, weight * 2), 0);
  const span = lines.length < 5
    ? Math.min(windowDuration, Math.max(lines.length * 0.4, estimatedSpan * 1.5))
    : windowDuration;
  let elapsedWeight = 0;
  return lines.map((line, index) => {
    const lineStart = windowStart + span * elapsedWeight / weightTotal;
    elapsedWeight += weights[index];
    const lineEnd = windowStart + span * elapsedWeight / weightTotal;
    return {
      start: Number(lineStart.toFixed(3)),
      end: Number(lineEnd.toFixed(3)),
      text: line,
    };
  });
};

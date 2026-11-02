// Caption timestamps are in source time. Generating one source must not erase
// another source's track, including manually reviewed lines.
export const captionsForSource = (segments, sourceId, defaultSourceId) =>
  segments.filter(segment => String(segment.sourceClipId || defaultSourceId) === String(sourceId));

export function mergeSourceCaptions(segments, generated, sourceId, defaultSourceId) {
  const belongs = segment => String(segment.sourceClipId || defaultSourceId) === String(sourceId);
  const insertion = segments.findIndex(belongs);
  const result = segments.filter(segment => !belongs(segment));
  const before = insertion < 0 ? result.length : segments.slice(0, insertion).filter(segment => !belongs(segment)).length;
  result.splice(before, 0, ...generated);
  return result;
}

// Recognizers restart cue numbering for each source. Inspector edits and the
// canonical layer graph require one stable identity per generated line.
export const generatedCaptionId = (sourceId, segmentId, index) =>
  `caption:${encodeURIComponent(String(sourceId))}:${index}:${encodeURIComponent(String(segmentId ?? ""))}`;

// Source timestamps overlap between cameras. A bound cue must never select a
// different source merely because it has the same time range. Unbound imported
// subtitles retain the legacy timeline-window behavior.
export const captionForSourceWindow = (segments, sourceId, window) => segments.find(segment =>
  (!segment.sourceClipId || String(segment.sourceClipId) === String(sourceId)) &&
  segment.end > window.start && segment.start < window.end);

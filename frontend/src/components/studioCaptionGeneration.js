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

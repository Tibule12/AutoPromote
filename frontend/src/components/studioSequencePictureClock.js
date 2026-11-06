// Mirrors studio_sequence_video.sequence_picture_window. Programme frames, not
// per-occurrence rounded durations, own the concat budget. No project mutation.
const SEQUENCE_SAMPLER = "studio-sequence-source-frame-v2";
function sequencePictureWindow(
  programmeStart,
  duration,
  programmeDuration,
  sourceStart,
  sourceFps,
  fps
) {
  const first = Math.ceil(programmeStart * fps - 1e-7);
  const end = Math.min(
    Math.round(programmeDuration * fps),
    Math.ceil((programmeStart + duration) * fps - 1e-7)
  );
  const sourceTime = sourceStart + first / fps - programmeStart;
  const sourceFrame = Math.floor(sourceTime * sourceFps + 1e-7);
  const sourceFrameTime = sourceFrame / sourceFps;
  return {
    first,
    frames: Math.max(0, end - first),
    sourceTime,
    sourceFrame,
    phase: sourceFrameTime - sourceTime,
    programmeStart: first / fps,
  };
}
module.exports = { SEQUENCE_SAMPLER, sequencePictureWindow };

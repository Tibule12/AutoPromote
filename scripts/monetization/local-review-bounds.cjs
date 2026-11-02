// Explicitly bounded local four-minute review. Production settings are separate.
const MiB = 1024 * 1024;
function localReviewBounds(env) {
  const longer = env.STUDIO_BACKGROUND_LONG_DEMO === 'true';
  if (longer && (env.STUDIO_BACKGROUND_DEMO !== 'true' || env.NODE_ENV !== 'test' ||
      env.UNIFIED_CREDITS_SANDBOX !== 'true' || env.UNIFIED_CREDITS_PROJECT_ID !== 'demo-autopromote-credits' ||
      !/^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST || '')))
    throw new Error('LONG_REVIEW_REQUIRES_LOOPBACK_DEMO');
  return longer
    ? { longer: true, maxSourceBytes: 512 * MiB, maxArtifactBytes: 512 * MiB,
      renderCpuSeconds: 900, renderTimeoutMs: 900000, fileBytes: 512 * MiB, maxSeconds: 240, maxSourceSeconds: 240 }
    : { longer: false, maxSourceBytes: 50 * MiB, maxArtifactBytes: 20 * MiB,
      renderCpuSeconds: 120, renderTimeoutMs: 120000, fileBytes: 20 * MiB, maxSourceSeconds: 30 };
}
function validateLongReviewRequest(body, endpoint, bounds) {
  if (!bounds.longer || !['/render-viral-clip', '/render-clip'].includes(endpoint)) return false;
  const ranges = body.timeline_segments?.length ? body.timeline_segments : [body];
  const durations = ranges.map(s => Number(s.end_time) - Number(s.start_time));
  if (!durations.length || durations.some(d => !Number.isFinite(d) || d <= 0) ||
      durations.reduce((a, b) => a + b, 0) > bounds.maxSeconds)
    throw new Error('LONG_REVIEW_SOURCE_RANGE_INVALID');
  return true;
}
module.exports = { localReviewBounds, validateLongReviewRequest };

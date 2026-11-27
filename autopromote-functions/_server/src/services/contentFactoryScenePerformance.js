// Scene planning and creative motion acceptance extend the existing Factory.
// They do not create another editor, certify pixels, or replace a real reviewer.
const { digest, error, ID, SHA } = require('./contentFactoryContract');

const SCENE_FIELDS = ['representation', 'before', 'during', 'after', 'camera', 'sound', 'transition'];
const text = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function validateCreativeScene(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene) ||
      Object.keys(scene).some(k => ![...SCENE_FIELDS, 'actions', 'supportingShots', 'vfx'].includes(k)) ||
      SCENE_FIELDS.some(k => !text(scene[k])) || !Array.isArray(scene.actions) ||
      !scene.actions.length || scene.actions.length > 16 ||
      new Set(scene.actions.map(a => a?.id)).size !== scene.actions.length ||
      scene.actions.some(a => !a || Object.keys(a).some(k => !['id', 'kind', 'action'].includes(k)) ||
        !ID.test(a.id || '') || !['human', 'object', 'environment'].includes(a.kind) || !text(a.action, 1000)) ||
      ['supportingShots', 'vfx'].some(k => !Array.isArray(scene[k]) || scene[k].length > 16 || scene[k].some(v => !text(v, 1000))))
    throw error('CONTENT_FACTORY_CREATIVE_SCENE_INVALID');
  return scene;
}

function validateScenePerformanceReview({ scene, artifact, review }) {
  if (!scene) return review; // Older projects retain their stated, narrower contracts.
  validateCreativeScene(scene);
  if (review?.accepted !== true) return review; // A rejection need not claim full playback.
  const motion = review.motionReview;
  if (!motion || motion.scope !== 'full_video' || !SHA.test(artifact?.sha256 || '') ||
      motion.artifactSha256 !== artifact.sha256 || motion.scenePlanHash !== digest(scene) ||
      motion.duration !== artifact.duration || motion.cameraOnly !== false ||
      !Array.isArray(motion.actions) || motion.actions.length !== scene.actions.length)
    throw error('CONTENT_FACTORY_MOTION_REVIEW_REQUIRED', 409,
      'Accepting this scene requires full-video performance review bound to its actual bytes and scene plan.');
  for (const expected of scene.actions) {
    const entries = motion.actions.filter(a => a.id === expected.id);
    const observed = entries[0];
    if (entries.length !== 1 || observed.kind !== expected.kind || observed.independentMotion !== true ||
        !text(observed.observation, 1500) || !Number.isFinite(observed.start) || !Number.isFinite(observed.end) ||
        observed.start < 0 || observed.end <= observed.start || observed.end > artifact.duration ||
        (expected.kind === 'human' && (observed.anatomyStable !== true || observed.identityStable !== true)))
      throw error('CONTENT_FACTORY_SCENE_PERFORMANCE_UNVERIFIED', 409,
        `The full moving take has not established the planned performance: ${expected.id}.`);
  }
  return review;
}

module.exports = { validateCreativeScene, validateScenePerformanceReview, SCENE_FIELDS };

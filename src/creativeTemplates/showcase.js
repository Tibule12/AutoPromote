const { hash, fail, SHA, same, validate, validateRegistry, resolveTemplate, verifiedEvidence } = require('./contract');
const studio = require('../generated/studioDirectorReplayKernel.cjs');
const { verifyArtifact } = require('../modelRuntime/artifacts');

const QUALITY_CHECKS = [
  'professionallyFinished', 'capabilityClearlyDemonstrated', 'transformationClear',
  'publiclyPostable', 'wholeVideoWatched', 'soundReviewed', 'previewFinalParity',
];
const HERO_REQUIREMENTS = [
  'story', 'cinematography', 'generatedVideo', 'motion', 'sound', 'vfx', 'threeD', 'editing', 'brandPayoff',
];
const LIFECYCLE_GATES = [
  'add_use', 'timeline_project', 'meaningful_controls', 'preview', 'interactive_adjustment',
  'combine', 'undo_redo', 'save', 'close_reopen', 'exact_state_recovery', 'render_export', 'preview_final_parity',
];
const CAPABILITY_REQUIREMENTS = {
  image_to_cinematic_scene: ['generate_video'],
  text_behind_subject: ['segment_subject'],
  tracked_graphics: ['track_object'],
  background_replacement: ['segment_subject'],
  object_cleanup_replacement: ['edit_video'],
  generated_humans: ['generate_video', 'generate_speech', 'lip_sync'],
  screenplay_to_scene: ['generate_video'],
};

function validateMedia(media, role) {
  const allowed = role === 'video' ? ['video/mp4'] : role === 'poster'
    ? ['image/webp', 'image/png', 'image/jpeg'] : ['video/mp4', 'image/webp', 'image/png', 'image/jpeg'];
  const suffix = { 'video/mp4': 'mp4', 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[media.mediaType];
  // Public copies are explicit, immutable and same-origin. Never expose a private source or signed URL.
  if (!allowed.includes(media.mediaType) || media.path !== `/showcase/${media.sha256}/${role}.${suffix}`)
    throw fail('SHOWCASE_PUBLIC_MEDIA_INVALID');
}

async function validateRelease(release, { registry, evidenceStore, publicMediaStore, approvedReviewerUids = [] }) {
  validate('showcaseRelease', release);
  const template = resolveTemplate(registry, release.templateRef, { requireQualified: true });
  if (release.categoryIds.some(id => !template.categoryIds.includes(id)))
    throw fail('SHOWCASE_CAPABILITY_NOT_IN_TEMPLATE');
  if (release.categoryIds.some(id => registry.categories.find(category => category.id === id)?.availability !== 'qualified'))
    throw fail('SHOWCASE_CATEGORY_NOT_QUALIFIED');
  if (!evidenceStore?.get || !publicMediaStore?.verify || !approvedReviewerUids.length)
    throw fail('SHOWCASE_TRUSTED_STORES_REQUIRED');

  // These are trusted server-side immutable records, never browser-submitted approval flags.
  const instance = verifiedEvidence(await evidenceStore.get(release.instanceHash), release.instanceHash, 'creative_template_instance');
  const render = verifiedEvidence(await evidenceStore.get(release.renderEvidenceHash), release.renderEvidenceHash, 'studio_render_evidence');
  const review = verifiedEvidence(await evidenceStore.get(release.reviewEvidenceHash), release.reviewEvidenceHash, 'showcase_creative_review');
  const reference = release.templateRef;
  if (!same(instance.templateRef, reference) || !instance.ownerUid || !instance.projectId ||
      !SHA.test(instance.projectHash || '') || !SHA.test(instance.renderRequestHash || '') ||
      instance.compiler !== template.compiler || instance.renderer !== template.renderer)
    throw fail('SHOWCASE_TEMPLATE_PROJECT_MISMATCH');

  const project = verifiedEvidence(await evidenceStore.get(instance.projectEvidenceHash),
    instance.projectEvidenceHash, 'studio_project_evidence');
  studio.validateStudioProjectDocument(project.document);
  if (project.ownerUid !== instance.ownerUid || project.document.projectId !== instance.projectId ||
      hash(project.document) !== instance.projectHash)
    throw fail('SHOWCASE_TEMPLATE_PROJECT_MISMATCH');

  const requiredCapabilities = new Set(release.categoryIds.flatMap(category => CAPABILITY_REQUIREMENTS[category] || []));
  if (release.isHero) requiredCapabilities.add('generate_video');
  const capabilities = new Map();
  for (const artifactHash of instance.modelArtifactHashes || []) {
    if (!SHA.test(artifactHash)) throw fail('SHOWCASE_MODEL_EVIDENCE_REQUIRED');
    const artifact = verifyArtifact(await evidenceStore.get(artifactHash),
      { ownerUid: instance.ownerUid, projectId: instance.projectId });
    if (artifact.artifactHash !== artifactHash || !project.document.analysisRefs?.some(ref => ref.artifactHash === artifactHash) ||
        artifact.provenance?.producer !== 'autopromote-model-capability-runtime' ||
        !evidenceStore.verifyModelExecution || !await evidenceStore.verifyModelExecution(artifact) ||
        !project.document.assets.some(asset => asset.contentHash === artifact.sourceSha256) ||
        (artifact.capability === 'generate_video' &&
          !project.document.assets.some(asset => asset.contentHash === artifact.output.video.sha256)))
      throw fail('SHOWCASE_MODEL_EVIDENCE_REQUIRED');
    capabilities.set(artifact.capability, artifact);
  }
  if ([...requiredCapabilities].some(capability => !capabilities.has(capability)) ||
      (release.categoryIds.includes('image_to_cinematic_scene') &&
        capabilities.get('generate_video')?.parameters.mode !== 'image_to_video'))
    throw fail('SHOWCASE_MODEL_EVIDENCE_REQUIRED');

  if (render.status !== 'completed' || render.ownerUid !== instance.ownerUid || render.projectId !== instance.projectId ||
      render.projectHash !== instance.projectHash || render.requestHash !== instance.renderRequestHash ||
      render.instanceHash !== release.instanceHash || render.renderer !== template.renderer ||
      render.outputSha256 !== release.media.video.sha256 || render.outputBytes !== release.media.video.bytes ||
      !Number.isSafeInteger(render.frameCount) || render.frameCount < 2 ||
      render.decodedFrameCount !== render.frameCount || render.fullDecodeVerified !== true ||
      render.durationTicks !== project.document.outputTimeMap.at(-1)?.outputRange.endTick ||
      !Number.isSafeInteger(render.fpsNumerator) || render.fpsNumerator < 1 ||
      !Number.isSafeInteger(render.fpsDenominator) || render.fpsDenominator < 1 ||
      Math.abs(render.frameCount - render.durationTicks / 90000 * render.fpsNumerator / render.fpsDenominator) > 1)
    throw fail('SHOWCASE_RENDER_NOT_PROVEN');

  if (!approvedReviewerUids.includes(review.reviewerUid) || review.decision !== 'approved' ||
      review.ownerUid !== instance.ownerUid || review.projectId !== instance.projectId ||
      review.instanceHash !== release.instanceHash || review.renderEvidenceHash !== release.renderEvidenceHash ||
      review.outputSha256 !== render.outputSha256 || review.projectHash !== instance.projectHash ||
      !same(review.templateRef, reference) || !Number.isFinite(Date.parse(review.reviewedAt)) ||
      !same(review.mediaHashes, Object.fromEntries(Object.entries(release.media).map(([role, media]) => [role, media.sha256]))) ||
      QUALITY_CHECKS.some(check => review.checks?.[check] !== true) ||
      release.categoryIds.some(category => review.demonstratedCategories?.[category] !== true))
    throw fail('SHOWCASE_CREATIVE_APPROVAL_REQUIRED');

  const lifecycle = instance.studioLifecycle;
  if (lifecycle?.authenticated !== true || lifecycle.ownerUid !== instance.ownerUid ||
      lifecycle.projectHash !== instance.projectHash ||
      LIFECYCLE_GATES.some(gate => lifecycle.gates?.[gate] !== 'VERIFIED') ||
      !SHA.test(lifecycle.evidenceHash || ''))
    throw fail('SHOWCASE_NATIVE_LIFECYCLE_REQUIRED');
  const lifecycleEvidence = verifiedEvidence(await evidenceStore.get(lifecycle.evidenceHash),
    lifecycle.evidenceHash, 'studio_lifecycle_evidence');
  if (lifecycleEvidence.authenticated !== true || lifecycleEvidence.ownerUid !== instance.ownerUid ||
      lifecycleEvidence.projectId !== instance.projectId || lifecycleEvidence.projectHash !== instance.projectHash ||
      !same(lifecycleEvidence.gates, lifecycle.gates))
    throw fail('SHOWCASE_NATIVE_LIFECYCLE_REQUIRED');

  if (release.isHero && (HERO_REQUIREMENTS.some(item => review.heroDemonstrations?.[item] !== true) ||
      review.endCard?.text !== 'Made with AutoPromote.' || review.endCard?.visibleInRenderedOutput !== true))
    throw fail('SHOWCASE_HERO_NOT_PROVEN');

  for (const [role, media] of Object.entries(release.media)) {
    validateMedia(media, role);
    if (!await publicMediaStore.verify(media, { role, ownerUid: instance.ownerUid,
      instanceHash: release.instanceHash, renderEvidenceHash: release.renderEvidenceHash,
      reviewEvidenceHash: release.reviewEvidenceHash }))
      throw fail('SHOWCASE_PUBLIC_COPY_NOT_VERIFIED');
  }

  // Allowlist the public projection. It contains no private owner, project, prompt, source URL or model configuration.
  return { releaseId: release.releaseId, title: release.title, summary: release.summary,
    templateRef: { ...reference }, categoryIds: [...release.categoryIds], isHero: release.isHero,
    media: structuredClone(release.media),
    watchExample: { label: 'WATCH EXAMPLE', videoPath: release.media.video.path },
    makeOneLikeThis: { label: 'MAKE ONE LIKE THIS', workflow: template.workflow,
      templateRef: { ...reference }, showcaseReleaseId: release.releaseId, authenticationRequired: true } };
}

async function buildPublicShowcaseManifest({ registry, catalogue, evidenceStore, publicMediaStore, approvedReviewerUids }) {
  validateRegistry(registry);
  validate('showcaseCatalogue', catalogue);
  if (new Set(catalogue.releases.map(item => item.releaseId)).size !== catalogue.releases.length)
    throw fail('SHOWCASE_DUPLICATE_RELEASE');
  const heroes = catalogue.releases.filter(item => item.isHero);
  if (heroes.length > 1 || (heroes[0]?.releaseId || null) !== catalogue.heroReleaseId)
    throw fail('SHOWCASE_HERO_IDENTITY_INVALID');
  // Fail the whole candidate catalogue on any ineligible release; do not silently publish a partial revision.
  const items = [];
  for (const release of catalogue.releases) items.push(await validateRelease(release,
    { registry, evidenceStore, publicMediaStore, approvedReviewerUids }));
  return { schemaVersion: 1, heroReleaseId: catalogue.heroReleaseId, items };
}

function resolveMakeOneLikeThis({ registry, manifest, releaseId, authenticatedUser, requestedTemplateRef }) {
  if (!authenticatedUser?.uid || typeof authenticatedUser.uid !== 'string')
    throw fail('SHOWCASE_AUTHENTICATION_REQUIRED', 401);
  const item = manifest.items.find(entry => entry.releaseId === releaseId);
  if (!item || !same(item.templateRef, requestedTemplateRef))
    throw fail('SHOWCASE_INTENT_STALE');
  const template = resolveTemplate(registry, item.templateRef, { requireQualified: true });
  // This is a fresh owned workflow intent, never adoption of the public creator's project or media ownership.
  return { workflow: template.workflow, ownerUid: authenticatedUser.uid,
    templateRef: { ...item.templateRef }, showcaseReleaseId: releaseId,
    requiresOwnInputs: true, requiresProjectCreation: true, startsModelJob: false };
}

module.exports = { QUALITY_CHECKS, HERO_REQUIREMENTS, LIFECYCLE_GATES,
  validateRelease, buildPublicShowcaseManifest, resolveMakeOneLikeThis };

// CPU policy fixtures only. No fixture is a real movie, customer lifecycle or creative approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const studio = require('../../src/generated/studioDirectorReplayKernel.cjs');
const configuredRegistry = require('../../config/creative-templates/registry.v1.json');
const configuredCatalogue = require('../../config/creative-templates/showcase.v1.json');
const { hash, referenceFor, validateRegistry } = require('../../src/creativeTemplates/contract');
const { QUALITY_CHECKS, HERO_REQUIREMENTS, LIFECYCLE_GATES, buildPublicShowcaseManifest,
  resolveMakeOneLikeThis } = require('../../src/creativeTemplates/showcase');

function fixture({ hero = false, category = 'product_launch', model = false } = {}) {
  const registry = structuredClone(configuredRegistry);
  const template = registry.templates[0];
  template.status = 'qualified';
  template.durationTicks = model ? 453750 : 270000;
  template.categoryIds = [category];
  template.qualification = { studioLifecycle: 'verified', directorInstantiation: 'verified',
    creativeQuality: 'approved', previewFinalParity: 'verified' };
  registry.categories.find(item => item.id === category).availability = 'qualified';
  const templateRef = referenceFor(template);
  const video = Buffer.from('CPU policy fixture; this is not a movie');
  const poster = Buffer.from('CPU policy fixture; not a poster');
  const before = Buffer.from('CPU policy fixture; not a source image');
  const media = Object.fromEntries([['video', video, 'mp4', 'video/mp4'],
    ['poster', poster, 'webp', 'image/webp'], ['before', before, 'png', 'image/png']]
    .map(([role, bytes, suffix, mediaType]) => [role,
      { path: `/showcase/${hash(bytes)}/${role}.${suffix}`, sha256: hash(bytes), bytes: bytes.length, mediaType }]));
  const sourceHash = 'a'.repeat(64), generatedHash = 'b'.repeat(64);
  const snapshot = { timeline: [{ id: 'clip', sourceClipId: 'source', startRequest: 0, endRequest: 3,
    duration: 3, contentHash: sourceHash, storagePath: 'studio/sources/owner/source.mp4' }],
    projectMedia: [{ id: 'source', name: 'CPU source fixture', type: 'video', duration: 3,
      contentHash: sourceHash, storagePath: 'studio/sources/owner/source.mp4' }],
    orderedClips: [], analysisRefs: [], reframeAspect: '16:9',
    exportSettings: { resolution: '1080p', fps: 24, codec: 'h264', audioCodec: 'aac' } };
  const records = new Map();
  const put = record => { const key = hash(record); records.set(key, structuredClone(record)); return key; };
  let artifact;
  if (model) {
    const core = { schemaVersion: 1, status: 'completed', ownerUid: 'owner', projectId: 'project',
      sourceSha256: sourceHash, capability: 'generate_video', parameters: { mode: 'image_to_video' },
      provenance: { executionKind: 'synthetic_contract_fixture', producer: 'autopromote-model-capability-runtime' },
      output: { video: { name: 'generated_shot.mp4', sha256: generatedHash, bytes: 12, mediaType: 'video/mp4' },
        width: 1280, height: 704, fpsNumerator: 24, fpsDenominator: 1, frameCount: 49,
        durationTicks: 183750, origin: 'generated_illustration', reviewRequired: true, confidence: null } };
    artifact = { ...core, artifactHash: hash(core) };
    records.set(artifact.artifactHash, artifact);
    snapshot.projectMedia.push({ id: 'generated', name: 'CPU generated fixture', type: 'video',
      duration: 183750 / 90000, contentHash: generatedHash, storagePath: 'studio/sources/owner/generated.mp4' });
    snapshot.timeline.push({ id: 'generated-clip', sourceClipId: 'generated', startRequest: 0,
      endRequest: 49 / 24, duration: 49 / 24, contentHash: generatedHash,
      storagePath: 'studio/sources/owner/generated.mp4' });
    snapshot.analysisRefs.push(studio.createModelArtifactReference({ kind: 'model_capability', schemaVersion: 1,
      artifactHash: artifact.artifactHash, sourceAssetId: 'source', sourceContentHash: sourceHash,
      capability: 'generate_video', sourceRange: { space: 'source', startTick: 0, endTick: 270000 } }));
  }
  const document = studio.adaptStudioSnapshotToDocument({ snapshot, projectId: 'project' });
  const project = { kind: 'studio_project_evidence', ownerUid: 'owner', document };
  const gates = Object.fromEntries(LIFECYCLE_GATES.map(gate => [gate, 'VERIFIED']));
  const lifecycleEvidence = { kind: 'studio_lifecycle_evidence', authenticated: true, ownerUid: 'owner',
    projectId: 'project', projectHash: hash(document), gates };
  const instance = { kind: 'creative_template_instance', templateRef, ownerUid: 'owner', projectId: 'project',
    projectHash: hash(document), renderRequestHash: 'c'.repeat(64), compiler: template.compiler,
    renderer: template.renderer, modelArtifactHashes: artifact ? [artifact.artifactHash] : [],
    studioLifecycle: { authenticated: true, ownerUid: 'owner', projectHash: hash(document), gates } };
  const render = { kind: 'studio_render_evidence', ownerUid: 'owner', projectId: 'project', status: 'completed',
    projectHash: hash(document), requestHash: instance.renderRequestHash, renderer: template.renderer,
    outputSha256: media.video.sha256, outputBytes: media.video.bytes, frameCount: model ? 121 : 72,
    decodedFrameCount: model ? 121 : 72, fullDecodeVerified: true,
    durationTicks: template.durationTicks, fpsNumerator: 24, fpsDenominator: 1 };
  const review = { kind: 'showcase_creative_review', reviewerUid: 'approved-reviewer', decision: 'approved',
    ownerUid: 'owner', projectId: 'project', projectHash: hash(document), templateRef,
    outputSha256: media.video.sha256, reviewedAt: '2026-10-09T18:00:00Z',
    checks: Object.fromEntries(QUALITY_CHECKS.map(check => [check, true])),
    mediaHashes: Object.fromEntries(Object.entries(media).map(([role, item]) => [role, item.sha256])),
    demonstratedCategories: { [category]: true },
    heroDemonstrations: Object.fromEntries(HERO_REQUIREMENTS.map(check => [check, true])),
    endCard: { text: 'Made with AutoPromote.', visibleInRenderedOutput: true },
    privatePrompt: 'must never appear in the public manifest' };
  const release = { schemaVersion: 1, releaseId: 'fixture-release', title: 'CPU policy fixture',
    summary: 'This fixture is not a product demonstration.', templateRef, categoryIds: [category],
    isHero: hero, media };
  function seal() {
    instance.projectEvidenceHash = put(project);
    instance.studioLifecycle.evidenceHash = put(lifecycleEvidence);
    release.instanceHash = put(instance);
    render.instanceHash = release.instanceHash;
    release.renderEvidenceHash = put(render);
    review.instanceHash = release.instanceHash;
    review.renderEvidenceHash = release.renderEvidenceHash;
    release.reviewEvidenceHash = put(review);
  }
  seal();
  const catalogue = { schemaVersion: 1, heroReleaseId: hero ? release.releaseId : null, releases: [release] };
  const verificationCalls = [];
  const args = { registry, catalogue, approvedReviewerUids: ['approved-reviewer'],
    evidenceStore: { get: async key => records.get(key), verifyModelExecution: async () => true },
    publicMediaStore: { verify: async (item, scope) => {
      verificationCalls.push({ item, scope });
      return Object.values(media).some(entry => hash(entry) === hash(item)) && scope.ownerUid === 'owner';
    } } };
  return { args, registry, catalogue, template, instance, project, lifecycleEvidence,
    render, review, release, records, seal, verificationCalls };
}

test('configured registry includes all eighteen planned categories and publishes no unapproved demos', async () => {
  validateRegistry(configuredRegistry);
  assert.equal(configuredRegistry.categories.length, 18);
  assert.ok(configuredRegistry.categories.every(item => item.availability === 'planned'));
  assert.equal(configuredRegistry.templates[0].status, 'draft');
  const manifest = await buildPublicShowcaseManifest({ registry: configuredRegistry, catalogue: configuredCatalogue });
  assert.deepEqual(manifest, { schemaVersion: 1, heroReleaseId: null, items: [] });
});

test('public projection retains exact template identity and both CTA contracts without leaking private evidence', async () => {
  const f = fixture();
  const manifest = await buildPublicShowcaseManifest(f.args);
  const item = manifest.items[0];
  assert.deepEqual(item.templateRef, f.release.templateRef);
  assert.equal(item.watchExample.label, 'WATCH EXAMPLE');
  assert.equal(item.makeOneLikeThis.label, 'MAKE ONE LIKE THIS');
  assert.equal(item.makeOneLikeThis.authenticationRequired, true);
  assert.equal(f.verificationCalls.length, 3);
  assert.doesNotMatch(JSON.stringify(manifest), /ownerUid|privatePrompt|renderRequestHash|instanceHash|checkpoint|projectHash/);
});

test('a draft or unqualified template cannot supply a public demo', async () => {
  for (const field of ['studioLifecycle', 'directorInstantiation', 'creativeQuality', 'previewFinalParity']) {
    const f = fixture(); f.template.qualification[field] = field === 'creativeQuality' ? 'unapproved' : 'unverified';
    f.release.templateRef = referenceFor(f.template);
    await assert.rejects(buildPublicShowcaseManifest(f.args), /NOT_QUALIFIED/);
  }
});

test('template replacement cannot silently change a pinned showcase or redirect to another version', async () => {
  const f = fixture(); f.template.durationTicks++;
  await assert.rejects(buildPublicShowcaseManifest(f.args), /VERSION_UNAVAILABLE/);
});

test('a render hash cannot be reused for another template project or request', async () => {
  for (const [field, value] of [['projectId', 'other-project'], ['ownerUid', 'other-owner'],
    ['projectHash', 'd'.repeat(64)], ['requestHash', 'd'.repeat(64)], ['instanceHash', 'd'.repeat(64)]]) {
    const f = fixture(); f.render[field] = value; f.seal();
    if (field === 'instanceHash') {
      f.render[field] = value;
      f.release.renderEvidenceHash = hash(f.render); f.records.set(hash(f.render), f.render);
    }
    await assert.rejects(buildPublicShowcaseManifest(f.args), /RENDER_NOT_PROVEN/);
  }
});

test('partial decode and merely successful render status do not qualify a showcase', async () => {
  for (const [field, value] of [['decodedFrameCount', 71], ['fullDecodeVerified', false], ['status', 'running']]) {
    const f = fixture(); f.render[field] = value; f.seal();
    await assert.rejects(buildPublicShowcaseManifest(f.args), /RENDER_NOT_PROVEN/);
  }
});

test('every creative check and demonstrated category requires explicit approval of the exact bytes', async () => {
  for (const check of QUALITY_CHECKS) {
    const f = fixture(); f.review.checks[check] = false; f.seal();
    await assert.rejects(buildPublicShowcaseManifest(f.args), /CREATIVE_APPROVAL_REQUIRED/);
  }
  const f = fixture(); f.review.demonstratedCategories.product_launch = false; f.seal();
  await assert.rejects(buildPublicShowcaseManifest(f.args), /CREATIVE_APPROVAL_REQUIRED/);
});

test('rejected work or an untrusted reviewer cannot become public', async () => {
  for (const [field, value] of [['decision', 'rejected'], ['reviewerUid', 'unapproved-reviewer']]) {
    const f = fixture(); f.review[field] = value; f.seal();
    await assert.rejects(buildPublicShowcaseManifest(f.args), /CREATIVE_APPROVAL_REQUIRED/);
  }
});

test('changed before/poster/video files invalidate prior creative approval', async () => {
  for (const role of ['before', 'poster', 'video']) {
    const f = fixture(); f.release.media[role].sha256 = 'e'.repeat(64);
    await assert.rejects(buildPublicShowcaseManifest(f.args), /RENDER_NOT_PROVEN|CREATIVE_APPROVAL_REQUIRED/);
  }
});

test('signed-out, incomplete or unrelated lifecycle evidence cannot qualify a template', async () => {
  const signedOut = fixture(); signedOut.instance.studioLifecycle.authenticated = false; signedOut.seal();
  await assert.rejects(buildPublicShowcaseManifest(signedOut.args), /NATIVE_LIFECYCLE_REQUIRED/);
  for (const gate of LIFECYCLE_GATES) {
    const f = fixture(); f.instance.studioLifecycle.gates[gate] = 'UNVERIFIED'; f.seal();
    await assert.rejects(buildPublicShowcaseManifest(f.args), /NATIVE_LIFECYCLE_REQUIRED/);
  }
  const f = fixture(); f.lifecycleEvidence.projectId = 'unrelated-project'; f.seal();
  await assert.rejects(buildPublicShowcaseManifest(f.args), /NATIVE_LIFECYCLE_REQUIRED/);
});

test('private/signed media URLs and unverified public copies are rejected', async () => {
  const f = fixture(); f.release.media.video.path = 'https://storage.googleapis.com/private?token=secret';
  await assert.rejects(buildPublicShowcaseManifest(f.args), /PUBLIC_MEDIA_INVALID/);
  const p = fixture(); p.args.publicMediaStore.verify = async () => false;
  await assert.rejects(buildPublicShowcaseManifest(p.args), /PUBLIC_COPY_NOT_VERIFIED/);
});

test('unbacked model claims and text-to-video presented as image-to-video are rejected', async () => {
  const f = fixture({ category: 'image_to_cinematic_scene' });
  await assert.rejects(buildPublicShowcaseManifest(f.args), /MODEL_EVIDENCE_REQUIRED/);
  const p = fixture({ category: 'image_to_cinematic_scene', model: true });
  const oldHash = p.instance.modelArtifactHashes[0], artifact = structuredClone(p.records.get(oldHash));
  artifact.parameters.mode = 'text_to_video';
  const { artifactHash, ...core } = artifact;
  artifact.artifactHash = hash(core); p.records.set(artifact.artifactHash, artifact);
  p.instance.modelArtifactHashes = [artifact.artifactHash];
  p.project.document.analysisRefs[0].artifactHash = artifact.artifactHash;
  p.instance.projectHash = hash(p.project.document);
  p.seal();
  await assert.rejects(buildPublicShowcaseManifest(p.args), /MODEL_EVIDENCE_REQUIRED/);
});

test('hero requires backed generated footage, all creative demonstrations and the rendered brand payoff', async () => {
  const noModel = fixture({ hero: true });
  await assert.rejects(buildPublicShowcaseManifest(noModel.args), /MODEL_EVIDENCE_REQUIRED/);
  const valid = fixture({ hero: true, model: true });
  assert.equal((await buildPublicShowcaseManifest(valid.args)).heroReleaseId, valid.release.releaseId);
  for (const item of HERO_REQUIREMENTS) {
    const f = fixture({ hero: true, model: true }); f.review.heroDemonstrations[item] = false; f.seal();
    await assert.rejects(buildPublicShowcaseManifest(f.args), /HERO_NOT_PROVEN/);
  }
  const f = fixture({ hero: true, model: true }); f.review.endCard.visibleInRenderedOutput = false; f.seal();
  await assert.rejects(buildPublicShowcaseManifest(f.args), /HERO_NOT_PROVEN/);
});

test('an artifact hash alone cannot replace authoritative model execution attestation', async () => {
  const f = fixture({ hero: true, model: true });
  f.args.evidenceStore.verifyModelExecution = async () => false;
  await assert.rejects(buildPublicShowcaseManifest(f.args), /MODEL_EVIDENCE_REQUIRED/);
});

test('actual render clock, category qualification and reviewer allowlist are mandatory', async () => {
  const clock = fixture(); clock.render.durationTicks++; clock.seal();
  await assert.rejects(buildPublicShowcaseManifest(clock.args), /RENDER_NOT_PROVEN/);
  const category = fixture(); category.registry.categories.find(item => item.id === 'product_launch').availability = 'planned';
  await assert.rejects(buildPublicShowcaseManifest(category.args), /CATEGORY_NOT_QUALIFIED/);
  const reviewer = fixture(); reviewer.args.approvedReviewerUids = [];
  await assert.rejects(buildPublicShowcaseManifest(reviewer.args), /TRUSTED_STORES_REQUIRED/);
});

test('make-one intent requires authentication and the exact approved reference, and creates no GPU job or owner transfer', async () => {
  const f = fixture(); const manifest = await buildPublicShowcaseManifest(f.args);
  const args = { registry: f.registry, manifest, releaseId: f.release.releaseId,
    requestedTemplateRef: f.release.templateRef, authenticatedUser: { uid: 'new-customer' } };
  assert.throws(() => resolveMakeOneLikeThis({ ...args, authenticatedUser: null }), /AUTHENTICATION_REQUIRED/);
  assert.throws(() => resolveMakeOneLikeThis({ ...args,
    requestedTemplateRef: { ...f.release.templateRef, version: '2.0.0' } }), /INTENT_STALE/);
  const intent = resolveMakeOneLikeThis(args);
  assert.equal(intent.ownerUid, 'new-customer');
  assert.equal(intent.requiresOwnInputs, true);
  assert.equal(intent.requiresProjectCreation, true);
  assert.equal(intent.startsModelJob, false);
  assert.equal(intent.projectId, undefined);
});

test('duplicate identities, dangling heroes and mismatched evidence abort a catalogue revision', async () => {
  const f = fixture(); f.catalogue.releases.push({ ...f.release, title: 'same id, different title' });
  await assert.rejects(buildPublicShowcaseManifest(f.args), /DUPLICATE_RELEASE/);
  const h = fixture(); h.catalogue.heroReleaseId = h.release.releaseId;
  await assert.rejects(buildPublicShowcaseManifest(h.args), /HERO_IDENTITY_INVALID/);
  const e = fixture(); e.records.get(e.release.renderEvidenceHash).frameCount++;
  await assert.rejects(buildPublicShowcaseManifest(e.args), /EVIDENCE_CHANGED/);
});

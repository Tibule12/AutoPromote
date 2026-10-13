const test = require('node:test');
const assert = require('node:assert/strict');
const studio = require('../../src/generated/studioDirectorReplayKernel.cjs');
const { instantiateTemplate, instantiateDirectorTemplate, launchTemplateReference } = require('../../src/creativeTemplates/instantiate');
const { hash } = require('../../src/creativeTemplates/contract');
const registry = require('../../config/creative-templates/registry.v1.json');
const owned = (id, type) => ({ id, mediaType: type, ownerUid: 'customer-a',
  url: `https://media.invalid/${id}`, storagePath: `uploads/${type}s/customer-a/${id}`,
  contentHash: hash(id), duration: 30 });
const bindings = () => ({ logo: owned('logo', 'image'), music: owned('music', 'audio'),
  hookFootage: owned('hook', 'video'), productFootage: owned('product', 'video'), detailFootage: owned('detail', 'video'),
  brandColour: '#ffb15a', headline: 'RAISE\nTHE RITUAL', featureOne: 'Precision.\nEvery pour.',
  featureTwo: 'Crafted for\nyour everyday.', callToAction: 'Discover the collection' });
const args = () => ({ templateRef: launchTemplateReference(), authenticatedUser: { uid: 'customer-a' },
  projectId: 'customer-a-launch', bindings: bindings() });

test('registry and browser execute the exact same authored definition', () => {
  assert.equal(hash(studio.PRODUCT_LAUNCH_TEMPLATE), hash(registry.templates[0]));
});
test('native project compiles 20 seconds and survives canonical projection without transport identity', async () => {
  const result = await instantiateTemplate(args());
  assert.equal(result.document.outputTimeMap.at(-1).outputRange.endTick, 1800000);
  assert(result.document.assets.every(a => a.identityState === 'hash_verified'));
  const projected = studio.projectStudioEditableStateToSnapshot(result.document, result.snapshot);
  const restored = studio.adaptStudioSnapshotToDocument({ snapshot: projected,
    projectId: result.projectId, previousDocument: result.document });
  assert.equal(hash(restored), result.documentHash);
  assert.deepEqual(projected.creativeTemplateInstance.templateRef, launchTemplateReference());
  assert.equal(studio.compileStudioCompositionForRender(restored).layers.find(l => l.id.endsWith(':hook-line-1')).motion_keyframes[1].easing, 'bezier');
  assert.equal(studio.compileStudioTimelineForRender(restored).at(-1).transition_in, 'soft_dip');
  const workerLayers = studio.compileStudioOverlaysForRender(restored, projected);
  assert.equal(workerLayers.find(layer => layer.name === 'feature-1').start_time, 8.25);
  assert.equal(workerLayers.find(layer => layer.name === 'cta').start_time, 17);
});
test('fresh distinct bindings create distinct projects through the same pinned definition', async () => {
  const refs = [];
  for (const [index, text] of ['RAISE\nTHE RITUAL', 'OWN\nTHE ROAD', 'FEEL\nEVERY NOTE'].entries()) {
    const options = args(); options.projectId += index; options.bindings.headline = text;
    options.bindings.logo = owned(`logo-${index}`, 'image');
    options.bindings.productFootage = owned(`footage-${index}`, 'video');
    const result = await instantiateTemplate(options); refs.push(result.templateRef);
    assert.equal(result.document.layers.find(l => l.layerId.endsWith(':hook-line-2')).parameters.text, text.split('\n')[1]);
    assert.equal(result.document.clipOccurrences[2].assetId.includes(`footage-${index}`), true);
  }
  assert(refs.every(ref => hash(ref) === hash(refs[0])));
});
test('Director returns the same native edit, retaining its actor only in metadata', async () => {
  const options = args(); const manual = await instantiateTemplate(options);
  const director = await instantiateDirectorTemplate({ ...options, selection: { templateRef: options.templateRef } });
  assert.deepEqual(director.document.clipOccurrences, manual.document.clipOccurrences);
  assert.deepEqual(director.document.layers, manual.document.layers);
  assert.equal(director.snapshot.creativeTemplateInstance.instantiatedBy, 'director');
  assert.equal(director.startsModelJob, false);
  assert(director.sourceEvidence.every(asset => /^[a-f0-9]{64}$/.test(asset.contentHash)));
});
for (const [name, mutate, code] of [
  ['anonymous', a => { a.authenticatedUser = null; }, 'TEMPLATE_AUTH_REQUIRED'],
  ['foreign media', a => { a.bindings.logo.ownerUid = 'customer-b'; }, 'TEMPLATE_OWNED_MEDIA_REQUIRED'],
  ['changed definition hash', a => { a.templateRef.definitionHash = hash('changed'); }, 'CREATIVE_TEMPLATE_VERSION_UNAVAILABLE'],
  ['short footage', a => { a.bindings.productFootage.duration = 1; }, 'TEMPLATE_FOOTAGE_TOO_SHORT'],
  ['long copy', a => { a.bindings.headline = 'A very long headline which cannot fit\nSecond line'; }, 'TEMPLATE_COPY_TOO_LONG'],
]) test(`reject ${name} before creating any project or job`, async () => {
  const options = args(); mutate(options); await assert.rejects(instantiateTemplate(options), { code });
});

test('cycling uses a separately pinned definition in the same editable graph and Director adapter', async () => {
  const template = registry.templates.find(t => t.templateId === 'cycling_rhythm_v1' && t.version === '1.0.2');
  const templateRef = require('../../src/creativeTemplates/contract').referenceFor(template);
  const options = { ...args(), templateRef, aspect: '9:16' };
  options.bindings.hookFootage.duration = 5.046708;
  options.bindings.productFootage.duration = 10;
  options.bindings.detailFootage.duration = 7.424083;
  const result = await instantiateTemplate(options);
  const director = await instantiateDirectorTemplate({ ...options, selection: { templateRef } });
  assert.equal(result.document.outputTimeMap.at(-1).outputRange.endTick, 1800000);
  assert.equal(result.snapshot.timeline.length, 13);
  assert.equal(result.snapshot.reframeAspect, '9:16');
  assert.equal(result.snapshot.smartCrop, true);
  assert(result.snapshot.reframeKeyframes.some(k => k.cut && k.x !== 50));
  assert(result.snapshot.reframeKeyframes.every(k => k.origin === 'manual')); 
  assert.deepEqual(result.document.clipOccurrences, director.document.clipOccurrences);
  assert.equal(director.startsModelJob, false);
  const finish = studio.compileStudioFinishForRender(result.document, result.snapshot);
  assert.equal(finish.motion.scale_keyframes.length, 13);
  assert(finish.motion.scale_keyframes.every(k => k.easing === 'hold'));
  const projected = studio.projectStudioEditableStateToSnapshot(result.document, result.snapshot);
  assert.equal(hash(studio.adaptStudioSnapshotToDocument({ snapshot: projected,
    projectId: result.projectId, previousDocument: result.document })), result.documentHash);
});

test('cycling refuses a mutated definition even when the caller supplies its matching new hash', async () => {
  const template = structuredClone(registry.templates.find(t => t.templateId === 'cycling_rhythm_v1'));
  template.executionDefinition.sequence[0].offset = 999;
  await assert.rejects(studio.instantiateStudioCreativeTemplate({ template,
    templateRef: {templateId:template.templateId,version:template.version,definitionHash:hash(template)},
    ownerUid:'customer-a',projectId:'cycling-mutated',bindings:bindings(),aspect:'9:16' }),
  { code: 'TEMPLATE_IDENTITY_MISMATCH' });
});

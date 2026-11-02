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

test('set-reveal template reuses the exact source matte and gives Director the same editable transformation',async()=>{
  const template=registry.templates.find(t=>t.templateId==='podcast_set_reveal_v1');
  const templateRef=require('../../src/creativeTemplates/contract').referenceFor(template);
  const bound=bindings();for(const key of ['logo','productFootage','detailFootage'])delete bound[key];
  bound.background=owned('room','image');bound.revealSound=owned('whoosh','audio');bound.impactSound=owned('hit','audio');
  const subjectScenes=[{enabled:true,modelArtifactRef:{kind:'model_capability',schemaVersion:1,artifactHash:'b'.repeat(64),
    sourceAssetId:bound.hookFootage.id,sourceContentHash:bound.hookFootage.contentHash,capability:'segment_subject',
    sourceRange:{space:'source',startTick:0,endTick:540000}},
    scene:{version:1,id:'subject',sourceId:bound.hookFootage.id,sourceStoragePath:bound.hookFootage.storagePath,
      sourceRange:{start:0,end:6},prompt:{points:[[.3,.3]],labels:[1],shotPrompts:[]},effects:[]}}];
  const options={...args(),templateRef,bindings:bound,subjectScenes};
  const manual=await instantiateTemplate(options),director=await instantiateDirectorTemplate({...options,selection:{templateRef}});
  assert.deepEqual(manual.snapshot.subjectVfxScenes,director.snapshot.subjectVfxScenes);
  assert.equal(director.startsModelJob,false);
  assert.equal(manual.snapshot.subjectVfxScenes[0].modelArtifactRef.artifactHash,'b'.repeat(64));
  assert.equal(manual.snapshot.subjectVfxScenes[0].scene.effects.find(e=>e.type==='background_replace').reveal_seconds,.58);
  assert.equal(manual.snapshot.subjectVfxScenes[0].scene.effects.filter(e=>e.type==='kinetic_type').length,2);
  assert.equal(manual.snapshot.muteOriginalAudio,false);
  assert.equal(manual.snapshot.soundEffects.length,3);
  assert(manual.document.assets.some(a=>a.sourceId==='room'));
  assert.equal(manual.document.outputTimeMap.at(-1).outputRange.endTick,540000);
  assert.deepEqual(studio.projectStudioEditableStateToSnapshot(manual.document,manual.snapshot).subjectVfxScenes[0].scene,
    manual.snapshot.subjectVfxScenes[0].scene);
  const wrong=structuredClone(subjectScenes);wrong[0].modelArtifactRef.sourceContentHash='a'.repeat(64);
  await assert.rejects(instantiateTemplate({...options,subjectScenes:wrong}),{code:'TEMPLATE_MASK_REQUIRED'});
  await assert.rejects(instantiateTemplate({...options,subjectScenes:[]}),{code:'TEMPLATE_MASK_REQUIRED'});
});

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

test('editorial launch adapts distinct brands and optional owned sound through the same Director/native graph', async () => {
  const template = registry.templates.find(t => t.templateId === 'product_launch_cinematic_v1' && t.version === '1.1.2');
  const templateRef = require('../../src/creativeTemplates/contract').referenceFor(template);
  for (const [index, headline] of ['CRAFT.\nNOT ROUTINE.', 'FEEL.\nEVERY FREQUENCY.'].entries()) {
    const options = { ...args(), templateRef, projectId: `editorial-${index}` };
    options.bindings.headline = headline;
    if (index) {
      options.bindings.transitionSfx = owned('custom-sweep', 'audio');
      options.bindings.revealSfx = owned('custom-reveal', 'audio');
    }
    const manual = await instantiateTemplate(options);
    const director = await instantiateDirectorTemplate({ ...options, selection: { templateRef } });
    assert.deepEqual(director.document.clipOccurrences, manual.document.clipOccurrences);
    assert.deepEqual(director.document.layers, manual.document.layers);
    assert.equal(manual.document.outputTimeMap.at(-1).outputRange.endTick, 1800000);
    assert.equal(manual.snapshot.overlays.find(l => l.name === 'hook-line-1').text, headline.split('\n')[0]);
    assert.equal(manual.snapshot.smartCrop, true);
    assert.equal(manual.snapshot.smartCropMode, 'speaker_track');
    assert.equal(manual.snapshot.reframeKeyframes[0].x, 50);
    const finish = studio.compileStudioFinishForRender(manual.document, manual.snapshot);
    assert(finish.motion.keyframes.some(k => k.property === 'opacity' && k.value === .17));
    assert(finish.motion.keyframes.some(k => k.property === 'scale' && k.value === 1.085));
    const sampled = manual.snapshot.soundEffects.filter(c => !c.builtIn);
    assert.equal(sampled.length, index ? 4 : 0);
    assert(sampled.every(c => c.sourceStoragePath.startsWith('uploads/audios/customer-a/')));
    assert.deepEqual(manual.snapshot.creativeTemplateInstance.templateRef, templateRef);
    const projected = studio.projectStudioEditableStateToSnapshot(manual.document, manual.snapshot);
    assert.equal(hash(studio.adaptStudioSnapshotToDocument({ snapshot: projected,
      projectId: manual.projectId, previousDocument: manual.document })), manual.documentHash);
  }
});

test('momentum trailer keeps action, replacement copy and optional sound editable in the shared project', async () => {
  const template = registry.templates.find(t => t.templateId === 'brand_trailer_momentum_v1' && t.version === '1.0.1');
  const templateRef = require('../../src/creativeTemplates/contract').referenceFor(template);
  const options = { ...args(), templateRef, aspect: '9:16' };
  options.bindings.headline = 'GET OUT.\nGO FURTHER.';
  options.bindings.hookFootage.duration = 5.046708;
  options.bindings.productFootage.duration = 10;
  options.bindings.detailFootage.duration = 7.424083;
  options.bindings.transitionSfx = owned('trailer-sweep', 'audio');
  options.bindings.revealSfx = owned('trailer-impact', 'audio');
  options.bindings.accentSfx = owned('trailer-accent', 'audio');
  const manual = await instantiateTemplate(options);
  const director = await instantiateDirectorTemplate({ ...options, selection: { templateRef } });
  assert.deepEqual(director.document.clipOccurrences, manual.document.clipOccurrences);
  assert.deepEqual(director.document.layers, manual.document.layers);
  assert.equal(manual.document.outputTimeMap.at(-1).outputRange.endTick, 1800000);
  assert.equal(manual.snapshot.timeline.length, 13);
  assert(manual.snapshot.timeline.every(c => c.transitionIn === 'clean_cut'));
  assert.equal(manual.snapshot.soundEffects.filter(c => !c.builtIn).length, 5);
  assert.equal(manual.snapshot.soundEffects.find(c => c.sourceMediaId === 'trailer-accent').trimStart, .15);
  assert(manual.snapshot.reframeKeyframes.every(k => k.origin === 'manual'));
  assert.equal(director.startsModelJob, false);
  assert.match(director.selectionReason, /Brand-trailer/);
  const projected = studio.projectStudioEditableStateToSnapshot(manual.document, manual.snapshot);
  assert.equal(hash(studio.adaptStudioSnapshotToDocument({ snapshot: projected,
    projectId: manual.projectId, previousDocument: manual.document })), manual.documentHash);
  const replacement = await instantiateTemplate({ ...options, projectId: 'fresh-brand-trailer',
    bindings: { ...options.bindings, headline: 'BREAK OUT.\nSTAY CURIOUS.',
      logo: owned('replacement-logo', 'image'), detailFootage: owned('replacement-action', 'video') } });
  assert.equal(replacement.snapshot.overlays.find(l => l.name === 'hook-line-2').text, 'STAY CURIOUS.');
  assert(replacement.document.assets.some(a => a.assetId.includes('replacement-action')));
  assert.deepEqual(replacement.templateRef, templateRef);
});

test('podcast binds real speech separately while Director preserves the same picture and audio clock', async () => {
  const template = registry.templates.find(t => t.templateId === 'podcast_story_hook_v1' && t.version === '1.0.1');
  const templateRef = require('../../src/creativeTemplates/contract').referenceFor(template);
  const bound = bindings();
  for (const key of ['logo', 'productFootage', 'detailFootage']) delete bound[key];
  bound.headline = 'UNMUTED\nPODCAST'; bound.speech = owned('real-speech', 'audio');
  const options = { ...args(), templateRef, aspect: '9:16', bindings: bound };
  const manual = await instantiateTemplate(options);
  const director = await instantiateDirectorTemplate({ ...options, selection: { templateRef } });
  assert.deepEqual(director.document.clipOccurrences, manual.document.clipOccurrences);
  assert.deepEqual(director.document.linkedTiming.cues, manual.document.linkedTiming.cues);
  const spoken = manual.document.linkedTiming.cues.voiceovers[0];
  assert.equal(spoken.programmeRange.endTick, 1260000);
  assert.equal(spoken.parameters.contentHash, bound.speech.contentHash);
  assert.equal(manual.document.outputTimeMap.at(-1).outputRange.endTick, 1620000);
  assert.equal(manual.snapshot.voiceovers[0].duration, 14);
  assert.equal(manual.snapshot.voiceovers[0].sourceStoragePath, bound.speech.storagePath);
  assert.equal(manual.snapshot.voiceovers[0].contentHash, bound.speech.contentHash);
  assert.equal(manual.snapshot.musicTrack.duckingMode, 'constant');
  assert.deepEqual(manual.snapshot.audioKeyframes.music.map(k => k.value), [40, 40, 100, 100]);
  assert.equal(manual.snapshot.audioKeyframes.music[2].time, 14.6);
  assert.equal(manual.snapshot.overlays.some(l => l.type === 'image'), false);
  assert.equal(manual.snapshot.reframeKeyframes[0].origin, 'manual');
  const projected = studio.projectStudioEditableStateToSnapshot(manual.document, manual.snapshot);
  assert.equal(hash(studio.adaptStudioSnapshotToDocument({ snapshot: projected,
    projectId: manual.projectId, previousDocument: manual.document })), manual.documentHash);
  await assert.rejects(instantiateTemplate({ ...options,
    bindings: { ...bound, speech: { ...bound.speech, duration: 13 } } }), { code: 'TEMPLATE_SPEECH_TOO_SHORT' });
});

test('two-speaker set template requires separate source-bound mattes and authors real editable cuts',async()=>{
 const template=registry.templates.find(t=>t.templateId==='podcast_set_dialogue_v1');
 const templateRef=require('../../src/creativeTemplates/contract').referenceFor(template);
 const bound=bindings();for(const key of ['logo','productFootage','detailFootage'])delete bound[key];
 Object.assign(bound,{background:owned('room','image'),responseFootage:owned('response','video'),revealSound:owned('whoosh','audio'),impactSound:owned('hit','audio')});
 const subjectScenes=[['hookFootage',6,'b'],['responseFootage',2,'c']].map(([slot,duration,letter])=>({enabled:true,
  modelArtifactRef:{kind:'model_capability',schemaVersion:1,artifactHash:letter.repeat(64),sourceAssetId:bound[slot].id,sourceContentHash:bound[slot].contentHash,capability:'segment_subject',sourceRange:{space:'source',startTick:0,endTick:duration*90000}},
  scene:{version:1,id:slot,sourceId:bound[slot].id,sourceStoragePath:bound[slot].storagePath,sourceRange:{start:0,end:duration},prompt:{points:[[.3,.3]],labels:[1],shotPrompts:[]},effects:[]}}));
 const options={...args(),templateRef,bindings:bound,subjectScenes};
 const manual=await instantiateTemplate(options),director=await instantiateDirectorTemplate({...options,selection:{templateRef}});
 assert.deepEqual(manual.snapshot.subjectVfxScenes,director.snapshot.subjectVfxScenes);
 assert.equal(manual.snapshot.subjectVfxScenes.length,2);
 assert.deepEqual(manual.snapshot.timeline.map(c=>[c.sourceClipId,c.startRequest,c.endRequest]),[['hook',0,2],['response',0,2],['hook',2,4]]);
 assert.equal(manual.document.outputTimeMap.at(-1).outputRange.endTick,540000);
 assert(manual.snapshot.motionKeyframes.some(k=>k.targetId==='main-video'&&k.property==='x'&&k.time===2));
 await assert.rejects(instantiateTemplate({...options,subjectScenes:subjectScenes.slice(0,1)}),{code:'TEMPLATE_MASK_REQUIRED'});
 const wrong=structuredClone(subjectScenes);wrong[1].modelArtifactRef=structuredClone(subjectScenes[0].modelArtifactRef);
 await assert.rejects(instantiateTemplate({...options,subjectScenes:wrong}),{code:'TEMPLATE_MASK_REQUIRED'});
});

test('full-set dialogue matches native decimal ranges on the canonical clock without accepting a different frame',async()=>{
 const template=registry.templates.find(t=>t.templateId==='podcast_set_dialogue_v1'&&t.version==='1.1.0');
 const templateRef=require('../../src/creativeTemplates/contract').referenceFor(template);
 const bound=bindings();for(const key of ['logo','productFootage','detailFootage'])delete bound[key];
 Object.assign(bound,{background:owned('room','image'),responseFootage:owned('response','video'),revealSound:owned('whoosh','audio'),impactSound:owned('hit','audio')});
 const subjectScenes=[['hookFootage',8.666667,'b'],['responseFootage',3.75,'c']].map(([slot,duration,letter])=>({enabled:true,
  modelArtifactRef:{kind:'model_capability',schemaVersion:1,artifactHash:letter.repeat(64),sourceAssetId:bound[slot].id,sourceContentHash:bound[slot].contentHash,capability:'segment_subject',sourceRange:{space:'source',startTick:0,endTick:Math.round(duration*90000)}},
  scene:{version:1,id:slot,sourceId:bound[slot].id,sourceStoragePath:bound[slot].storagePath,sourceRange:{start:0,end:duration},prompt:{points:[[.3,.3]],labels:[1],shotPrompts:[]},effects:[]}}));
 const options={...args(),templateRef,bindings:bound,subjectScenes};
 const manual=await instantiateTemplate(options),director=await instantiateDirectorTemplate({...options,selection:{templateRef}});
 assert.deepEqual(manual.snapshot.subjectVfxScenes,director.snapshot.subjectVfxScenes);
 assert.equal(manual.document.outputTimeMap.at(-1).outputRange.endTick,1117500);
 assert.equal(manual.snapshot.timeline.length,2);
 assert.equal(manual.snapshot.motionKeyframes.some(k=>k.targetId==='main-video'&&k.property==='scale'&&k.value>1),false);
 const wrong=structuredClone(subjectScenes);wrong[0].scene.sourceRange.end-=1/24;
 await assert.rejects(instantiateTemplate({...options,subjectScenes:wrong}),{code:'TEMPLATE_MASK_REQUIRED'});
});

test('podcast story renders both supplied headline lines and the supplied accent colour',async()=>{
 const template=registry.templates.find(t=>t.templateId==='podcast_set_dialogue_v1'&&t.version==='1.1.1');
 const templateRef=require('../../src/creativeTemplates/contract').referenceFor(template),bound=bindings();
 for(const key of ['logo','productFootage','detailFootage'])delete bound[key];
 Object.assign(bound,{headline:'COMMUNITY\nTHE STORIES',brandColour:'#d6b787',background:owned('room','image'),responseFootage:owned('response','video'),revealSound:owned('whoosh','audio'),impactSound:owned('hit','audio')});
 const subjectScenes=[['hookFootage',8.666667,'b'],['responseFootage',3.75,'c']].map(([slot,duration,letter])=>({enabled:true,
  modelArtifactRef:{kind:'model_capability',schemaVersion:1,artifactHash:letter.repeat(64),sourceAssetId:bound[slot].id,sourceContentHash:bound[slot].contentHash,capability:'segment_subject',sourceRange:{space:'source',startTick:0,endTick:Math.round(duration*90000)}},
  scene:{version:1,id:slot,sourceId:bound[slot].id,sourceStoragePath:bound[slot].storagePath,sourceRange:{start:0,end:duration},prompt:{points:[[.3,.3]],labels:[1],shotPrompts:[]},effects:[]}}));
 const result=await instantiateTemplate({...args(),templateRef,bindings:bound,subjectScenes});
 assert(result.snapshot.overlays.some(l=>l.text==='COMMUNITY'));
 assert(result.snapshot.overlays.some(l=>l.text==='THE STORIES'&&l.color==='#d6b787'));
 assert.equal(result.snapshot.overlays.some(l=>l.text==='UNMUTED'),false);
});

test('camera-matched set binds two owned backgrounds through the same Studio and Director adapter',async()=>{
 const template=registry.templates.find(t=>t.templateId==='podcast_set_dialogue_v1'&&t.version==='1.2.0');
 const templateRef=require('../../src/creativeTemplates/contract').referenceFor(template),bound=bindings();
 for(const key of ['logo','productFootage','detailFootage'])delete bound[key];
 Object.assign(bound,{background:owned('camera-a-room','image'),responseBackground:owned('camera-b-room','image'),responseFootage:owned('response','video'),revealSound:owned('whoosh','audio'),impactSound:owned('hit','audio')});
 const subjectScenes=[['hookFootage',8.666667,'b'],['responseFootage',3.75,'c']].map(([slot,duration,letter])=>({enabled:true,
  modelArtifactRef:{kind:'model_capability',schemaVersion:1,artifactHash:letter.repeat(64),sourceAssetId:bound[slot].id,sourceContentHash:bound[slot].contentHash,capability:'segment_subject',sourceRange:{space:'source',startTick:0,endTick:Math.round(duration*90000)}},
  scene:{version:1,id:slot,sourceId:bound[slot].id,sourceStoragePath:bound[slot].storagePath,sourceRange:{start:0,end:duration},prompt:{points:[[.3,.3]],labels:[1],shotPrompts:[]},effects:[]}}));
 const options={...args(),templateRef,bindings:bound,subjectScenes};
 const manual=await instantiateTemplate(options),director=await instantiateDirectorTemplate({...options,selection:{templateRef}});
 assert.deepEqual(manual.snapshot.subjectVfxScenes,director.snapshot.subjectVfxScenes);
 for(const [i,id]of ['camera-a-room','camera-b-room'].entries()){
  const effect=manual.snapshot.subjectVfxScenes[i].scene.effects.find(e=>e.type==='background_replace');
  assert.equal(effect.asset_id,id);assert.equal(effect.asset_sha256,bound[i?'responseBackground':'background'].contentHash);assert.equal(effect.start,0);
 }
 assert.equal(manual.snapshot.subjectVfxScenes.every(s=>!s.maskJob),true);
});

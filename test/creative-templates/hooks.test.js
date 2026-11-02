const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../../config/creative-templates/registry.v1.json');
const definitions = require('../../frontend/src/templates/hooks.v1.json');
const studio = require('../../src/generated/studioDirectorReplayKernel.cjs');
const { instantiateTemplate, instantiateDirectorTemplate } = require('../../src/creativeTemplates/instantiate');
const { referenceFor, hash, validateRegistry } = require('../../src/creativeTemplates/contract');
const owned = (id, type) => ({ id, name: id, mediaType: type, ownerUid: 'hook-owner',
  url: `https://media.invalid/${id}`, storagePath: `studio/sources/hook-owner/${id}`,
  contentHash: hash(id), duration: 90 });
const inputs = (template, optional = false) => Object.fromEntries(template.inputSlots
  .filter(slot => slot.required || optional).map(slot => [slot.id, slot.type === 'text'
    ? template.executionDefinition.inputPresentation[slot.id].default : owned(slot.id, slot.type)]));
const options = template => ({ templateRef: referenceFor(template), authenticatedUser: { uid: 'hook-owner' },
  projectId: `hook-${template.templateId}`, bindings: inputs(template), aspect: '9:16' });

test('six hook families are pinned identically in the browser and existing registry', () => {
  validateRegistry(registry);
  assert.equal(definitions.length, 6);
  assert.equal(new Set(definitions.map(t => t.executionDefinition.hook.family)).size, 6);
  for (const template of definitions) assert.equal(hash(template), hash(registry.templates.find(t => t.templateId === template.templateId)));
});
for (const template of definitions) for (const variation of template.executionDefinition.variations) {
  test(`${template.templateId}/${variation.id}: footage edit, editable recovery and Director use the canonical graph`, async () => {
    const request = { ...options(template), variationId: variation.id };
    const result = await instantiateTemplate(request);
    assert.equal(result.document.outputTimeMap.at(-1).outputRange.endTick, template.durationTicks);
    assert(result.document.clipOccurrences.length >= 2);
    assert.equal(result.snapshot.creativeTemplateInstance.variationId, variation.id);
    assert.equal(result.snapshot.muteOriginalAudio, !template.executionDefinition.keepOriginalAudio);
    assert.equal(result.snapshot.addMusic, false, 'optional sound cannot become a missing required asset');
    assert(!result.snapshot.overlays.some(layer => layer.name === 'Brand logo'));
    assert(result.snapshot.motionKeyframes.every(key => result.snapshot.overlays.some(layer => layer.id === key.targetId) || key.targetId === 'main-video'));
    const framing = result.snapshot.reframeKeyframes || [];
    assert.equal(new Set(framing.map(key => key.id)).size, framing.length,
      'Each framing correction must remain individually selectable in Reframe');
    assert(framing.every(key => key.id?.startsWith(request.projectId + ':hook-frame:')));
    const projected = studio.projectStudioEditableStateToSnapshot(result.document, result.snapshot);
    assert.equal(hash(studio.adaptStudioSnapshotToDocument({snapshot:projected,projectId:result.projectId,previousDocument:result.document})),result.documentHash);
    const director = await instantiateDirectorTemplate({ ...request, selection: { templateRef: request.templateRef } });
    assert.deepEqual(director.document.clipOccurrences, result.document.clipOccurrences);
    assert.deepEqual(director.document.layers, result.document.layers);
    assert.equal(director.startsModelJob,false);
    assert.equal(studio.compileStudioTimelineForRender(result.document).length,result.snapshot.timeline.length);
  });
}

test('captions follow source identity across reordered cuts; source focus and narration remain editable', async () => {
  const template = definitions.find(t => t.templateId === 'podcast_cold_open_v1'), request = options(template);
  request.bindings.statementFootage.focus = {x:23,y:51,zoom:1.12};
  request.transcripts = {statementFootage:[{start:.2,end:2,text:'Words actually supplied by the owner.'}]};
  const result = await instantiateTemplate(request);
  assert.equal(result.snapshot.captionSegments[0].sourceClipId,'statementFootage');
  assert.equal(result.snapshot.captionSegments[0].text,'Words actually supplied by the owner.');
  assert.equal(result.snapshot.reframeKeyframes[0].x,23);
  assert.equal(result.snapshot.motionKeyframes.find(key=>key.targetId==='main-video').value,1.12);
  assert.equal(result.snapshot.creativeTemplateInstance.bindings.statementFootage.focus.zoom,1.12);
  const story = definitions.find(t => t.templateId === 'storytelling_comeback_v1');
  const voiced = await instantiateTemplate({...options(story),bindings:inputs(story,true)});
  assert.equal(voiced.snapshot.voiceovers.length,2);
  assert.equal(voiced.snapshot.voiceovers[1].startTime,14);
  assert.equal(voiced.snapshot.voiceovers[1].trimStart,0);
  assert.equal(voiced.snapshot.voiceovers[1].volume,.94);
  assert(voiced.snapshot.soundEffects.length>0);
});

test('alternate cuts genuinely change the source sequence, rather than adding decorative text', async () => {
  for(const template of definitions){
    const a=await instantiateTemplate({...options(template),variationId:'signature'});
    const b=await instantiateTemplate({...options(template),variationId:'alternate'});
    assert.notDeepEqual(a.document.clipOccurrences,b.document.clipOccurrences);
    assert.equal(a.document.outputTimeMap.at(-1).outputRange.endTick,b.document.outputTimeMap.at(-1).outputRange.endTick);
  }
});

for(const [name,change,code] of [
 ['unknown variation',a=>{a.variationId='invented'},'TEMPLATE_HOOK_INVALID'],
 ['foreign footage',a=>{a.bindings.statementFootage.ownerUid='another-owner'},'TEMPLATE_OWNED_MEDIA_REQUIRED'],
 ['short statement',a=>{a.bindings.statementFootage.duration=1},'TEMPLATE_FOOTAGE_TOO_SHORT'],
 ['caption on an unbound source',a=>{a.transcripts={invented:[{start:0,end:1,text:'invented'}]}},'TEMPLATE_HOOK_INVALID'],
 ['caption outside source',a=>{a.transcripts={statementFootage:[{start:0,end:99,text:'outside'}]}},'TEMPLATE_HOOK_INVALID'],
 ['unreadable source focus',a=>{a.bindings.statementFootage.focus={x:101}},'TEMPLATE_HOOK_INVALID'],
])test(`reject ${name} before creating a hook`,async()=>{
 const request=options(definitions[0]);change(request);await assert.rejects(instantiateTemplate(request),{code});
});

test('selected sentence endpoints move downstream cuts, accents and framing without stretching the dialogue',async()=>{
 const template=definitions[0],request=options(template);
 request.bindings.statementFootage.trimStart=10;
 request.bindings.statementFootage.selectedEnd=19.875;
 const result=await instantiateTemplate(request);
 assert.equal(result.snapshot.timeline[0].startRequest,10);
 assert.equal(result.snapshot.timeline[0].endRequest,19.875);
 assert.equal(result.snapshot.timeline[1].duration,.5);
 assert.equal(result.snapshot.reframeKeyframes[1].time,9.875);
 assert.equal(result.snapshot.overlays.find(layer=>layer.name==='ending-question').startTime,11.875);
 assert.equal(result.snapshot.creativeTemplateInstance.bindings.statementFootage.selectedEnd,19.875);
 const projected=studio.projectStudioEditableStateToSnapshot(result.document,result.snapshot);
 assert.equal(hash(studio.adaptStudioSnapshotToDocument({snapshot:projected,projectId:result.projectId,previousDocument:result.document})),result.documentHash);
});

test('caption import retains supplied speaker/language provenance and leaves unknown voices for review',async()=>{
 const template=definitions[0],request=options(template);
 request.transcripts={statementFootage:[{start:0,end:1,text:'Reviewed source words',language:'en',speaker:'guest',textReviewed:true,translatedToEnglish:true},
  {start:1,end:2,text:'Still needs source review'}]};
 const result=await instantiateTemplate(request),cues=result.snapshot.captionSegments;
 assert.equal(cues[0].speaker,'guest');assert.equal(cues[0].translatedToEnglish,true);assert.equal(cues[0].textReviewRequired,false);
 assert.equal(cues[1].speaker,'unknown');assert.equal(cues[1].textReviewRequired,true);
});


test('fractional spoken durations resolve once to whole delivery frames instead of accumulating segment rounding loss',async()=>{
 const request=options(definitions[0]);
 for(const [slot,start,end] of [['statementFootage',10,19.56],['reactionFootage',30,31.52],['questionFootage',40,43.68]])Object.assign(request.bindings[slot],{trimStart:start,selectedEnd:end});
 const result=await instantiateTemplate(request);
 assert.deepEqual(result.snapshot.timeline.map(shot=>Math.round(shot.duration*24)),[229,36,88]);
 for(const shot of result.snapshot.timeline)assert(Math.abs(shot.duration*24-Math.round(shot.duration*24))<.00001);
 assert.equal(result.document.outputTimeMap.at(-1).outputRange.endTick,353*3750);
});

const test = require('node:test'), assert = require('node:assert/strict');
const { instantiateTemplate, instantiateDirectorTemplate } = require('../../src/creativeTemplates/instantiate');
const { hash, referenceFor } = require('../../src/creativeTemplates/contract');
const recipe = require('../../frontend/src/templates/creator_identity_v1.json');
const registry = require('../../config/creative-templates/registry.v1.json');
const owned = (id, type, duration=30) => ({ id, name:id, mediaType:type, type, status:'ready', ownerUid:'owner', duration,
  url:`http://127.0.0.1/${id}`, storagePath:`studio/sources/owner/${id}`, contentHash:hash(id) });
const options = () => ({ templateRef:referenceFor(recipe), authenticatedUser:{uid:'owner'}, projectId:'creator',
  bindings:{...recipe.executionDefinition.defaultCopy, logo:owned('logo','image'), music:owned('music','audio'),hookFootage:owned('portrait','video',4.633333),
    detailFootage:owned('close','video',19.635),productFootage:owned('wide','video',19.166667),screenFootage:owned('screen','video',13.408333)} });
test('four-source recipe is identical in browser and server registry',()=> assert.equal(hash(registry.templates.find(t=>t.templateId===recipe.templateId)),hash(recipe)));
test('Director and manual recipe produce identical native layers, mattes, source timing and motion',async()=>{
 const o=options(),a=await instantiateTemplate(o),b=await instantiateDirectorTemplate({...o,selection:{templateRef:o.templateRef}});
 assert.equal(b.startsModelJob,false); assert.equal(b.snapshot.smartCrop,true); assert.equal(b.snapshot.smartCropMode,'off');assert.equal(b.snapshot.videoFit,'contain');assert.equal(b.snapshot.overlays.find(l=>l.name==='Live closing fill').mediaFit,'cover'); assert.equal(b.snapshot.creativeTemplateInstance.instantiatedBy,'director');
 assert.deepEqual(a.document.clipOccurrences,b.document.clipOccurrences);assert.deepEqual(a.document.layers,b.document.layers);
 assert.equal(b.document.outputTimeMap.at(-1).outputRange.endTick,2160000);
 assert.equal(new Set(b.snapshot.timeline.map(c=>c.sourceClipId)).size,4);
 assert.equal(b.snapshot.overlays.filter(l=>l.type==='video').length,5);
 assert.equal(b.snapshot.overlays.find(l=>l.name==='Live closing fill').trackMatte.sourceLayerId,'creator:you-matte');
 assert.equal(b.snapshot.overlays.find(l=>l.name==='Moving screen').perspective.corners.length,4);
 assert(b.snapshot.motionKeyframes.length>100);
 assert(b.sourceEvidence.every(a=>/^[a-f0-9]{64}$/.test(a.contentHash)));
});
for(const mode of ['foreign','short','missing','changed-definition']) test(`recipe rejects ${mode} inputs before mutation`,async()=>{
 const o=options();if(mode==='foreign')o.bindings.screenFootage.ownerUid='stranger';if(mode==='short')o.bindings.hookFootage.duration=3;
 if(mode==='missing')delete o.bindings.screenFootage;if(mode==='changed-definition')o.templateRef.definitionHash=hash('different');
 const before=JSON.stringify(o);await assert.rejects(instantiateTemplate(o));assert.equal(JSON.stringify(o),before);
});
test('creator edit needs only four videos and preserves original audio when optional branding and music are omitted',async()=>{
 const o=options();delete o.bindings.logo;delete o.bindings.music;
 const a=await instantiateDirectorTemplate({...o,selection:{templateRef:o.templateRef}});
 assert.equal(a.snapshot.muteOriginalAudio,false);assert.equal(a.snapshot.addMusic,false);assert.equal(a.snapshot.musicTrack,null);
 assert(!a.snapshot.overlays.some(l=>l.name==='Brand logo'));assert.equal(a.snapshot.overlays.filter(l=>l.type==='video').length,5);
});

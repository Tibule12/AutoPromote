const test = require('node:test'), assert = require('node:assert/strict');
const { instantiateTemplate, instantiateDirectorTemplate } = require('../../src/creativeTemplates/instantiate');
const { hash, referenceFor } = require('../../src/creativeTemplates/contract');
const registry = require('../../config/creative-templates/registry.v1.json');
const durations = { hookFootage: 4.633333, detailFootage: 19.635, productFootage: 19.166667, screenFootage: 13.408333 };
function options(recipe, owner='owner') {
  return { templateRef: referenceFor(recipe), authenticatedUser: { uid: owner }, projectId: `${owner}:look`,
    bindings: Object.fromEntries(Object.entries(durations).map(([id, duration]) => [id, {
      id: `${owner}:${id}`, name: id, mediaType: 'video', ownerUid: owner, duration, status: 'ready',
      url: `http://127.0.0.1/${owner}/${id}`, storagePath: `studio/sources/${owner}/${id}`, contentHash: hash(owner+id),
    }])) };
}
for (const id of ['prism_cuts_v1', 'momentum_v1']) {
  const recipe = require(`../../frontend/src/templates/${id}.json`);
  test(`${id}: browser and server share the exact pinned recipe`, () => {
    assert.equal(hash(registry.templates.find(t=>t.templateId===id&&t.version===recipe.version)), hash(recipe));
    const serialized = JSON.stringify(recipe);
    assert(!/demo-pilot|43927|uploads\/|blob:|WhatsApp Video/.test(serialized));
  });
  test(`${id}: Director and manual style share all ordinary media, masks, keys, order and groups`, async () => {
    const o=options(recipe), a=await instantiateTemplate(o), b=await instantiateDirectorTemplate({...o, selection:{templateRef:o.templateRef}});
    assert.deepEqual(a.document.layers,b.document.layers);
    assert.deepEqual(a.snapshot.compoundClips,b.snapshot.compoundClips);
    assert.deepEqual(a.snapshot.motionKeyframes,b.snapshot.motionKeyframes);
    assert(a.snapshot.overlays.every(l=>['image','video'].includes(l.type)));
    assert.equal(a.snapshot.captionSegments.length,0); assert.equal(a.snapshot.muteOriginalAudio,true);
    assert.equal(a.snapshot.overlays.length,recipe.executionDefinition.ordinaryMotion.layers.length);
    assert.equal(a.document.outputTimeMap.at(-1).outputRange.endTick,2160000);
    assert.equal(b.startsModelJob,false); assert.equal(b.snapshot.creativeTemplateInstance.instantiatedBy,'director');
  });
  test(`${id}: another owner's four clips replace every video without retained source references`, async () => {
    const a=await instantiateTemplate(options(recipe,'first')), b=await instantiateTemplate(options(recipe,'second'));
    for (const [index,l] of b.snapshot.overlays.entries()) {
      if(l.type==='video') { assert(l.src.includes('/second/'));assert(l.sourceStoragePath.includes('/second/'));assert(!JSON.stringify(l).includes('/first/')); }
      assert.equal(l.name,a.snapshot.overlays[index].name);
    }
  });
  for(const mode of ['foreign','missing','short-overlay','changed-hash']) test(`${id}: ${mode} refuses without mutating inputs`, async()=>{
    const o=options(recipe);
    if(mode==='foreign')o.bindings.detailFootage.ownerUid='another';
    if(mode==='missing')delete o.bindings.productFootage;
    if(mode==='short-overlay')o.bindings.detailFootage.duration=9;
    if(mode==='changed-hash')o.templateRef.definitionHash=hash('unregistered');
    const before=JSON.stringify(o);await assert.rejects(instantiateTemplate(o));assert.equal(JSON.stringify(o),before);
  });
}
test('Prism preset preserves all delivered video geometry, group keys and composition ordering',async()=>{
  const recipe=require('../../frontend/src/templates/prism_cuts_v1.json'), a=await instantiateTemplate(options(recipe));
  assert.equal(a.snapshot.overlays.filter(l=>l.name.startsWith('P / live fragment ')).length,12);
  const screen=a.snapshot.overlays.find(l=>l.name==='P / code ground');
  assert.equal(screen.width,70);assert.equal(screen.scale,100/70);assert.equal(screen.sourceStartTime,2);
  const medium=a.snapshot.overlays.find(l=>l.name==='P / medium panel');
  assert.deepEqual(medium.perspective.sourceRect,[0,4,100,70]);
  assert.deepEqual(medium.perspective.corners,[[4,4],[48,4],[48,96],[4,96]]);
  assert.equal(a.snapshot.motionKeyframes.length,447);assert.equal(a.snapshot.compoundClips.length,1);
  const group=a.snapshot.compoundClips[0];assert.equal(group.layerIds.length,4);
  assert.equal(a.snapshot.motionKeyframes.filter(k=>k.targetId===group.id).length,12);
});
test('native style source in-points offset both the sequence and secondary video clocks',async()=>{
  const recipe=require('../../frontend/src/templates/momentum_v1.json'), o=options(recipe);
  for(const asset of Object.values(o.bindings)){asset.duration=60;asset.trimStart=2;}
  const a=await instantiateTemplate(o);
  assert.equal(a.snapshot.timeline[0].startRequest,2.25);
  assert.equal(a.snapshot.overlays.find(l=>l.name==='M / orbit card 1').sourceStartTime,5);
  assert.equal(a.snapshot.overlays.find(l=>l.name==='M / contact 0').sourceStartTime,2.25);
});

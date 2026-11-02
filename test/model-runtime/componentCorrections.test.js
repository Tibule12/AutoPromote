const test=require('node:test'),assert=require('node:assert/strict');
const {request}=require('../../src/modelRuntime/contract');
const base=()=>({schemaVersion:1,requestId:'request-001',projectId:'project',projectRevision:1,sourceAssetId:'source',sourceSha256:'a'.repeat(64),sourceStoragePath:'studio/sources/owner/source.mp4',sourceRange:{space:'source',startTick:0,endTick:270000},capability:'segment_subject',dependencyHashes:[],parameters:{subjectId:'person',initialBox:[.1,.1,.6,.9],points:[{position:[.3,.3],label:1}],shotPrompts:[],components:[{id:'mic',box:[.2,.4,.8,.9],points:[{position:[.5,.6],label:1}],propagate:true,shotPrompts:[{frameIndex:36,points:[{position:[.8,.3],label:0}]}]}]}});
test('later object corrections retain negative clicks and source frame identity',()=>{
 const r=base();assert.deepEqual(request(r).parameters.components,r.parameters.components);
});
test('corrections must be unique, ordered and inside the selected source interval',()=>{
 for(const modify of [c=>c.shotPrompts.push(structuredClone(c.shotPrompts[0])),c=>c.shotPrompts[0].frameIndex=72,c=>c.shotPrompts[0].points=[],c=>c.propagate=false]){
  const r=base();modify(r.parameters.components[0]);assert.throws(()=>request(r),/COMPONENT_SELECTION_INVALID/);
 }
});
test('a foreground object cannot silently borrow the person or another object identity',()=>{
 const r=base();r.parameters.components[0].id='person';assert.throws(()=>request(r),/COMPONENT_SELECTION_INVALID/);
});
test('source colour refinement is bound to an explicitly selected fixed object with both point roles',()=>{
 const r=base();const c=r.parameters.components[0];c.propagate=false;c.shotPrompts=[];c.points.push({position:[.7,.6],label:0});r.dependencyHashes=['b'.repeat(64)];r.parameters.refinement={maskArtifactHash:'b'.repeat(64),radius:6,holdouts:[],colourComponentIds:['mic']};
 assert.deepEqual(request(r).parameters.refinement.colourComponentIds,['mic']);
 for(const modify of [x=>x.parameters.refinement.colourComponentIds=['other'],x=>x.parameters.components[0].propagate=true,x=>x.parameters.components[0].points.pop()]){
  const invalid=structuredClone(r);modify(invalid);assert.throws(()=>request(invalid),/COLOUR_CORRECTION_COMPONENT_INVALID/);
 }
 const duplicate=structuredClone(r);duplicate.parameters.refinement.colourComponentIds.push('mic');assert.throws(()=>request(duplicate));
});

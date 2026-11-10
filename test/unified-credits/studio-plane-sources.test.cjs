const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {createSourceGateway}=require('../../src/services/unifiedCredits/sourceGateway');

test('the local signed source manifest includes an owned secondary video plane once and rejects a foreign plane',async()=>{
 const previous={...process.env};Object.assign(process.env,{NODE_ENV:'test',UNIFIED_CREDITS_SANDBOX:'true',UNIFIED_CREDITS_PROJECT_ID:'demo-autopromote-credits',FIRESTORE_EMULATOR_HOST:'127.0.0.1:12345'});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-plane-proof-'));
 try{
  const movie=path.join(directory,'source.mp4');cp.execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=navy:s=16x16:r=24:d=0.1','-an','-c:v','libx264','-threads','1',movie]);const bytes=fs.readFileSync(movie),records=[];
  const db={projectId:'demo-autopromote-credits',_settings:{servicePath:'127.0.0.1',port:12345,ssl:false},collection:()=>({doc:()=>({set:async row=>records.push(row)})})};
  const bucket={name:'demo-autopromote-credits',file:name=>({getMetadata:async()=>[{size:bytes.length,generation:'1',contentType:'video/mp4',metadata:{ownerUid:name.includes('foreign')?'another-user':'owner'}}],download:async()=>[bytes]})};let quotes=0;
  const gateway=createSourceGateway({db,bucket,origin:'http://127.0.0.1:1',storageOrigin:'http://127.0.0.1:2',secret:'local-unit-test',cohort:['owner'],admission:{quote:async()=>{quotes++;return {credits:1};}},service:{getAccount:async()=>({balance:10})}});
  const body=plane=>({sourceStoragePath:'studio/sources/owner/base.mp4',options:{viralData:{timeline_segments:[{sourceStoragePath:'studio/sources/owner/base.mp4'}],overlays:[{type:'video',sourceStoragePath:plane},{type:'video',sourceStoragePath:plane}]}}});
  await gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:body('studio/sources/owner/secondary.mp4')});
  assert.deepEqual(records[0].workflowInput.sources.map(s=>s.storagePath),['studio/sources/owner/base.mp4','studio/sources/owner/secondary.mp4']);
  const large=body('studio/sources/owner/secondary.mp4');large.options.viralData.editor_timeline={motion_keyframes:Array(45000).fill({property:'maskPoint0X',time:1,value:50})};
  assert(Buffer.byteLength(JSON.stringify(large))>1024*1024);
  await gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:large});
  assert.equal(records[1].workflowInput.requestBody,undefined);
  assert.equal(records[1].workflowInput.requestBodyHash,require('../../src/services/unifiedCredits/workerVerification').digest(large));
  assert(Buffer.byteLength(JSON.stringify(records[1]))<128*1024);
  await assert.rejects(gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:body('studio/sources/foreign/secondary.mp4')}),error=>error.code==='SOURCE_FORBIDDEN');
  assert.equal(records.length,2);assert.equal(quotes,2);
  const cameraBody=body('studio/sources/owner/secondary.mp4');
  cameraBody.options.viralData.finish_plan={reframe:{group_stack:{cameras:[
    {source_url:'http://127.0.0.1:2/v0/b/demo-autopromote-credits/o/studio%2Fsources%2Fowner%2Fcamera-a.mp4'},
    {source_url:'http://127.0.0.1:2/v0/b/demo-autopromote-credits/o/studio%2Fsources%2Fowner%2Fcamera-b.mp4'},
  ]}}};
  await gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:cameraBody});
  assert.deepEqual(records[2].workflowInput.sources.map(s=>s.storagePath),[
    'studio/sources/owner/base.mp4','studio/sources/owner/secondary.mp4',
    'studio/sources/owner/camera-a.mp4','studio/sources/owner/camera-b.mp4']);
  cameraBody.options.viralData.finish_plan.reframe.group_stack.cameras[1].source_url='http://127.0.0.1:2/v0/b/demo-autopromote-credits/o/studio%2Fsources%2Fforeign%2Fcamera.mp4';
  await assert.rejects(gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:cameraBody}),error=>error.code==='SOURCE_FORBIDDEN');
  assert.equal(records.length,3);assert.equal(quotes,3);
 }finally{fs.rmSync(directory,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});

test('saved expired music renews against the owned admission manifest; foreign or changed audio is refused',async()=>{
 const previous={...process.env};Object.assign(process.env,{NODE_ENV:'test',UNIFIED_CREDITS_SANDBOX:'true',UNIFIED_CREDITS_PROJECT_ID:'demo-autopromote-credits',FIRESTORE_EMULATOR_HOST:'127.0.0.1:12345'});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-audio-proof-'));const now=Date.now;
 try{
  const movie=path.join(directory,'source.mp4');cp.execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=navy:s=16x16:r=24:d=0.1','-an','-c:v','libx264','-threads','1',movie]);const video=fs.readFileSync(movie),audio=Buffer.alloc(2048,17),records=[];let generation='1',quotes=0;
  const db={projectId:'demo-autopromote-credits',_settings:{servicePath:'127.0.0.1',port:12345,ssl:false},collection:()=>({doc:()=>({set:async row=>records.push(row)})})};
  const bucket={name:'demo-autopromote-credits',file:name=>({getMetadata:async()=>[{size:name.endsWith('.wav')?audio.length:video.length,generation:name.endsWith('.wav')?generation:'1',contentType:name.endsWith('.wav')?'audio/wav':'video/mp4',metadata:{ownerUid:name.includes('foreign')?'another-user':'owner'}}],download:async()=>[name.endsWith('.wav')?audio:video]})};
  const gateway=createSourceGateway({db,bucket,origin:'http://127.0.0.1:1',storageOrigin:'http://127.0.0.1:2',secret:'local-unit-test',cohort:['owner'],admission:{quote:async()=>{quotes++;return{credits:1}}},service:{getAccount:async()=>({balance:10})}});
  Date.now=()=>now()-45*60000;const stale=await gateway.signedUrl('owner','uploads/audios/owner/music.wav');Date.now=now;
  const payload=url=>JSON.parse(Buffer.from(new URL(url).searchParams.get('cap').split('.')[0],'base64url'));
  assert(payload(stale).expiresAt<now());let status;await gateway.stream({originalUrl:new URL(stale).pathname+new URL(stale).search},{sendStatus:code=>status=code});assert.equal(status,403);
  const body={sourceStoragePath:'studio/sources/owner/base.mp4',options:{viralData:{add_music:true,music_url:stale}}};
  await gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:body});
  const sources=records[0].workflowInput.sources;assert.equal(sources.length,2);assert.equal(sources[1].contentType,'audio/wav');
  const worker={...body.options.viralData};const digest=require('../../src/services/unifiedCredits/workerVerification').workerRequestDigest(worker);
  await gateway.refreshWorkerAudio('owner',worker,sources);assert(payload(worker.music_url).expiresAt>now()+29*60000);assert.equal(payload(worker.music_url).contentHash,sources[1].contentHash);assert.equal(require('../../src/services/unifiedCredits/workerVerification').workerRequestDigest(worker),digest);
  await assert.rejects(gateway.refreshWorkerAudio('owner',{add_music:true,music_url:stale},sources.slice(0,1)),e=>e.code==='SOURCE_GENERATION_CONFLICT');
  generation='2';await assert.rejects(gateway.refreshWorkerAudio('owner',{add_music:true,music_url:stale},sources),e=>e.code==='SOURCE_GENERATION_CONFLICT');
  const foreign=structuredClone(body);foreign.options.viralData.music_url='http://127.0.0.1:2/v0/b/demo-autopromote-credits/o/uploads%2Faudios%2Fforeign%2Fmusic.wav';
  await assert.rejects(gateway.prepare('owner',{operation:'studio.render',route:'/api/media/process',requestBody:foreign}),e=>e.code==='SOURCE_FORBIDDEN');assert.equal(records.length,1);assert.equal(quotes,1);
 }finally{Date.now=now;fs.rmSync(directory,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});

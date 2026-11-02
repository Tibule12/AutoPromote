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
 }finally{fs.rmSync(directory,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});

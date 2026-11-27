const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net'),Module=require('node:module');
const {once}=require('node:events');
test('actual native 60s movie uses a generation-bound emulator copy with zero backend media re-upload',{timeout:60000},async()=>{
 const {StorageEmulator}=require('firebase-tools/lib/emulator/storage');
 const {EmulatorRegistry}=require('firebase-tools/lib/emulator/registry');
 const probe=net.createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'autopromote-waste-transfer-'));
 class OwnedStorage extends StorageEmulator{getPersistenceTmpDir(){return scratch;}}
 const emulator=new OwnedStorage({projectId:'demo-autopromote-credits',host:'127.0.0.1',port,auto_download:false,
  rules:{name:path.resolve('storage.rules'),content:fs.readFileSync('storage.rules','utf8')}});
 await EmulatorRegistry.start(emulator);
 const storageModule=require.resolve('@google-cloud/storage',{paths:[require.resolve('firebase-admin')]});
 const {Storage}=require(storageModule);const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
 const storage=new Storage({projectId:'demo-autopromote-credits',apiEndpoint:'http://127.0.0.1:'+port,useAuthWithCustomEndpoint:false,
  credentials:{client_email:'local@demo-autopromote-credits.iam.gserviceaccount.com',private_key:key}});
 const seenRequests=[];
 // This firebase-tools version mounts its rewrite route at /b rather than
 // /storage/v1/b (ordinary object routes support both). Adapt only the local
 // endpoint prefix; keep the SDK rewrite protocol and production code intact.
 storage.interceptors.push({request:options=>{seenRequests.push({method:options.method,uri:String(options.uri||options.url).split('?')[0]});if(options.method==='POST'&&String(options.uri||'').includes('/rewriteTo/')) options.uri=String(options.uri).replace('/storage/v1/b/','/b/');options.headers={...options.headers,Authorization:'Bearer owner'};return options;}});
 const bucket=storage.bucket('demo-autopromote-credits'),fixture=path.resolve('reports/free-first-optimization-20261126/actual-studio60-verified/studio-free-output.mp4');
 const bytes=fs.readFileSync(fixture),sha=crypto.createHash('sha256').update(bytes).digest('hex');let uploadedBytes=0;
 const upload=bucket.upload.bind(bucket);bucket.upload=async(local,options)=>{uploadedBytes+=fs.statSync(local).size;return upload(local,options);};
 const adminFile=require.resolve('firebase-admin'),originalAdmin=require.cache[adminFile];require.cache[adminFile]={id:adminFile,filename:adminFile,loaded:true,exports:{storage:()=>({bucket:()=>bucket})}};
 function load(source,suffix){const filename=path.resolve('src/services/studioWorkerOutputService.js')+suffix,m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source,filename);return m.exports;}
 let phase='load';
 try{
  const old=load(fs.readFileSync(path.join(__dirname,'baselines/studioWorkerOutputService.before.txt'),'utf8'),'.baseline.js');
  const current=load(fs.readFileSync('src/services/studioWorkerOutputService.js','utf8'),'.optimized.js');const results=[];
  for(const [name,implementation] of [['before',old],['after',current]]){
   phase=name+' source-save';
   const jobId='waste_transfer_'+name,source='processed/'+jobId+'_viral.mp4';await bucket.file(source).save(bytes,{resumable:false,metadata:{contentType:'video/mp4'}});uploadedBytes=0;
   const started=performance.now(),cpu=process.cpuUsage();
   phase=name+' adopt';
   const result=await implementation.persistWorkerBucketOutput({url:'https://storage.googleapis.com/'+bucket.name+'/'+source,userId:'waste-owner',jobId,expectedSha256:sha});
   phase=name+' download';
   const used=process.cpuUsage(cpu),[delivered]=await bucket.file(result.storagePath).download();
   assert.equal(crypto.createHash('sha256').update(delivered).digest('hex'),sha);
   const [metadata]=await bucket.file(result.storagePath).getMetadata();assert.equal(metadata.metadata.ownerUid,'waste-owner');assert.equal(metadata.metadata.sha256,sha);
   results.push({name,wallMs:performance.now()-started,cpuMs:(used.user+used.system)/1000,backendMediaReuploadBytes:uploadedBytes,deliveredBytes:delivered.length,sha256:sha,sourceGeneration:metadata.metadata.sourceGeneration});
  }
  assert.equal(results[0].backendMediaReuploadBytes,bytes.length);assert.equal(results[1].backendMediaReuploadBytes,0);
  fs.writeFileSync(path.join(process.env.FREE_FIRST_EVIDENCE_DIR||'reports/free-first-waste-20261126','media-transfer-before-after.json'),JSON.stringify({scope:'Real local Firebase Storage emulator, real GCS SDK, retained actual Studio 60s MP4. No cloud resources/data changed.',results,retainsFullSourceSha256Validation:true,remainingBackendIngressBytes:bytes.length,cloudCopyQualified:false},null,2)+'\n');
 }catch(error){error.message=phase+': '+error.message+' '+JSON.stringify(seenRequests.slice(-5));throw error;}finally{if(originalAdmin)require.cache[adminFile]=originalAdmin;else delete require.cache[adminFile];await emulator.stop();}
});

// Read-only recovery/cache preparation from a real native export, never a
// replacement project, response or worker receipt.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),preset=process.argv[3],dir=path.join(root,preset);
const delivery=JSON.parse(fs.readFileSync(path.join(dir,'delivery.json')));
const backup=JSON.parse(fs.readFileSync(path.join(dir,'FINAL-EDITABLE.autopromote.json')));
assert.equal(delivery.actualOwnerAccount,true);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
 const session=JSON.parse(fs.readFileSync(path.join(dir,'login.private.json')));
 const attempt=session.origins.flatMap(o=>o.localStorage||[]).filter(x=>x.name.startsWith('autopromote-viral-render-attempt:')).map(x=>JSON.parse(x.value)).find(x=>x.studioProjectId===backup.id);
 assert(attempt,'Retain the real request identity from native submission');
 const browser=await chromium.launch({headless:true,args:['--mute-audio']});
 const context=await browser.newContext({storageState:session});const p=await context.newPage();let job,owner;
 try{
  await p.goto('http://localhost:5008');await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).first().waitFor({timeout:60000});
  owner=await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('firebaseLocalStorageDb');r.onsuccess=()=>{const q=r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();q.onsuccess=()=>{const v=q.result.map(x=>x.value).find(x=>x.stsTokenManager?.accessToken);resolve(v?{uid:v.uid,token:v.stsTokenManager.accessToken}:null)};q.onerror=reject};r.onerror=reject}));
  assert(owner?.token);const response=await context.request.get('http://localhost:5159/api/media/viral-render-attempt/'+encodeURIComponent(attempt.requestId),{headers:{Authorization:'Bearer '+owner.token}});
  assert(response.ok(),'Completed owned job must be available');job=await response.json();assert.equal(job.status,'completed');
  assert.equal(job.result.outputSha256,delivery.sha256);assert.equal(job.renderRequestId,attempt.requestId);
  const status=await context.request.get('http://localhost:5159/api/media/status/'+encodeURIComponent(job.jobId),{headers:{Authorization:'Bearer '+owner.token}});
  assert(status.ok());const completed=await status.json();assert.equal(completed.status,'completed');
  assert.equal(completed.result.outputSha256,delivery.sha256);assert.equal(completed.brandWatermark,false);
  job={...job,...completed,result:{...job.result,...completed.result}};
  fs.writeFileSync(path.join(dir,'finished-status.private.json'),JSON.stringify(job),{mode:0o600});
 }finally{await context.close();await browser.close();}
 const receipt={projectId:backup.id,projectHash:digest(Buffer.from(JSON.stringify(stable(backup.snapshot.studioDocument)))),outputSha256:delivery.sha256,submittedJobId:job.jobId};
 fs.writeFileSync(path.join(dir,'native-export-receipt.json'),JSON.stringify(receipt,null,2));
 require('dotenv').config({path:'/home/tibule12/Projects/AutoPromte/AutoPromote/.env',quiet:true});
 const {admin}=require('../../src/firebaseAdmin');const {resolveIngestBucketName}=require('../../src/services/multicamUploadService');
 const bucket=admin.storage().bucket(resolveIngestBucketName());
 const cache='/dev/shm/autopromote-real-account-studio-20261030/verified-media-cache';fs.mkdirSync(cache,{recursive:true,mode:0o700});
 const manifestFile=path.join(cache,'manifest.private.json');const entries=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):[];
 for(const [storagePath,file]of[[backup.snapshot.timeline[0].sourceStoragePath,'/home/tibule12/Downloads/WhatsApp Video 2026-10-30 at 18.23.56.mp4'],[job.result.outputStoragePath,path.join(root,delivery.file)]]){
  const [metadata]=await bucket.file(storagePath).getMetadata(),bytes=fs.readFileSync(file),sha256=digest(bytes);
  assert.equal(metadata.metadata.ownerUid,owner.uid);assert.equal(Number(metadata.size),bytes.length);
  assert.equal(metadata.md5Hash,crypto.createHash('md5').update(bytes).digest('base64'));
  if(metadata.metadata.sha256)assert.equal(metadata.metadata.sha256,sha256);
  fs.writeFileSync(path.join(cache,sha256+'.bin'),bytes,{mode:0o600});
  const existing=entries.findIndex(x=>x.storagePath===storagePath);const item={storagePath,generation:metadata.generation,sha256,bytes:bytes.length};if(existing<0)entries.push(item);else entries[existing]=item;
 }
 fs.writeFileSync(manifestFile+'.next',JSON.stringify(entries),{mode:0o600});fs.renameSync(manifestFile+'.next',manifestFile);
 console.log(preset+': actual job/hash/project recovery and immutable media cache prepared');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});

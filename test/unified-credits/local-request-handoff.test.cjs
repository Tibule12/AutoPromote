// Local transport bounds only. The native movie is verified separately.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLocalWorkerProvider}=require('../../scripts/monetization/local-worker-provider.cjs');
const env={...process.env,NODE_ENV:'test',UNIFIED_CREDITS_SANDBOX:'true',UNIFIED_CREDITS_PROJECT_ID:'demo-autopromote-credits',FIRESTORE_EMULATOR_HOST:'127.0.0.1:12345'};
test('local request budgets and fixed loopback ports reject invalid configurations',async()=>{
 for(const maxRequestBytes of [511*1024,4*1024**2+1,NaN])await assert.rejects(createLocalWorkerProvider({env,maxRequestBytes}),/512 KiB–4 MiB/);
 for(const port of [-1,65536,1.5])await assert.rejects(createLocalWorkerProvider({env,port}),/loopback worker port/);
});
test('an explicit larger native graph still needs a valid signature and cannot exceed its chosen byte ceiling',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-request-bound-'));
 try{for(const [name,maxRequestBytes]of [['default',undefined],['explicit',2*1024**2]]){
  const directory=path.join(root,name),p=await createLocalWorkerProvider({directory,python:'/not-a-worker',env,apiOrigin:'http://127.0.0.1:1',...(maxRequestBytes?{maxRequestBytes}:{})});
  try{
   const send=body=>fetch(p.origin+'/render-viral-clip',{method:'POST',headers:{Authorization:'Bearer '+p.token,'Content-Type':'application/json','X-Credits-Execution':Buffer.from(JSON.stringify({endpoint:'/wrong',sources:[{}]})).toString('base64url')},body:JSON.stringify(body)});
   assert.equal((await send({graph:'a'.repeat(1024**2)})).status,name==='default'?413:403);
   assert.equal((await send({graph:'a'.repeat(2*1024**2)})).status,413);
   assert.deepEqual(fs.readdirSync(directory).sort(),['public-key.pem','signing-key.pem','transport-token']);
  }finally{await p.stop();}
 }}finally{fs.rmSync(root,{recursive:true,force:true});}
});

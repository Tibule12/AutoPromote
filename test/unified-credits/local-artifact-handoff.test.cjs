// Transport fixtures only; these do not qualify a media render or cloud service.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createLocalWorkerProvider}=require('../../scripts/monetization/local-worker-provider.cjs');
const {workerRequestDigest,verifyLocalProcessEnvelope}=require('../../src/services/unifiedCredits/workerVerification');
const env={...process.env,NODE_ENV:'test',UNIFIED_CREDITS_SANDBOX:'true',UNIFIED_CREDITS_PROJECT_ID:'demo-autopromote-credits',FIRESTORE_EMULATOR_HOST:'127.0.0.1:12345'};

test('rejects artifact budgets outside the explicit local bounds',async()=>{
  for(const maxArtifactBytes of [1,129*1024**2,NaN])await assert.rejects(createLocalWorkerProvider({env,maxArtifactBytes}),/20–128 MiB/);
});

test('publishes signed terminal handoff failure and measured termination; accepts the bounded larger artifact',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-handoff-fixture-'));
  const fixture=path.join(root,'fixture');
  fs.writeFileSync(fixture,`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const q=JSON.parse(fs.readFileSync(process.argv[3]));
const output=path.join(q.directory,'fixture.mp4');fs.writeFileSync(output,Buffer.alloc(21*1024*1024,5));
fs.writeFileSync(path.join(q.directory,'result.json'),JSON.stringify({success:true,output_path:output}));
`,{mode:0o700});
  try{
    for(const [name,maxArtifactBytes,expectedState]of [['small',20*1024**2,'failed'],['large',128*1024**2,'succeeded']]){
      const directory=path.join(root,name),provider=await createLocalWorkerProvider({directory,python:fixture,env,apiOrigin:'http://127.0.0.1:12346',maxArtifactBytes});
      try{
        const body={fixture:true},binding={endpoint:'/render-viral-clip',executionId:'a'.repeat(64),requestDigest:workerRequestDigest(body),operationId:'fixture-operation',userId:'fixture-user',fingerprint:'fixture',sourceHash:'fixture-source',sources:[{contentHash:'fixture-source'}]};
        const response=await fetch(provider.origin+'/render-viral-clip',{method:'POST',headers:{Authorization:'Bearer '+provider.token,'Content-Type':'application/json','X-Credits-Execution':Buffer.from(JSON.stringify(binding)).toString('base64url')},body:JSON.stringify(body)});
        assert.equal(response.status,expectedState==='failed'?500:200);
        const envelope=JSON.parse(fs.readFileSync(path.join(directory,binding.executionId,'receipt.json')));
        assert.equal(verifyLocalProcessEnvelope(envelope,binding,provider.publicKey).state,expectedState);
        assert.equal(envelope.payload.exitCode,0);
        assert.equal(envelope.payload.processTerminated,true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(directory,binding.executionId,'termination.json'))).code,0);
        if(expectedState==='failed'){assert.match(envelope.payload.providerFailure,/budget/);assert.equal(envelope.payload.output,undefined);}
        else assert.equal(envelope.payload.output.bytes,21*1024**2);
      }finally{await provider.stop();}
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

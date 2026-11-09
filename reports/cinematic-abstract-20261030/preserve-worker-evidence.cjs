// Verify retained actual outcomes after the ephemeral emulator ended.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const demo='/dev/shm/autopromote-application-demo-rlq21z',root='/dev/shm/autopromote-abstract-20261030';
const {verifyLocalProcessEnvelope}=require('../../src/services/unifiedCredits/workerVerification');
const publicKey=fs.readFileSync(path.join(demo,'worker/public-key.pem'));
const cpu=[];
for(const entry of fs.readdirSync(path.join(demo,'worker')).filter(n=>/^[a-f0-9]{64}$/.test(n))){
 const directory=path.join(demo,'worker',entry),file=path.join(directory,'receipt.json');if(!fs.existsSync(file))continue;
 const expected=JSON.parse(fs.readFileSync(path.join(directory,'request.json'))).expected;
 const proof=verifyLocalProcessEnvelope(JSON.parse(fs.readFileSync(file)),expected,publicKey);
 cpu.push({executionId:proof.executionId,operationId:proof.operationId,endpoint:proof.endpoint,state:proof.state,processTerminated:proof.processTerminated,sourceHash:proof.sourceHash,outputHash:proof.output?.sha256,outputBytes:proof.output?.bytes,resource:proof.resource});
}
const gpu=[];
for(const id of ['346b4181-7db9-4aa7-bb67-3890f4122235','78388abe-f152-4701-ac24-3e8a8c716767','a078c46d-dc9e-404c-9e44-ca307d8e0ed4','c9533b31-293c-4f2e-b9d2-a2d794390c5d']){
 const dir=path.join('/dev/shm/autopromote-abstract-blender-20261030',id),bytes=fs.readFileSync(path.join(dir,'input.json')),input=JSON.parse(bytes),status=JSON.parse(fs.readFileSync(path.join(dir,'status.json')));
 const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
 if(status.inputSha256!==sha256(bytes)||status.jobId!==id||status.ownerUid!==input.ownerUid||status.sceneHash!==input.sceneHash)throw Error('Retained GPU binding differs');
 let receipt;
 if(status.status==='completed'){
  receipt=JSON.parse(fs.readFileSync(path.join(dir,'output/receipt.json')));
  if(receipt.device.backend!=='CUDA'||receipt.device.gpu_verified!==true)throw Error('Missing actual CUDA evidence');
  for(const[name,meta]of Object.entries(receipt.artifacts)){const b=fs.readFileSync(path.join(dir,'output',name));if(b.length!==meta.bytes||sha256(b)!==meta.sha256)throw Error('Retained artifact changed');}
 }
 gpu.push({jobId:id,status:status.status,ownerUid:input.ownerUid,inputSha256:status.inputSha256,sceneHash:status.sceneHash,runtime:input.runtime,receipt,failedAttemptRemainsFailed:status.status==='failed'});
}
const summary={observedAt:new Date().toISOString(),cpu,gpu,originalFirestoreSnapshotAvailable:false,emulatorReplayQualified:false,retention:'Actual Storage files/metadata, signed CPU evidence, CUDA inputs/outcomes/artifacts, native backups and recordings retained privately. No reconstructed financial state or invented terminal result.',ownerApproved:false,scheduled:false};
fs.writeFileSync(path.join(__dirname,'worker-evidence.json'),JSON.stringify(summary,null,2)+'\n');console.log('Verified actual signed CPU outcomes:',cpu.length,'; CUDA outcomes:',gpu.map(x=>x.status).join(', '));

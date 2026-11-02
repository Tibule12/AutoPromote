#!/usr/bin/env node
// Recover identity from an authentic completed local process. The normal Studio
// receipt importer still checks signed-in ownership and the completed API job.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {hash}=require('../../src/creativeTemplates/contract');
const {canonical}=require('../../src/services/unifiedCredits/workerVerification');
const runtime=process.argv[2],execution=process.argv[3];
assert(/^[a-f0-9]{64}$/.test(execution));
const config=JSON.parse(fs.readFileSync(path.join(runtime,'config.json')));
require('../../src/services/unifiedCredits/runtime').assertSandbox(config.env);
const dir=path.join(runtime,'worker',execution),envelope=JSON.parse(fs.readFileSync(path.join(dir,'receipt.json')));
const payload=envelope.payload;
assert(crypto.verify(null,Buffer.from(canonical(payload)),config.worker.publicKey,Buffer.from(envelope.signature,'base64')));
assert(payload.processTerminated && payload.state==='succeeded');
assert.equal(payload.userId,'demo-pilot-alice');
const request=JSON.parse(fs.readFileSync(path.join(dir,'request.json')));
const result=payload.result;
assert.equal(request.body.job_id,result.job_id);
const artifact=path.join(dir,'artifact.mp4');
assert.equal(hash(fs.readFileSync(artifact)),result.output_sha256);
const folder=path.resolve(__dirname,'../../reports/studio-motion-flow-takeover-20261031/cinematic');
const project=JSON.parse(fs.readFileSync(path.join(folder,'Editable Project.autopromote.json')));
const accepted=JSON.parse(fs.readFileSync(path.join(folder,'native-motion-flow-project.private.json')));
assert.equal(hash(project.snapshot.studioDocument),hash(accepted.snapshot.studioDocument));
const target=path.join(folder,'native-motion-flow');fs.mkdirSync(target,{recursive:true});
const receiptFile=path.join(target,'render-receipt.json');
if(fs.existsSync(receiptFile))fs.copyFileSync(receiptFile,path.join(target,`previous-${hash(fs.readFileSync(receiptFile)).slice(0,12)}-receipt.json`));
fs.writeFileSync(receiptFile,JSON.stringify({projectId:project.id,projectHash:hash(project.snapshot.studioDocument),
  submittedJobId:result.job_id,outputSha256:result.output_sha256,startedAt:payload.startedAt,finishedAt:payload.finishedAt,
  executionId:execution,terminatedWorkerSignatureVerified:true,exactArtifactHashVerified:true,
  recoveryScope:'Identity receipt reconstructed from the retained signed worker outcome and exact accepted project; requires normal authenticated Studio restore/download.',
  noResubmission:true,resource:payload.resource},null,2));
console.log('Verified completed local artifact identity; restore the receipt in Studio to download.');

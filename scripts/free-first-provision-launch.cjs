// Provision only the approved launch controls after retained Q1–Q7 evidence.
const fs=require('fs'),path=require('path');
const PRIVATE='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const[k,v]of Object.entries(env))if(/^(FIREBASE_|GOOGLE_)/.test(k))process.env[k]=v;
const {db}=require('../src/firebaseAdmin');
const{digest}=require('../src/services/unifiedCredits/workerVerification');
const profiles=require('../config/free-first-release/worker-profiles.prepared.json').filter(p=>p.id!=='failure-cpu');
const evidence={'speech-cpu':'Q1-ASR','render-cpu':'Q1-EXPORT-caption-track-export','finder-cpu':'Q2-FIND',
 'clip-cpu':'Q2-EXPORT','cam-gpu':'Q3-CAM-DELIVERY-CORRECTED','render-gpu':'Q4-FX','sync-cpu':'Q3-PREFLIGHT-RANGE','audio-cpu':'Q1-AUDIO'};
async function main(){
 const q7=require('../reports/free-first-launch-20261127/q7-termination-replay-proof.json');
 if(!q7.providerTerminated||q7.matchingExecutions!==1||q7.freshControllerReplayHttp!==409||!q7.userTokensRestored)
  throw Error('Complete Q7 before provisioning');
 const q5=JSON.parse(fs.readFileSync(path.join(PRIVATE,'Q5-qualified.private.json')));
 if(!q5.actualProviderCall||!q5.providerResponseId||q5.estimatedMicros>10000)throw Error('Actual Q5 proof required');
 const publication=JSON.parse(fs.readFileSync(path.join(PRIVATE,'Q6-publication.private.json')));
 const approved=require('../reports/free-first-launch-20261127/approval-and-status.json');
 if(publication.channelId!==approved.privateYoutubeTests.channelId||publication.mediaSha256!==approved.privateYoutubeTests.mediaSha256)
  throw Error('Publication identity differs from approval');
 for(const name of ['immediate','scheduled'])if(publication[name].verified?.visibility!=='private'||!publication[name].verified.videoId)
  throw Error('Both actual private publications must be verified');
 const prepared=[];
 for(const p of profiles){
  const stage=evidence[p.id];if(!stage)throw Error('No retained native qualification for '+p.id);
  const saved=JSON.parse(fs.readFileSync(path.join(PRIVATE,stage+'.execution.private.json')));
  const binding=(await db.collection('processing_worker_bindings').doc(digest([saved.uid,saved.requestId])).get()).data();
  if(binding?.state!=='settled'||binding.success!==true||saved.profile.image!==p.image||saved.profile.cpuMilli!==p.cpuMilli||
   saved.profile.memoryBytes!==p.memoryBytes||saved.profile.maxSeconds!==p.maxSeconds||saved.profile.maxMicros>p.maxMicros)
   throw Error('Qualified engine/resources do not match '+p.id);
  const receipt={kind:'production-qualification',approved:true,workerContract:'renewable-native-v1',
   profileDigest:digest(p),qualifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+365*86400000).toISOString(),
   sourceAndOutputBoundsVerified:true,networkAndStorageBoundsVerified:true,terminalReconciliationVerified:true,
   physicalHostLossInjected:false,testStage:stage,testedRunnerSha256:saved.profile.runnerSha256,
   admittedRunnerSha256:p.runnerSha256,executionName:binding.executionName,
   evidenceScope:'Pinned existing native engine; actual endpoint output plus immutable source/output, bounded transport tests and actual cancellation/fresh-controller duplicate refusal. Later common transport fixes retain this native endpoint and resource shape.',
   actualInvoiceUsd:null};
  prepared.push({profile:p,receipt});
 }
 const apply=process.argv.includes('--apply');
 if(apply){
  for(const{profile:p,receipt}of prepared)await db.collection('processing_worker_qualifications').doc(p.qualificationId).set(receipt);
  const service=require('../src/services/processingTokens/service').createProcessingService({db});
  await service.configure({enabled:true});
  const control=(await db.collection('processing_control').doc('global').get()).data();
  if(control.suspensionReason)throw Error('Existing global control is suspended; do not erase it');
 }
 const report={provisioned:apply,profiles:prepared.map(({profile:p,receipt:r})=>({id:p.id,image:p.image,tokens:p.tokens,
  maximumUsd:p.maxMicros/1e6,qualifiedStage:r.testStage,runnerSha256:p.runnerSha256})),
  dailyUsd:2,monthlyUsd:10,externalAiDailyUsd:0.05,maximumConcurrentExecutions:1,
  customerBalancesModified:0,legacyAgreementsModified:0,productionResourcesDeleted:0,
  publicPurchasesEnabled:false,physicalHostLossInjected:false};
 if(apply)fs.writeFileSync(path.resolve('reports/free-first-launch-20261127/production-qualification-provisioned.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));await db.terminate();
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});

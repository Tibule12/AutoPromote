// Prepare/verify only the exact two owner-approved PRIVATE YouTube tests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const PRIVATE='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const [key,value] of Object.entries(env))
  if(/^(FIREBASE_|GOOGLE_|GCLOUD_|GCP_|YT_|YOUTUBE_|TWITTER_TOKEN_ENCRYPTION_KEY|GENERIC_TOKEN_ENCRYPTION_KEY|DOC_SIGNING_SECRET)/.test(key))process.env[key]=value;
process.env.ENABLE_BACKGROUND_JOBS='false';
process.env.PROCESSING_LEDGER_NAMESPACE='processing_qualification_launch_20261127';
process.env.PROCESSING_BUDGET_LIMITS_JSON=JSON.stringify({dailyMicros:5000000,monthlyMicros:5000000,
 freeDailyMicros:5000000,apiDailyMicros:50000,maxActive:1,maxActiveUser:1});
const {db,storage}=require('../src/firebaseAdmin');
const approved=require('../reports/free-first-launch-20261127/approval-and-status.json').privateYoutubeTests;
let lock;
const lockPath=path.join(PRIVATE,'Q6-controller.lock');
function decode(value){
 if(value&&typeof value==='object'){
  if(Array.isArray(value.o))return Object.fromEntries(value.o.map(x=>[x.k,decode(x.v)]));
  if(Array.isArray(value.a))return value.a.map(decode);
  if(Object.prototype.hasOwnProperty.call(value,'s'))return value.s;
  for(const key of ['n','b','bi'])if(Object.prototype.hasOwnProperty.call(value,key))return value[key];
 }
 return value;
}
function identity(value){
 if(!value||typeof value!=='object')return null;
 if(typeof value.uid==='string'&&value.stsTokenManager)return value.uid;
 if(value.valueEncoded){const found=identity(decode(value.valueEncoded));if(found)return found;}
 for(const child of Object.values(value)){
  if(typeof child==='string'&&child.startsWith('{')&&child.includes('stsTokenManager')){
   try{const found=identity(JSON.parse(child));if(found)return found;}catch{}
  }
  const found=identity(child);if(found)return found;
 }
 return null;
}
async function main(){
 lock=fs.openSync(lockPath,'wx',0o600);fs.writeFileSync(lock,String(process.pid));
 if(!approved.approved||approved.uploads!==2||approved.visibility!=='private')throw Error('Exact private publication approval required');
 const uid=identity(JSON.parse(fs.readFileSync('/home/tibule12/.local/share/autopromote-qa/studio-video-sync-20261121/final-session.private.json')));
 if(!uid)throw Error('Retained connected owner identity unavailable');
 const youtube=require('../src/services/youtubeService');
 const connection=await youtube.getUserYouTubeConnection(uid);
 if(connection?.channel?.id!==approved.channelId)throw Error('Connected YouTube channel changed');
 const auth=youtube.buildOAuthClient(connection);
 await youtube.ensureFreshTokens(auth,connection,uid);
 const api=require('googleapis').google.youtube({version:'v3',auth});
 const current=await api.channels.list({mine:true,part:'id,snippet'},{retry:false,timeout:15000});
 if(current.data.items?.length!==1||current.data.items[0].id!==approved.channelId)throw Error('Current OAuth channel does not match the approved destination');
 const filename=path.join(ROOT,'reports/free-first-optimization-20261126/actual-studio60-verified/studio-free-output.mp4');
 const sha=crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
 if(sha!==approved.mediaSha256)throw Error('Approved film hash changed');
 const statePath=path.join(PRIVATE,'Q6-publication.private.json');
 let state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{uid,channelId:approved.channelId,mediaSha256:sha,
   bytes:fs.statSync(filename).size,title:approved.title,privacy:'private',immediate:{},scheduled:{}};
 if(state.uid!==uid||state.mediaSha256!==sha)throw Error('Publication binding conflict');
 if(process.argv.includes('--prepare')){
  const object=`uploads/videos/${uid}/free-first-private-test-${sha}.mp4`;
  const file=storage.bucket().file(object);const [exists]=await file.exists();
  if(!exists)await storage.bucket().upload(filename,{destination:object,resumable:false,preconditionOpts:{ifGenerationMatch:0},
    metadata:{contentType:'video/mp4',metadata:{ownerUid:uid,sha256:sha,purpose:'private_publication_qualification'}}});
  const [metadata]=await file.getMetadata();
  if(metadata.metadata?.sha256!==sha||Number(metadata.size)!==state.bytes)throw Error('Publication source identity conflict');
  state.storagePath=object;state.generation=metadata.generation;
 }
 if(process.argv.includes('--verify')){
  for(const kind of ['immediate','scheduled']){
   const videoId=state[kind].videoId;if(!videoId)continue;
   const response=await api.videos.list({id:videoId,part:'id,snippet,status,contentDetails'},{retry:false,timeout:15000});
   const video=response.data.items?.[0];
   if(!video||video.snippet.channelId!==approved.channelId||video.status.privacyStatus!=='private'||video.snippet.title!==approved.title)
    throw Error('Private publication verification failed');
   state[kind].verified={videoId,channelId:video.snippet.channelId,visibility:video.status.privacyStatus,
     duration:video.contentDetails.duration,verifiedAt:new Date().toISOString()};
  }
 }
 const publishing = process.argv.includes('--publish-immediate') || process.argv.includes('--schedule') || process.argv.includes('--dispatch-schedule');
 if(publishing){
  // These commands are invoked only after the preceding Q1–Q5 controller
  // receipts are qualified. Existing workers cannot pick up our held tests.
  const prerequisites=['Q2-FIND','Q2-EXPORT','Q3-CAM-DELIVERY-CORRECTED','Q4-FX'];
  for(const stage of prerequisites){
   const receipt=JSON.parse(fs.readFileSync(path.join(PRIVATE,stage+'.execution.private.json')));
   const binding=(await db.collection('processing_worker_bindings').doc(require('../src/services/unifiedCredits/workerVerification').digest([receipt.uid,receipt.requestId])).get()).data();
   if(binding?.state!=='settled'||binding.success!==true)throw Error('Complete '+stage+' before Q6');
  }
  if(!fs.existsSync(path.join(PRIVATE,'Q5-qualified.private.json')))throw Error('Complete the approved Q5 API qualification before Q6');
  process.env.FREE_FIRST_USAGE_ENABLED='true';
  const ledger=require('../src/services/processingTokens/runtime').service();
  const control=(await db.collection(process.env.PROCESSING_LEDGER_NAMESPACE+'_control').doc('global').get()).data();
  if(!control?.enabled||control.suspensionReason)throw Error('Qualification cash ledger is not enabled');
  const kind=process.argv.includes('--publish-immediate')?'immediate':'scheduled';
  const step=state[kind];
  if(step.videoId)throw Error('This private post already exists; verify instead of publishing again');
  const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
  if(!step.contentId){
   const contentId='free-first-q6-'+kind+'-'+crypto.randomUUID();
   const [url]=await storage.bucket().file(state.storagePath).getSignedUrl({action:'read',expires:Date.now()+2*3600000,
    responseDisposition:'inline; filename="q6-'+kind+'.mp4"'});
   await db.collection('content').doc(contentId).create({user_id:uid,userId:uid,title:approved.title,
    description:'Private AutoPromote subscription qualification. Not a public post.',url,type:'video',
    mimeType:'video/mp4',size:state.bytes,privacy:'private',platform_options:{youtube:{privacy:'private'}},
    monetization_settings:{is_sponsored:false},createdAt:new Date().toISOString(),qualificationOnly:true});
   step.contentId=contentId;step.payload={url,title:approved.title,description:'Private AutoPromote subscription qualification. Not a public post.',
    privacy:'private',platform_options:{youtube:{privacy:'private',visibility:'private'}},hashtags:[],
    optimizeMetadata:false,forceReupload:true,skipIfDuplicate:false};save();
  }
  const queue=require('../src/services/promotionTaskQueue');
  if(kind==='immediate'&&!step.taskId){
   const task=await queue.enqueuePlatformPostTask({uid,contentId:step.contentId,platform:'youtube',
    reason:'free_first_private_qualification',payload:step.payload,skipIfDuplicate:false,forceRepost:true,holdForQualification:true});
   if(!task.id)throw Error('The ordinary publisher did not enqueue its private test');
   step.taskId=task.id;save();
  }
  if(kind==='scheduled'&&!step.scheduleId){
   const due=new Date(Date.now()+60000).toISOString();
   const schedule=await require('../src/promotionService').schedulePromotion(step.contentId,{platform:'youtube',
    startTime:due,frequency:'once',timezone:'Africa/Johannesburg',platformSpecificSettings:step.payload,qualificationHold:true});
   await db.collection('promotion_schedules').doc(schedule.id).update({user_id:uid});
   step.scheduleId=schedule.id;step.dueAt=due;save();
  }
  if(kind==='scheduled'&&process.argv.includes('--dispatch-schedule')){
   const count=await require('../src/promotionService').processDueSchedules({scheduleId:step.scheduleId,qualificationHold:true});
   const schedule=(await db.collection('promotion_schedules').doc(step.scheduleId).get()).data();
   if(!schedule.result?.taskId)throw Error(count===0?'Scheduled private test is not due yet':'No private schedule task receipt');
   step.taskId=schedule.result.taskId;save();
  }
  if(step.taskId){
   await db.collection('processing_qualification_publications').doc(step.taskId).set({userId:uid,contentId:step.contentId,
    platform:'youtube',channelId:approved.channelId,mediaSha256:sha,maximumMicros:70000});
   const taskBefore=(await db.collection('promotion_tasks').doc(step.taskId).get()).data();
   if(taskBefore.status==='completed')step.videoId=taskBefore.outcome?.videoId;
   else if(taskBefore.status==='qualification_held'){
    const result=await queue.processNextPlatformTask({taskId:step.taskId,qualificationClaim:true});
    const taskAfter=(await db.collection('promotion_tasks').doc(step.taskId).get()).data();
    step.lastOutcome=result;step.taskStatus=taskAfter.status;step.videoId=taskAfter.outcome?.videoId||result?.outcome?.videoId;
   } else throw Error('Private publication already attempted; reconcile its stored provider receipt');
   save();
   if(!step.videoId)throw Error('Private publisher has not produced a verified provider identity');
   step.financialUsage=await ledger.status(uid);save();
  }
 }
 fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
 console.log(JSON.stringify({channelId:approved.channelId,channelTitle:current.data.items[0].snippet.title,
   mediaSha256:sha,bytes:state.bytes,title:approved.title,visibility:'private',sourcePrepared:!!state.storagePath,
   immediateVerified:!!state.immediate.verified,scheduledVerified:!!state.scheduled.verified,
   publishingExecutedByThisCommand:publishing,createdVideoIds:[state.immediate.videoId,state.scheduled.videoId].filter(Boolean)}));
 await db.terminate();
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;})
 .finally(()=>{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(lockPath);}});

// Approved Q1–Q7 only. This controller never retries an ambiguous run POST.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const PRIVATE = '/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const dotenv = require('dotenv');
const credentials = dotenv.parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for (const [name,value] of Object.entries(credentials))
  if (/^(FIREBASE_|GOOGLE_|GCLOUD_|GCP_)/.test(name)) process.env[name] = value;
process.env.FREE_FIRST_USAGE_ENABLED = 'true';
process.env.ENABLE_BACKGROUND_JOBS = 'false';
process.env.PROCESSING_LEDGER_NAMESPACE = 'processing_qualification_launch_20261127';
const { db, admin, storage } = require('../src/firebaseAdmin');
const { GoogleAuth } = require('google-auth-library');
const { digest } = require('../src/services/unifiedCredits/workerVerification');
const { createProcessingService } = require('../src/services/processingTokens/service');
const { createNativeWorkerAdapter } = require('../src/services/processingTokens/nativeWorkerAdapter');
const { createProcessingGuard } = require('../src/middlewares/processingBudgetMiddleware');
const { applicationWorkerConfig } = require('../src/services/unifiedCredits/workerTransport');
const runtime = require('../src/services/processingTokens/runtime');
const express = require('express');
const http = require('supertest');
const axios = require('axios');
const profiles = require('../config/free-first-release/worker-profiles.prepared.json');
const expectedStages = {
  'Q1-ASR': ['speech-cpu', 'audio.transcribe', '/api/media/transcribe', '/transcribe', 'Q1'],
  'Q1-AUDIO': ['audio-cpu','audio.extract','/api/media/extract-audio','/extract-audio','Q1'],
  'Q1-EXPORT': ['render-cpu','studio.render','/api/media/process','/render-viral-clip','Q1'],
  'Q2-FIND': ['finder-cpu','clips.analyze','/api/media/analyze','/analyze-clips','Q2'],
  'Q2-EXPORT': ['clip-cpu','studio.render','/api/media/render-clip','/render-clip','Q2'],
  'Q3-CAM': ['cam-gpu','multicam.render','/api/media/render-multicam','/render-multicam','Q3'],
  'Q3-PREFLIGHT': ['sync-cpu','audio.sync','/api/media/multicam/preflight-sync','/multicam/preflight-sync','Q3'],
  'Q3-PREFLIGHT-CPU': ['sync-cpu','audio.sync','/api/media/multicam/preflight-sync','/multicam/preflight-sync','Q3'],
  'Q3-PREFLIGHT-TRANSPORT': ['sync-cpu','audio.sync','/api/media/multicam/preflight-sync','/multicam/preflight-sync','Q3'],
  'Q3-PREFLIGHT-RANGE': ['sync-cpu','audio.sync','/api/media/multicam/preflight-sync','/multicam/preflight-sync','Q3'],
  'Q3-CAM-CHANNELS': ['cam-gpu','multicam.render','/api/media/render-multicam','/render-multicam','Q3'],
  'Q3-CAM-SYNC-CORRECTED': ['cam-gpu','multicam.render','/api/media/render-multicam','/render-multicam','Q3'],
  'Q3-CAM-DELIVERY-CORRECTED': ['cam-gpu','multicam.render','/api/media/render-multicam','/render-multicam','Q3'],
  'Q4-FX': ['render-gpu','studio.render','/api/media/process','/render-viral-clip','Q4'],
  'Q7-FAIL': ['failure-cpu','studio.render','/api/media/process','/render-viral-clip','Q7'],
};
async function main() {
  const stage = process.argv[2];
  const correction = process.argv.includes('--corrected-attempt');
  const captionTrackExport = process.argv.includes('--export-with-retained-caption-track');
  const correctionNumber = captionTrackExport ? 4 : process.argv.includes('--reviewed-caption-metadata') ? 3 : process.argv.includes('--caption-contract-correction') ? 2 : correction ? 1 : 0;
  if (correctionNumber && stage !== 'Q1-EXPORT') throw Error('Only the identified Q1 corrections may use contingency');
  const attemptKey = stage + (captionTrackExport ? '-caption-track-export' : correctionNumber === 3 ? '-reviewed-caption-metadata' : correctionNumber === 2 ? '-caption-contract-corrected' : correction ? '-corrected' : '');
  if (!expectedStages[stage]) throw Error('Name exactly one approved native stage');
  const execute = process.argv.includes('--execute');
  const recover = process.argv.includes('--reconcile');
  const [profileId,operation,route,endpoint,workflow] = expectedStages[stage];
  let profile = profiles.find(p => p.id === profileId);
  const previousReceipt = path.join(PRIVATE,attemptKey+'.execution.private.json');
  if (recover && fs.existsSync(previousReceipt)) {
    const old=JSON.parse(fs.readFileSync(previousReceipt));
    if (old.profile) profile=old.profile;
  }
  if (!profile) throw Error('Prepared immutable profile required');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    credentials: require('../firebaseConfig.server') });
  const client = await auth.getClient();
  let cancellation;
  const request = async config => {
    const response=await client.request({ ...config, timeout: 30000,
      retry: false, headers: { ...config.headers, 'X-Goog-User-Project': 'autopromote-cc6d3' } });
    if(stage==='Q7-FAIL' && config.method==='POST' && config.url.endsWith(':run')) {
      const name=response.data.metadata?.name;
      if(!name?.startsWith(profile.job+'/executions/'))throw Error('No cancellation authority');
      cancellation=(async()=>{
        const deadline=Date.now()+(profile.maxSeconds+250)*1000;
        while(Date.now()<deadline){
          const execution=(await client.request({url:'https://run.googleapis.com/v2/'+name,retry:false,timeout:15000})).data;
          if(execution.completionTime)return;
          if(execution.startTime && execution.runningCount){
            await new Promise(resolve=>setTimeout(resolve,15000));
            const receipt=path.join(PRIVATE,'Q7-cancellation.private.json');
            if(fs.existsSync(receipt))throw Error('Cancellation already attempted; reconcile only');
            fs.writeFileSync(receipt,JSON.stringify({executionName:name,startedAt:execution.startTime,
              cancellationAttemptedAt:new Date().toISOString(),maximumUsd:profile.maxMicros/1e6},null,2),{mode:0o600});
            await client.request({method:'POST',url:'https://run.googleapis.com/v2/'+name+':cancel',
              data:{},retry:false,timeout:15000});return;
          }
          await new Promise(resolve=>setTimeout(resolve,5000));
        }
      })();
    }
    return response;
  };
  const remote = (await request({ method:'GET',url:'https://run.googleapis.com/v2/'+profile.job })).data;
  require('../src/services/processingTokens/cloudRunAdapter').assertJob(remote,profile);
  if (!execute && !recover) {
    console.log(JSON.stringify({ stage, profileId, maximumUsd:profile.maxMicros/1e6,
      taskCount:1,maxRetries:0,timeout:profile.maxSeconds,shapeVerified:true,executed:false }));
    return;
  }
  const approval = require('../reports/free-first-launch-20261127/approval-and-status.json');
  if (approval.qualificationMaximumUsd !== 5 || approval.maxConcurrentPaidExecutions !== 1) throw Error('Funding approval mismatch');
  fs.mkdirSync(PRIVATE,{recursive:true,mode:0o700});
  const receiptPath = path.join(PRIVATE,attemptKey+'.execution.private.json');
  const operationPolicies=Object.fromEntries(profiles.map(p=>[p.operation+'@'+p.id,{tokens:p.tokens,
    maxMicros:p.maxMicros,maxSeconds:p.maxSeconds,resource:p.device,retries:0}]));
  if (recover) {
    const saved=JSON.parse(fs.readFileSync(receiptPath));
    const service=createProcessingService({db,namespace:process.env.PROCESSING_LEDGER_NAMESPACE,
      limits:{dailyMicros:5000000,monthlyMicros:5000000,freeDailyMicros:5000000,apiDailyMicros:50000,maxActive:1,maxActiveUser:1},
      operations:operationPolicies});
    const adapter=createNativeWorkerAdapter({db,profile,request});
    await adapter.reconcilePending(service,saved.uid);
    const native=(await db.collection('video_edits').doc(saved.nativeJobId).get()).data();
    const binding=(await db.collection('processing_worker_bindings').doc(digest([saved.uid,saved.requestId])).get()).data();
    if(stage==='Q7-FAIL' && process.argv.includes('--replay')){
      if(binding?.state!=='settled'||binding.success!==false)throw Error('Terminal failed execution must be settled before replay');
      await adapter.reconcileBinding(binding,service);
      const nativeTerminal=(await db.collection('video_edits').doc(saved.nativeJobId).get()).data();
      if(!['failed','cancelled'].includes(nativeTerminal?.status))throw Error('Native UI must observe the provider termination');
      if(!fs.existsSync(path.join(PRIVATE,'Q7-cancellation.private.json')))throw Error('Actual cancellation receipt required');
      const terminal=(await request({method:'GET',url:'https://run.googleapis.com/v2/'+binding.executionName})).data;
      if(terminal.cancelledCount!==1)throw Error('Provider-confirmed cancelled task required');
      const replayApp=express();replayApp.use(express.json());
      replayApp.use(createProcessingGuard({service,adapters:{select:()=>adapter},authenticate:(req,res,next)=>{
        req.user={uid:saved.uid,claims:{email_verified:true}};next();}}));
      replayApp.post(route,(_req,res)=>res.status(500).json({error:'DUPLICATE_REACHED_DISPATCH'}));
      const response=await http(replayApp).post(route).set('Idempotency-Key',saved.requestId)
        .set('X-Processing-Tokens-Approved',String(profile.tokens)).send(JSON.parse(binding.requestCanonicalJSON));
      const executions=(await request({method:'GET',url:'https://run.googleapis.com/v2/'+profile.job+'/executions?pageSize=100'})).data.executions||[];
      const same=executions.filter(e=>e.template?.containers?.[0]?.env?.some(v=>v.name==='PROCESSING_DISPATCH_NONCE'&&v.value===binding.nonce));
      if(response.status!==409||same.length!==1)throw Error('Fresh-controller replay did not prove a single execution');
      fs.writeFileSync(path.join(ROOT,'reports/free-first-launch-20261127/q7-termination-replay-proof.json'),
        JSON.stringify({providerTerminated:true,freshControllerReplayHttp:response.status,matchingExecutions:same.length,
          nativeTerminalVisible:true,
          userTokensRestored:(await service.status(saved.uid)).remaining===100,physicalHostLossInjected:false,
          estimatedMicros:binding.actualMicros,actualInvoiceUsd:null},null,2)+'\n');
    }
    console.log(JSON.stringify({stage,nativeStatus:native?.status,nativeStage:native?.stage,progress:native?.progress,
      detail:native?.detail,state:binding?.state,success:binding?.success,
      actualMicros:binding?.actualMicros,processingError:native?.processingError,allowance:await service.status(saved.uid)}));
    await db.terminate();return;
  }
  if (correction && stage !== 'Q1-EXPORT') throw Error('Only the identified Q1 source transport correction is approved here');
  if (fs.existsSync(receiptPath)) throw Error('Stage already admitted; use --reconcile for GET-only recovery');
  const uid = 'free-first-launch-20261127-' + workflow.toLowerCase();
  const userRef = db.collection('users').doc(uid);
  if (!(await userRef.get()).exists) await userRef.create({ name:'Free allowance qualification '+workflow,
    subscriptionTier:'free',credits:0,createdAt:new Date().toISOString(),qualificationAccount:true });
  try { await admin.auth().getUser(uid); }
  catch(error) { if(error.code!=='auth/user-not-found')throw error;
    await admin.auth().createUser({uid,displayName:'AutoPromote Free qualification '+workflow}); }
  const bucket = storage.bucket();
  async function source(filename) {
    const absolute = path.resolve(ROOT,filename);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    const object = `uploads/videos/${uid}/qualification-${sha}${path.extname(filename)}`;
    const file = bucket.file(object);
    const [exists] = await file.exists();
    if (!exists) await bucket.upload(absolute,{destination:object,resumable:false,preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:filename.endsWith('.wav')?'audio/wav':'video/mp4',metadata:{ownerUid:uid,sha256:sha,purpose:'studio_source'}}});
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size)!==fs.statSync(absolute).size || metadata.metadata?.sha256!==sha) throw Error('Source generation conflict');
    const [url] = await file.getSignedUrl({action:'read',expires:Date.now()+2*3600000});
    return {url,object,sha256:sha,generation:metadata.generation,bytes:Number(metadata.size)};
  }
  const shortFile='tmp/free-first-workload-inputs/d563280d6d3f60c275be7900bafb71d4c67bcdc6531b811dcb19b904aeb3c526.mp4';
  const sourceRecord = await source(workflow==='Q2'?'tmp/free-first-workloads-20261126/episode-180s.mp4':shortFile);
  let body;
  if(stage==='Q1-ASR') body={video_url:sourceRecord.url,translate_to_english:'false',source_language:'auto'};
  if(stage==='Q1-AUDIO') body={video_url:sourceRecord.url,output_format:'mp3',async_mode:true};
  if(stage==='Q2-FIND') body={video_url:sourceRecord.url,source_duration_seconds:184,max_clips:3};
  if(stage==='Q2-EXPORT') {
    const finder=JSON.parse(fs.readFileSync(path.join(PRIVATE,'Q2-FIND.execution.private.json')));
    const native=(await db.collection('video_edits').doc(finder.nativeJobId).get()).data();
    const scene=native.processingResult?.scenes?.[0];
    if(!scene)throw Error('Complete production analysis before choosing its clip');
    body={video_url:sourceRecord.url,start_time:scene.start,end_time:Math.min(scene.end,scene.start+45),target_aspect_ratio:'9:16'};
  }
  if(['Q1-EXPORT','Q4-FX','Q7-FAIL'].includes(stage)) {
    body=JSON.parse(fs.readFileSync(path.join(ROOT,'reports/free-first-optimization-20261126/effects60-cpu4/request.json')));
    const old=body.video_url;
    const replace=v=>typeof v==='string'&&v===old?sourceRecord.url:Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;
    body=replace(body); body.async_mode=true;
    if(stage==='Q1-EXPORT') {
      const speech=JSON.parse(fs.readFileSync(path.join(PRIVATE,'Q1-ASR.execution.private.json')));
      const native=(await db.collection('video_edits').doc(speech.nativeJobId).get()).data();
      if(!native.processingResult?.segments?.length)throw Error('Production speech output required');
      body.auto_captions=true;
      body.caption_segments=require('../src/generated/studioDirectorReplayKernel.cjs').buildViralRenderData({
        finalVideoUrl:sourceRecord.url,selectedClip:{start:0,end:60},
        extraOptions:{captionSegments:native.processingResult.segments},
      }).caption_segments;
      if (correctionNumber === 3) {
        // Operator review: the readable production transcript is English, with
        // the introduction through49s and a second response from55.42s. Use
        // generic turn labels; no identity/name or verbatim-accuracy claim.
        body.caption_segments=body.caption_segments.map(s=>({...s,
          speaker:s.start_time>=55?'speaker_2':'speaker_1',speaker_label:s.start_time>=55?'Speaker 2':'Speaker 1',
          language:'en',language_label:'English',review_required:false}));
      }
      if (captionTrackExport) {
        // Preserve the actual editable transcription and its review flags.
        // Export the native effects/title film without claiming a reviewed
        // burnt-caption result. Generating/downloading captions is qualified
        // separately; this is the ordinary supported unburnt export choice.
        body.auto_captions=false;
        fs.writeFileSync(path.join(PRIVATE,'Q1-generated-caption-track.private.json'),
          JSON.stringify({segments:native.processingResult.segments,reviewPending:true,burntIntoFilm:false},null,2),{mode:0o600});
      }
      if(!body.caption_segments?.length || body.caption_segments.some(s=>!Number.isFinite(s.end_time)||!s.text))
        throw Error('Canonical caption render contract validation failed before dispatch');
    }
    if(stage==='Q7-FAIL') body.quality_enhancement_profile='qualification deliberate termination';
  }
  if(stage.startsWith('Q3-')) {
    body=JSON.parse(fs.readFileSync(path.join(ROOT,'reports/free-first-optimization-20261126/cam60-cpu4-optimized/request.json')));
    const cam1=await source('tmp/free-first-workloads-20261126/'+(stage==='Q3-CAM'?'source-60s.mp4':'camera-wide-mic-left-60s.mp4'));
    const cam2=await source('tmp/free-first-workloads-20261126/'+(stage==='Q3-CAM'?'camera-close-60s.mp4':'camera-close-mic-right-60s.mp4'));
    const audio=await source('tmp/free-first-workloads-20261126/external-audio-60s.wav');
    body.sources[0].url=cam1.url;body.sources[1].url=cam2.url;body.external_audio_url=audio.url;
    body.sources[0].cache_key=cam1.sha256;body.sources[1].cache_key=cam2.sha256;
    body.external_audio_cache_key=audio.sha256;
    body.auto_switch=true;body.async_mode=true;
    if(stage==='Q3-CAM-CHANNELS'||stage==='Q3-CAM-SYNC-CORRECTED'||stage==='Q3-CAM-DELIVERY-CORRECTED') {
      const preflight=JSON.parse(fs.readFileSync(path.join(PRIVATE,'Q3-PREFLIGHT-RANGE.execution.private.json')));
      const result=(await db.collection('video_edits').doc(preflight.nativeJobId).get()).data()?.processingResult;
      if(result?.status!=='good')throw Error('Production sync preflight must pass before the corrected camera render');
      body.trusted_sync_contract=result.trusted_sync_contract||result.trustedSyncContract;
      if(stage!=='Q3-CAM-CHANNELS')for(const source of body.sources){
        const fit=body.trusted_sync_contract?.sources?.[source.id];
        if(!fit)throw Error('The real preflight has no fitted camera timing');
        source.offset_seconds=fit.offset_seconds;source.sync_rate=fit.sync_rate;source.syncRate=fit.sync_rate;
      }
    }
  }
  const nativeJobId='launch-'+stage.toLowerCase()+'-'+crypto.randomUUID();
  body.job_id=nativeJobId;
  require('../src/services/processingTokens/nativeWorkerAdapter').validateNativePayload(endpoint,body);
  const requestId='launch-'+attemptKey.toLowerCase();
  const fingerprint=digest({path:route,body});
  const limits={dailyMicros:5000000,monthlyMicros:5000000,freeDailyMicros:5000000,apiDailyMicros:50000,maxActive:1,maxActiveUser:1};
  const service=createProcessingService({db,namespace:process.env.PROCESSING_LEDGER_NAMESPACE,limits,
    operations:operationPolicies});
  const control=(await db.collection(process.env.PROCESSING_LEDGER_NAMESPACE+'_control').doc('global').get()).data();
  if (!control) await service.configure({enabled:true});
  else if (control.enabled !== true || control.suspensionReason) throw Error('Qualification ledger suspended; reconcile before continuing');
  await db.collection('processing_worker_qualifications').doc(profile.qualificationId).set({
    kind:'funded-qualification',approved:true,profileDigest:digest(profile),expiresAt:new Date(Date.now()+24*3600000).toISOString(),
    allowedRequests:[{userId:uid,requestId,fingerprint}],maximumMicros:profile.maxMicros,
    note:'Specific owner-funded test authorization; not a production qualification receipt.'});
  const adapter=createNativeWorkerAdapter({db,profile,request});
  const app=express();app.use(express.json({limit:'1mb'}));
  app.use(createProcessingGuard({service,adapters:{select:()=>adapter},authenticate:(req,res,next)=>{
    req.user={uid,claims:{email_verified:true}};req.userId=uid;next(); }}));
  app.post(route,async(req,res)=>{try{
    if(stage==='Q1-AUDIO')return res.json(await require('../src/services/mediaWorkerTaskQueue').queueAudioExtractionTask({
      jobId:req.body.job_id,videoUrl:req.body.video_url,outputFormat:'mp3'}));
    const target='https://native.invalid'+endpoint;
    const output=await axios.post(target,req.body,await applicationWorkerConfig(target,req.body));res.json(output.data);
  }catch(error){res.status(error.status||503).json({error:error.code||'PROCESSING_PENDING'});}});
  const record={stage,attemptKey,profile,uid,requestId,nativeJobId,profileId,maximumMicros:profile.maxMicros,source:sourceRecord,
    startedAt:new Date().toISOString(),testHarness:'Canonical API worker transport and production Jobs; public ordinary-user flow verified separately after release.'};
  fs.writeFileSync(receiptPath,JSON.stringify(record,null,2),{mode:0o600});
  const response=await http(app).post(route).set('Idempotency-Key',requestId)
    .set('X-Processing-Tokens-Approved',String(profile.tokens)).send(body);
  record.httpStatus=response.status;record.response=response.body;
  fs.writeFileSync(receiptPath,JSON.stringify(record,null,2),{mode:0o600});
  console.log(JSON.stringify({stage,httpStatus:response.status,nativeJobId,maximumUsd:profile.maxMicros/1e6,
    state:response.body.status||response.body.error,allowance:await service.status(uid)}));
  if(cancellation)await cancellation;
  await db.terminate();
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});

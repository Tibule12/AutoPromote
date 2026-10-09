const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const execFile = require('util').promisify(require('child_process').execFile);
const { db } = require('../firebaseAdmin');
const { createNvidiaFactoryProviders } = require('./contentFactoryProviders');
const { getStudioSourceBucket, resolveOwnedStudioVideoSource } = require('./studioSourceService');
const {visualSubjectsForCaption} = require('./studioBRollPlanGrounding');
const fail = (code, statusCode = 400) => Object.assign(new Error(code), {code,statusCode});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const jobs = () => db.collection('studio_broll_jobs');
const runningJobs = new Set();

function normalizeBRollRequest(input) {
  if (!input || Object.keys(input).some(k=>!['requestId','projectId','sourceStoragePath','captions','duration','maxShots','excludedCaptionIds'].includes(k)) ||
      !validId(input.requestId) || !validId(input.projectId) || typeof input.sourceStoragePath !== 'string' ||
      !Number.isFinite(input.duration) || input.duration < 1 || input.duration > 3600 ||
      !Array.isArray(input.captions) || !input.captions.length || input.captions.length > 400 ||
      ![1,2,3].includes(input.maxShots || 2)) throw fail('BROLL_REQUEST_INVALID');
  const captions=input.captions.map(c=>({id:c.id,start:c.start,end:c.end,text:c.text,reviewRequired:c.reviewRequired === true}));
  if (captions.some(c=>!validId(c.id) || !Number.isFinite(c.start) || !Number.isFinite(c.end) ||
      c.start < 0 || c.end <= c.start || c.end > input.duration + .05 ||
      typeof c.text !== 'string' || !c.text.trim() || c.text.length > 500) ||
      new Set(captions.map(c=>c.id)).size !== captions.length) throw fail('BROLL_TRANSCRIPT_INVALID');
  if (captions.some(c=>c.reviewRequired)) throw fail('BROLL_TRANSCRIPT_REVIEW_REQUIRED',409);
  const excludedCaptionIds=input.excludedCaptionIds || [];
  if(!Array.isArray(excludedCaptionIds) || excludedCaptionIds.length>400 ||
      excludedCaptionIds.some(id=>!captions.some(c=>c.id===id)))throw fail('BROLL_REQUEST_INVALID');
  return {projectId:input.projectId,sourceStoragePath:input.sourceStoragePath,captions,
    duration:input.duration,maxShots:input.maxShots || 2,excludedCaptionIds:[...new Set(excludedCaptionIds)]};
}

function validateBRollPlan(plan, request) {
  if (!plan || typeof plan.reason !== 'string' || !Array.isArray(plan.shots) || plan.shots.length > request.maxShots)
    throw fail('BROLL_PLAN_INVALID',422);
  const seen=new Set();
  const shots=plan.shots.map((shot,i)=>{
    const cue=request.captions.find(c=>c.id===shot.captionId);
    if (!cue || shot.evidenceQuote!==cue.text || seen.has(cue.id) ||
        request.excludedCaptionIds?.includes(cue.id) ||
        typeof shot.subjectQuote!=='string' || !visualSubjectsForCaption(cue).includes(shot.subjectQuote.toLowerCase()) ||
        typeof shot.title!=='string' || !shot.title.trim() || shot.title.length>100 ||
        typeof shot.prompt!=='string' || shot.prompt.length<20 || shot.prompt.length>1500 ||
        !Number.isFinite(shot.start) || shot.start<cue.start || shot.start>=cue.end ||
        !Number.isFinite(shot.duration) || shot.duration<1 || shot.duration>4 || shot.start+shot.duration>request.duration ||
        /\b(i decided|my decision|realised|realized|that changed me)\b/i.test(cue.text)) throw fail('BROLL_PLAN_NOT_GROUNDED',422);
    seen.add(cue.id);
    return {...shot,id:`shot-${i+1}`};
  }).sort((a,b)=>a.start-b.start);
  if(shots.some((s,i)=>i && s.start-shots[i-1].start<8)) throw fail('BROLL_PLAN_OVERLAPPING',422);
  return {reason:plan.reason.slice(0,500),shots};
}

function configuration(minimumSeconds = 1800) {
  const deadlineEpoch=Number(process.env.STUDIO_BROLL_GPU_DEADLINE_EPOCH);
  if(process.env.STUDIO_BROLL_GENERATION_ENABLED!=='true' || !Number.isFinite(deadlineEpoch) || deadlineEpoch < Date.now()/1000 + minimumSeconds ||
      !process.env.STUDIO_BROLL_ARTIFACT_ROOT || !process.env.STUDIO_BROLL_REMOTE_ROOT || !process.env.STUDIO_BROLL_NVIDIA_HOST)
    throw fail('BROLL_GENERATOR_UNAVAILABLE',503);
  return {deadlineEpoch,root:process.env.STUDIO_BROLL_ARTIFACT_ROOT,
    remoteRoot:process.env.STUDIO_BROLL_REMOTE_ROOT,host:process.env.STUDIO_BROLL_NVIDIA_HOST};
}

async function ownedJob(ownerUid, jobId) {
  if(!/^[a-f0-9]{40}$/.test(jobId || '')) throw fail('BROLL_JOB_MISSING',404);
  const ref=jobs().doc(jobId),snapshot=await ref.get();
  if(!snapshot.exists || snapshot.data().ownerUid!==ownerUid) throw fail('BROLL_JOB_MISSING',404);
  return {ref,job:JSON.parse(snapshot.data().record)};
}

const writeJob = (ref,job) => {
  job.updatedAt=new Date().toISOString();
  return ref.set({ownerUid:job.ownerUid,status:job.status,record:JSON.stringify(clean(job))});
};

async function presentJob(job) {
  const result=clean(job);
  result.inputState=result.request;
  delete result.request;
  for (const shot of result.shots || []) {
    delete shot.generatedArtifact;
    // Only durable owned storage is exposed, never workstation/GPU paths.
    if(shot.asset?.storagePath) {
      const source=await resolveOwnedStudioVideoSource({storagePath:shot.asset.storagePath,userId:job.ownerUid});
      shot.asset.url=source.signedUrl;
    }
  }
  return result;
}

const shotCriteria=[
  'The moving shot depicts the concrete subject in the quoted transcript as a nonidentifying illustration.',
  'No visible distorted anatomy, broken objects, text, logos or distracting generation defects in sampled frames.',
  'The shot has stable framing and believable restrained physical movement suitable for a short podcast cutaway.',
];
async function reviewAndStoreShot({provider,generated,shot,job,config,gpuTask}) {
  const artifact=await provider.verifyArtifact(generated.artifact);
  const root=path.join(config.root,job.id),real=await fs.realpath(path.join(root,artifact.path));
  if(!real.startsWith(await fs.realpath(root)+path.sep))throw fail('BROLL_ARTIFACT_PATH_INVALID',409);
  await execFile('ffmpeg',['-v','error','-xerror','-err_detect','explode','-i',real,'-f','null','-'],{timeout:60000,maxBuffer:1024*1024});
  artifact.independentFullDecode=true;
  shot.generatedArtifact={...generated,artifact};
  const requirement={assetId:shot.id,type:'video',sourceQuote:shot.evidenceQuote,
    visualSubject:shot.subjectQuote || '',role:'Generated illustrative cutaway, not archival footage. Respect concrete subjects, actions and explicit counts in the spoken source. Incidental prop-count choices in the generation prompt are not owner requirements; evaluate these exact usability criteria and actual visual defects.'};
  const review=await gpuTask(()=>provider.review({artifact,requirement,criteria:shotCriteria}));
  shot.systemReviewHistory=[...(shot.systemReviewHistory || []),...(shot.review?[shot.review]:[])];
  shot.review=review;
  if(!review.accepted || review.artifactSha256!==artifact.sha256 || !review.criteria?.every(c=>c.passed)) {
    shot.status='rejected';shot.remainingIssue=review.reason || 'Visual review rejected this shot.';return;
  }
  const provenance={provider:'wan',model:generated.model,modelRevision:generated.modelRevision,
    settings:generated.settings,seed:shot.seed,prompt:shot.prompt,jobId:job.id,
    attemptId:`br-${job.id.slice(0,20)}-${shot.id}`,contentHash:artifact.sha256,
    origin:'generated_illustration',evidenceQuote:shot.evidenceQuote,captionId:shot.captionId,
    review,systemReviewHistory:shot.systemReviewHistory,technical:{independentFullDecode:true,
      duration:artifact.duration,width:artifact.width,height:artifact.height}};
  const storagePath=`studio/sources/${job.ownerUid}/generated_${job.id}_${shot.id}_${artifact.sha256}.mp4`;
  await getStudioSourceBucket('durable_studio').upload(real,{destination:storagePath,resumable:false,
    metadata:{contentType:'video/mp4',cacheControl:'private, no-store, max-age=0',metadata:{
      ownerUid:job.ownerUid,purpose:'studio_project',contentHash:artifact.sha256,generationJobId:job.id,
      generationReview:'system_reviewed',origin:'generated_illustration'}}});
  shot.asset={id:`generated-${job.id}-${shot.id}`,name:`Generated illustration — ${shot.title}`,
    storagePath,sourceStoragePath:storagePath,contentHash:artifact.sha256,duration:artifact.duration,
    width:artifact.width,height:artifact.height,status:'ready',isLocal:false,generationProvenance:provenance};
  shot.status='ready_for_review';delete shot.remainingIssue;
}

async function processJob(ref,job,config,capacity) {
  if(runningJobs.has(job.id))return;
  runningJobs.add(job.id);
  const provider=createNvidiaFactoryProviders({...config,root:path.join(config.root,job.id),remoteRoot:`${config.remoteRoot}/${job.id}`});
  const gpuTask=async action=>{
    for(;;){
      try{return await action();}
      catch(error){
        if(error.code!=='CONTENT_FACTORY_GPU_BUSY' || Date.now()/1000+1800>config.deadlineEpoch)throw error;
        job.status='waiting_for_gpu';await writeJob(ref,job);
        await new Promise(resolve=>setTimeout(resolve,15000));
      }
    }
  };
  try {
    job.status='planning';await writeJob(ref,job);
    const planned=await gpuTask(()=>provider.planBRoll({jobId:job.id,...job.request}));
    job.plan=validateBRollPlan(planned.plan,job.request);job.planner=planned.provenance;
    job.shots=job.plan.shots.map(s=>({...s,status:'queued'}));
    job.status=job.shots.length?'generating':'no_cutaways_needed';await writeJob(ref,job);
    if(!job.shots.length)return;
    for (const shot of job.shots) {
      try {
        const seed=crypto.randomInt(1,2147483647);
        const requirement={assetId:shot.id,beatId:shot.captionId,type:'video',provider:'wan',videoModel:'wan_ti2v_5b',
          prompt:shot.prompt,duration:5.04,seed,negativePrompt:'static image, frozen action, motionless camera, text, words, captions, letters, watermarks, logos, screen interface, distorted geometry, warped straight lines, blurry, low quality, artifacts, cartoon, incoherent temporal changes, strobing, shaky camera',acceptanceCriteria:[
            'The moving shot depicts the concrete subject in the quoted transcript as an illustration.',
            'No visible distorted anatomy, broken objects, text, logos or distracting generation defects in sampled frames.',
            'The shot has stable framing and believable restrained movement suitable for a short podcast cutaway.']};
        const attemptId=`br-${job.id.slice(0,20)}-${shot.id}`;
        shot.status='generating';shot.seed=seed;await writeJob(ref,job);
        const generated=await gpuTask(()=>provider.generate({ownerUid:job.ownerUid,jobId:job.id,attemptId,attempt:1,requirement,
          sourceBrief:`Generate an illustrative B-roll cutaway for this exact spoken evidence: ${shot.evidenceQuote}. Original programme speech continues; this is not archival footage of the speaker.`}));
        await reviewAndStoreShot({provider,generated,shot,job,config,gpuTask});
        await writeJob(ref,job);
      } catch(error) {
        shot.status='failed';shot.remainingIssue=String(typeof error.code==='string'?error.code:'BROLL_GENERATION_FAILED').slice(0,160);
        await writeJob(ref,job);
      }
    }
    job.status=job.shots.every(s=>s.status==='ready_for_review')?'ready_for_review':'partial';
    await writeJob(ref,job);
  } catch(error) {
    job.status='failed';job.error=String(typeof error.code==='string'?error.code:'BROLL_GENERATION_FAILED').slice(0,160);
    await writeJob(ref,job);
  } finally {
    runningJobs.delete(job.id);
    await db.runTransaction(async tx=>{const current=await tx.get(capacity);if(current.data()?.jobId===job.id) tx.delete(capacity);}).catch(()=>{});
  }
}

async function createBRollJob({ownerUid,input}) {
  const request=normalizeBRollRequest(input);
  const id=hash(`${ownerUid}\0${input.requestId}`).slice(0,40),ref=jobs().doc(id),fingerprint=hash(JSON.stringify(request));
  const prior=await ref.get();
  if(prior.exists){if(prior.data().ownerUid!==ownerUid || JSON.parse(prior.data().record).fingerprint!==fingerprint)
    throw fail('BROLL_REQUEST_CONFLICT',409);return presentJob(JSON.parse(prior.data().record));}
  const config=configuration();
  await resolveOwnedStudioVideoSource({storagePath:request.sourceStoragePath,userId:ownerUid});
  const capacity=db.collection('studio_broll_capacity').doc('nvidia');
  const budget=db.collection('studio_broll_budgets').doc(hash(`${ownerUid}:${new Date().toISOString().slice(0,10)}`));
  const job={schemaVersion:1,id,ownerUid,fingerprint,request,projectId:request.projectId,status:'queued',shots:[],
    createdAt:new Date().toISOString(),gpuDeadlineEpoch:config.deadlineEpoch};
  const created=await db.runTransaction(async tx=>{
    const [existing,lock,daily]=await Promise.all([tx.get(ref),tx.get(capacity),tx.get(budget)]);
    if(existing.exists){const record=JSON.parse(existing.data().record);
      if(record.fingerprint!==fingerprint || record.ownerUid!==ownerUid)throw fail('BROLL_REQUEST_CONFLICT',409);return record;}
    if(lock.exists && lock.data().expiresAt>Date.now()) throw fail('BROLL_GPU_BUSY',429);
    const used=daily.data()?.shots || 0;
    if(used+request.maxShots>12) throw fail('BROLL_DAILY_LIMIT',429);
    tx.set(capacity,{jobId:id,expiresAt:config.deadlineEpoch*1000});
    tx.set(budget,{ownerUid,shots:used+request.maxShots});
    tx.create(ref,{ownerUid,status:'queued',record:JSON.stringify(job)});return null;
  });
  if(created)return presentJob(created);
  setImmediate(()=>processJob(ref,job,config,capacity).catch(()=>{}));
  return presentJob(job);
}

async function getBRollJob({ownerUid,jobId}) {
  const {ref,job}=await ownedJob(ownerUid,jobId);
  // A locally restarted API can resume a queued plan without dispatching a
  // second generation or charging the daily allowance again. In-flight model
  // attempts are deliberately not guessed/restarted from an empty receipt.
  if(['queued','waiting_for_gpu','planning'].includes(job.status) && !job.shots.length && !runningJobs.has(job.id)) {
    try {
      const config=configuration(),capacity=db.collection('studio_broll_capacity').doc('nvidia');
      const lock=await capacity.get();
      if(lock.data()?.jobId===job.id && lock.data().expiresAt>Date.now())
        setImmediate(()=>processJob(ref,job,config,capacity).catch(()=>{}));
    }catch(_error){/* Preserve a recoverable record when the generator is offline. */}
  }
  return presentJob(job);
}

async function listBRollJobs({ownerUid,projectId}) {
  if(!validId(projectId))throw fail('BROLL_REQUEST_INVALID');
  const snapshot=await jobs().where('ownerUid','==',ownerUid).limit(50).get();
  const records=snapshot.docs.map(doc=>JSON.parse(doc.data().record))
    .filter(job=>job.ownerUid===ownerUid && job.projectId===projectId)
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,5);
  return Promise.all(records.map(job=>presentJob(job)));
}

async function processShotRecheck(ref,job,config,capacity) {
  if(runningJobs.has(job.id))return;
  runningJobs.add(job.id);
  const shot=job.shots.find(s=>s.recheckPending);
  try {
    const provider=createNvidiaFactoryProviders({...config,root:path.join(config.root,job.id),remoteRoot:`${config.remoteRoot}/${job.id}`});
    let generated=shot.generatedArtifact;
    if(!generated) {
      // Compatibility with already-created jobs: recover this same owner's
      // immutable provider receipt, never infer approval from a file existing.
      const attemptId=`br-${job.id.slice(0,20)}-${shot.id}`;
      const receipt=JSON.parse(await fs.readFile(path.join(config.root,job.id,'assets',attemptId,'generation-receipt.json'),'utf8'));
      if(receipt.sha256!==shot.recheckContentHash || receipt.shot.name!==attemptId ||
          receipt.shot.prompt!==shot.prompt || receipt.shot.seed!==shot.seed)throw fail('BROLL_REVIEW_HASH_MISMATCH',409);
      generated={artifact:{path:`assets/${attemptId}/video.mp4`,sha256:receipt.sha256},
        model:receipt.model.model,modelRevision:receipt.model.revision,
        settings:{steps:receipt.steps,width:receipt.width,height:receipt.height,fps:receipt.fps,negativePrompt:receipt.negative_prompt}};
    }
    if(generated.artifact.sha256!==shot.recheckContentHash)throw fail('BROLL_REVIEW_HASH_MISMATCH',409);
    const gpuTask=async action=>{
      for(;;)try{return await action();}catch(error){
        if(error.code!=='CONTENT_FACTORY_GPU_BUSY' || Date.now()/1000+180>config.deadlineEpoch)throw error;
        await new Promise(resolve=>setTimeout(resolve,15000));
      }
    };
    await reviewAndStoreShot({provider,generated,shot,job,config,gpuTask});
  } catch(error) {
    shot.status='rejected';shot.remainingIssue=String(typeof error.code==='string'?error.code:'BROLL_RECHECK_FAILED');
  } finally {
    delete shot.recheckPending;delete shot.recheckContentHash;
    job.status=job.shots.every(s=>['accepted','ready_for_review'].includes(s.status))?'ready_for_review':'partial';
    await writeJob(ref,job);
    runningJobs.delete(job.id);
    await db.runTransaction(async tx=>{const lock=await tx.get(capacity);if(lock.data()?.jobId===job.id)tx.delete(capacity);}).catch(()=>{});
  }
}

async function recheckBRollShot({ownerUid,jobId,shotId,contentHash}) {
  const {ref,job}=await ownedJob(ownerUid,jobId);
  const shot=job.shots.find(s=>s.id===shotId);
  if(job.status==='reviewing' && shot?.recheckContentHash===contentHash)return presentJob(job);
  if(!['partial','ready_for_review'].includes(job.status) || shot?.status!=='rejected' ||
      !/^[a-f0-9]{64}$/.test(contentHash || '') || shot.review?.artifactSha256!==contentHash)
    throw fail('BROLL_RECHECK_NOT_READY',409);
  const config=configuration(180),capacity=db.collection('studio_broll_capacity').doc('nvidia');
  await db.runTransaction(async tx=>{const lock=await tx.get(capacity);
    if(lock.exists && lock.data().expiresAt>Date.now())throw fail('BROLL_GPU_BUSY',429);
    tx.set(capacity,{jobId:job.id,expiresAt:config.deadlineEpoch*1000});
    shot.recheckPending=true;shot.recheckContentHash=contentHash;job.status='reviewing';
    tx.set(ref,{ownerUid,status:job.status,record:JSON.stringify(job)});
  });
  setImmediate(()=>processShotRecheck(ref,job,config,capacity).catch(()=>{}));
  return presentJob(job);
}

async function reviewBRollShot({ownerUid,jobId,shotId,decision,contentHash}) {
  if(!['accept','reject'].includes(decision) || !/^[a-f0-9]{64}$/.test(contentHash || ''))throw fail('BROLL_REVIEW_INVALID');
  const {ref}=await ownedJob(ownerUid,jobId);
  const job=await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists || snapshot.data().ownerUid!==ownerUid)throw fail('BROLL_JOB_MISSING',404);
    const current=JSON.parse(snapshot.data().record);
    if(!['ready_for_review','partial'].includes(current.status))throw fail('BROLL_REVIEW_NOT_READY',409);
    const shot=current.shots.find(s=>s.id===shotId);
    if(!shot?.asset || !['ready_for_review','accepted','rejected_by_owner'].includes(shot.status) ||
        shot.asset.contentHash!==contentHash || !shot.review?.accepted)throw fail('BROLL_REVIEW_HASH_MISMATCH',409);
    const status=decision==='accept'?'accepted':'rejected_by_owner';
    if(shot.status!==status){
      shot.status=status;
      shot.asset.generationProvenance.reviewHistory=[...(shot.asset.generationProvenance.reviewHistory || []),
        {decision,ownerUid,contentHash,at:new Date().toISOString()}];
    }
    current.updatedAt=new Date().toISOString();
    tx.set(ref,{ownerUid,status:current.status,record:JSON.stringify(current)});return current;
  });
  return presentJob(job);
}

async function assertGeneratedBRollExport({ownerUid,storagePath}) {
  if(!storagePath.startsWith(`studio/sources/${ownerUid}/generated_`))return;
  const match=storagePath.match(/\/generated_([a-f0-9]{40})_(shot-\d+)_([a-f0-9]{64})\.mp4$/);
  if(!match)throw fail('BROLL_GENERATED_SOURCE_INVALID',422);
  const {job}=await ownedJob(ownerUid,match[1]);
  const shot=job.shots.find(s=>s.id===match[2]);
  if(shot?.status!=='accepted' || shot.asset?.storagePath!==storagePath || shot.asset.contentHash!==match[3] ||
      !shot.review?.accepted || shot.review.artifactSha256!==match[3])throw fail('BROLL_GENERATED_SOURCE_NOT_APPROVED',422);
}

module.exports={normalizeBRollRequest,validateBRollPlan,createBRollJob,getBRollJob,listBRollJobs,reviewBRollShot,recheckBRollShot,assertGeneratedBRollExport};

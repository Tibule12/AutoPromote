#!/usr/bin/env node
// Real private GPU proof through the same capability router used by the API.
// File storage/owner assertions are an isolated development transport, not an
// authentication bypass or a claim of production Studio qualification.
const fs=require('fs/promises');
const path=require('path');
const crypto=require('crypto');
const {execFileSync}=require('child_process');
const {OAuth2Client}=require('google-auth-library');
const {Storage}=require('@google-cloud/storage');
const {ModelCapabilityRuntime}=require('../../src/modelRuntime/router');
const {FileStore,FileArtifactStore,immutableJson}=require('../../src/modelRuntime/stores');
const {CloudRunCapabilityWorker}=require('../../src/modelRuntime/cloudRunWorker');
const {hash,stable,fail}=require('../../src/modelRuntime/contract');
const studio=require('../../src/generated/studioDirectorReplayKernel.cjs');
const repo=path.resolve(__dirname,'../..');
const root=path.join(repo,'reports/model-capability-runtime-v1-20261009/proof');
const ownerUid='model-runtime-proof';
const projectId='model-runtime-v1-proof-20261009';
const bucketName='autopromote-cc6d3-viral-studio-3d';
async function credentials() {
  const client=new OAuth2Client();
  // Kept in memory only. Never printed, committed or persisted in artifacts.
  client.setCredentials({access_token:execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim(),expiry_date:Date.now()+45*60000});
  return {client,bucket:new Storage({projectId:'autopromote-cc6d3',authClient:client}).bucket(bucketName)};
}
async function initialize() {
  const {bucket}=await credentials();const source=path.join(root,'media/source.mp4');const bytes=await fs.readFile(source),sha256=hash(bytes);
  const storagePath=`studio/sources/${ownerUid}/source-${sha256}.mp4`,file=bucket.file(storagePath);
  const [exists]=await file.exists();
  if(!exists)await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',metadata:{ownerUid,purpose:'studio_source',sha256,contentHash:sha256,projectId}}});
  const [meta]=await file.getMetadata();
  if(meta.metadata?.ownerUid!==ownerUid || meta.metadata?.sha256!==sha256 || Number(meta.size)!==bytes.length)throw fail('PROOF_SOURCE_IDENTITY_CHANGED');
  const sourceIdentity={sha256,storagePath,bucket:bucketName,generation:String(meta.generation),size:bytes.length};
  await immutableJson(path.join(root,'source-identity.json'),sourceIdentity);
  const clip={id:'proof-source',name:'Recorded source · 3-second excerpt',sourceClipId:'proof-source',startRequest:0,endRequest:3,duration:3,contentHash:sha256,storagePath};
  const media={id:'proof-source',name:clip.name,type:'video',mediaType:'video',status:'ready',duration:3,width:960,height:540,url:'http://127.0.0.1:6021/factory-media/media/source.mp4',contentHash:sha256,storagePath};
  const snapshot={timeline:[clip],projectMedia:[media],orderedClips:[media],selectedClipId:'proof-source',reframeAspect:'16:9',
    exportSettings:{resolution:'1080p',fps:24,codec:'h264',audioCodec:'aac'},overlays:[],motionScenes:[],subjectVfxScenes:[],captionSegments:[],autoCaptions:false,analysisRefs:[],soundEffects:[],speedKeyframes:[],trackStates:{},muteOriginalAudio:false};
  const document=studio.adaptStudioSnapshotToDocument({snapshot,projectId});studio.validateStudioProjectDocument(document);
  await immutableJson(path.join(root,'initial-project.json'),{projectId,ownerUid,document,snapshot});
  console.log(JSON.stringify({event:'proof_source_ingested',projectId,sourceSha256:sha256,sourceGeneration:meta.generation}));
}
async function runtime() {
  const {client,bucket}=await credentials();const initial=JSON.parse(await fs.readFile(path.join(root,'initial-project.json')));
  const source=JSON.parse(await fs.readFile(path.join(root,'source-identity.json')));
  const artifacts=new FileArtifactStore(path.join(root,'artifacts')),jobs=new FileStore(path.join(root,'journal'));
  const config=JSON.parse(await fs.readFile(path.join(repo,'config/model-runtime/deployment.proof.v1.json')));
  const workers=Object.fromEntries(Object.entries(config.workers).map(([key,c])=>[key,new CloudRunCapabilityWorker({client,bucket,artifactStore:artifacts,image:c.image,jobName:c.jobName})]));
  const authorize=async({ownerUid:uid,request:r})=>{
    if(uid!==ownerUid || r.projectId!==projectId || r.projectRevision!==initial.document.revision ||
       r.sourceAssetId!=='proof-source' || r.sourceSha256!==source.sha256 || r.sourceStoragePath!==source.storagePath ||
       r.sourceRange.endTick>270000 || hash(await fs.readFile(path.join(root,'media/source.mp4')))!==source.sha256)throw fail('PROOF_SOURCE_SCOPE_INVALID',409);
    const [metadata]=await bucket.file(source.storagePath,{generation:source.generation}).getMetadata();
    if(metadata.metadata?.ownerUid!==ownerUid || metadata.metadata?.sha256!==source.sha256)throw fail('PROOF_OWNER_INVALID',403);
    return source;
  };
  return {engine:new ModelCapabilityRuntime({jobs,artifacts,authorize,workers}),initial,source,bucket,jobs,artifacts};
}
async function latest(capability) {
  const files=(await fs.readdir(path.join(root,'artifacts'))).filter(f=>f.endsWith('.json'));
  const results=await Promise.all(files.map(f=>fs.readFile(path.join(root,'artifacts',f),'utf8').then(JSON.parse)));
  const matches=results.filter(a=>a.capability===capability).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  if(!matches.length)throw fail('PROOF_DEPENDENCY_MISSING');return matches.at(-1);
}
async function submit(capability,attempt='v1') {
  const {engine,initial,source}=await runtime();let parameters,dependencyHashes=[];
  await fs.writeFile(path.join(root,'resolved-registry.json'),stable(engine.resolvedRegistry()));
  if(capability==='understand_video')parameters={sampleCount:6,question:'Identify the main visible person and concrete recording objects. Describe visible changes across these frames.'};
  if(capability==='detect_object') {
    const understanding=await latest('understand_video');
    const subject=understanding.output.subjects.find(s=>/person|woman|man|host|presenter/i.test(s.label)) || understanding.output.subjects[0];
    parameters={query:subject.label,frameIndex:0,boxThreshold:.25,textThreshold:.2};dependencyHashes=[understanding.artifactHash];
    await fs.writeFile(path.join(root,'subject-selection.json'),stable({selectedBy:'runtime-proof-director',subject,evidenceArtifactHash:understanding.artifactHash,policy:'Visible main subject; final box chosen by largest detected area, not inferred identity.'}));
  }
  if(capability==='segment_subject') {
    const detection=await latest('detect_object');const d=[...detection.output.detections].sort((a,b)=>((b.box[2]-b.box[0])*(b.box[3]-b.box[1]))-((a.box[2]-a.box[0])*(a.box[3]-a.box[1])))[0];
    if(!d)throw fail('PROOF_NO_REAL_DETECTION');
    parameters={subjectId:'visible-subject-1',initialBox:d.box,points:[],shotPrompts:[]};dependencyHashes=[detection.artifactHash];
    await fs.writeFile(path.join(root,'selected-detection.json'),stable(d));
  }
  if(capability==='track_object') { const mask=await latest('segment_subject');parameters={subjectId:mask.output.subjectId,mode:'mask_centroid',maskArtifactHash:mask.artifactHash,points:[]};dependencyHashes=[mask.artifactHash]; }
  if(capability==='generate_video') {
    const understanding=await latest('understand_video');dependencyHashes=[understanding.artifactHash];
    parameters={mode:'text_to_video',prompt:'A cinematic close-up of a professional reel-to-reel audio tape recorder on a dark recording studio desk. Both large metal reels rotate continuously at a steady speed as audio tape travels between them. Warm amber VU meter needles swing back and forth. Soft purple studio light in the background. The camera is locked off. Clear sustained physical motion of the rotating reels. Realistic unbranded analog recording equipment, crisp details, no people, no writing, no logos.',
      negativePrompt:'static still image, frozen reels, camera zoom, camera pan, slideshow, lettering, logos, warped equipment, flicker, distorted objects, blurry, low quality',
      seed:20261009,width:1280,height:704,frames:121,fps:24,steps:30,guidance:5};
  }
  if(!parameters)throw fail('PROOF_CAPABILITY_UNKNOWN');
  const input={schemaVersion:1,requestId:`proof-${capability}-${attempt}`,projectId,projectRevision:initial.document.revision,
    sourceAssetId:'proof-source',sourceSha256:source.sha256,sourceStoragePath:source.storagePath,
    sourceRange:{space:'source',startTick:0,endTick:270000},capability,parameters,dependencyHashes};
  const result=await engine.submit({ownerUid,input});
  await fs.writeFile(path.join(root,capability+'-'+attempt+'-job.json'),stable(result));console.log(JSON.stringify(result));
}
async function poll(jobId) {
  const {engine}=await runtime();const state=await engine.reconcile({ownerUid,jobId});console.log(JSON.stringify(state));
  if(state.status==='completed') {
    const {artifact}=await engine.getArtifact({ownerUid,jobId});console.log(JSON.stringify({event:'artifact_persisted',artifactHash:artifact.artifactHash,capability:artifact.capability,metrics:artifact.metrics}));
  }
}
async function download(capability) {
  const {bucket}=await credentials();const a=await latest(capability);const directory=path.join(root,'outputs',capability);await fs.mkdir(directory,{recursive:true});
  for(const file of a.files) {
    const filename=path.join(directory,file.name);
    const [bytes]=await bucket.file(file.storagePath,{generation:file.generation}).download();
    if(bytes.length!==file.bytes || hash(bytes)!==file.sha256)throw fail('PROOF_DOWNLOAD_CHANGED');
    await fs.writeFile(filename,bytes,{mode:0o600});
  }
  console.log(JSON.stringify({event:'verified_artifact_download',capability,artifactHash:a.artifactHash,directory}));
}
async function main() {
  const [action,arg,attempt]=process.argv.slice(2);
  if(action==='init')return initialize();if(action==='submit')return submit(arg,attempt);
  if(action==='poll')return poll(arg);if(action==='download')return download(arg);
  if(action==='cancel') {const {engine}=await runtime();console.log(JSON.stringify(await engine.cancel({ownerUid,jobId:arg})));return;}
  throw new Error('Use init | submit CAPABILITY [ATTEMPT] | poll JOB | download CAPABILITY | cancel JOB');
}
if(require.main===module)main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
module.exports={runtime,latest,root,ownerUid,projectId,credentials};

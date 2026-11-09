#!/usr/bin/env node
// Private founder operator. Import is CPU-only; scene planning/generation use
// the configured retained NVIDIA providers and the ordinary Factory worker.
const fs=require('fs/promises'),path=require('path');
const {localFactoryStore,firestoreFactoryStore}=require('../src/services/contentFactoryStore');
const {createContentFactoryService}=require('../src/services/contentFactoryService');
const {createScreenplayProductionService}=require('../src/services/screenplayProductionService');
const {createNvidiaFactoryProviders}=require('../src/services/contentFactoryProviders');
const {createFactoryArtifactAccess}=require('../src/services/contentFactoryArtifactAccess');
async function main(){
 const args=process.argv.slice(2),get=name=>{const at=args.indexOf(name);return at<0?null:args[at+1]};
 const uid=get('--owner')||process.env.CONTENT_FACTORY_OWNER_UID;
 if(process.env.CONTENT_FACTORY_ENABLED!=='true'||!(process.env.CONTENT_FACTORY_ADMIN_UIDS||'').split(',').map(s=>s.trim()).includes(uid))throw Error('Private founder configuration required');
 const root=path.resolve(get('--root')||process.env.CONTENT_FACTORY_ARTIFACT_ROOT||'/var/lib/autopromote/content-factory');
 const store=args.includes('--firestore')?firestoreFactoryStore(require('../src/firebaseAdmin').db):localFactoryStore(root);
 let providers=null;
 if(args.includes('--plan-scenes')||get('--process-scene')){
  const window=get('--gpu-window')?JSON.parse(await fs.readFile(get('--gpu-window'),'utf8')):{};
  providers=createNvidiaFactoryProviders({root,host:process.env.CONTENT_FACTORY_NVIDIA_SSH_HOST,remoteRoot:process.env.CONTENT_FACTORY_NVIDIA_ROOT,
   ...(process.env.CONTENT_FACTORY_NVIDIA_SSH_PORT?{sshPort:Number(process.env.CONTENT_FACTORY_NVIDIA_SSH_PORT)}:{}),
   deadlineEpoch:Number(window.deadline_epoch||process.env.CONTENT_FACTORY_GPU_DEADLINE_EPOCH),python:process.env.CONTENT_FACTORY_PYTHON||'python3'});
 }
 if(args.includes('--prepare-assembly')&&!providers)providers=createFactoryArtifactAccess({root});
 const factory=createContentFactoryService({store,providers}),service=createScreenplayProductionService({store,factory,providers});
 let productionId=get('--production');
 if(get('--screenplay')){
  const result=await service.create({uid,input:{requestId:get('--request')||`film-${Date.now()}`,title:get('--title')||'Untitled screenplay',format:get('--format')||'fountain',text:await fs.readFile(get('--screenplay'),'utf8')}});
  productionId=result.job.productionId;console.log(JSON.stringify({productionId,status:result.job.status,sceneCount:result.job.screenplay.scenes.length,sourceSha256:result.job.screenplay.source.sha256,duplicate:result.duplicate}));
 }
 if(!productionId)throw Error('Provide --screenplay or --production');
 let row=await service.get(uid,productionId);
 if(get('--review-plan')){
  const review=JSON.parse(await fs.readFile(get('--review-plan'),'utf8'));
  row=await service.reviewScenePlan({uid,productionId,...review});
 }
 if(args.includes('--plan-scenes'))for(const scene of row.screenplay.scenes)row=await service.planScene({uid,productionId,sceneId:scene.sceneId});
 if(get('--queue-scene')||get('--process-scene')){
  const child=await service.queueScene({uid,productionId,sceneId:get('--queue-scene')||get('--process-scene')});
  console.log(JSON.stringify({sceneJobId:child.job.jobId,duplicate:child.duplicate,status:child.job.status}));
  if(get('--process-scene')){const result=await factory.process(child.job.jobId);console.log(JSON.stringify({sceneJobId:child.job.jobId,status:result.status,failure:result.failure}));if(result.status!=='awaiting_founder_review')process.exitCode=1;}
 }
 if(args.includes('--prepare-assembly')){
  const assembly=await service.prepareAssembly({uid,productionId});await fs.mkdir(path.join(root,'screenplays'),{recursive:true,mode:0o700});
  const file=path.join(root,'screenplays',`${productionId}-assembly.json`);await fs.writeFile(file,JSON.stringify(assembly,null,2),{mode:0o600});console.log(JSON.stringify({productionId,stage:assembly.stage,artifact:file}));
 }
 if(!get('--screenplay'))console.log(JSON.stringify({productionId,status:row.status,scenes:row.screenplay.scenes.map(s=>({sceneId:s.sceneId,status:s.status,planHash:s.plan?.planHash||null}))}));
}
main().catch(e=>{console.error(`${e.code||'SCREENPLAY_FAILED'}: ${e.message}`);process.exitCode=1});

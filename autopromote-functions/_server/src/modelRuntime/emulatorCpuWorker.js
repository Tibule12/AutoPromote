// Actual inference transport used only by the guarded loopback application demo.
// Runtime/model/source ownership and immutable artifact publication stay shared.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {hash,stable,fail}=require('./contract');
const {verifyArtifact}=require('./artifacts');
const {CloudRunCapabilityWorker}=require('./cloudRunWorker');
const {immutableJson}=require('./stores');
const root=path.resolve(__dirname,'../..');
const files=['model_workers/common.py','model_workers/emulator_cpu.py','model_workers/adapters/cpu_segmentation.py',
 'model_workers/adapters/component_segmentation.py','model_workers/adapters/cpu_matting.py','model_workers/adapters/temporal_alpha.py',
 'model_workers/adapters/segmentation.py','model_workers/adapters/source_edge_alpha.py','model_workers/adapters/moving_detail_alpha.py','model_workers/adapters/photographed_opacity.py','model_workers/adapters/person_material_alpha.py','model_workers/adapters/fixed_source_neural.py','python_media_worker/studio_subject_matte.py','python_media_worker/studio_source_background.py','config/model-runtime/registry.v1.json','contracts/model-capabilities-v1.json'];
class EmulatorCpuWorker {
 static async create(options){
  require('../services/unifiedCredits/runtime').assertSandbox();
  if(process.env.STUDIO_BACKGROUND_DEMO!=='true'||process.env.NODE_ENV!=='test'||options.bucket.name!=='demo-autopromote-credits')throw fail('MODEL_DEMO_OFFLINE',503);
  const cuda=!!options.cudaProfile;
  if(cuda&&(process.env.STUDIO_BACKGROUND_DEMO_LOCAL_CUDA!=='true'||options.cudaProfile.kind!=='private_local_cuda_host_overlay_v1'))throw fail('MODEL_DEMO_CUDA_OFFLINE',503);
  const implementationNames=cuda?[...files,'model_workers/emulator_cuda.py','model_workers/adapters/bounded_attention.py','config/model-runtime/local-cuda-evaluation.v1.json']:files;
  const implementationFiles={};for(const name of implementationNames)implementationFiles[name]=hash(await fs.readFile(path.join(root,name)));
  const worker=new EmulatorCpuWorker();Object.assign(worker,options,{implementationNames,implementationFiles,
   image:cuda?`local-emulator-cuda@sha256:${hash({implementationFiles,runtimeOverlay:options.cudaProfile})}`:`local-emulator-cpu@sha256:${hash(implementationFiles)}`,resultPrefix:'studio/model-runtime/executions'});
  return worker;
 }
 prefix(job){return CloudRunCapabilityWorker.prototype.prefix.call(this,job);}
 work(job){return path.join(this.directory,job.id,job.attemptToken);}
 async copy(file,target,owner){
  if(!file||!/^\d+$/.test(file.generation)||file.bytes>75*1024**2)throw fail('MODEL_DEMO_INPUT_INVALID');
  const object=this.bucket.file(file.storagePath,{generation:file.generation}),[meta]=await object.getMetadata();
  if(String(meta.generation)!==file.generation||Number(meta.size)!==file.bytes||meta.metadata?.ownerUid!==owner)throw fail('MODEL_DEMO_INPUT_CHANGED');
  const [bytes]=await object.download();if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw fail('MODEL_DEMO_INPUT_CHANGED');
  await fs.writeFile(target,bytes,{flag:'wx',mode:0o600});
 }
 async dispatch(job){
  const work=this.work(job);await fs.mkdir(work,{recursive:true,mode:0o700});
  try {await fs.access(path.join(work,'started.json'));return {name:`local-process:${job.id}:${job.attemptToken}`};}catch(e){if(e.code!=='ENOENT')throw e;}
  let spec;
  try {
   const implementationFiles={};for(const name of this.implementationNames){const bytes=await fs.readFile(path.join(root,name));if(hash(bytes)!==this.implementationFiles[name])throw fail('MODEL_DEMO_IMPLEMENTATION_CHANGED');const to=path.join(work,'runtime',name);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,bytes,{flag:'wx'});implementationFiles[name]=hash(bytes);}
   await this.copy({storagePath:job.source.storagePath,generation:job.source.generation,sha256:job.source.sha256,bytes:job.source.size},path.join(work,'source'),job.ownerUid);
   let maskDependency;
   if(job.request.parameters.refinement){
    maskDependency=verifyArtifact(await this.artifacts.get(job.request.parameters.refinement.maskArtifactHash),{ownerUid:job.ownerUid,projectId:job.request.projectId,sourceSha256:job.request.sourceSha256});
    if(maskDependency.capability!=='segment_subject'||hash(maskDependency.sourceRange)!==hash(job.request.sourceRange)||maskDependency.sourceAssetId!==job.request.sourceAssetId||maskDependency.provenance.sourceGeneration!==job.source.generation)throw fail('MODEL_MASK_REFINEMENT_SOURCE_MISMATCH',409);
    for(const [name,target] of [[maskDependency.output.maskBundle.name,'dependency.tar.gz'],['normalized_source.mp4','parent_source.mp4']]){
     const f=maskDependency.files.find(v=>v.name===name);
     const expected=`${this.resultPrefix}/${job.ownerUid}/${maskDependency.provenance.jobId}/${maskDependency.provenance.attemptToken}/outputs/${name}`;
     if(f?.storagePath!==expected)throw fail('MODEL_DEMO_INPUT_INVALID');await this.copy(f,path.join(work,target),job.ownerUid);
    }
   }
   const modelDirectory=job.model.modelFamily==='ViTMatte'?this.refinementModelDirectory:this.modelDirectory;
   let componentDependency;
   if(maskDependency&&job.model.limits?.sourceResolutionEdges){
    componentDependency=await require('./componentGuidance').componentGuidance(maskDependency,this.artifacts);
    if(componentDependency)await this.copy(componentDependency.file,path.join(work,'component_dependency.tar.gz'),job.ownerUid);
   }
   if(this.cudaProfile&&job.model.requiredDevice!=='cuda'||!this.cudaProfile&&job.model.requiredDevice!=='cpu')throw fail('MODEL_DEMO_DEVICE_MISMATCH');
   spec={...job,implementationFiles,modelDirectory,...(this.cudaProfile?{runtimeOverlay:this.cudaProfile}:{}),...(maskDependency?{maskDependency}:{}),...(componentDependency?{componentDependency}:{})};await immutableJson(path.join(work,'spec.json'),spec);
  }catch(e){e.definitelyNotStarted=true;throw e;}
  // Write the attempt marker before launch. An ambiguous acknowledgement never
  // launches another inference process for the same job.
  await immutableJson(path.join(work,'started.json'),{startedAt:Date.now(),requestHash:job.requestHash});
  const log=await fs.open(path.join(work,'process.log'),'a',0o600);
  const child=spawn(this.python,['-m',this.cudaProfile?'model_workers.emulator_cuda':'model_workers.emulator_cpu','--spec',path.join(work,'spec.json')],{
   cwd:path.join(work,'runtime'),env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',
    GCLOUD_PROJECT:'demo-autopromote-credits',STUDIO_BACKGROUND_DEMO:'true',CUDA_VISIBLE_DEVICES:this.cudaProfile?'0':'',HF_HUB_OFFLINE:'1',
    ...(this.cudaProfile?{STUDIO_BACKGROUND_DEMO_LOCAL_CUDA:'true',LD_LIBRARY_PATH:this.cudaLibraries}:{}),
    PYTHONDONTWRITEBYTECODE:'1',OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'1',PYTHONPATH:`${this.cudaProfile?this.cudaProfile.directory+':':''}${process.env.STUDIO_MODEL_LOCAL_CPU_EDGE_DEPS_DIR||''}:${this.dependenciesDirectory}:${path.join(work,'runtime')}`},stdio:['ignore',log.fd,log.fd]});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  const command=await fs.readFile(`/proc/${child.pid}/cmdline`,'utf8');await immutableJson(path.join(work,'process.json'),{pid:child.pid,command});
  child.unref();await log.close();return {name:`local-process:${job.id}:${job.attemptToken}`};
 }
 async process(job){try{const work=this.work(job),p=JSON.parse(await fs.readFile(path.join(work,'process.json'),'utf8'));const actual=await fs.readFile(`/proc/${p.pid}/cmdline`,'utf8');return actual===p.command&&actual.includes(path.join(work,'spec.json'))?p:null;}catch(e){if(['ENOENT','ESRCH'].includes(e.code))return null;throw e;}}
 async cancel(job){const p=await this.process(job);if(p)process.kill(p.pid,'SIGKILL');}
 async poll(job){
  const work=this.work(job),executionName=`local-process:${job.id}:${job.attemptToken}`;let result;
  try{result=JSON.parse(await fs.readFile(path.join(work,'result.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!result){const p=await this.process(job);const started=JSON.parse(await fs.readFile(path.join(work,'started.json'),'utf8'));if(p&&Date.now()-started.startedAt<job.model.timeoutSeconds*1000)return {terminal:false};if(p){await this.cancel(job);return {terminal:false};}return {terminal:true,executionName,result:{status:'failed'}};}
  // The terminal receipt must outlive its exact owned process. A written file
  // alone does not establish termination or permit another execution.
  if(await this.process(job))return {terminal:false};
  if(result.status!=='completed')return {terminal:true,executionName,result};
  const retainedSpec=JSON.parse(await fs.readFile(path.join(work,'spec.json'),'utf8'));
  const expectedImage=this.cudaProfile?`local-emulator-cuda@sha256:${hash({implementationFiles:retainedSpec.implementationFiles,runtimeOverlay:retainedSpec.runtimeOverlay})}`:`local-emulator-cpu@sha256:${hash(retainedSpec.implementationFiles)}`;
  if(job.workerImage!==expectedImage)throw fail('MODEL_DEMO_IMPLEMENTATION_IDENTITY_INVALID');
  if(result.jobId!==job.id||result.attemptToken!==job.attemptToken||result.requestHash!==job.requestHash||result.provenance?.runtimeImage!==job.workerImage||result.metrics?.gpuCount!==(this.cudaProfile?1:0)||stable(result.provenance.implementationFiles)!==stable(retainedSpec.implementationFiles)||this.cudaProfile&&(stable(result.provenance.runtimeOverlay)!==stable(retainedSpec.runtimeOverlay)||result.provenance.runtimeKind!=='local_cuda_emulator_process'||result.metrics?.device!=='cuda'))throw fail('MODEL_DEMO_RECEIPT_INVALID',502);
  for(const file of result.files){
   if(!/^[A-Za-z0-9_.-]+$/.test(file.name))throw fail('MODEL_DEMO_OUTPUT_INVALID');
   const local=path.join(work,'outputs',file.name),stat=await fs.lstat(local),bytes=await fs.readFile(local);
   if(!stat.isFile()||stat.isSymbolicLink()||bytes.length!==file.bytes||bytes.length>75*1024**2||hash(bytes)!==file.sha256)throw fail('MODEL_DEMO_OUTPUT_INVALID');
   const remote=this.bucket.file(`${this.prefix(job)}/outputs/${file.name}`);
   try{await remote.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:file.mediaType,metadata:{ownerUid:job.ownerUid,sha256:file.sha256,purpose:'model_capability_artifact'}}});}catch(e){if(Number(e.code)!==412)throw e;}
   const [meta]=await remote.getMetadata();if(meta.metadata?.ownerUid!==job.ownerUid||meta.metadata?.sha256!==file.sha256||Number(meta.size)!==file.bytes)throw fail('MODEL_DEMO_STORED_OUTPUT_INVALID');
   Object.assign(file,{storagePath:remote.name,generation:String(meta.generation)});
  }
  result.provenance.executionName=executionName;await immutableJson(path.join(work,'published-result.json'),result);
  return {terminal:true,executionName,result};
 }
 verifyFiles(job,result){return CloudRunCapabilityWorker.prototype.verifyFiles.call(this,job,result);}
}
module.exports={EmulatorCpuWorker};

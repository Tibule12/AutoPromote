const test=require('node:test'),assert=require('node:assert/strict');
const {localCudaProfile}=require('../../src/modelRuntime/localCudaEvaluation');
const {EmulatorCpuWorker}=require('../../src/modelRuntime/emulatorCpuWorker');
const sandbox={NODE_ENV:'test',UNIFIED_CREDITS_SANDBOX:'true',UNIFIED_CREDITS_PROJECT_ID:'demo-autopromote-credits',FIRESTORE_EMULATOR_HOST:'127.0.0.1:1',STUDIO_BACKGROUND_DEMO:'true'};
async function withEnvironment(extra,run){const names=[...new Set([...Object.keys(sandbox),...Object.keys(extra),'STUDIO_BACKGROUND_DEMO_LOCAL_CUDA','K_SERVICE'])],prior=Object.fromEntries(names.map(n=>[n,process.env[n]]));for(const n of names)delete process.env[n];Object.assign(process.env,sandbox,extra);try{await run();}finally{for(const n of names){if(prior[n]===undefined)delete process.env[n];else process.env[n]=prior[n];}}}
test('local CUDA cannot be enabled without explicit demo opt-in',()=>withEnvironment({},async()=>{
 await assert.rejects(localCudaProfile('/dev/shm/autopromote-local-cu118-20261104'),/CUDA_OFFLINE/);
 await assert.rejects(EmulatorCpuWorker.create({bucket:{name:'demo-autopromote-credits'},cudaProfile:{kind:'private_local_cuda_host_overlay_v1'}}),/CUDA_OFFLINE/);
}));
test('a hosted service cannot use the local GPU qualification transport',()=>withEnvironment({K_SERVICE:'production',STUDIO_BACKGROUND_DEMO_LOCAL_CUDA:'true'},async()=>{
 await assert.rejects(localCudaProfile('/dev/shm/autopromote-local-cu118-20261104'),/explicit local demo emulator/);
}));
test('a browser or arbitrary host path cannot choose another CUDA installation',()=>withEnvironment({STUDIO_BACKGROUND_DEMO_LOCAL_CUDA:'true'},async()=>{
 await assert.rejects(localCudaProfile('/tmp/untrusted'),/CUDA_OFFLINE/);
}));
test('private GPU model profiles preserve exact checkpoint and algorithm identity',()=>{
 const base=require('../../config/model-runtime/registry.v1.json');
 const local=require('../../config/model-runtime/local-cuda-evaluation.v1.json');
 assert.equal(local.models.length,2);
 for(const model of local.models){const cpu=base.models.find(m=>m.id===model.id.replace('-local-cuda-','-cpu-'));assert(cpu);for(const field of ['weights','license','revision','checkpoint','modelVersion','timeoutSeconds'])assert.deepEqual(model[field],cpu[field]);for(const [key,value]of Object.entries(cpu.limits))assert.deepEqual(model.limits[key],value);if(model.modelFamily==='SAM2.1')assert.equal(model.limits.offloadStateToCpu,true);assert.equal(model.requiredDevice,'cuda');assert.equal(model.workerImage,null);assert.match(model.availability,/private_loopback/);}
});
test('CUDA publication rejects CPU receipts, changed overlays and incorrect device counts',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {hash}=require('../../src/modelRuntime/contract');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'autopromote-cuda-receipt-'));
 try{
  const implementationFiles={'model_workers/emulator_cuda.py':'a'.repeat(64)};
  const runtimeOverlay={kind:'private_local_cuda_host_overlay_v1',files:{'torch/__init__.py':'b'.repeat(64)}};
  const worker=new EmulatorCpuWorker();Object.assign(worker,{directory,cudaProfile:runtimeOverlay});
  const job={id:'c'.repeat(64),attemptToken:'attempt',requestHash:'d'.repeat(64),
   workerImage:`local-emulator-cuda@sha256:${hash({implementationFiles,runtimeOverlay})}`};
  const work=worker.work(job);await fs.mkdir(work,{recursive:true});
  await fs.writeFile(path.join(work,'spec.json'),JSON.stringify({implementationFiles,runtimeOverlay}));
  const result={status:'completed',jobId:job.id,attemptToken:job.attemptToken,requestHash:job.requestHash,
   metrics:{device:'cuda',gpuCount:1},files:[],
   provenance:{runtimeImage:job.workerImage,implementationFiles,runtimeOverlay,runtimeKind:'local_cuda_emulator_process'}};
  for(const mutate of [r=>{r.metrics.device='cpu';},r=>{r.metrics.gpuCount=0;},
   r=>{r.provenance.runtimeKind='local_cpu_emulator_process';},
   r=>{r.provenance.runtimeOverlay.files['torch/__init__.py']='e'.repeat(64);}]){
   const bad=structuredClone(result);mutate(bad);
   await fs.writeFile(path.join(work,'result.json'),JSON.stringify(bad));
   await assert.rejects(worker.poll(job),/MODEL_DEMO_RECEIPT_INVALID/);
   await assert.rejects(fs.access(path.join(work,'published-result.json')),e=>e.code==='ENOENT');
  }
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

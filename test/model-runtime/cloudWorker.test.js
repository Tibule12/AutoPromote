const test=require('node:test'),assert=require('node:assert/strict');
const {CloudRunCapabilityWorker}=require('../../src/modelRuntime/cloudRunWorker');
const image='private/model@sha256:'+'a'.repeat(64);
const job={id:'a'.repeat(64),ownerUid:'owner',attemptToken:'attempt',workerImage:image,
  request:{dependencyHashes:[]},model:{requiredDevice:'cuda',timeoutSeconds:600}};
function fixture() {
  const calls=[];
  const config={etag:'version-1',template:{taskCount:1,parallelism:1,template:{maxRetries:0,
    containers:[{image,resources:{limits:{'nvidia.com/gpu':'1'}}}]}}};
  const client={request:async r=>{calls.push(r);return {data:r.method==='POST'?{metadata:{name:'execution'}}:config};}};
  const bucket={name:'private-test',file:()=>({save:async()=>{},download:async()=>{throw Error('Must not trust mismatched execution');}})};
  return {calls,config,worker:new CloudRunCapabilityWorker({client,bucket,image,jobName:'projects/test/locations/test/jobs/test',artifactStore:{}})};
}
test('a queued request cannot execute under a different image identity',async()=>{
  const f=fixture();await assert.rejects(f.worker.dispatch({...job,workerImage:image.replace(/a$/,'b')}),e=>e.code==='MODEL_QUEUED_WORKER_IMAGE_CHANGED' && e.definitelyNotStarted);
  assert.equal(f.calls.length,0);
});
test('dispatch seals the checked Cloud Run resource version without automatic retry',async()=>{
  const f=fixture();await f.worker.dispatch(job);const run=f.calls.find(c=>c.method==='POST');
  assert.equal(run.data.etag,'version-1');assert.equal(run.retry,false);assert.equal(run.data.overrides.taskCount,1);
});
test('terminated execution with another image cannot publish model evidence',async()=>{
  const f=fixture();f.worker.execution=async()=>({name:'execution',completionTime:new Date().toISOString(),template:{containers:[{image:'other'}]}});
  const result=await f.worker.poll(job);assert.equal(result.terminal,true);assert.equal(result.result.status,'failed');
  assert.equal(result.result.errorCode,'MODEL_EXECUTION_IMAGE_INVALID');
});

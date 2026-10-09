#!/usr/bin/env node
// Durable queue/reconciliation process. This process runs on CPU only.
const {getRuntime}=require('../src/services/studioModelCapabilityService');
const {db}=require('../src/firebaseAdmin');
async function pass() {
  const runtime=await getRuntime();
  const pending=await db.collection('studio_model_capability_jobs').where('status','in',
    ['queued','dispatching','dispatch_uncertain','running','cancelling']).limit(20).get();
  for(const doc of pending.docs) {
    const job=JSON.parse(doc.data().recordJson);
    try { const result=await runtime.reconcile({ownerUid:job.ownerUid,jobId:job.id});
      console.log(JSON.stringify({event:'model_capability_reconciled',jobId:job.id,status:result.status})); }
    catch(error) { console.error(JSON.stringify({event:'model_capability_reconciliation_pending',jobId:job.id,code:error.code || 'UNAVAILABLE'})); }
  }
}
async function main() {
  if(process.env.ENABLE_STUDIO_MODEL_CAPABILITY_WORKER!=='true')throw new Error('Model capability queue worker is explicitly disabled');
  while(process.env.ENABLE_STUDIO_MODEL_CAPABILITY_WORKER==='true') {
    await pass();await new Promise(resolve=>setTimeout(resolve,10000));
  }
}
if(require.main===module)main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
module.exports={pass};

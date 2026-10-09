const crypto = require('crypto');
const { stable, hash, fail } = require('./contract');
class CloudRunCapabilityWorker {
  constructor({ client, bucket, jobName, image, modelCachePrefix = 'studio/model-runtime/models', resultPrefix = 'studio/model-runtime/executions', artifactStore }) {
    Object.assign(this, { client, bucket, jobName, image, modelCachePrefix, resultPrefix, artifactStore });
    if (!/^projects\/[^/]+\/locations\/[^/]+\/jobs\/[^/]+$/.test(jobName) || !/^.+@sha256:[a-f0-9]{64}$/.test(image)) throw fail('MODEL_CLOUD_CONFIG_INVALID',503);
  }
  prefix(job) { return `${this.resultPrefix}/${job.ownerUid}/${job.id}/${job.attemptToken}`; }
  async dispatch(job) {
    let spec,etag;
    try {
      if(job.workerImage!==this.image)throw fail('MODEL_QUEUED_WORKER_IMAGE_CHANGED',503);
      // Check job isolation/digest/one GPU/retry policy before a paid side effect.
      const config = (await this.client.request({ url: `https://run.googleapis.com/v2/${this.jobName}`, method:'GET', timeout:30000 })).data;
      const task = config.template?.template;
      if (config.reconciling || !config.etag || config.template.taskCount !== 1 || config.template.parallelism !== 1 || task?.maxRetries !== 0 ||
          task.containers?.length !== 1 || task.containers[0].image !== this.image ||
          Number(task.containers[0].resources?.limits?.['nvidia.com/gpu'] || 0) !== (job.model.requiredDevice === 'cuda' ? 1 : 0))
        throw fail('MODEL_CLOUD_JOB_ISOLATION_INVALID',503);
      etag=config.etag;
      const dependencies = await Promise.all(job.request.dependencyHashes.map(id => this.artifactStore.get(id)));
      spec = { ...job, dependencies, modelCachePrefix: this.modelCachePrefix, resultPrefix: this.prefix(job), bucket: this.bucket.name };
      await this.bucket.file(`${this.prefix(job)}/request.json`).save(stable(spec), { resumable:false, preconditionOpts:{ifGenerationMatch:0}, metadata:{contentType:'application/json',metadata:{ownerUid:job.ownerUid,purpose:'model_capability_request'}} });
    } catch (e) { e.definitelyNotStarted = true; throw e; }
    // No automatic HTTP retry for :run. An ambiguous response is reconciled by
    // exact request identity in execution overrides, never by issuing :run again.
    const data = { etag,overrides: { taskCount:1, timeout:`${job.model.timeoutSeconds}s`, containerOverrides:[{ env:[
      { name:'MODEL_REQUEST_URI',value:`gs://${this.bucket.name}/${this.prefix(job)}/request.json` },
      { name:'MODEL_REQUEST_SHA256',value:hash(stable(spec)) },
    ] }] } };
    try {
      const response = await this.client.request({ url:`https://run.googleapis.com/v2/${this.jobName}:run`,method:'POST',data,timeout:60000,retry:false });
      return { name: response.data.metadata?.name || response.data.response?.name || response.data.name };
    } catch (e) { if ([400,401,403,404,409,412,422].includes(e.response?.status)) e.definitelyNotStarted=true; throw e; }
  }
  async execution(job) {
    // :run returns an operation; recover the execution from its metadata or
    // from exact generation request env after a lost operation response.
    if (job.executionName?.includes('/operations/')) {
      const op=(await this.client.request({url:`https://run.googleapis.com/v2/${job.executionName}`,timeout:30000})).data;
      if(op.metadata?.name?.includes('/executions/')) return op.metadata;
      if(op.response?.name?.includes('/executions/')) return op.response;
    } else if (job.executionName?.includes('/executions/')) return (await this.client.request({url:`https://run.googleapis.com/v2/${job.executionName}`,timeout:30000})).data;
    const list=(await this.client.request({url:`https://run.googleapis.com/v2/${this.jobName}/executions?pageSize=100`,timeout:30000})).data.executions || [];
    const uri=`gs://${this.bucket.name}/${this.prefix(job)}/request.json`;
    const matches=list.filter(e=>e.template?.containers?.some(c=>c.env?.some(v=>v.name==='MODEL_REQUEST_URI' && v.value===uri)));
    if(matches.length>1) throw fail('MODEL_DUPLICATE_EXECUTION_DETECTED',503);
    return matches[0] || null;
  }
  async poll(job) {
    const e = await this.execution(job);
    if (!e || !e.completionTime) return { terminal:false };
    if(e.template?.containers?.length!==1 || e.template.containers[0].image!==job.workerImage)
      return {terminal:true,executionName:e.name,result:{status:'failed',errorCode:'MODEL_EXECUTION_IMAGE_INVALID'}};
    let result;
    try { const [bytes]=await this.bucket.file(`${this.prefix(job)}/result.json`).download(); result=JSON.parse(bytes); }
    catch(error) { if(Number(error.code)!==404) throw error; }
    return { terminal:true,executionName:e.name,result:result || {status:'failed'} };
  }
  async cancel(job) {
    const e=await this.execution(job); if(!e) throw fail('MODEL_CANCEL_RECONCILIATION_REQUIRED',503);
    if(!e.completionTime) await this.client.request({url:`https://run.googleapis.com/v2/${e.name}:cancel`,method:'POST',data:{},retry:false,timeout:30000});
  }
  async verifyFiles(job,result) {
    if(!Array.isArray(result.files) || !result.files.length || result.files.length>1000)throw fail('MODEL_OUTPUT_FILES_INVALID',502);
    for(const file of result.files || []) {
      const expected=`${this.prefix(job)}/outputs/${file.name}`;
      if(file.storagePath!==expected || !/^[0-9]+$/.test(String(file.generation))) throw fail('MODEL_OUTPUT_PATH_INVALID',502);
      const object=this.bucket.file(expected,{generation:String(file.generation)});
      const digest=crypto.createHash('sha256');let size=0;
      for await(const block of object.createReadStream()) { size+=block.length; if(size>512*1024**2) throw fail('MODEL_OUTPUT_TOO_LARGE',502);digest.update(block); }
      if(size!==file.bytes || digest.digest('hex')!==file.sha256) throw fail('MODEL_OUTPUT_HASH_INVALID',502);
    }
  }
}
module.exports={CloudRunCapabilityWorker};

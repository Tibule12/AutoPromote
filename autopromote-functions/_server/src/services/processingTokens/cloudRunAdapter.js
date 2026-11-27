// Renewable accounting for the existing durable Cam runner. Registration is
// opt-in; an image-bound, expiring server qualification is required before run.
// This is not qualification of a worker merely because its URL/timeout is set.
const crypto = require('node:crypto');
const {digest,canonical} = require('../unifiedCredits/workerVerification');
const {fail,integer} = require('../unifiedCredits/policy');
const runtime = require('./runtime');

function validateProfile(p) {
  if (p?.operation !== 'multicam.render' || !/^[a-z0-9_-]{1,80}$/.test(p.id || '') ||
      !/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/jobs\/[a-z0-9-]+$/.test(p.job || '') ||
      !/@sha256:[a-f0-9]{64}$/.test(p.image || '') || !p.serviceAccount ||
      !['cpu','gpu'].includes(p.device) || !/^[a-z0-9_-]{1,100}$/.test(p.qualificationId || ''))
    fail('INVALID_CLOUD_RUN_PROFILE',503);
  if(p.requestScope!=='manual-two-camera-60s')fail('WORKFLOW_SCOPE_REQUIRED',503);
  if(p.device==='gpu'&&(!Number.isSafeInteger(p.gpuCount)||p.gpuCount<1||!p.accelerator))
    fail('GPU_COST_SHAPE_REQUIRED',503);
  for (const name of ['maxMicros','maxSeconds','cpuMilli','memoryBytes','inputMaxBytes','outputMaxBytes','networkMaxBytes','storageMaxByteHours','rateMicrosPerSecond','fixedCostMicros'])
    integer(p[name],name,name==='fixedCostMicros'?0:1);
  if (p.maxMicros < Math.max(60,p.maxSeconds)*p.rateMicrosPerSecond+p.fixedCostMicros)
    fail('INCOMPLETE_COST_ENVELOPE',503);
  return p;
}
function assertJob(job,p) {
  const t=job.template?.template,c=t?.containers?.[0],limits=c?.resources?.limits||{};
  const memory=/^(\d+)(Ki|Mi|Gi)?$/.exec(String(limits.memory));
  const memoryBytes=memory?Number(memory[1])*({Ki:1024,Mi:1024**2,Gi:1024**3}[memory[2]]||1):NaN;
  const cpu=String(limits.cpu||'');const milli=cpu.endsWith('m')?Number(cpu.slice(0,-1)):Number(cpu)*1000;
  if (job.name!==p.job || !job.etag || job.reconciling || t?.containers?.length!==1 ||
      job.template.taskCount!==1 || job.template.parallelism!==1 || t.maxRetries!==0 ||
      c.image!==p.image || t.serviceAccount!==p.serviceAccount || milli!==p.cpuMilli ||
      memoryBytes!==p.memoryBytes || Number(limits['nvidia.com/gpu']||0)!==(p.gpuCount||0) ||
      (p.device==='gpu'&&t.nodeSelector?.accelerator!==p.accelerator) ||
      !Number.isFinite(Number(String(t.timeout).replace(/s$/,''))) || Number(String(t.timeout).replace(/s$/,''))>p.maxSeconds)
    fail('CLOUD_RUN_PROFILE_DRIFT',503);
}
function createCloudRunAdapter({db,profile,request,inspectOutput,now=Date.now}) {
  const p=validateProfile(profile),bindings=db.collection('processing_worker_bindings');
  const qualification=db.collection('processing_worker_qualifications').doc(p.qualificationId);
  async function reconcile(binding,service) {
    if (binding.state==='settled') return null;
    let execution;
    if (binding.executionName) {
      try { execution=(await request({method:'GET',url:'https://run.googleapis.com/v2/'+binding.executionName})).data; }
      catch { return null; }
    } else {
      // A lost :run response is discovery, never permission to submit again.
      let cursor;
      const found=[];
      for(let page=0;page<10;page++) {
        let response;try{response=await request({method:'GET',url:'https://run.googleapis.com/v2/'+p.job+'/executions?pageSize=100'+(cursor?'&pageToken='+encodeURIComponent(cursor):'')});}catch{return null;}
        for(const e of response.data.executions||[])if(e.template?.containers?.[0]?.env?.some(v=>v.name==='PROCESSING_DISPATCH_NONCE'&&v.value===binding.nonce))found.push(e);
        cursor=response.data.nextPageToken;if(!cursor)break;
      }
      if(found.length>1){await service.configure({enabled:false});fail('MULTIPLE_CLOUD_EXECUTIONS',503);}
      if(found.length!==1)return null;
      execution=found[0];await bindings.doc(binding.id).set({executionName:execution.name},{merge:true});
    }
    const c=execution.template?.containers?.[0],env=Object.fromEntries((c?.env||[]).map(v=>[v.name,v.value]));
    assertJob({name:p.job,etag:'authoritative-execution',template:{taskCount:execution.taskCount,parallelism:1,template:execution.template}},p);
    if(!execution.name?.startsWith(p.job+'/executions/')||execution.job!==p.job||!execution.uid||
        execution.taskCount!==1||execution.template.maxRetries!==0||c.image!==p.image||
        execution.template.serviceAccount!==p.serviceAccount||env.PROCESSING_BINDING_ID!==binding.id||
        env.PROCESSING_DISPATCH_NONCE!==binding.nonce)fail('WORKER_BINDING_CONFLICT',403);
    const succeeded=execution.succeededCount||0,failed=(execution.failedCount||0)+(execution.cancelledCount||0);
    if(execution.reconciling||(execution.runningCount||0)>0||!execution.completionTime||succeeded+failed!==1)return null;
    const condition=execution.conditions?.find(c=>c.type==='Completed');
    if(!['CONDITION_SUCCEEDED','CONDITION_FAILED'].includes(condition?.state))return null;
    const native=(await db.collection('video_edits').doc(binding.nativeJobId).get()).data();
    let delivered=succeeded===1&&condition.state==='CONDITION_SUCCEEDED'&&native?.userId===binding.userId&&native.status==='completed';
    if(delivered) {
      const output=await inspectOutput(native,binding);
      if(!output?.generation||!Number.isSafeInteger(output.bytes)||output.bytes<1||output.bytes>p.outputMaxBytes)
        fail('WORKER_OUTPUT_EVIDENCE_REQUIRED',503);
    }
    const seconds=(Date.parse(execution.completionTime)-Date.parse(execution.createTime))/1000;
    if(!Number.isFinite(seconds)||seconds<0)fail('WORKER_TIME_EVIDENCE_REQUIRED',503);
    const actualMicros=Math.ceil(Math.max(60,seconds)*p.rateMicrosPerSecond)+p.fixedCostMicros;
    const eventId=digest([execution.name,execution.uid,execution.completionTime]);
    const result=await service.settle(binding.userId,binding.requestId,{eventId,success:delivered,actualMicros,stopped:true});
    await bindings.doc(binding.id).set({state:'settled',settledAt:now(),actualMicros,
      costBasis:'profile-rate-envelope-estimate',actualCloudInvoiceMicros:null},{merge:true});
    return result;
  }
  return {
    enforcesCostBound:true, // Effective only after the independently qualified image checks below.
    validateQuote(q) {
      if(q.operation!==p.operation||q.maxMicros!==p.maxMicros||q.maxSeconds!==p.maxSeconds)
        fail('RESERVATION_PROFILE_CONFLICT',503);
    },
    validateRequest(req) {
      if(!require('./costRouting').boundedManualMulticam(req.body))fail('QUALIFIED_WORKFLOW_SCOPE_REQUIRED',409);
    },
    async reconcilePending(service,uid) {
      let query=bindings.where('profileId','==',p.id).where('state','==','dispatch_claimed');
      if(uid)query=query.where('userId','==',uid);
      for(const doc of (await query.limit(25).get()).docs)await reconcile(doc.data(),service);
    },
    async handle(req,res,next,q) {
      const ctx=runtime.current();
      if(q.operation!==p.operation||q.maxMicros!==p.maxMicros||q.maxSeconds!==p.maxSeconds)
        fail('RESERVATION_PROFILE_CONFLICT',503);
      ctx.cloudRunProfile={job:p.job,device:p.device};
      ctx.prepareCloudRunJob=async(resource,data)=>{
        if(ctx.dispatched||ctx.preparing||resource!==p.job)fail('WORKER_RETRY_NOT_ALLOWED',409);
        ctx.preparing=true;
        try {
          const job=(await request({method:'GET',url:'https://run.googleapis.com/v2/'+p.job})).data;assertJob(job,p);
          const values=Object.fromEntries((data.overrides?.containerOverrides?.[0]?.env||[]).map(v=>[v.name,v.value]));
          const nativeJobId=values.MULTICAM_JOB_ID;
          if(!/^[A-Za-z0-9_-]{8,160}$/.test(nativeJobId||''))fail('INVALID_NATIVE_JOB');
          const id=digest([ctx.uid,ctx.reservation.requestId]);
          const binding=await db.runTransaction(async tx=>{
            const [approved,native,prior]=await tx.getAll(qualification,db.collection('video_edits').doc(nativeJobId),bindings.doc(id));
            const a=approved.data(),n=native.data();
            if(!a?.approved||a.profileDigest!==digest(p)||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now()||
                a.workerContract!=='renewable-cam-v1'||a.sourceAndOutputBoundsVerified!==true||
                a.networkAndStorageBoundsVerified!==true||a.terminationAndHostLossVerified!==true)
              fail('PRODUCTION_QUALIFICATION_REQUIRED',503);
            if(prior.exists)fail('WORKER_RETRY_NOT_ALLOWED',409);
            if(n?.userId!==ctx.uid||!n.multicamRequest||n.creditReceipt?.processingTokens!==true||
                n.creditReceipt.requestId!==ctx.reservation.requestId)fail('NATIVE_RESERVATION_CONFLICT',403);
            if(!require('./costRouting').boundedManualMulticam(n.multicamRequest))fail('QUALIFIED_WORKFLOW_SCOPE_REQUIRED',409);
            const record={id,profileId:p.id,qualificationId:p.qualificationId,profileDigest:digest(p),userId:ctx.uid,requestId:ctx.reservation.requestId,
              fingerprint:ctx.reservation.fingerprint,nativeJobId,requestCanonicalJSON:canonical(n.multicamRequest),
              requestDigest:digest(n.multicamRequest),nonce:crypto.randomBytes(24).toString('hex'),state:'prepared',createdAt:now()};
            tx.create(bindings.doc(id),record);return record;
          });
          await ctx.service.authorizeDispatch(ctx.uid,ctx.reservation.requestId);
          await bindings.doc(id).set({state:'dispatch_claimed'},{merge:true});
          const result={...data,etag:job.etag,overrides:{...data.overrides,taskCount:1,timeout:p.maxSeconds+'s',containerOverrides:[{...data.overrides.containerOverrides[0],env:[...data.overrides.containerOverrides[0].env,
            {name:'PROCESSING_CONTRACT_VERSION',value:'renewable-cam-v1'},
            {name:'PROCESSING_BINDING_ID',value:id},{name:'PROCESSING_DISPATCH_NONCE',value:binding.nonce}]}]}};
          ctx.cloudRunRequestDigest=digest(result);ctx.dispatched=true;return result;
        } finally {ctx.preparing=false;}
      };
      const send=res.json.bind(res);
      res.json=body=>{
        if(!ctx.dispatched&&!ctx.finalized&&!ctx.preparing&&res.statusCode>=400){ctx.finalized=true;void ctx.service.settle(ctx.uid,ctx.reservation.requestId,{eventId:'refused-before-cloud-run',success:false,actualMicros:0,stopped:true}).then(()=>send(body)).catch(()=>send({...body,processing:{state:'uncertain'}}));return res;}
        return send(body);
      };
      return next();
    },
  };
}
module.exports={createCloudRunAdapter,validateProfile,assertJob};

// Accounting transport for the existing native endpoints and video_edits jobs.
// Rendering, recognition, synchronization and their output settings stay native.
const crypto = require('node:crypto');
const { digest, canonical } = require('../unifiedCredits/workerVerification');
const { fail } = require('../unifiedCredits/policy');
const { assertJob } = require('./cloudRunAdapter');
const runtime = require('./runtime');
const endpoints = {
  'multicam.render': ['/render-multicam'],
  'studio.render': ['/render-viral-clip', '/render-clip', '/render-montage', '/process-video', '/process',
    '/auto-generate-clips', '/preview-silence', '/preview-music', '/preview-audio-remix', '/preview-watermark-cleanup'],
  'clips.analyze': ['/analyze-clips'], 'audio.transcribe': ['/transcribe'],
  'audio.extract': ['/extract-audio'], 'audio.sync': ['/clean-audio-sync', '/multicam/preflight-sync'],
};
function validateNativePayload(endpoint, body) {
  if(endpoint==='/render-multicam' && body.trusted_sync_contract?.sources)
    for(const source of body.sources||[]){
      const fitted=body.trusted_sync_contract.sources[source.id];
      if(fitted && (Math.abs(Number(source.offset_seconds||0)-Number(fitted.offset_seconds))>0.000001 ||
          Math.abs(Number(source.sync_rate??source.syncRate??1)-Number(fitted.sync_rate))>0.000000001))
        fail('SYNC_PREFLIGHT_TIMING_CHANGED',409);
    }
  if (endpoint === '/render-viral-clip' && body.auto_captions && !body.caption_review_copy &&
      (body.caption_segments || []).some(s => s.review_required || (s.text_review_required && !s.text_reviewed)))
    fail('CAPTION_REVIEW_REQUIRED', 409);
  if (endpoint === '/render-viral-clip' && body.caption_segments?.some(s =>
      !Number.isFinite(s.start_time) || !Number.isFinite(s.end_time) || s.end_time <= s.start_time || !s.text))
    fail('INVALID_NATIVE_CAPTION_CONTRACT', 400);
}
async function authorizeProfile(db, profile, binding, now = Date.now()) {
  const receipt = (await db.collection('processing_worker_qualifications').doc(profile.qualificationId).get()).data();
  if (!receipt || receipt.profileDigest !== digest(profile) || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= now)
    fail('PRODUCTION_QUALIFICATION_REQUIRED', 503);
  if (receipt.kind === 'funded-qualification') {
    if (receipt.approved !== true || !receipt.allowedRequests?.some(r => r.userId === binding.userId &&
        r.requestId === binding.requestId && r.fingerprint === binding.fingerprint))
      fail('QUALIFICATION_REQUEST_NOT_APPROVED', 403);
    return;
  }
  if (receipt.approved !== true || receipt.workerContract !== 'renewable-native-v1' ||
      receipt.sourceAndOutputBoundsVerified !== true || receipt.networkAndStorageBoundsVerified !== true ||
      receipt.terminalReconciliationVerified !== true) fail('PRODUCTION_QUALIFICATION_REQUIRED', 503);
}
function createNativeWorkerAdapter({ db, profile: p, request, now = Date.now }) {
  const bindings = db.collection('processing_worker_bindings');
  const get = path => request({ method: 'GET', url: 'https://run.googleapis.com/v2/' + path });
  async function executionFor(binding) {
    if (binding.executionName) return (await get(binding.executionName)).data;
    // Discovery is GET-only after an ambiguous dispatch. Never retry :run.
    let cursor, found = [];
    do {
      const response = (await get(p.job + '/executions?pageSize=100' +
        (cursor ? '&pageToken=' + encodeURIComponent(cursor) : ''))).data;
      found.push(...(response.executions || []).filter(e => e.template?.containers?.[0]?.env?.some(
        v => v.name === 'PROCESSING_DISPATCH_NONCE' && v.value === binding.nonce)));
      cursor = response.nextPageToken;
    } while (cursor && found.length < 2);
    if (found.length > 1) fail('MULTIPLE_CLOUD_EXECUTIONS', 503);
    if (!found.length) return null;
    await bindings.doc(binding.id).update({ executionName: found[0].name });
    return found[0];
  }
  async function reconcile(binding, service) {
    if (binding.state === 'settled') {
      if(binding.success===false)await db.runTransaction(async tx=>{
        const ref=db.collection('video_edits').doc(binding.nativeJobId),native=(await tx.get(ref)).data();
        if(native?.processingBindingId===binding.id&&!['failed','cancelled'].includes(native.status))
          tx.update(ref,{status:'failed',stage:'failed',processingError:'The bounded worker stopped before successful completion'});
      });
      return {success:binding.success,result:binding.result};
    }
    const execution = await executionFor(binding);
    if (!execution) return null;
    await require('./cloudRunAdapter').assertExecutionTemplate(execution,p,request);
    const env = Object.fromEntries((execution.template.containers[0].env || []).map(v => [v.name, v.value]));
    if (!execution.name?.startsWith(p.job+'/executions/') ||
        ![p.job,p.job.split('/').pop()].includes(execution.job) || !execution.uid || env.PROCESSING_BINDING_ID !== binding.id ||
        env.PROCESSING_DISPATCH_NONCE !== binding.nonce) fail('WORKER_BINDING_CONFLICT', 403);
    if (execution.reconciling || execution.runningCount || !execution.completionTime) return null;
    const terminal = execution.conditions?.find(c => c.type === 'Completed');
    if (!['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(terminal?.state) ||
        (execution.succeededCount || 0) + (execution.failedCount || 0) + (execution.cancelledCount || 0) !== 1) return null;
    const native = (await db.collection('video_edits').doc(binding.nativeJobId).get()).data();
    let success = execution.succeededCount === 1 && native?.userId === binding.userId && native.status === 'completed';
    if(!success && native?.processingBindingId===binding.id && !['failed','cancelled'].includes(native.status))
      await db.collection('video_edits').doc(binding.nativeJobId).update({status:'failed',stage:'failed',
        processingError:'The bounded worker stopped before successful completion'});
    if (binding.endpoint === '/analyze-clips') {
      const analysis = db.collection('clip_analyses').doc(binding.nativeJobId);
      const saved = (await analysis.get()).data();
      if (saved?.userId === binding.userId && saved.status !== 'completed')
        await analysis.set(success ? require('../videoClippingService').normalizeFundedAnalysis(native.processingResult)
          : {status:'failed',error:'Native processing failed',progress:100}, {merge:true});
    }
    if (success && (['studio.render','multicam.render'].includes(p.operation) || p.operation==='audio.extract') && !binding.endpoint.startsWith('/preview-')) {
      const path = native.outputStoragePath || native.output_storage_path || native.processingResult?.output_storage_path;
      if (typeof path !== 'string' || !(path.startsWith(`processed/${binding.nativeJobId}`) || path === `processed/multicam_${binding.nativeJobId}.mp4`))
        fail('WORKER_OUTPUT_EVIDENCE_REQUIRED', 503);
      const [meta] = await require('../../firebaseAdmin').storage.bucket().file(path).getMetadata();
      if (meta.metadata?.autopromoteJobId !== binding.nativeJobId || !Number(meta.size) || Number(meta.size) > p.outputMaxBytes)
        fail('WORKER_OUTPUT_EVIDENCE_REQUIRED', 503);
    }
    const elapsed = (Date.parse(execution.completionTime) - Date.parse(execution.startTime || execution.createTime)) / 1000;
    if (!Number.isFinite(elapsed) || elapsed < 0) fail('WORKER_TIME_EVIDENCE_REQUIRED', 503);
    const actualMicros = Math.ceil(Math.max(60, elapsed) * p.rateMicrosPerSecond) + p.fixedCostMicros;
    await service.settle(binding.userId, binding.requestId, { eventId: digest([execution.name, execution.uid]),
      success, actualMicros, stopped: true });
    let result = success ? {...native.processingResult,job_id:binding.nativeJobId} : null;
    if (success && (['studio.render','multicam.render'].includes(p.operation) || p.operation==='audio.extract') && !binding.endpoint.startsWith('/preview-')) {
      const output = native.outputStoragePath || native.output_storage_path || native.processingResult?.output_storage_path;
      const file = require('../../firebaseAdmin').storage.bucket().file(output);
      const url = await require('./mediaDelivery').ownedOutputUrl(file,binding.userId,binding.nativeJobId);
      result = {...result,output_storage_path:output,...(url ? {output_url:url,outputUrl:url,url} : {})};
      if(url && p.operation==='audio.extract'){
        result={...result,audio_url:url,result:{...result.result,audioUrl:url}};
        await db.collection('video_edits').doc(binding.nativeJobId).set({audio_url:url,result:result.result},{merge:true});
      }
    }
    await bindings.doc(binding.id).update({ state: 'settled', success, actualMicros,
      costBasis: 'profile-rate-envelope-estimate', actualCloudInvoiceMicros: null, result: result || null, settledAt: now() });
    return { success, result };
  }
  const adapter = {
    profileId: p.id, enforcesCostBound: true,
    reconcileBinding: reconcile,
    validateQuote(q) {
      if (q.profileId !== p.id || q.maxMicros !== p.maxMicros || q.tokens !== p.tokens)
        fail('RESERVATION_PROFILE_CONFLICT', 503);
    },
    async reconcilePending(service, uid) {
      // Filter the small active set locally, avoiding new compound indexes.
      const query = bindings.where('state', '==', 'dispatch_claimed');
      for (const doc of (await query.limit(100).get()).docs) {
        const b = doc.data();
        if ((!uid || b.userId === uid) && b.profileId === p.id && b.state === 'dispatch_claimed' &&
            (!b.ledgerCollection || b.ledgerCollection === service.jobCollectionName)) await reconcile(b, service);
      }
    },
    async handle(req, res, next) {
      const ctx = runtime.current();
      ctx.cloudRunProfile = { job: p.job, device: p.device };
      ctx.prepareNative = async (target, body) => {
        if (ctx.dispatched || ctx.preparing) fail('WORKER_RETRY_NOT_ALLOWED', 409);
        ctx.preparing = true;
        try {
          const endpoint = new URL(target).pathname;
          if (!endpoints[p.operation]?.includes(endpoint)) fail('RESERVATION_PROFILE_CONFLICT', 503);
          validateNativePayload(endpoint, body);
          body = await require('./mediaDelivery').workerSources(body,ctx.uid);
          const job = (await get(p.job)).data; assertJob(job, p);
          const nativeJobId = body.job_id || body.jobId || 'native-' + crypto.randomUUID();
          if (!/^[A-Za-z0-9_-]{8,160}$/.test(nativeJobId)) fail('INVALID_NATIVE_JOB', 400);
          const id = digest([ctx.uid, ctx.reservation.requestId]);
          const nativeRef = db.collection('video_edits').doc(nativeJobId);
          const prior = (await nativeRef.get()).data();
          if (prior && prior.userId !== ctx.uid) fail('NATIVE_RESERVATION_CONFLICT', 403);
          const binding = { id, userId: ctx.uid, requestId: ctx.reservation.requestId,
            fingerprint: ctx.reservation.fingerprint, nativeJobId, profileId: p.id, profile: p,
            ledgerCollection: ctx.service.jobCollectionName || 'processing_jobs',
            qualificationId: p.qualificationId, profileDigest: digest(p), endpoint,
            requestCanonicalJSON: canonical(body), requestDigest: digest(body),
            nonce: crypto.randomBytes(24).toString('hex'), state: 'prepared', createdAt: now() };
          if (Buffer.byteLength(binding.requestCanonicalJSON) > 750000) fail('WORKER_REQUEST_TOO_LARGE', 413);
          await authorizeProfile(db, p, binding, now());
          await bindings.doc(id).create(binding);
          await nativeRef.set({ userId: ctx.uid, processingBindingId: id,
            creditReceipt: { processingTokens: true, deferredSettlement: true, requestId: binding.requestId },
            ...(!prior ? { status: 'queued', createdAt: new Date(now()).toISOString() } : {}) }, { merge: true });
          await ctx.service.authorizeDispatch(ctx.uid, binding.requestId);
          await bindings.doc(id).update({ state: 'dispatch_claimed' });
          ctx.dispatched = true;
          return { binding, job };
        } finally { ctx.preparing = false; }
      };
      ctx.workerTransport = async (target, body) => {
        const { binding, job } = await ctx.prepareNative(target, body);
        const nativeJobId = binding.nativeJobId;
        const { id, endpoint } = binding;
          const response = await request({ method: 'POST', url: 'https://run.googleapis.com/v2/' + p.job + ':run',
            retry: false, data: { etag: job.etag, overrides: { taskCount: 1, timeout: p.maxSeconds + 's',
              containerOverrides: [{ env: [{ name: 'PROCESSING_BINDING_ID', value: id },
                { name: 'PROCESSING_DISPATCH_NONCE', value: binding.nonce }] }] } } });
          const executionName = response.data.metadata?.name || response.data.response?.name;
          if (executionName?.startsWith(p.job + '/executions/')) await bindings.doc(id).update({ executionName });
          if ((['studio.render','multicam.render'].includes(p.operation) || p.operation==='audio.extract') && body.async_mode !== false &&
              !['/render-clip','/render-montage'].includes(endpoint) && !endpoint.startsWith('/preview-'))
            return { status: 'processing', mode: 'async', job_id: nativeJobId, jobId: nativeJobId };
          const deadline = now() + (p.maxSeconds + 250) * 1000;
          while (now() < deadline) {
            const outcome = await reconcile({ ...binding, ...(executionName ? { executionName } : {}) }, ctx.service);
            if (outcome) {
              if (!outcome.success) fail('NATIVE_WORKER_FAILED', 502);
              return outcome.result;
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          fail('NATIVE_WORKER_PENDING', 503);
      };
      if (p.operation === 'multicam.render') {
        ctx.cloudRunProfile = { job: p.job, device: p.device };
        ctx.prepareCloudRunJob = async (resource, data) => {
          if (resource !== p.job) fail('RESERVATION_PROFILE_CONFLICT', 503);
          const env = data.overrides.containerOverrides[0].env;
          const nativeJobId = env.find(v => v.name === 'MULTICAM_JOB_ID')?.value;
          const native = (await db.collection('video_edits').doc(nativeJobId).get()).data();
          if (native?.userId !== ctx.uid || !native.multicamRequest) fail('NATIVE_RESERVATION_CONFLICT', 403);
          const { binding, job } = await ctx.prepareNative('https://native.invalid/render-multicam',
            { ...native.multicamRequest, job_id: nativeJobId });
          const bounded = { ...data, etag: job.etag, overrides: { ...data.overrides, taskCount: 1,
            timeout: p.maxSeconds + 's', containerOverrides: [{ ...data.overrides.containerOverrides[0], env: [...env,
              { name: 'PROCESSING_BINDING_ID', value: binding.id },
              { name: 'PROCESSING_DISPATCH_NONCE', value: binding.nonce }] }] } };
          ctx.cloudRunRequestDigest = digest(bounded);
          return bounded;
        };
      }
      const send = res.json.bind(res);
      res.json = body => {
        if (!ctx.dispatched && !ctx.preparing && !ctx.finalized && res.statusCode >= 400) {
          ctx.finalized = true;
          void ctx.service.settle(ctx.uid, ctx.reservation.requestId, { eventId: 'native-undispatched',
            success: false, actualMicros: 0, stopped: true }).then(() => send(body)).catch(() => send(body));
          return res;
        }
        return send(body);
      };
      return next();
    },
  };
  return adapter;
}
module.exports = { createNativeWorkerAdapter, authorizeProfile, validateNativePayload };

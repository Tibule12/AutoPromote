const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const http = require('supertest');
const axios = require('axios');
const { createSandboxDatabase } = require('../../src/services/unifiedCredits/runtime');
const { createProcessingService } = require('../../src/services/processingTokens/service');
const { createNativeWorkerAdapter } = require('../../src/services/processingTokens/nativeWorkerAdapter');
const { createProcessingGuard } = require('../../src/middlewares/processingBudgetMiddleware');
const { applicationWorkerConfig } = require('../../src/services/unifiedCredits/workerTransport');
const { digest } = require('../../src/services/unifiedCredits/workerVerification');
const { requestBound } = require('../../src/services/processingTokens/apiAdapter');
test('caption review and malformed native cues are rejected before a billable task can be submitted',()=>{
 const {validateNativePayload}=require('../../src/services/processingTokens/nativeWorkerAdapter');
 assert.throws(()=>validateNativePayload('/render-viral-clip',{auto_captions:true,caption_segments:[{review_required:true}]}),{code:'CAPTION_REVIEW_REQUIRED'});
 assert.throws(()=>validateNativePayload('/render-viral-clip',{caption_segments:[{start:0,end:2,text:'Wrong transport contract'}]}),{code:'INVALID_NATIVE_CAPTION_CONTRACT'});
 validateNativePayload('/render-viral-clip',{auto_captions:true,caption_segments:[{start_time:0,end_time:2,text:'Reviewed English cue',speaker:'speaker_1',review_required:false}]});
});
const db = createSandboxDatabase();
process.env.FREE_FIRST_USAGE_ENABLED = 'true';
after(async () => { delete process.env.FREE_FIRST_USAGE_ENABLED; await db.terminate(); });
async function fixture({ funded = true, lost = false, success = true, render = false } = {}) {
  const uid = 'native-' + crypto.randomUUID(), requestId = crypto.randomUUID();
  const operation = render ? 'studio.render' : 'audio.transcribe';
  const route = render ? '/api/media/process' : '/api/media/transcribe';
  const tokens = render ? 40 : 10;
  const p = { id: 'speech-' + crypto.randomBytes(4).toString('hex'), operation: 'audio.transcribe',
    requestScope: 'existing-native-v1', tokens: 10, maxMicros: 30000, maxSeconds: 360, cpuMilli: 2000,
    memoryBytes: 4 * 1024 ** 3, device: 'cpu', inputMaxBytes: 1024 ** 3, outputMaxBytes: 128 * 1024 ** 2,
    networkMaxBytes: 256 * 1024 ** 2, storageMaxByteHours: 1024 ** 3 * 144,
    rateMicrosPerSecond: 44, fixedCostMicros: 14160,
    job: 'projects/autopromote-staging-native/locations/us-central1/jobs/speech',
    image: 'us-docker.pkg.dev/autopromote-staging-native/runtime/native@sha256:' + 'a'.repeat(64),
    serviceAccount: 'native@autopromote-staging-native.iam.gserviceaccount.com', qualificationId: 'qa-' + crypto.randomUUID() };
  p.operation = operation; p.tokens = tokens;
  const body = { video_url: 'https://storage.googleapis.com/owned/input.mp4', ...(render ? {async_mode:true,job_id:'native-'+crypto.randomUUID()} : {}) };
  const fingerprint = digest({ path: route, body });
  const service = createProcessingService({ db, entitlement: async () => 'free',
    operations: { [operation+'@' + p.id]: { tokens, maxMicros: p.maxMicros,
      maxSeconds: p.maxSeconds, resource: 'cpu', retries: 0 } } });
  await service.configure({ enabled: true });
  if (funded) await db.collection('processing_worker_qualifications').doc(p.qualificationId).set({
    kind: 'funded-qualification', approved: true, profileDigest: digest(p),
    expiresAt: new Date(Date.now() + 600000).toISOString(), allowedRequests: [{ userId: uid, requestId, fingerprint }] });
  const template = { containers: [{ image: p.image, env: [{ name: 'PROCESSING_MAX_SECONDS', value: '360' }],
    resources: { limits: { cpu: '2', memory: '4Gi' } } }], timeout: '360s', maxRetries: 0, serviceAccount: p.serviceAccount };
  let posts = 0, execution;
  const request = async config => {
    if (config.method === 'POST') {
      posts++;
      const env = [...template.containers[0].env, ...config.data.overrides.containerOverrides[0].env];
      const id = env.find(v => v.name === 'PROCESSING_BINDING_ID').value;
      const binding = (await db.collection('processing_worker_bindings').doc(id).get()).data();
      await db.collection('video_edits').doc(binding.nativeJobId).set({ status: success ? 'completed' : 'failed',
        processingResult: { status: 'completed', segments: [{ start: 0, end: 60, text: 'Actual transcript fixture' }] } }, { merge: true });
      execution = { name: p.job + '/executions/one', job: p.job, uid: 'provider-execution', taskCount: 1,
        template: { ...template, containers: [{ ...template.containers[0], env }] },
        startTime: new Date(Date.now() - 1000).toISOString(), completionTime: new Date().toISOString(),
        succeededCount: success ? 1 : 0, failedCount: success ? 0 : 1,
        conditions: [{ type: 'Completed', state: success ? 'CONDITION_SUCCEEDED' : 'CONDITION_FAILED' }] };
      if (lost) throw Error('Lost run response');
      return { data: { metadata: { name: execution.name } } };
    }
    if (config.url.includes('/executions?')) return { data: { executions: execution ? [execution] : [] } };
    if (config.url.endsWith('/executions/one')) return { data: execution };
    return { data: { name: p.job, etag: 'pinned', template: { taskCount: 1, parallelism: 1, template } } };
  };
  const adapter = createNativeWorkerAdapter({ db, profile: p, request });
  const app = express(); app.use(rateLimit({windowMs:60000,max:300})); app.use(express.json());
  app.use(createProcessingGuard({ service, authenticate: (req, res, next) => {
    req.user = { uid, claims: { email_verified: true } }; next(); }, adapters: { select: () => adapter } }));
  app.post(route, async (req, res) => {
    try { const target = 'https://native.invalid'+(render?'/render-viral-clip':'/transcribe');
      const response = await axios.post(target, req.body, await applicationWorkerConfig(target, req.body));
      res.json(response.data);
    } catch (error) { res.status(error.status || 503).json({ error: error.code || 'worker-pending' }); }
  });
  return { uid, requestId, p, service, adapter, get posts() { return posts; },
    submit: () => http(app).post(route).set('Idempotency-Key', requestId)
      .set('X-Processing-Tokens-Approved', String(tokens)).send(body) };
}
test('funded asynchronous Studio dispatch retains the existing native handoff contract and one execution', async () => {
  const f = await fixture({render:true}), response = await f.submit();
  assert.equal(response.status,200);
  assert.equal(response.body.status,'processing');
  assert.equal(response.body.mode,'async','existing VideoEditingService uses mode to recognize worker ownership');
  assert.equal(response.body.job_id,response.body.jobId);
  assert.equal((await f.service.status(f.uid)).remaining,60);
  assert.equal(f.posts,1);
  assert.equal((await f.submit()).status,409);
  assert.equal(f.posts,1);
  await f.service.settle(f.uid,f.requestId,{eventId:'fixture-stopped',success:false,actualMicros:16800,stopped:true});
});
test('existing native HTTP caller is admitted and settled through one immutable no-retry execution', async () => {
  const f = await fixture(); const response = await f.submit();
  assert.equal(response.status, 200); assert.equal(response.body.segments[0].end, 60);
  assert.equal(f.posts, 1); assert.equal((await f.service.status(f.uid)).remaining, 90);
  assert.equal((await f.submit()).status, 409); assert.equal(f.posts, 1);
});
test('missing funded authorization cannot start production processing and releases undispatched holds', async () => {
  const f = await fixture({ funded: false }); assert.equal((await f.submit()).status, 503);
  assert.equal(f.posts, 0); assert.equal((await f.service.status(f.uid)).remaining, 100);
});
test('lost run response is discovered without another run POST and provider failure restores tokens only', async () => {
  const f = await fixture({ lost: true, success: false }); assert.equal((await f.submit()).status, 503);
  assert.equal((await f.service.status(f.uid)).activeJobs, 1);
  const binding=(await db.collection('processing_worker_bindings').doc(digest([f.uid,f.requestId])).get()).data();
  await db.collection('video_edits').doc(binding.nativeJobId).update({status:'processing'});
  await f.adapter.reconcilePending(f.service, f.uid);
  const status = await f.service.status(f.uid); assert.equal(status.activeJobs, 0); assert.equal(status.remaining, 100);
  assert.equal(f.posts, 1);
  assert.equal((await db.collection('video_edits').doc(binding.nativeJobId).get()).data().status,'failed');
});
test('API envelope preserves requested output limits and rejects extra choices, tools or unpriced models', () => {
  const input = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Write one caption' }], max_tokens: 500 };
  assert.equal(requestBound(input).output, 500); assert.ok(requestBound(input).micros < 10000);
  for (const extra of [{ n: 2 }, { tools: [{}] }, { model: 'unknown' }, { stream: true }])
    assert.throws(() => requestBound({ ...input, ...extra }), { code: 'API_COST_VALIDATION_REQUIRED' });
});
test('a resolved image must be an amd64 child of the exact pinned manifest, with unchanged resources', async () => {
  const child='sha256:'+crypto.randomBytes(32).toString('hex');
  const bytes=Buffer.from(JSON.stringify({manifests:[{digest:child,platform:{os:'linux',architecture:'amd64'}}]}));
  const image='us-docker.pkg.dev/demo-autopromote-credits/runtime/native@sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
  const p={job:'projects/demo-autopromote-credits/locations/us-central1/jobs/native',image,
    serviceAccount:'native@example.test',cpuMilli:2000,memoryBytes:4*1024**3,maxSeconds:360,device:'cpu'};
  const execution={taskCount:1,template:{serviceAccount:p.serviceAccount,maxRetries:0,timeout:'360s',
    containers:[{image:image.split('@')[0]+'@'+child,resources:{limits:{cpu:'2',memory:'4Gi'}}}]}};
  const assertExecution=require('../../src/services/processingTokens/cloudRunAdapter').assertExecutionTemplate;
  await assertExecution(execution,p,async()=>({data:bytes}));
  await assert.rejects(assertExecution({...execution,template:{...execution.template,containers:[{
    ...execution.template.containers[0],image:image.split('@')[0]+'@sha256:'+'0'.repeat(64)}]}},p,async()=>({data:bytes})),
    {code:'CLOUD_RUN_PROFILE_DRIFT'});
  await assert.rejects(assertExecution({...execution,template:{...execution.template,timeout:'900s'}},p,async()=>({data:bytes})),
    {code:'CLOUD_RUN_PROFILE_DRIFT'});
});

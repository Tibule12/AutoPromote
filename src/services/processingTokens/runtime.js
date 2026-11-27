const { AsyncLocalStorage } = require("node:async_hooks");
const { fail } = require("../unifiedCredits/policy");
const context = new AsyncLocalStorage();
const enabled = () => process.env.FREE_FIRST_USAGE_ENABLED === "true";
function current(uid) {
  const value = context.getStore();
  if (value && uid && value.uid !== uid) fail("PROCESSING_IDENTITY_CONFLICT", 403);
  return value;
}
function assertDispatch() {
  if (enabled() && !current()?.boundedWorker) fail("BOUNDED_PROCESSING_ADAPTER_REQUIRED", 503);
}
let singleton;
const adapters = {};
let productionProfiles;
function profiles() {
  if(productionProfiles)return productionProfiles;
  if(process.env.PROCESSING_CLOUD_RUN_ADAPTER_ENABLED!=='true')return [];
  const configured=JSON.parse(process.env.PROCESSING_CLOUD_RUN_PROFILES_JSON||'[]');
  if(!Array.isArray(configured)||!configured.length)fail('CLOUD_RUN_PROFILES_REQUIRED',503);
  return productionProfiles=configured.map(require('./cloudRunAdapter').validateProfile);
}
function installProductionAdapters(db) {
  adapters['ai-text']=require('./apiAdapter').createApiAdapter();
  adapters['ai-director']=require('./apiAdapter').createApiAdapter({profileId:'ai-director'});
  for(const profile of profiles()) {
    if(adapters[profile.id])continue;
    const request=async config=>{
      const {GoogleAuth}=require('google-auth-library');
      const credentials=require('../../../firebaseConfig.server');
      const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform'],
        ...(!process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.K_SERVICE&&credentials.private_key ? {credentials} : {})}).getClient();
      return client.request({...config,timeout:30000});
    };
    if(profile.requestScope==='existing-native-v1') {
      adapters[profile.id]=require('./nativeWorkerAdapter').createNativeWorkerAdapter({db,profile,request});
      continue;
    }
    adapters[profile.id]=require('./cloudRunAdapter').createCloudRunAdapter({db,profile,request,
      inspectOutput:async (native,binding)=>{
        const path=native.outputStoragePath||native.output_storage_path;
        if(path!==`processed/multicam_${binding.nativeJobId}.mp4`)fail('WORKER_OUTPUT_EVIDENCE_REQUIRED',503);
        const [metadata]=await require('../../firebaseAdmin').storage.bucket().file(path).getMetadata();
        if(metadata.metadata?.autopromoteJobId!==binding.nativeJobId)fail('WORKER_OUTPUT_EVIDENCE_REQUIRED',503);
        return {bytes:Number(metadata.size),generation:metadata.generation};
      }});
  }
  adapters.select=(operation,req)=>{
    if(operation==='captions.generate')return adapters[/director/.test(req.path||'')?'ai-director':'ai-text'];
    const choices=profiles().filter(p=>p.operation===operation);
    let selected;
    if(operation==='studio.render') {
      const body=req.body?.options?.viralData||req.body||{};
      const seconds=Number(body.duration_seconds)||Math.max(0,Number(body.end_time||0)-Number(body.start_time||0))||60;
      const cpu=!/^\/api\/clips\/auto-generate$|^\/api\/media\/preview-/.test(req.path||'') &&
        !req.body?.isMontage && seconds<=60 && !body.subjectVfx?.length && !body.threeDGraphics?.length &&
        !body.finish_plan?.face_restoration?.enabled && !body.finish_plan?.adjustment_layers?.length &&
        (body.overlays||[]).length<=3 && !['2160p','4k'].includes(String(body.output_settings?.resolution||'').toLowerCase());
      selected=(cpu&&/^\/api\/(?:clips\/generate|media\/render-clip)$/.test(req.path||'')
        ? choices.find(p=>p.id==='clip-cpu') : null)||choices.find(p=>p.id!=='failure-cpu'&&p.device===(cpu?'cpu':'gpu'))||choices[0];
    } else selected=choices[0];
    return selected ? adapters[selected.id] : adapters[operation];
  };
}
function service() {
  if (!singleton) {
    const db=require('../../firebaseAdmin').db;installProductionAdapters(db);
    const operations={...require('./policy').OPERATIONS};
    operations['captions.generate@ai-text']={tokens:1,maxMicros:10000,maxSeconds:90,resource:'external-api',retries:0};
    operations['captions.generate@ai-director']={tokens:3,maxMicros:50000,maxSeconds:90,resource:'external-api',retries:0};
    operations['publisher.publish@publication-small']={tokens:2,maxMicros:70000,maxSeconds:120,resource:'network',retries:0};
    operations['publisher.publish@publication-large']={tokens:2,maxMicros:350000,maxSeconds:600,resource:'network',retries:0};
    for(const p of profiles())operations[p.operation+'@'+p.id]={maxMicros:p.maxMicros,maxSeconds:p.maxSeconds,
      resource:p.device,retries:0,tokens:p.tokens};
    singleton = require("./service").createProcessingService({
      db,
      operations,
      namespace: process.env.PROCESSING_LEDGER_NAMESPACE || 'processing',
      limits: JSON.parse(process.env.PROCESSING_BUDGET_LIMITS_JSON || "{}"),
      plans: tier => {
        const p = require("./policy").processingPlan(tier);
        const hours =
          tier === "plus"
            ? Number(process.env.PROCESSING_PLUS_RESET_HOURS || p.resetHours)
            : p.resetHours;
        if (!Number.isSafeInteger(hours) || hours < 1 || hours > 720)
          fail("INVALID_RESET_POLICY", 503);
        return { ...p, resetHours: hours };
      },
    });
  }
  return singleton;
}
async function reconcilePending(uid) {
  const ledger=service();
  const active=await require('../../firebaseAdmin').db.collection('processing_worker_bindings')
    .where('state','==','dispatch_claimed').limit(100).get();
  for(const doc of active.docs) {
    const binding=doc.data();
    if((uid&&binding.userId!==uid)||(binding.ledgerCollection&&binding.ledgerCollection!==ledger.jobCollectionName))continue;
    await adapters[binding.profileId]?.reconcileBinding?.(binding,ledger);
  }
  for(const adapter of new Set(Object.values(adapters)))
    if(!adapter.reconcileBinding)await adapter.reconcilePending?.(ledger,uid);
}
module.exports = { context, current, enabled, assertDispatch, service, adapters, reconcilePending, profiles };

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
  for(const profile of profiles()) {
    if(adapters[profile.operation])continue;
    const request=async config=>{
      const {GoogleAuth}=require('google-auth-library');
      const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
      return client.request({...config,timeout:30000});
    };
    adapters[profile.operation]=require('./cloudRunAdapter').createCloudRunAdapter({db,profile,request,
      inspectOutput:async (native,binding)=>{
        const path=native.outputStoragePath||native.output_storage_path;
        if(path!==`processed/multicam_${binding.nativeJobId}.mp4`)fail('WORKER_OUTPUT_EVIDENCE_REQUIRED',503);
        const [metadata]=await require('../../firebaseAdmin').storage.bucket().file(path).getMetadata();
        if(metadata.metadata?.autopromoteJobId!==binding.nativeJobId)fail('WORKER_OUTPUT_EVIDENCE_REQUIRED',503);
        return {bytes:Number(metadata.size),generation:metadata.generation};
      }});
  }
}
function service() {
  if (!singleton) {
    const db=require('../../firebaseAdmin').db;installProductionAdapters(db);
    const operations={...require('./policy').OPERATIONS};
    for(const p of profiles())operations[p.operation]={maxMicros:p.maxMicros,maxSeconds:p.maxSeconds,resource:p.device,retries:0};
    singleton = require("./service").createProcessingService({
      db,
      operations,
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
  for(const adapter of new Set(Object.values(adapters)))await adapter.reconcilePending?.(ledger,uid);
}
module.exports = { context, current, enabled, assertDispatch, service, adapters, reconcilePending };

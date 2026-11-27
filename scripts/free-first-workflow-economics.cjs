const fs=require('node:fs');
const path=require('node:path');
const config=require('../config/processing-cost-profiles.example.json');
const root='reports/free-first-optimization-20261126';
const GiB=1024**3;
const usd=micros=>Math.round(micros)/1e6;
const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
// Reservation capacity matters: floor(allowance / actual charge) overstates
// usable operations when a new step needs a larger outstanding reservation.
function capacity(allowance,steps,rolling=Infinity) {
  if(!steps.length||steps.some(s=>!Number.isSafeInteger(s.reservedTokens)||s.reservedTokens<1||
    !Number.isSafeInteger(s.chargedTokens)||s.chargedTokens<1||s.chargedTokens>s.reservedTokens))throw Error('Invalid workflow costs');
  let remaining=allowance,spent=0,count=0;
  while(count<10000){
    let trial=remaining,used=0;
    for(const step of steps){if(trial<step.reservedTokens||spent+used+step.reservedTokens>rolling)return count;
      trial-=step.chargedTokens;used+=step.chargedTokens;}
    remaining=trial;spent+=used;count++;
  }
  return count;
}
function model({name,resources,outputBytes,profile,additionalBaselineSeconds=0,downloadCopies=1,currentGpuShapeObserved=false}) {
  if(!resources||resources.status!=='completed')return{name,status:'not_completed',currentEstimatedUsd:null,optimizedEstimatedUsd:null,
    recommendedTokens:null,freeCapacityPerSixDays:null,plusCapacityPerRenewal:null};
  const p=config.profiles[profile];
  if(!p)throw Error('Unknown resource profile');
  const cpuRate=p.cpu*config.cpuMicrosPerVcpuSecond+p.memoryGiB*config.memoryMicrosPerGiBSecond;
  const gpuRate=20*config.cpuMicrosPerVcpuSecond+80*config.memoryMicrosPerGiBSecond+config.gpuRtxMicrosPerSecond;
  const measuredSeconds=resources.wallSecondsIncludingImport;
  const currentSeconds=Math.max(config.minimumJobSeconds,
    (measuredSeconds+additionalBaselineSeconds)/config.baselineGpuSpeedupAssumption+config.baselineGpuStartupSecondsAssumption);
  const optimizedSeconds=Math.max(config.minimumJobSeconds,measuredSeconds+config.optimizedStartupSecondsAssumption);
  const networkMicros=outputBytes*downloadCopies/GiB*config.networkUsdPerGiBAssumption*1e6;
  const renderEgressMicros=outputBytes*downloadCopies/1e9*config.renderOutboundUsdPerGBAssumption*1e6;
  const storageMicros=((resources.sourceBytes||0)+outputBytes)/GiB*config.storageUsdPerGiBMonthAssumption*
    config.retentionDaysAssumption/30*1e6;
  const other=networkMicros+renderEgressMicros+storageMicros+config.databaseAndRequestMicrosAssumption;
  // Require explicit evidence for the media GPU service allocation. An observed
  // Cam job shape alone must never become a claimed media service price.
  const cpuServiceSeconds=Math.max(config.minimumJobSeconds,
    measuredSeconds+additionalBaselineSeconds+config.optimizedStartupSecondsAssumption);
  const cpuServiceRate=4*24+8*2.5;
  const cpuServiceReference=cpuServiceSeconds*cpuServiceRate+other;
  const gpuSensitivity=currentSeconds*gpuRate+other;
  const current=profile==='cam60'||currentGpuShapeObserved?gpuSensitivity:null,optimized=optimizedSeconds*cpuRate+other;
  const tokens=Math.max(1,Math.ceil(optimized*config.costMargin/1000));
  const reservation=Math.max(tokens,p.proposedReservationTokens);
  const steps=[{reservedTokens:reservation,chargedTokens:tokens}];
  return{name,status:'completed_local',measuredLocal:resources,outputBytes,profile:p,
    currentEstimatedUsd:current===null?null:usd(current),optimizedEstimatedUsd:usd(optimized),
    currentEstimateQualification:profile==='cam60'||currentGpuShapeObserved?'Observed primary GPU allocation; runtime assumes 4x measured CPU speed, not measured GPU execution':
      'Primary GPU service allocation/runtime unavailable; current primary cost is unknown. CPU service reference is reported separately.',
    currentCpuServiceReferenceEstimatedUsd:usd(cpuServiceReference),
    gpuJobSensitivityEstimatedUsd:usd(gpuSensitivity),
    optimizedDirectGcsDeliveryEstimatedUsd:usd(optimized-renderEgressMicros),
    networkTopologyAssumption:'One GCS Internet leg plus one Render outbound leg per output. Direct signed GCS delivery is supported and can avoid Render egress; actual staging/proxy topology must be attributed before production admission.',
    actualCloudExpenditureUsd:0,historicalInvoiceAttributedUsd:null,
    estimateBasis:'GPU baseline assumes 4x CPU speed + 30s startup; CPU candidate uses measured local time + 10s startup and job minimum. Neither is a measured GPU/cloud duration.',
    costBreakdownUsd:{currentCompute:current===null?null:usd(currentSeconds*gpuRate),optimizedCompute:usd(optimizedSeconds*cpuRate),
      network:usd(networkMicros+renderEgressMicros),gcsNetwork:usd(networkMicros),renderOutbound:usd(renderEgressMicros),storage:usd(storageMicros),databaseAndRequests:usd(config.databaseAndRequestMicrosAssumption),
      externalApi:0,externalApiBasis:'offline local runs; no paid provider call'},
    recommendedTokens:tokens,proposedReservationTokens:reservation,recommendedTokensFinal:false,
    freeCapacityPerSixDays:capacity(config.freeWindowTokens,steps,config.freeRollingTokens),
    plusCapacityPerRenewal:capacity(config.plusRenewalTokens,steps,config.plusRollingTokens),
    plusCapacityPerRolling30Days:capacity(config.plusRollingTokens,steps,config.plusRollingTokens),
    estimatedCostReductionPercent:current===null?null:Math.round((1-optimized/current)*10000)/100,
    estimatedReductionVsCpuServiceReferencePercent:Math.round((1-optimized/cpuServiceReference)*10000)/100,
    reductionIsMeasuredCloudSaving:false};
}
function main(){
  const gpu=read(`${root}/operating-environment-followup.json`)?.gpuServiceShape?.[0];
  const mediaGpuShapeObserved=gpu?.nodeSelector?.accelerator==='nvidia-rtx-pro-6000'&&
    gpu.resources?.some(r=>r.limits?.cpu==='20'&&r.limits?.memory==='80Gi');
  const before=read(`${root}/finder-ingest-before/resources.json`),after=read(`${root}/finder-ingest-after/resources.json`);
  const eliminated=before&&after?before.wallSecondsIncludingImport-after.wallSecondsIncludingImport:0;
  const definitions=[['60s basic native worker export','studio60-cpu2','studio60'],
    ['60s multilingual word-timed captions','captions60-sa-cpu2','captions60'],
    ['184s Find Viral Clips + 45s export','finder180-cpu4','finder180'],
    ['60s two-stream Cam edit + external audio','cam60-cpu4-matched-before','cam60'],
    ['60s visual effect + keyed title motion','effects60-cpu4','effects60']];
  const workflows=definitions.map(([name,folder,profile])=>{
    const directory=path.join(root,folder);let resources=read(directory+'/resources.json');
    const files=fs.existsSync(directory)?fs.readdirSync(directory).filter(f=>/^artifact-\d+\.mp4$/.test(f)):[];
    if(resources?.mode!=='captions'&&(!files.length||files.some(file=>!read(path.join(directory,file.replace('.mp4','-proof.json')))?.fullDecodePassed)))resources=null;
    const outputBytes=files.reduce((sum,f)=>sum+fs.statSync(path.join(directory,f)).size,0)||
      (resources?.mode==='captions'?fs.statSync(directory+'/result.json').size:0);
    return model({name,resources,outputBytes,profile,additionalBaselineSeconds:profile==='finder180'?eliminated:0,currentGpuShapeObserved:mediaGpuShapeObserved});
  });
  const native=read(`${root}/actual-studio60-verified/worker-resource.json`);
  if(native){const bytes=fs.statSync(`${root}/actual-studio60-verified/studio-free-output.mp4`).size;
    workflows.push(model({name:'Actual signed-in 60s title/edit/save/reopen/export',resources:native,outputBytes:bytes,profile:'nativeStudio60',currentGpuShapeObserved:mediaGpuShapeObserved}));}
  const output={config,workflows,measuredIngestReduction:before&&after?{
    beforeWallSeconds:before.wallSecondsIncludingImport,afterWallSeconds:after.wallSecondsIncludingImport,
    wallReductionPercent:100*(1-after.wallSecondsIncludingImport/before.wallSecondsIncludingImport),
    beforeCpuSeconds:before.cpuSeconds,afterCpuSeconds:after.cpuSeconds,
    cpuReductionPercent:100*(1-after.cpuSeconds/before.cpuSeconds)}:null,
    caveats:['No GPU benchmark or attributed invoice is implied by the baseline sensitivity scenario.',
      'Download copies, storage retention, failure frequency and merchant fees still need observed production attribution and enforcement.',
      'Recommended tokens include modeled network/storage; the local ledger proof uses its existing CPU-time reference. Do not silently replace one with the other.',
      'Capacity is conditional on the proposed tariffs and excludes earlier failed jobs/outstanding liabilities; production adapters and meaningful workflow combinations remain rollout gates.']};
  fs.writeFileSync(root+'/workflow-economics.json',JSON.stringify(output,null,2)+'\n');
  const columns=['name','status','currentEstimatedUsd','currentCpuServiceReferenceEstimatedUsd','gpuJobSensitivityEstimatedUsd','optimizedEstimatedUsd','recommendedTokens','freeCapacityPerSixDays',
    'plusCapacityPerRenewal','plusCapacityPerRolling30Days','estimatedCostReductionPercent'];
  fs.writeFileSync(root+'/workflow-economics.csv',[columns.join(','),...workflows.map(r=>columns.map(k=>JSON.stringify(r[k]??null)).join(','))].join('\n')+'\n');
  console.log(`Wrote ${workflows.length} workflow scenarios; GPU/cloud amounts are explicitly modeled, not invoices.`);
}
if(require.main===module)main();
module.exports={capacity,model};

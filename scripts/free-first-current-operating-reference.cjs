const fs=require('node:fs');
const root='reports/free-first-optimization-20261126';
const read=name=>JSON.parse(fs.readFileSync(root+'/'+name));
const observation=read('operating-environment-observations.json');
const detail=read('operating-environment-followup.json');
const extra=read('operating-environment-metrics-followup.json');
const hosting=read('hosting-auth-observations.json');
const sum=label=>observation.metrics[label].rows.reduce((s,r)=>s+(r.observedSum||0),0);
const latest=label=>observation.metrics[label].rows.reduce((s,r)=>s+(r.latestValue||0),0);
const round=n=>Math.round(n*1e6)/1e6;
const rows=[];
function add(service,quantity,unit,rateUsd,basis,scope='unallocated') {
 rows.push({service,quantity,unit,rateUsd,estimatedGrossUsd:round(quantity*rateUsd),basis,scope,actualInvoiceAttributedUsd:null});
}
add('Render backend + diagnostic cron',1,'reference month',8,'Historical $7 server line plus $1 cron minimum; current plan/replicas unverified','fixed-reference');
add('Firestore reads',sum('firestoreReads'),'document',.03/1e5,'Observed 30d total at us-central1 Standard price; before daily grants. Includes LOOKUP/QUERY/NOT_FOUND; no per-operation attribution');
add('Firestore writes',sum('firestoreWrites'),'document',.09/1e5,'Observed 30d total, before daily grants; owner/operation split unavailable');
add('Firestore deletes',sum('firestoreDeletes'),'document',.01/1e5,'Observed 30d total, before daily grants');
const dbBytes=extra.metrics.firestoreDataIndexBytes.reduce((s,r)=>s+(r.latestValue||0),0);
add('Firestore document + index storage',dbBytes/1024**3,'GiB-month',.15,'Latest observed footprint held for 30 days; before 1 GiB grant. Not historical mean','retained-footprint');
const groups=new Map();
for(const row of observation.metrics.runBillableSeconds.rows) {
 const name=row.resource.service_name||row.resource.job_name||'unknown';groups.set(name,(groups.get(name)||0)+row.observedSum);
}
for(const [name,seconds] of groups) {
 let rate=null;
 if(['media-worker-gpu','cam-combiner-render-gpu-job','autopromote-model-v1-segmentation','autopromote-model-v1-video','autopromote-model-v1-vision'].includes(name))rate=.00088522;
 else if(['media-worker-v1','cam-combiner-worker'].includes(name))rate=.000116;
 else if(['cam-combiner-render-fast-job','cam-combiner-render-job'].includes(name))rate=.000168;
 else if(name.startsWith('thulani-'))rate=.00002525;
 if(rate!==null)add('Cloud Run '+name,seconds,'observed billable instance-second',rate,
   'Observed 30d instance-time × CURRENT shape/reference rate; historical revisions/startup boost/minimum rounding and credits not attributed. Shared thulani services remain unallocated.',name.startsWith('thulani-')?'shared-unallocated':'processing-or-service');
}
add('Artifact Registry current repositories',detail.repositories.reduce((s,r)=>s+Number(r.sizeBytes||0),0)/1024**3,'GiB-month',.1,
 'Current API repository size held 30 days, before account 0.5 GiB grant. Older Monitoring disagrees; not historical bill. Includes shared thulani-repo.','retained-footprint');
add('GCS retained current footprint',latest('storageBytes')/1024**3,'GiB-month',.02,
 'Latest gauges held 30 days at regional Standard reference; bucket classes/soft-deleted bytes/credits require reconciliation','retained-footprint');
add('Functions invocations',sum('functionExecutions'),'invocation',.4/1e6,
 'Gross reference only; first 2M may be covered by shared grants. Execution compute/network not inferred from invocation count.');
let completedBuildSeconds=0;
for(const b of observation.builds)if(b.startTime&&b.finishTime)completedBuildSeconds+=(Date.parse(b.finishTime)-Date.parse(b.startTime))/1000;
add('Cloud Build known execution intervals',completedBuildSeconds/60,'build-minute',.0156,
 'E2_HIGHCPU_8 sensitivity for observed started builds; one default machine and cancelled/no-start interval cannot be priced exactly. No queued time included.','development-overhead');
const hostBytes=hosting.metrics.hostingTransferBytes.rows.reduce((s,r)=>s+(r.observedSum||0),0);
add('Firebase Hosting transfer',hostBytes/1e9,'GB',.15,'November MTD domain transfer before daily quota; not extrapolated to full month. Static Hosting, not App Hosting.','control-plane');
const total=rows.reduce((s,r)=>s+r.estimatedGrossUsd,0);
const output={currency:'USD',basis:'Mixed 30-day consumption and latest retained-footprint sensitivity; NOT an invoice, a fixed-cost total, or a production maximum.',rows,
 estimatedGrossSubtotalUsd:round(total),gcsTransferSensitivityUsd:{minimum:0,allObservedBytesInternetReference:round(sum('storageNetworkBytes')/1024**3*.12)},
 firestorePossibleDailyGrantUsd:round((50000*.03/1e5+20000*.09/1e5+20000*.01/1e5)*30),
 unpriced:['current Render replicas/workspace/disks/bandwidth/build overage','Functions billed compute/100ms rounding and outbound transfer','GCS class A/B operations and location/destination-specific egress','email, external AI consumed credits, PayPal fees/FX/chargebacks','domain renewal, paid Sentry/custom Monitoring, Data Connect/Secret Manager/App Check/Persona/X API','historical registry footprint discrepancy and credits/taxes'],
 actualInvoiceAttributedTotalUsd:null,noProcessingTokenCostsAddedAgain:true,
 use:'Historical diagnostic reference separate from the population forecast. Never add this subtotal to the processing-token scenario: Cloud Run/media/GCS/job DB are already represented there.'};
fs.writeFileSync(root+'/current-operating-reference.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({grossReferenceSubtotalUsd:output.estimatedGrossSubtotalUsd,networkSensitivity:output.gcsTransferSensitivityUsd,knownBuildMinutes:completedBuildSeconds/60,invoiceAttributedUsd:null}));

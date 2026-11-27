const fs=require('node:fs'),crypto=require('node:crypto');
const directory='reports/free-first-waste-20261126';
const inventory=JSON.parse(fs.readFileSync(directory+'/artifact-inventory-raw-summary.json'));
const references=new Set(inventory.references.map(r=>r.image.split('@')[1]).filter(Boolean));
const byPackage=new Map();
for(const im of inventory.images){const name=im.uri.split('@')[0];if(!byPackage.has(name))byPackage.set(name,[]);byPackage.get(name).push(im);}
const recent=new Set();for(const group of byPackage.values())for(const im of group.sort((a,b)=>Date.parse(b.updateTime||b.uploadTime)-Date.parse(a.updateTime||a.uploadTime)).slice(0,5))recent.add(im.uri);
const at=Date.parse(inventory.capturedAtUtc),classified=[];
for(const im of inventory.images){const reasons=[],digest=im.uri.split('@')[1],age=(at-Date.parse(im.updateTime||im.uploadTime))/86400000;
 if(references.has(digest))reasons.push('Referenced by retained service revision/job/execution');
 if(im.tags?.length)reasons.push('Tagged image retained');
 if(recent.has(im.uri))reasons.push('Five newest versions of each package retained');
 if(!Number.isFinite(age)||age<30)reasons.push('Unknown age or younger than 30 days');
 if(inventory.functionRepositoriesProtectedInFull.includes(im.repository)||/\/(gcf-artifacts|cloud-run-source-deploy)$/.test(im.repository))reasons.push('Function/source-deploy repository retained in full');
 classified.push({...im,ageDays:Number.isFinite(age)?Math.floor(age):null,status:reasons.length?'keep':'review_unreferenced_untagged_old',reasons,
  referencedInInspectedRunMetadata:references.has(digest),
  manualOwnershipReview:!references.has(digest),
  deletionEligible:false});
}
const candidates=classified.filter(r=>r.status.startsWith('review'));
const artifact={capturedAtUtc:inventory.capturedAtUtc,imagesInspected:classified.length,referencesInspected:inventory.references.length,keep:classified.length-candidates.length,
 reviewCandidates:candidates.length,manualOwnershipReview:classified.filter(r=>r.manualOwnershipReview).length,
 images:classified,productionDeletes:0,approvedDeletionCommands:[],reclaimableBytesVerified:null,
 blockers:['No complete authenticated Render/external-consumer image ownership inventory.','45 Gen1 Function runtime image references are not exposed in the returned metadata; affected repositories remain protected.',
  'At least one revision/execution page is truncated; older retained revisions must be completed before any deletion.','OCI manifest-index/attestation reachability and shared-layer storage must be resolved; per-image sizes cannot be summed as reclaimable bytes.','Owner approval is required before deleting production images.'],
 policy:'All observed deployed/rollback references, every tag, newest five/package, recent images and function repositories are kept. Remaining images are REVIEW candidates, not established unused/delete-safe resources.'};
fs.writeFileSync(directory+'/artifact-cleanup-inventory.json',JSON.stringify(artifact,null,2)+'\n');
const csv=['image,status,ageDays,reportedImageBytes,referencedInInspectedRunMetadata,manualOwnershipReview,deletionEligible',...classified.map(im=>[JSON.stringify(im.uri),im.status,im.ageDays,im.imageSizeBytes||'',im.referencedInInspectedRunMetadata,im.manualOwnershipReview,false].join(','))];fs.writeFileSync(directory+'/artifact-cleanup-inventory.csv',csv.join('\n')+'\n');
const privateDirectory=process.argv[2]||'/tmp/autopromote-waste-evidence-20261126';
const audit=JSON.parse(fs.readFileSync(privateDirectory+'/logs-firestore.json'));
const grouped=new Map();const writes=[];
for(const entry of audit.entries||[]){const p=entry.protoPayload||{},r=p.request||{},q=r.structuredQuery||r.addTarget?.query?.structuredQuery||{};
 const fields=[];function visit(value){if(value?.fieldFilter)fields.push({field:value.fieldFilter.field?.fieldPath,operator:value.fieldFilter.op});for(const f of value?.compositeFilter?.filters||[])visit(f);}visit(q.where);
 const shape={method:p.methodName,collections:(q.from||[]).map(f=>f.collectionId),filters:fields,limit:q.limit??null};
 const key=JSON.stringify(shape),row=grouped.get(key)||{...shape,observedRequests:0};row.observedRequests++;grouped.set(key,row);
 for(const write of r.writes||[])writes.push({collection:String(write.update?.name||write.delete||'').split('/documents/')[1]?.split('/')[0]||'unknown',fields:write.updateMask?.fieldPaths||Object.keys(write.update?.fields||{})});
}
let contentWrites=[];
if(fs.existsSync(privateDirectory+'/logs-content-writes.json'))for(const e of JSON.parse(fs.readFileSync(privateDirectory+'/logs-content-writes.json')).entries||[])
 for(const w of e.protoPayload?.request?.writes||[])if(w.update?.name?.includes('/documents/content/'))contentWrites.push({timestamp:e.timestamp,fields:w.updateMask?.fieldPaths||Object.keys(w.update?.fields||{})});
const match=['platform_posts','promotion_tasks','promotion_schedules','media_transform_tasks'];
const groups=[...grouped.values()].sort((a,b)=>b.observedRequests-a.observedRequests);
const retentionRequests=groups.filter(r=>r.limit===200&&r.collections.some(c=>match.includes(c))&&r.filters.some(f=>f.field==='contentId')).reduce((s,r)=>s+r.observedRequests,0);
const report={sampleEntries:(audit.entries||[]).length,earliestSampleUtc:(audit.entries||[]).at(-1)?.timestamp,latestSampleUtc:audit.entries?.[0]?.timestamp,
 queryGroups:groups,retentionSignatureMatches:retentionRequests,matchedSource:'src/services/publishedVideoRetention.js (old four per-content dependency preflight queries)',
 attributionConfidence:'Unique four-query collection/filter/limit signature matches repository source. Sample is not the complete 30-day workload or exact per-endpoint bill.',
 observedWrites:writes,contentWriteSamples:contentWrites,endpointCandidates:[
  {source:'src/server.js',work:'Storage cleanup timer -> storageCleanupService.cleanupPublishedVideos -> publishedVideoRetention',queries:'user_billing, content owner pages, four contentId dependency queries'},
  {source:'src/routes/adminSystemRoutes.js',endpoints:['/api/admin/system/activity','/api/admin/system/api-metrics','/api/admin/system/errors','/api/admin/system/firebase-usage'],work:'activity user joins, API-request history, error pages and aggregate counts'},
  {source:'frontend/src/components/SystemHealthPanel.js',work:'Five GETs and a full integration scan per 10s auto-refresh before change'},
  {source:'src/services/backgroundWorkService.js',work:'Queue/schedule listeners (not per-tick queries); listener changes/reconnects are separately chargeable'},
  {source:'src/services/contentRecoveryService.js',work:'Diagnostic cron persists diagnosis and a content summary; independent of interactive users'},
  {source:'autopromote-functions/index.js',work:'Four content-update trigger deliveries per source update, including unrelated fields'},
  {source:'frontend/src/components/UserLiveLogViewer.js',work:'Three five-document listeners; hidden-tab grace now releases them'}],
 applications:'Observed Node gRPC activity uses a shared service principal; these samples alone do not distinguish every Render/thulani/operator process. New opt-in SDK instrumentation records application, route, code source and query shape without filter values.',
 measuredReadCountAttributionComplete:false,productionWrites:0};
fs.writeFileSync(directory+'/query-attribution.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({images:classified.length,kept:artifact.keep,reviewCandidates:candidates.length,manualOwnershipReview:artifact.manualOwnershipReview,deleteEligible:0,retentionMatches:retentionRequests,sampleEntries:report.sampleEntries,contentWriteSamples:contentWrites.length}));

// Metadata graph only. This script has no cloud client and cannot delete images.
const fs=require('node:fs'),crypto=require('node:crypto');
function classify(observation, prior={references:[]}) {
 const images=new Map(observation.images.map(im=>[im.uri,im]));
 const manifests=new Map(observation.manifests.map(r=>[r.uri,r.manifest]));
 const refs=[...observation.references,...prior.references];
 const digests=new Set(refs.map(r=>r.image.split('@')[1]).filter(Boolean));
 const reasons=new Map(),children=new Set();
 const keep=(uri,reason)=>{if(!reasons.has(uri))reasons.set(uri,new Set());reasons.get(uri).add(reason);};
 const byPackage=new Map();
 for(const [uri,im] of images) {
  const pkg=uri.split('@')[0];if(!byPackage.has(pkg))byPackage.set(pkg,[]);byPackage.get(pkg).push(im);
  for(const edge of manifests.get(uri)?.manifests||[])children.add(pkg+'@'+edge.digest);
 }
 for(const group of byPackage.values())for(const im of group.filter(im=>!children.has(im.uri)).sort((a,b)=>Date.parse(b.uploadTime)-Date.parse(a.uploadTime)).slice(0,5))keep(im.uri,'Five newest build roots per package / rollback');
 for(const [uri,im] of images) {
  const age=(Date.parse(observation.capturedAtUtc)-Date.parse(im.uploadTime))/86400000;
  if(digests.has(uri.split('@')[1]))keep(uri,'Observed current or retained GCP deployment/execution reference');
  if(!Number.isFinite(age)||age<30)keep(uri,'Younger than thirty days or unknown age');
  if(/\/(gcf-artifacts|cloud-run-source-deploy)$/.test(im.repository))keep(uri,'Managed Functions/source repository');
  if(im.tags?.some(t=>/(?:^|:)(latest|stable|production|prod|rollback(?:[-_].*)?)$/.test(t)))keep(uri,'Named release/current/rollback tag');
 }
 const missingEdges=[];
 const closure=(roots,mark=false)=>{
  const visited=new Set();const todo=[...roots];
  while(todo.length){const uri=todo.pop();if(visited.has(uri))continue;visited.add(uri);const m=manifests.get(uri);if(!m)continue;
   for(const e of [...(m.manifests||[]),...(m.subject?[m.subject]:[])]) {
    const child=uri.split('@')[0]+'@'+e.digest;
    if(!images.has(child)){missingEdges.push({parent:uri,child});continue;}
    if(mark)keep(child,'Reachable from retained manifest/index/subject');todo.push(child);
   }
  }return visited;
 };
 closure(reasons.keys(),true);
 // Candidates remain conditional on complete external consumer ownership.
 const candidates=[...images.keys()].filter(uri=>!reasons.has(uri));
 const kept=[...images.keys()].filter(uri=>reasons.has(uri));
 const fileByDigest=new Map(),manifestFiles=new Map(),files=new Map();
 for(const f of observation.files) {
  const key=f.name;files.set(key,f);const tail=decodeURIComponent(key.split('/files/')[1]);
  if(tail.startsWith('sha256:'))fileByDigest.set(f.repository+'@'+tail,key);
  if(f.owner?.includes('/versions/'))manifestFiles.set(f.owner,key);
 }
 function assets(uris) {
  const result=new Set();
  for(const uri of closure(uris)) {
   const im=images.get(uri),m=manifests.get(uri);if(!im||!m)continue;
   const pkg=uri.split('@')[0].split('/').slice(3).join('/');
   const owner=im.repository+'/packages/'+encodeURIComponent(pkg)+'/versions/'+uri.split('@')[1];
   const manifest=manifestFiles.get(owner);if(manifest)result.add(manifest);
   for(const d of [...(m.layers||[]),...(m.config?[m.config]:[])]) {
    const file=fileByDigest.get(im.repository+'@'+d.digest);if(file)result.add(file);
   }
  }return result;
 }
 const retainedAssets=assets(kept),candidateAssets=assets(candidates);
 const unique=[...candidateAssets].filter(f=>!retainedAssets.has(f));
 const uniqueBytes=unique.reduce((sum,f)=>sum+Number(files.get(f).sizeBytes),0);
 const rows=[...images].map(([uri,im])=>({uri,tags:im.tags||[],repository:im.repository,
  ageDays:Math.floor((Date.parse(observation.capturedAtUtc)-Date.parse(im.uploadTime))/86400000),
  status:reasons.has(uri)?'keep':'conditional_candidate',keepReasons:[...(reasons.get(uri)||[])],
  deletionApproved:false,externalOwnershipConfirmed:observation.externalConsumerInventoryComplete===true}));
 return {capturedAtUtc:observation.capturedAtUtc,images:rows,kept:kept.length,candidates:candidates.length,missingManifestEdges:[...new Map(missingEdges.map(e=>[JSON.stringify(e),e])).values()],
  completeGetCoverage:observation.requests.every(r=>r.status===200),externalConsumerInventoryComplete:observation.externalConsumerInventoryComplete,
  candidateSetUniqueFileBytes:uniqueBytes,candidateSetUniqueGiB:uniqueBytes/1073741824,
  uniqueFiles:unique.map(f=>({name:f,sizeBytes:Number(files.get(f).sizeBytes)})),
  providerFilesInspected:files.size,allProviderFileBytes:[...files.values()].reduce((s,f)=>s+Number(f.sizeBytes),0),
  candidateBytesAreNonAdditive:true,confirmedReclaimableBytes:observation.externalConsumerInventoryComplete&&missingEdges.length===0?uniqueBytes:null,
  deleteEligible:0,productionDeletes:0,
  limitations:['Candidate-set byte count subtracts every file reachable from kept images, including shared layers, using provider file sizes. It is not the sum of image sizes.',
   'External Render/other consumers need confirmation before candidates become unused. All deletions still require owner approval.',
   'Unreferenced layers are garbage-collected by the provider later; invoice/storage reduction is not immediate or measured.']};
}
if(require.main===module){const folder='reports/free-first-release-20261127';const j=JSON.parse(fs.readFileSync(folder+'/registry-reachability-observations.json'));const old=JSON.parse(fs.readFileSync('reports/free-first-waste-20261126/artifact-inventory-raw-summary.json'));const r=classify(j,old);fs.writeFileSync(folder+'/registry-cleanup-candidates.json',JSON.stringify(r,null,2)+'\n');fs.writeFileSync(folder+'/registry-cleanup-candidates.csv',['uri,status,ageDays,tags,deletionApproved',...r.images.map(i=>[JSON.stringify(i.uri),i.status,i.ageDays,JSON.stringify(i.tags.join(';')),false].join(','))].join('\n')+'\n');console.log(JSON.stringify({kept:r.kept,candidates:r.candidates,uniqueGiB:r.candidateSetUniqueGiB,missingEdges:r.missingManifestEdges.length,confirmedReclaimableBytes:r.confirmedReclaimableBytes,deleteEligible:0}));}
module.exports={classify};

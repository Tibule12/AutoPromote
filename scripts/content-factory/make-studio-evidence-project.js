#!/usr/bin/env node
// Open the same reviewed raw sources in the existing local Studio component.
// Only the local media transport is adapted; no login/export bypass is used.
const fs=require('fs/promises'),path=require('path');
const {createFactoryArtifactAccess}=require('../../src/services/contentFactoryArtifactAccess');
const {compileFactoryEdit}=require('../../src/services/contentFactoryStudioAdapter');
const {digest}=require('../../src/services/contentFactoryContract');
async function main(){
 const root=path.resolve(process.argv[2]),version=Number(process.argv[3]);
 const selection=JSON.parse(await fs.readFile(path.join(root,`transformation-selection-v${version}.json`)));
 const p=createFactoryArtifactAccess({root});
 const shots=selection.output.sequence.filter(s=>!['studio-ui','identity'].includes(s.assetId));const assets=[];
 for(const shot of shots){const item=selection.assets.find(a=>a.assetId===shot.assetId);const review=JSON.parse(await fs.readFile(path.join(root,item.review)));const artifact=await p.verifyArtifact({path:item.path});
  if(!review.accepted||review.artifactSha256!==artifact.sha256)throw Error('Unreviewed Studio source '+item.assetId);
  const receipt=JSON.parse(await fs.readFile(path.join(root,item.receipt)));
  if(receipt.artifact?.sha256 && receipt.artifact.sha256!==artifact.sha256)throw Error('Changed source receipt '+item.assetId);
  const sourceBrief=receipt.sourceBrief || 'See the immutable source-generation receipt';
  assets.push({...item,status:'accepted',artifact,review:{...review,evidenceSha256:review.evidenceSha256||artifact.sha256},
   provenance:{sourceBrief,sourceBriefHash:digest(sourceBrief),model:receipt.model || 'Source trim; original generation retained in receipt',
    modelRevision:receipt.modelRevision || receipt.version || 'source-trim-v1',settings:receipt.settings || receipt.config || {sourceRange:receipt.sourceRange},
    seed:receipt.seed ?? receipt.config?.seed ?? null,parentArtifactSha256:receipt.parentSha256 || null,sourceReceiptHash:digest(receipt)}});
 }
 const output={outputId:'paper-to-real',aspect:'16:9',purpose:'Actual reviewed source assembly for private Studio interaction evidence.',sequence:shots};
 const edit=compileFactoryEdit({jobId:`transformation-evidence-v${version}`,ownerUid:'founder-local',assets,output,urlFor:a=>'/factory-media/'+a.path});
 const labels={'paper-start':'Paper boat · generated opening','paper-to-real':'Continuous transformation · generated take','native-transform':'Connected transformation · editable 3D','real-vessel':'Real yacht · generated moving footage'};
 const snapshot={...edit.snapshot,studioDocument:edit.document,studioDocumentHash:edit.documentHash};
 snapshot.timeline=snapshot.timeline.map(c=>{const asset=assets.find(a=>a.assetId===c.sourceClipId);const {storagePath,sourceStoragePath,...rest}=c;return {...rest,url:'/factory-media/'+asset.artifact.path,name:labels[c.sourceClipId]||c.sourceClipId};});
 snapshot.orderedClips=snapshot.timeline.map(c=>({...c,start:c.startRequest,end:c.endRequest,sourceDuration:assets.find(a=>a.assetId===c.sourceClipId).artifact.duration}));
 snapshot.selectedClipId=snapshot.timeline[0].id;
 const first=snapshot.orderedClips[0];
 const fixture={project:{id:edit.projectId,name:selection.studioProjectName || 'Paper to real · generated source assembly',snapshot},clip:first,sourceEvidence:edit.sourceEvidence,scope:'Private local signed-out source/edit interaction proof; no public release or authenticated export is implied.'};
 const file=path.join(root,'studio-fixture-project.json');
 await fs.copyFile(file,path.join(root,`studio-fixture-project-before-v${version}.json`));
 await fs.writeFile(file,JSON.stringify(fixture,null,2),{mode:0o600});console.log(JSON.stringify({event:'reviewed_studio_evidence_project_ready',documentHash:edit.documentHash}));
}
main().catch(e=>{console.error(e);process.exitCode=1});

#!/usr/bin/env node
// Private selected-take assembly through the existing Director and renderer.
// A successful generation is insufficient: every picture asset needs a
// separate review bound to these exact bytes before entering the edit.
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto');
const {createNvidiaFactoryProviders}=require('../../src/services/contentFactoryProviders');
const {createFactoryArtifactAccess}=require('../../src/services/contentFactoryArtifactAccess');
const {compileFactoryEdit}=require('../../src/services/contentFactoryStudioAdapter');
const {buildFactoryIntelligence}=require('../../src/services/contentFactoryIntelligenceAdapter');
const {validateDirection,digest}=require('../../src/services/contentFactoryContract');
async function main(){
 const root=path.resolve(process.argv[2]),version=Number(process.argv[3]||7);
 if(!Number.isSafeInteger(version)||version<7||version>99)throw Error('Private reviewed version required');
 const flags=process.argv.slice(4);
 if(flags.some(flag=>flag!=='--compile-only') || flags.length>1)throw Error('Unknown private assembly option');
 const compileOnly=flags.includes('--compile-only');
 const sourceBrief=await fs.readFile(path.join(root,'real-boat-direction-v6.txt'),'utf8');
 const direction=JSON.parse(await fs.readFile(path.join(root,'factory-direction-v6.json')));
 // Byte review and canonical assembly remain usable without a paid GPU window.
 // Provider dispatch is constructed only when an actual render is requested.
 const p=createFactoryArtifactAccess({root});
 const selection=JSON.parse(await fs.readFile(path.join(root,`transformation-selection-v${version}.json`)));
 if(selection.directionFile){
  const file=await fs.realpath(path.resolve(root,selection.directionFile));
  if(!file.startsWith(root+path.sep))throw Error('Creative direction outside private artifact root');
  Object.assign(direction,JSON.parse(await fs.readFile(file,'utf8')));
 }
 const assets=[];
 for(const item of selection.assets){
  const receipt=JSON.parse(await fs.readFile(path.join(root,item.receipt)));
  const review=JSON.parse(await fs.readFile(path.join(root,item.review)));
  const artifact=await p.verifyArtifact({path:item.path});
  if(!review.accepted||review.artifactSha256!==artifact.sha256||!review.reason)throw Error(`Unreviewed or changed asset: ${item.assetId}`);
  const asset={assetId:item.assetId,type:item.type,beatId:item.beatId,status:'accepted',artifact,audioRole:item.audioRole||null,review:{...review,evidenceSha256:review.evidenceSha256||artifact.sha256},
   provenance:{sourceBrief:receipt.sourceBrief||sourceBrief,model:receipt.model||'AutoPromote reviewed source trim',modelRevision:receipt.modelRevision||receipt.version||'source-trim-v1',settings:receipt.settings||receipt.config||{sourceRange:receipt.sourceRange},seed:receipt.seed??receipt.config?.seed??null,tool:receipt.tool||receipt.operation,origin:receipt.origin||(item.type==='ui'?'actual_product_ui':item.type==='audio'?'generated_audio':'server_generated'),parentArtifactSha256:receipt.parentSha256||receipt.referenceImageSha256||null,...(receipt.parentProvenance?{parentProvenance:receipt.parentProvenance}:{})},
   reusableArtifacts:item.reusableArtifacts||[]};
  assets.push(asset);
 }
 const output=selection.output;
 // Some takes pass only within a reviewed source range. Preserve that
 // restriction through editorial assembly, including repeated occurrences.
 for(const asset of assets){
  const range=asset.review.usableSourceRange;
  if(!range)continue;
  if(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end<=range.start||range.end>asset.artifact.duration+1/24)
   throw Error(`Invalid reviewed source range: ${asset.assetId}`);
  for(const shot of output.sequence.filter(s=>s.assetId===asset.assetId))
   if(shot.start<range.start-1e-6||shot.start+shot.duration>range.end+1e-6)
    throw Error(`Edit exceeds reviewed source range: ${asset.assetId}`);
 }
 const previousStory=direction.story;
 if(!selection.directionFile){
 direction.title='One world becomes another';
 direction.story={...previousStory,hook:'A tiny paper boat gains living water; its folded geometry begins to change.',development:'Paper unfolds into canvas, the hull gains timber and the desk-bound pool expands into a real sea within one continuous transformation.',tension:'The impossible change must remain recognisable and physically connected: will one small idea become a believable vessel and world?',payoff:'The same transformation resolves into the actual moving mahogany yacht take, followed by these generated sources in the existing Studio.',withheld:'The full yacht and open-sea scale until the material transformation resolves; AutoPromote identity until the proof and closing ident.',amplify:['Continuous geometry, material, lighting and water change','The full-size yacht moving with convincing wake','These exact generated sources as editable Studio material'],remove:['A cut or dissolve presented as a transformation','A paper vessel as the final payoff','Repeated water shots','Unrelated effects','Public-release or arbitrary-brief autonomy claims']};
 direction.script=[{beatId:'hook',action:'One idea. A recognisable paper boat on a workbench gains water.',sound:'Tactile paper and restrained narration.'},{beatId:'transformation',action:'The paper folds, material, scale and surrounding world continuously become a yacht at sea.',sound:'A motivated sound rise and material/water accents; space for the image.'},{beatId:'voyage',action:'The real mahogany vessel powers through moving waves.',sound:'Release into broad harmony and bow wake.'},{beatId:'reveal',action:'The exact generated source clips appear in the actual AutoPromote Studio.',sound:'This started with a brief. No camera. No footage.'},{beatId:'ending',action:'The editable cinematic AutoPromote ident resolves the story.',sound:'Timed studio impact and musical resolve.'}];
 }
 direction.assets=assets.map(a=>({assetId:a.assetId,type:a.type,beatId:a.beatId,prompt:a.review.reason,reason:a.review.reason,duration:a.artifact.duration,provider:'reuse',libraryRef:a.assetId,acceptanceCriteria:[a.review.reason],seed:20261007127}));
 direction.outputs=[output];validateDirection(direction);
 for(const asset of assets){asset.provenance.sourceBriefHash=digest(asset.provenance.sourceBrief);asset.provenance.directionHash=digest(direction);}
 const edit=compileFactoryEdit({jobId:`founder-continuous-transform-v${version}`,ownerUid:'founder-local',assets,output,urlFor:p.urlFor});
 edit.intelligence=buildFactoryIntelligence({projectId:edit.projectId,ownerUid:'founder-local',assets,direction});
 for(const [name,value] of [[`transformation-direction-v${version}.json`,direction],[`transformation-assets-v${version}.json`,assets],[`transformation-edit-v${version}.json`,edit]])await fs.writeFile(path.join(root,name),JSON.stringify(value,null,2),{mode:0o600});
 if(compileOnly){
  console.log(JSON.stringify({event:'private_transformation_edit_compiled',version,documentHash:edit.documentHash,gpuDispatched:false}));
  return;
 }
 const window=JSON.parse(await fs.readFile(path.join(root,'gpu-window.json')));
 const provider=createNvidiaFactoryProviders({root,host:'autopromote-l40s-staging',remoteRoot:window.renderRemoteRoot||'/data/autopromote-content-factory-20261007',deadlineEpoch:window.deadline_epoch,python:window.python||'/tmp/autopromote-studio-vfx-20261007/bin/python',renderDevice:window.renderDevice||'cpu'});
 const rendered=await provider.render({edit,output,attempt:version});const artifact=await p.verifyArtifact(rendered.artifact);
 await fs.writeFile(path.join(root,`transformation-rendered-v${version}.json`),JSON.stringify({status:'pending_whole_film_creative_review',artifact,editArtifact:rendered.editArtifact,documentHash:edit.documentHash},null,2),{mode:0o600});
 console.log(JSON.stringify({event:'private_transformation_film_rendered',version,...artifact}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

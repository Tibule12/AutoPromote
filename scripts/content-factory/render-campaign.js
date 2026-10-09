#!/usr/bin/env node
// Assemble selected, evidence-backed generated assets through the real Director.
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto');
const {createNvidiaFactoryProviders}=require('../../src/services/contentFactoryProviders');
const {compileFactoryEdit}=require('../../src/services/contentFactoryStudioAdapter');
const {buildFactoryIntelligence}=require('../../src/services/contentFactoryIntelligenceAdapter');
const {digest}=require('../../src/services/contentFactoryContract');
async function main(){
 const root=path.resolve(process.argv[2]),version=Number(process.argv[3]||1),film=process.argv[4]||'hero';
 const window=JSON.parse(await fs.readFile(path.join(root,'gpu-window.json'))),direction=JSON.parse(await fs.readFile(path.join(root,'factory-direction-v1.json')));
 const sourceBrief=await fs.readFile(path.join(root,'brief.txt'),'utf8');
 const p=createNvidiaFactoryProviders({root,host:'autopromote-l40s-staging',remoteRoot:'/data/autopromote-content-factory-20261007',deadlineEpoch:window.deadline_epoch,python:'/tmp/autopromote-studio-vfx-20261007/bin/python',renderDevice:'cpu'});
 const assets=[];
 async function add(id,type,file,receiptFile,reason,evidenceFile,role){
  const receipt=JSON.parse(await fs.readFile(path.join(root,receiptFile))),artifact=await p.verifyArtifact({path:file});
  const evidence=evidenceFile?crypto.createHash('sha256').update(await fs.readFile(path.join(root,evidenceFile))).digest('hex'):artifact.sha256;
  const review={accepted:true,reviewer:evidenceFile?'Codex visual inspection':'AutoPromote objective audio measurements',modelRevision:'content-factory-selected-roles-20261007',evidenceSha256:evidence,reason,criteria:[{criterion:'Usable for the explicitly assigned story role',passed:true,observation:reason}],revisionInstructions:'',limitation:type==='audio'?'Measured audibility/headroom; speech clarity and musical effectiveness await founder listening.':'Machine visual selection; final story review remains separate.'};
  const model=typeof receipt.model==='object'?receipt.model.model:receipt.model||'Blender';
  const revision=typeof receipt.model==='object'?receipt.model.revision:receipt.modelRevision||receipt.version;
  const asset={assetId:id,type,beatId:'hook',status:'accepted',artifact,audioRole:role||null,review,
   provenance:{sourceBrief:receipt.sourceBrief||sourceBrief,sourceBriefHash:digest(receipt.sourceBrief||sourceBrief),directionHash:digest(direction),prompt:receipt.shot?.prompt||receipt.prompt||receipt.settings?.scene?.text||reason,model,modelRevision:revision,settings:receipt.settings||{steps:receipt.steps,referenceImageSha256:receipt.referenceImageSha256||null},seed:receipt.seed||receipt.shot?.seed||0,tool:receipt.tool||'AutoPromote Wan adapter',origin:'server_generated',generationReceipt:receiptFile},usedIn:[]};
  if(type==='audio'){
   const {execFileSync}=require('child_process');const m=JSON.parse(execFileSync('/tmp/autopromote-studio-vfx-20261007/bin/python',[path.join(__dirname,'review-audio.py'),'--input',path.join(root,file)]));if(!m.accepted)throw Error('Audio technical rejection '+id);asset.review.reason=m.reason;asset.review.measurements=m;
  }
  assets.push(asset);return asset;
 }
 await add('paper-awakens','video','generated/paper-awakens.mp4','generated/paper-awakens-receipt.json','Use the final 2.5 seconds where water appears and the boat floats; omit the static lead-in.','generated/paper-awakens-review.jpg');
 await add('world-on-desk','video','generated/world-on-desk.mp4','generated/world-on-desk-receipt.json','The expanding miniature pool and blank sheet reveal the ordinary origin of the world.','generated/world-on-desk-review.jpg');
 await add('light-path','video','generated/light-path.mp4','generated/light-path-receipt.json','Warm reflected light and calm water provide relief after the threatening wave. Use only as a short relief beat; boat continuity is imperfect.','generated/light-path-review.jpg');
 if(version<3)await add('identity','motion','motion/identity/video.mp4','motion/identity/receipt.json','Correctly spelled AutoPromote and the brief/no-footage statement give a clear ending.','motion/identity/review.jpg');
 else await add('identity','three_d','idents/cinematic-v2/ident.mp4','idents/cinematic-v2/receipt.json','A full-size extruded wordmark resolves through travelling studio light with reflections and timed original impact sound.','idents/cinematic-v2/review.jpg','brand_ident');
 const uiVersion=5;
 await add('studio-ui','ui',`ui/studio-source-assembly-v${uiVersion}/video.mp4`,`ui/studio-source-assembly-v${uiVersion}/receipt.json`,'Actual AutoPromote Studio shows the generated boat footage, editable source clips and live preview.',`ui/studio-source-assembly-v${uiVersion}/poster.png`);
 if(version===1){
  await add('ocean-environment','image','native-images/ocean-keyart-v2/video.mp4','native-images/ocean-keyart-v2/receipt.json','Environment cutaway establishes the scale of the imagined sea. No boat is present; not qualified as a wide boat shot.','native-images/ocean-keyart-v2/image.png');
  await add('storm-action','image','native-images/storm-keyart-v2/video.mp4','native-images/storm-keyart-v2/receipt.json','A looming curling wave is a threatening environment cutaway. This timed still is a draft source to replace with generated water action.','native-images/storm-keyart-v2/image.png');
 }else{
  for(const [id,name,reason] of [
   ['ocean-environment','ocean-scale-v2','Use only 0.4–2.1 seconds: the matching boat opens into a moving sea. Reject the later overexposed close ocean for the requested wide-shot role.'],
   ['storm-action','storm-action-v2','The wave visibly curls and collapses across successive frames. Use as an environment threat cutaway; no boat is present inside this shot.'],
   ['light-return','golden-return-v2','The same reference boat remains intact as the camera reveals a golden sea. Use 2–5 seconds for relief after the wave, omitting the desk lead-in.']
  ])await add(id,'video',`generated/${name}.mp4`,`generated/${name}-receipt.json`,reason,`generated/${name}-review.jpg`);
 }
 const scoreFolder=film==='story'?'campaign':version===1?'hero-v2':'hero-v3';
 await add('score','audio',`audio/${scoreFolder}/score.wav`,`audio/${scoreFolder}/score-receipt.json`,'Original score gives the wave tension and a timed harmonic resolution.',null,'music');
 const n=JSON.parse(await fs.readFile(path.join(root,'narration-plan.json')));
 for(const line of n.lines)await add(line.id,'audio',`narration-cpu/${line.id}.wav`,`narration-cpu/${line.id}-receipt.json`,line.text,null,'voiceover');
 const shot=(assetId,start,duration,reason)=>({assetId,start,duration,reason});
 let sequence=[shot('paper-awakens',2.5,2.5,'Begin at the impossible movement'),shot('ocean-environment',0,3,'An ordinary idea gains a world'),shot('storm-action',0,3,'A wall of water threatens the fragile idea'),shot(version===1?'light-path':'light-return',0,4,'Let the threat resolve into calm'),shot('world-on-desk',1.5,3.5,'Reveal the world contained on the desk'),shot('studio-ui',0,3,'Show this actual generated material in AutoPromote'),shot('identity',.1,2.8,'Give the story a clear platform identity')];
 let cueList=[['idea-isnt-film',.2],['needs-world',2.7],['little-courage',5.7],['way-through',9.2],['brief-no-footage',15.2],['autopromote',19.3]];
 if(version>1){sequence=[shot('paper-awakens',2.5,2.5,'Begin at the impossible movement'),shot('ocean-environment',.4,1.7,'The same idea opens into a moving sea; omit the glare'),shot('storm-action',.8,4,'The wave visibly breaks, giving the fragile voyage a threat'),shot('light-return',2,3,'The same intact boat reaches a golden sea'),shot('world-on-desk',1.5,3.5,'Reveal the miniature world on an ordinary desk'),shot('studio-ui',0,3,'Show the generated material inside actual AutoPromote Studio'),shot('identity',.1,2.8,'Name the platform after the story payoff')];cueList=[['idea-isnt-film',.2],['needs-world',2.55],['little-courage',4.6],['way-through',8.7],['brief-no-footage',14.6],['autopromote',18.8]];}
 if(version>=3){sequence.at(-2).duration=1.2;sequence.at(-1).start=0;sequence.at(-1).duration=3.5;cueList[0]=['one-idea',.05];cueList=cueList.filter(c=>c[0]!=='autopromote').map(c=>c[0]==='brief-no-footage'?[c[0],12.5]:c);}
 if(film==='teaser'){sequence=[shot('paper-awakens',2.5,2.5,'An idea comes alive immediately'),shot('storm-action',0,2,'Introduce a visible threat'),shot(version===1?'light-path':'light-return',1,3,'Resolve the storm'),shot('world-on-desk',2,3,'Return the world to its ordinary origin'),shot('identity',.1,2.8,'Name the platform')];cueList=[['teaser-start',.1],['make-world',3.1],['make-story',6.2],['made-with',10.2]];}
 if(film==='story'){
  await add('failed-storm','video','generated/storm-question.mp4','generated/storm-question-receipt.json','Use as a clearly narrated rejected attempt: dark clouds without an approaching wave do not deliver the requested danger. This asset remains rejected for the hero threat role.','generated/storm-question-review.jpg');
  sequence=[shot('paper-awakens',0,3,'Ordinary material poses the no-footage problem'),shot('paper-awakens',3,2,'Reveal the first impossible movement'),shot('ocean-environment',.4,1.7,'An idea begins gaining a world'),shot('failed-storm',0,3.5,'Show why the first attempt failed, explicitly framed by narration'),shot('storm-action',.8,4,'Replace vague clouds with actual physical wave action'),shot('light-return',1,4,'An intact boat reaches the light'),shot('world-on-desk',0,5,'Reveal the entire miniature world emerging from paper'),shot('studio-ui',0,3,'The actual source material becomes an editable Studio story'),shot('storm-action',2,2,'Replay the threat within the finished story'),shot('light-return',2,3,'Deliver the survival payoff'),shot('identity',0,3,'Resolve the no-footage question with AutoPromote')];
  cueList=[['see-in-head',.15],['nothing-to-upload',2.8],['gave-one-idea',5],['reject-weak',7.8],['boat-refuses',11.3],['made-material',15.5],['brief-no-footage',20.3],['edited-story',25.3],['brief-to-this',28.8],['made-with',31.5]];
  if(version>=3){sequence.find(s=>s.assetId==='studio-ui').duration=1.2;sequence.at(-1).duration=3.5;cueList=cueList.map(c=>c[0]==='edited-story'?[c[0],24.05]:c[0]==='brief-to-this'?[c[0],27.0]:c[0]==='made-with'?[c[0],29.8]:c);}
 }
 if(film==='before-after'){
  await add('failed-storm','video','generated/storm-question.mp4','generated/storm-question-receipt.json','Show explicitly as the rejected first attempt: dark clouds without physical water danger. Qualified only for a failure comparison.','generated/storm-question-review.jpg');
  await add('before-label','motion','motion/before-label/video.mp4','motion/before-label/receipt.json','Readable label explicitly frames the following raw take as rejected.','motion/before-label/review.jpg');
  await add('after-label','motion','motion/after-label/video.mp4','motion/after-label/receipt.json','Readable correction states what the replacement must visibly achieve.','motion/after-label/review.jpg');
  sequence=[shot('before-label',0,1.5,'Name the concrete failed direction'),shot('failed-storm',0,3,'Show the failure honestly'),shot('after-label',0,1.5,'State the corrected physical action'),shot('storm-action',.8,4,'A wave now visibly breaks'),shot('light-return',2,3,'The idea survives into a golden world'),shot('identity',0,3.5,'Resolve with a cinematic AutoPromote ending')];
  cueList=[['reject-weak',1.7],['make-story',6.6],['made-with',13.3]];
 }
 const duration=sequence.reduce((s,x)=>s+x.duration,0);
 const audioCues=cueList.map(([assetId,startTime])=>{const a=assets.find(a=>a.assetId===assetId);if(startTime+a.artifact.duration>duration)throw Error('Narration would be cut off');return{assetId,kind:'voiceover',startTime,duration:a.artifact.duration,trimStart:0,volume:.85};});
 const orderedCues=[...audioCues].sort((a,b)=>a.startTime-b.startTime);
 for(let i=1;i<orderedCues.length;i++)if(orderedCues[i-1].startTime+orderedCues[i-1].duration>orderedCues[i].startTime+.02)throw Error(`Narration overlap: ${orderedCues[i-1].assetId} / ${orderedCues[i].assetId}`);
 const captionSegments=audioCues.map(c=>({start:c.startTime,end:c.startTime+c.duration,text:n.lines.find(l=>l.id===c.assetId).text,captionIcon:'none',captionAccent:'#a18aff'}));
 const output={outputId:`paper-voyage-${film}`,aspect:'16:9',purpose:film==='story'?'No-footage problem, actual rejected generation, corrected action, Studio assembly and finished voyage. Private founder story and making-of candidate.':'An ordinary idea with no footage becomes a story and a finished film; private founder candidate.',musicAssetId:'score',musicVolume:.25,sequence,audioCues,captionSegments};
 const edit=compileFactoryEdit({jobId:'founder-paper-campaign-20261007',ownerUid:'founder-local',assets,output,urlFor:p.urlFor});edit.intelligence=buildFactoryIntelligence({projectId:edit.projectId,ownerUid:'founder-local',assets,direction});
 await fs.writeFile(path.join(root,`selected-assets-${film}-v${version}.json`),JSON.stringify(assets,null,2));
 await fs.writeFile(path.join(root,`edit-plan-${film}-v${version}.json`),JSON.stringify(output,null,2));
 const r=await p.render({edit,output,attempt:version});const artifact=await p.verifyArtifact(r.artifact);
 await fs.writeFile(path.join(root,`rendered-${film}-v${version}.json`),JSON.stringify({status:'pending_creative_review',artifact,editArtifact:r.editArtifact,documentHash:edit.documentHash},null,2));console.log(JSON.stringify({event:'campaign_rendered',film,version,...artifact}));
}
main().catch(e=>{console.error(e);process.exitCode=1});

// An authored source world enters the real shared Director/Studio edit graph.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {compileFactoryEdit}=require('../../src/services/contentFactoryStudioAdapter');
const studio=require('../../src/generated/studioDirectorReplayKernel.cjs');
const root=path.resolve(process.argv[2]),stage=process.argv[3]||'proxy';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const story=JSON.parse(fs.readFileSync(path.join(root,'story-plan.json')));
const accepted=[];
for(const s of story.scenes){
 const file=`assets/${stage}/${s.id}.mp4`,p=path.join(root,file);
 const probe=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',p],{encoding:'utf8'}));
 const v=probe.streams.find(x=>x.codec_type==='video');
 if(Math.abs(Number(v.duration)-s.duration)>1/24)throw Error(`Source duration failed: ${s.id}`);
 accepted.push({assetId:s.id,type:'video',status:'accepted',artifact:{path:file,sha256:hash(p),duration:s.duration,hasAudio:false,codec:'h264',fps:stage==='proxy'?12:24},
  provenance:{provider:'AutoPromote native Blender source',concept:s.concept,sourceScene:'assets/welcome-world.blend',nativeSceneSha256:hash(path.join(root,'assets/welcome-world.blend')),
   authorSha256:hash(path.join(root,'assets/author_welcome_world.py')),photographicSources:JSON.parse(fs.readFileSync(path.join(root,'assets/photographic-provenance.json'))).assets,programmeStart:s.at,frameStart:s.at*24+1,frameEnd:(s.at+s.duration)*24},
  review:{accepted:true,reviewer:'Codex private founder production',reason:'Native moving source from the locally reviewed continuous scene; byte-bound review is recorded separately.',evidenceSha256:hash(path.join(root,'cpu-story-sheet.jpg'))}});
}
for(const name of ['score','cues']){
 const file=`assets/${name}.wav`;
 accepted.push({assetId:name,type:'audio',audioRole:name==='score'?'music':'sfx',status:'accepted',artifact:{path:file,sha256:hash(path.join(root,file)),duration:38,hasAudio:true},
  provenance:JSON.parse(fs.readFileSync(path.join(root,`assets/${name}-receipt.json`))),review:{accepted:true,reviewer:'Codex private founder production',evidenceSha256:hash(path.join(root,`assets/${name}-receipt.json`)),reason:'Original synchronized stereo stem, measured for non-silence and no clipping.'}});
}
const overlays=[];
for(const s of story.scenes)for(const [text,at,dur] of [[s.line,s.textAt,s.textDuration],[s.secondLine,s.secondAt,s.secondDuration]]){
 if(!text)continue;
 overlays.push({id:`line-${overlays.length+1}`,type:'text',text,x:50,y:s.id==='autopromote'&&at===35?72:90,width:88,height:7,
  startTime:at,start_time:at,duration:dur,fontFamily:'Inter',fontWeight:400,textAlign:'center',color:'#eeeaff',bg:'transparent',
  shadow:'soft',scale:s.id==='impact'?.72:.8,opacity:1,animation:{enter:'fade',exit:'fade',enterDuration:.5,exitDuration:.45}});
}
const output={outputId:'welcome-story',aspect:'16:9',purpose:'One idea becomes structure, motion, experience, impact and AutoPromote in one evolving creative world.',
 musicAssetId:'score',musicVolume:.82,overlays,
 sequence:story.scenes.map(s=>({assetId:s.id,start:0,duration:s.duration,reason:s.transition})),
 audioCues:Array.from({length:4},(_,i)=>({assetId:'cues',kind:'sfx',startTime:i*10,trimStart:i*10,duration:Math.min(10,38-i*10),volume:.8})),captionSegments:[]};
const edit=compileFactoryEdit({jobId:'welcome-cinematic-20261009',ownerUid:'founder-private',assets:accepted,output,urlFor:a=>'http://127.0.0.1:8765/'+a.path});
// The document controls creative decisions; only transport and quality differ.
edit.renderRequest.smart_crop=false;
edit.renderRequest.output_settings={resolution:stage==='proxy'?'360p':'1080p',fps:24,codec:'h264',audioCodec:'aac'};
edit.renderRequest.planned_black_ranges=[{start:0,end:1.8,reason:'Deliberate near-dark opening before the environment wakes.'}];
edit.snapshot.studioDocument=edit.document;
edit.snapshot.projectName=story.title;
edit.snapshot.clipMedia=Object.fromEntries(accepted.filter(a=>a.type==='video').map(a=>[a.assetId,{id:a.assetId,url:'http://127.0.0.1:8765/'+a.artifact.path,name:a.assetId,duration:a.artifact.duration,artifactPath:a.artifact.path,contentHash:a.artifact.sha256,status:'ready',type:'video'}]));
edit.snapshot.projectMedia=Object.values(edit.snapshot.clipMedia);
// The canonical graph retains hash-bound artifact paths. This saved local view
// uses durable loopback media, rather than pretending those files are Firebase
// storage objects that the normal authenticated resolver should refresh.
edit.snapshot.timeline=edit.snapshot.timeline.map(c=>({...c,storagePath:null,artifactPath:c.storagePath,url:edit.snapshot.clipMedia[c.sourceClipId].url}));
if(edit.snapshot.musicTrack){edit.snapshot.musicTrack.artifactPath=edit.snapshot.musicTrack.storagePath;edit.snapshot.musicTrack.storagePath=null;edit.snapshot.musicTrack.sourceStoragePath=null;}
edit.snapshot.soundEffects=edit.snapshot.soundEffects.map(c=>({...c,artifactPath:c.storagePath,storagePath:null,sourceStoragePath:null}));
edit.snapshot.orderedClips=edit.snapshot.timeline.map(c=>({...c,start:c.startRequest,end:c.endRequest,sourceDuration:c.duration}));
edit.snapshot.selectedClipId=edit.snapshot.timeline[0].id;
edit.snapshot.smartCrop=false;
edit.document=studio.adaptStudioSnapshotToDocument({snapshot:edit.snapshot,projectId:edit.projectId,previousDocument:edit.document});
edit.documentHash=require('../../src/services/contentFactoryContract').digest(edit.document);
edit.snapshot.studioDocument=edit.document;
const projected=studio.projectStudioEditableStateToSnapshot(edit.document,edit.snapshot);
if(projected.projectMedia.length!==5||projected.orderedClips.length!==5)throw Error('Canonical local media projection lost sources');
const saved={id:edit.projectId,name:story.title,createdAt:Date.now(),updatedAt:Date.now(),snapshot:edit.snapshot,versions:[]};
studio.validateStudioProjectDocument(edit.document);
const roundtrip=JSON.parse(JSON.stringify(edit));studio.validateStudioProjectDocument(roundtrip.document);
const dir=path.join(root,'outputs',stage);fs.mkdirSync(dir,{recursive:true});
for(const [name,data] of [['project.json',edit],['render-request.json',edit.renderRequest],['studio-saved-project.json',saved],['accepted-assets.json',accepted]])fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2));
console.log(JSON.stringify({stage,duration:38,occurrences:edit.document.occurrences?.length,layers:edit.document.layers.length,documentHash:edit.documentHash,canonicalClock:90000,directorCommands:edit.directorBatch.operations.length}));

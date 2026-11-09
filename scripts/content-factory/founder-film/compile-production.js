#!/usr/bin/env node
// Reviewed raw media becomes the existing Factory/Director/document/render edit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {compileFactoryEdit}=require('../../../src/services/contentFactoryStudioAdapter');
const {buildFactoryIntelligence}=require('../../../src/services/contentFactoryIntelligenceAdapter');
const {validateDirection,digest}=require('../../../src/services/contentFactoryContract');
const root=path.resolve(process.argv[2]);
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const hash=name=>crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex');
const write=(name,value)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2));};
const story=read('storyboard.json'),review=read('asset-review.json');
const brief=fs.readFileSync(path.join(root,'source-brief.txt'),'utf8');
const assets=[];
function add(id,file,type,role,receipt){
  const absolute=path.join(root,file),sha=hash(absolute);
  const selected=review.assets.find(a=>a.assetId===id);
  if(!selected?.accepted || selected.artifactSha256!==sha)throw Error('Missing byte-bound asset review: '+id);
  const info=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',absolute],{encoding:'utf8'}));
  const v=info.streams.find(x=>x.codec_type==='video'),a=info.streams.find(x=>x.codec_type==='audio');
  const artifact={path:file,sha256:sha,duration:Number(v?.duration||info.format.duration),container:type==='audio'?'wav':'mp4',codec:(v||a).codec_name,fps:v?24:undefined,hasAudio:!!a};
  const beatId=id==='vessel'?'magic':id.startsWith('vo-')?id.slice(3):type==='audio'?'cold-open':id;
  assets.push({assetId:id,beatId,type,audioRole:role,status:'accepted',artifact,
    provenance:{model:receipt.model||'Authored AutoPromote source',modelRevision:receipt.modelRevision||receipt.scriptSha256||'production-v3',
      sourceBrief:brief,sourceBriefHash:hash(path.join(root,'source-brief.txt')),settings:receipt.settings||{},generationReceipt:receipt,
      sourceLineage:receipt.sourceHashes||{},tool:receipt.tool||'AutoPromote native source generation',
      nativeScene:receipt.nativeSceneSha256||null,reusableArtifacts:receipt.reusableArtifacts||[],origin:type==='audio'?'authored_or_retained_audio':'authored_3d_with_retained_sources'},
    review:{...selected,reviewer:selected.reviewer,evidenceSha256:hash(path.join(root,'asset-review.json'))}});
}
for(const item of read('asset-catalog.json'))add(item.assetId,item.path,item.type,null,read(item.receipt));
for(const s of story.scenes.filter(x=>x.vo))add('vo-'+s.id,`assets/narration/${s.id}.wav`,'audio','voiceover',read(`assets/narration/${s.id}-receipt.json`));
for(const variant of ['hero','cutdown','teaser'])for(const name of ['score','cues']){
  const suffix=variant==='hero'?'-hero-v4':'-'+variant;
  add(variant==='hero'?name:name+suffix,`assets/sound/${name}${suffix}.wav`,'audio',name==='score'?'music':'sfx',read(variant==='hero'?`assets/sound/${name}-hero-v4-receipt.json`:`assets/sound/${name}${suffix}-receipt.json`));
}
const asset=id=>assets.find(a=>a.assetId===id);
const shot=(assetId,start,duration,reason)=>({assetId,start,duration,reason});
const voice=(id,start)=>({assetId:'vo-'+id,kind:'voiceover',startTime:start,trimStart:0,duration:asset('vo-'+id).artifact.duration,volume:.94});
const cues=(id,duration)=>Array.from({length:Math.ceil(duration/12)},(_,i)=>({assetId:id,kind:'sfx',startTime:i*12,trimStart:i*12,duration:Math.min(12,duration-i*12),volume:.8}));
const hero={outputId:'one-edit-hero',aspect:'16:9',purpose:'An ordinary editing problem grows through setbacks into a creative system; the physical transformation earns the opening image and the created-by reveal.',musicAssetId:'score',musicVolume:.75,
  sequence:story.scenes.map(s=>shot(['magic','cold-open'].includes(s.id)?'vessel':s.id,s.id==='cold-open'?4:0,s.duration,s.purpose)),
  audioCues:[...story.scenes.filter(s=>s.vo).map(s=>voice(s.id,s.at+s.voAt)),...cues('cues',story.duration)],captionSegments:[],
  plannedBlackRanges:[{start:46,end:46.55,reason:'Dedicated ident dark anticipation before the structural lighting reveal.'}]};
const cutdown={outputId:'one-edit-cutdown',aspect:'16:9',purpose:'26.5-second problem, capacity obstacle, breakthrough, connected transformation and self-referential ending.',musicAssetId:'score-cutdown',musicVolume:.68,
  sequence:[shot('origin',0,3,'One small editing problem'),shot('quota',0,3.5,'The capacity obstacle'),shot('breakthrough',0,3.5,'The route opens'),shot('vessel',0,7,'Earn the changed creative ambition'),shot('reveal',0,4.5,'Name who made this'),shot('ident',0,5,'Complete clean brand resolution')],
  audioCues:[voice('cold-open',.15),voice('quota',3.1),voice('breakthrough',6.65),voice('magic',10.3),voice('reveal',17.35),...cues('cues-cutdown',26.5)],captionSegments:[],
  plannedBlackRanges:[{start:21.5,end:22.05,reason:'Complete dedicated ident anticipation.'}]};
const teaser={outputId:'one-edit-teaser',aspect:'16:9',purpose:'10-second transformation event, clear created-by payoff and resolving brand lockup.',musicAssetId:'score-teaser',musicVolume:.65,
  sequence:[shot('vessel',3.5,3,'Transforming world'),shot('reveal',0,4,'Production identity'),shot('ident',2,3,'Resolving ident and readable hold')],
  audioCues:[voice('reveal',3.15),...cues('cues-teaser',10)],captionSegments:[]};
const direction={schemaVersion:1,title:'One Edit',story:{about:'One unsolved editing problem becomes a creative system.',whyCare:'A familiar frustration changes into an unexpected creative possibility.',hook:'Enter a transformed world and withhold its ordinary paper origin.',beginning:'One conversation and two drifting sound signals.',development:'Each fix opens a larger problem.',tension:'Failed renders and zero capacity stop the route.',payoff:'The ordinary paper hull and sail become a full vessel in one coherent world.',ending:'The film names AutoPromote before its layered native identity resolves.',withheld:'The hook’s source and the film’s production identity.',amplify:['Failure silence','The route reopening','Physical transformation','Identity lockup'],remove:['Repeated frames','Warped-video substitutions','Long technical paragraphs','Unrelated effects']},
  script:story.scenes.map(s=>({beatId:s.id,action:s.shot,sound:s.vo||'Rise and impact at the identity lockup.'})),
  assets:assets.map(a=>({assetId:a.assetId,type:a.type,beatId:a.beatId,duration:a.artifact.duration,prompt:a.review.reason,reason:a.review.reason,provider:'reuse',libraryRef:a.assetId,acceptanceCriteria:[a.review.reason.slice(0,490)],seed:20261008})),outputs:[hero,cutdown,teaser]};
validateDirection(direction);
for(const a of assets)a.provenance.directionHash=digest(direction);
for(const output of direction.outputs){
  const length=output.sequence.reduce((n,s)=>n+s.duration,0);
  const vo=output.audioCues.filter(a=>a.kind==='voiceover').sort((a,b)=>a.startTime-b.startTime);
  for(let i=0;i<vo.length;i++){
    if(vo[i].startTime+vo[i].duration>length+1/24)throw Error('Narration would be truncated');
    if(i && vo[i-1].startTime+vo[i-1].duration>vo[i].startTime+1/24)throw Error('Narration would overlap');
  }
  const edit=compileFactoryEdit({jobId:'founder-film-production-v3-20261008',ownerUid:'founder-private',assets,output,urlFor:a=>'http://127.0.0.1:8765/'+a.path.split('/').map(encodeURIComponent).join('/')});
  if(output.plannedBlackRanges)edit.renderRequest.planned_black_ranges=output.plannedBlackRanges;
  edit.intelligence=buildFactoryIntelligence({projectId:edit.projectId,ownerUid:'founder-private',assets,direction});
  write(`outputs/${output.outputId}/project.json`,edit);write(`outputs/${output.outputId}/render-request.json`,edit.renderRequest);write(`outputs/${output.outputId}/edit-plan.json`,output);
  console.log(JSON.stringify({output:output.outputId,duration:length,documentHash:edit.documentHash,directorOperations:edit.directorBatch.operations.length}));
}
write('accepted-asset-library.json',assets);write('factory-direction.json',direction);

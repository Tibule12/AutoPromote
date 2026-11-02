#!/usr/bin/env node
// Author a native project. This script never renders or opens a cloud session.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const k=require("../../src/generated/studioDirectorReplayKernel.cjs");
const {createCinematicParameters,PODCAST_PRESET}=require("../../frontend/src/components/threeD/cinematicContract");
const root=path.resolve(__dirname,"../.."),report=path.join(root,"reports/unmuted-cinematic-revision-20261031");
const source="/home/tibule12/Videos/cam-combiner-60sec.mp4";
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const provenance=JSON.parse(fs.readFileSync(path.join(report,"private-local/source/source-provenance.json")));
const hash=sha(source);if(hash!==provenance.sourceSha256)throw Error("Original source changed");
const speech=provenance.assets["selected-original.mp4"];
const id="unmuted-cinematic-revision-20261031",sourceId="unmuted-original";
const duration=391/24;
const baseline=JSON.parse(fs.readFileSync(process.argv[2])).snapshot;
const scenes=[{start:0,frames:195,offset:0,focal:36,headline:"WE ARE BACK.",words:"DEEP. RAW. AUTHENTIC.",cues:[5.26,6.10,6.36]},
  {start:195/24,frames:196,offset:195/24,focal:42,headline:"UNTOLD STORIES",words:"LAYER BY LAYER. TRUTH BY TRUTH.",cues:[5.7967,7.2367,7.5]}].map((shot,i)=>{
  const file=path.join(report,`private-local/source/presenter-alpha-${i?'b':'a'}-refined.mov`);
  if(!fs.existsSync(file))throw Error("Prepare both source-bound alpha shots before authoring the full project");
  const alpha={sha256:sha(file)};
  const cinematic=createCinematicParameters(alpha.sha256,speech.sha256,PODCAST_PRESET);
  cinematic.sources.presenterOffset=0;cinematic.sources.evidenceOffset=shot.offset;
  cinematic.camera={focalLength:shot.focal,pushIn:1,screenYaw:-8};
  cinematic.content.headline=shot.headline;cinematic.content.tagline=shot.words;
  cinematic.timing={...cinematic.timing,wordA:shot.cues[0]/(shot.frames/24),wordB:shot.cues[1]/(shot.frames/24),wordC:shot.cues[2]/(shot.frames/24)};
  return {version:1,id:`podcast-set-${i+1}`,sceneType:"cinematic_evidence",template:PODCAST_PRESET,
    name:`Podcast set · shot ${i+1}`,text:shot.headline,startTime:shot.start,duration:shot.frames/24,endTime:shot.start+shot.frames/24,
    enabled:true,layerOrder:50,keyframes:[],cinematic};
});
const cues=[
  ["return","cinematic_hit",0,.9,.13], ["space","airy_whoosh",1.05,.65,.08],
  ["camera","riser",2.1,1.6,.035], ["deep","bass_punch",5.26,.42,.09],
  ["raw","click",6.1,.14,.07], ["authentic","chime",6.36,.75,.055],
  ["angle","airy_whoosh",7.95,.65,.07], ["story","subdrop",13.02,1.4,.06],
  ["layers","click",13.92,.15,.05], ["truth","cinematic_hit",15.36,.85,.075],
].map(([id,tone,startTime,duration,volume])=>({id:`podcast-${id}`,name:id,kind:"sfx",builtIn:true,tone,startTime,duration,volume,fadeIn:.015,fadeOut:.15,enabled:true}));
const firstRendered=path.join(report,"private-local/project-podcast-set-1-rendered.json");
if(fs.existsSync(firstRendered)){
 const prior=JSON.parse(fs.readFileSync(firstRendered)).snapshot.threeDScenes.find(s=>s.id===scenes[0].id);
 if(JSON.stringify(k.buildCinematicGraph(prior))!==JSON.stringify(k.buildCinematicGraph(scenes[0])))throw Error("First shot changed; cannot reuse its rendered scene");
 scenes[0]=prior;
}
const snapshot={...structuredClone(baseline),orderedClips:[{id:sourceId,name:"UNMUTED · original podcast",start:0,end:60,duration:60,contentHash:hash,url:`/api/cinematic/assets/${hash}/media`}],
  selectedClipId:sourceId,timeline:provenance.cuts.map(([start,end],i)=>({id:`podcast-dialogue-${i}`,sourceClipId:sourceId,name:i?"Deep, raw, authentic · untold stories":"We are back",
    startRequest:start,endRequest:end,duration:60,contentHash:hash,url:`/api/cinematic/assets/${hash}/media`})),
  captionSegments:[],autoCaptions:false,overlays:[],motionScenes:[],threeDScenes:scenes,subjectVfxScenes:[],
  soundEffects:cues,motionKeyframes:[],finishKeyframes:[],speedKeyframes:[],voiceovers:[],adjustmentLayers:[],
  audioKeyframes:{},trackStates:{},previewSpeed:1,projectMedia:[],angleGroups:[],compoundClips:[],
  compositionOrder:scenes.map(s=>s.id),mainTransform:{id:"main-video",type:"video",name:"Main video",x:50,y:50,scale:1,rotation:0,opacity:1,cropX:0,cropY:0},
  reframeAspect:"16:9",smartCrop:false,smartCropMode:"off",speakerTrackZoom:1,reframeKeyframes:[],speakerFocusCuts:[],reframeModeCuts:[],
  mainFrame:{...baseline.mainFrame,enabled:false},finishFx:{},creativeEffectsEnabled:false,addHook:false,addMusic:false,musicTrack:null,
  audioRemix:{...baseline.audioRemix,enabled:false},muteOriginalAudio:false,joinTransition:"cut",extractedAudio:null,
  exportSettings:{...baseline.exportSettings,resolution:"720p",fps:"24",audioBitrate:"192"},studioDocument:undefined};
snapshot.studioDocument=k.adaptStudioSnapshotToDocument({projectId:id,snapshot});
const project={id,name:"UNMUTED · Cinematic set revision",createdAt:Date.now(),updatedAt:Date.now(),snapshot};
fs.writeFileSync(path.join(report,"private-local/project-before-renders.json"),JSON.stringify(project,null,2));
fs.writeFileSync(path.join(report,"edit-plan.json"),JSON.stringify({id,duration,frames:391,sourceSha256:hash,cuts:provenance.cuts,
  background:"Native 3D architectural set with source-bound prepared alpha presenter",scenes,soundEffects:cues,
  sourceMatte:"Private local CPU preprocessing; editable imported alpha video, not a claim of native automatic matting"},null,2));
console.log("Authored native Studio revision",duration,"seconds",scenes.length,"3D scenes",cues.length,"sound cues");

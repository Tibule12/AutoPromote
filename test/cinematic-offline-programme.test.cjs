const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {compileOfflineProgramme}=require("../src/cinematic/offlineProgramme.cjs");
const k=require("../src/generated/studioDirectorReplayKernel.cjs");
test("offline transport compiles canonical portrait framing, source captions and a real L-cut without client URLs",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"offline-studio-contract-")),file=path.join(dir,"source");fs.writeFileSync(file,"unit source identity");
 const hash=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
 const snapshot={selectedClipId:"source",orderedClips:[{id:"source",start:0,end:10}],
  timeline:[{id:"intro",sourceClipId:"source",contentHash:hash,url:"https://untrusted.invalid",startRequest:1,endRequest:3},
    {id:"reaction",sourceClipId:"source",contentHash:hash,url:"https://untrusted.invalid",startRequest:8,endRequest:9,
     audioDetached:true,audioSourceStart:3,audioSourceEnd:4,audioProgrammeStart:2}],
  reframeAspect:"9:16",smartCrop:true,smartCropMode:"speaker_track",previewSpeed:1,
  reframeKeyframes:[{time:0,x:26,y:50},{time:2,x:77,y:50,cut:true}],autoCaptions:true,captionStyle:"minimal",captionScale:1.5,captionPosition:"bottom_center",
  captionSegments:[{id:"spoken",sourceClipId:"source",start:1,end:2,text:"We are back.",textReviewed:true}],
  overlays:[{id:"headline",type:"text",text:"UNMUTED",x:20,y:7,startTime:0,duration:3}],motionScenes:[],threeDScenes:[],trackStates:{},exportSettings:{fps:"30"}};
 const doc=k.adaptStudioSnapshotToDocument({snapshot,projectId:"local-offline-test"});
 const assets=new Map([[hash,{id:hash,path:file,duration:10}]]);
 try{
  const result=compileOfflineProgramme(doc,assets);assert.equal(result.payload.video_url,`local:${hash}`);
  assert.equal(result.payload.timeline_segments[1].audioSourceStart,3);
  assert.equal(result.payload.timeline_segments[1].audioProgrammeStart,2);
  assert.equal(result.payload.caption_segments[0].start_time,0);
  assert.equal(result.payload.caption_segments[0].text,"We are back.");
  assert.equal(result.payload.finish_plan.reframe.keyframes[1].x,77);
  assert.equal(result.payload.output_settings.resolution,"720p");
  assert(!JSON.stringify(result.payload).includes("untrusted.invalid"));
  fs.writeFileSync(file,"changed source");assert.throws(()=>compileOfflineProgramme(doc,assets),/original source/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("offline production boundary rejects media absent from the verified local catalogue",()=>{
 const base={orderedClips:[{id:"source",start:0,end:10}],selectedClipId:"source",timeline:[{id:"main",sourceClipId:"source",contentHash:"a".repeat(64),startRequest:0,endRequest:5}],
  overlays:[],motionScenes:[],threeDScenes:[],reframeAspect:"16:9",smartCropMode:"off",previewSpeed:1};
 const doc=k.adaptStudioSnapshotToDocument({snapshot:base,projectId:"unbound"});
 assert.throws(()=>compileOfflineProgramme(doc,new Map()),/original source/);
});

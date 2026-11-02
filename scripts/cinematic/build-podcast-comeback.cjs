#!/usr/bin/env node
// Author the edit through the same canonical adapters/compiler used by Studio.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const k = require("../../src/generated/studioDirectorReplayKernel.cjs");
const ROOT = path.resolve(__dirname, "../.."), report = path.join(ROOT, "reports/unmuted-comeback-20261031");
const source = "/home/tibule12/Videos/cam-combiner-60sec.mp4";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sourceHash = sha(fs.readFileSync(source));
const sourceUrl = `/api/cinematic/assets/${sourceHash}/media`;
const sourceId = "unmuted-podcast-source";
// Source-frame accurate cuts: return announcement, show promise, guest welcome.
const ranges = [[373/30, 400/30], [588/30, 1120/30], [1209/30, 1459/30], [1485/30,1500/30]];
const total = ranges.reduce((sum, [a,b]) => sum+b-a, 0);
const transcript = JSON.parse(fs.readFileSync(path.join(report, "private-local/source-transcript.json")));
const allWords = transcript.segments.flatMap(segment => segment.words);
const captions = [];
for (let cut = 0; cut < ranges.length; cut++) {
  if (cut === 3) continue; // Guest reaction uses the host's final half-second as an L-cut.
  const [start,end] = ranges[cut]; let group = [];
  const flush = () => {
    if (!group.length) return;
    const text = group.map(word => word.word).join(" ");
    captions.push({ id: `podcast-caption-${captions.length+1}`, sourceClipId: sourceId,
      start: Math.max(start, group[0].start), end: Math.min(end, group.at(-1).end + .12),
      text, language: "en", reviewRequired: false, textReviewRequired: false,
      textReviewed: true, speaker: "host", captionIcon:"none",captionAccent:"#ffffff",captionPlacement:"bottom_center" });
    group = [];
  };
  for (const word of allWords.filter(word => word.start >= start-.02 && word.end <= end+.02)) {
    const proposed = [...group, word].map(item => item.word).join(" ");
    if (group.length && (proposed.length > 25 || group.length >= 4)) flush();
    group.push(word);
    if (/[.?!]$/.test(word.word)) flush();
  }
  flush();
}

async function main() {
  const base = "http://127.0.0.1:6341";
  const assets = await (await fetch(base+"/api/cinematic/assets")).json();
  if (!assets.assets.some(item => item.id === sourceHash)) {
    const response = await fetch(base+"/api/cinematic/assets", { method: "POST", headers: { Origin: base,
      "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(path.basename(source)) }, body: fs.readFileSync(source) });
    if (!response.ok) throw new Error(JSON.stringify(await response.json()));
  }
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT,"reports/cinematic-evidence-20261031/review/programme-editable-project.json"))).snapshot;
  const title = (id,text,startTime,duration,x,y,scale) => ({ id, type:"text", text, startTime,duration,
    x,y,width:90,scale,rotation:0,opacity:1,fontFamily:"Inter",fontWeight:800,color:"#ffffff",bg:"transparent",shadow:"soft",
    strokeWidth:0,anchorX:50,anchorY:50,animation:{enter:"slideUp",exit:"fade",enterDuration:.22,exitDuration:.18} });
  for (const format of ["portrait", "landscape"]) {
    const portrait = format === "portrait";
    const snapshot = { ...structuredClone(baseline),
      orderedClips:[{ id:sourceId, name:"Unmuted Podcast · source", start:0,end:60,duration:60,url:sourceUrl,contentHash:sourceHash }],
      selectedClipId:sourceId,projectMedia:[],angleGroups:[],activeAngleGroupId:null,
      timeline:ranges.map(([start,end],index)=>({id:`unmuted-cut-${index+1}`,sourceClipId:sourceId,name:["We are back","The conversation","Guest welcome","Guest reaction · L-cut"][index],
        contentHash:sourceHash,url:sourceUrl,duration:60,startRequest:start,endRequest:end,
        ...(index===3?{audioDetached:true,audioSourceStart:1459/30,audioSourceEnd:1474/30,audioProgrammeStart:809/30}: {})})),
      activeTimelineIndex:0,captionSegments:captions,autoCaptions:true,captionStyle:"minimal",captionPosition:"bottom_center",
      captionScale:portrait?1.85:1.15,captionCoverageMode:"selected",captionTextOverride:"",translateCaptionsToEnglish:false,
      overlays:[title("return-headline","WE ARE BACK.",0,1.55,50,portrait?16:16,portrait?.9:1.15),
        title("show-identity","UNMUTED",1.2,total-1.2,50,7,portrait?.5:.6),
        title("conversation-promise","DEEP. RAW. AUTHENTIC.",4.55,2.15,50,portrait?17:17,portrait?.6:.8),
        title("guest-welcome","WELCOME TO THE STUDIO",24.25,total-24.25,50,portrait?17:17,portrait?.55:.78)],
      motionScenes:[],threeDScenes:[],subjectVfxScenes:[],voiceovers:[],soundEffects:[],adjustmentLayers:[],
      motionKeyframes:[],finishKeyframes:[],speedKeyframes:[],previewSpeed:1,compoundClips:[],compositionOrder:["return-headline","show-identity","conversation-promise","guest-welcome"],
      reframeAspect:portrait?"9:16":"16:9",smartCrop:portrait,smartCropMode:portrait?"speaker_track":"off",speakerTrackZoom:1,
      reframeKeyframes:portrait?[{id:"host-frame",time:0,x:26,y:50,cut:true},{id:"guest-frame",time:809/30,x:77,y:50,cut:true}]:[],
      reframeModeCuts:[],speakerFocusCuts:[],addHook:false,addMusic:false,musicTrack:null,extractedAudio:null,
      audioKeyframes:{},muteOriginalAudio:false,audioRemix:{...baseline.audioRemix,enabled:false},
      audioRestoration:{...baseline.audioRestoration,enabled:true,denoise:8,deEsser:12,compressor:25,loudness:-16,limiter:-1},
      mainFrame:{...baseline.mainFrame,enabled:false},finishFx:{...baseline.finishFx,fadeIn:0,fadeOut:0},
      joinTransition:"cut",creativeEffectsEnabled:false,creatorPreview:{...baseline.creatorPreview,activeDemo:""},
      exportSettings:{...baseline.exportSettings,resolution:"720p",fps:"30",audioBitrate:"192",quality:"high"},
      analysisRefs:[],studioDocument:undefined,mainTransform:{id:"main-video",type:"video",name:"Main video",x:50,y:50,scale:1,rotation:0,opacity:1,cropX:0,cropY:0},
    };
    const id=`unmuted-comeback-${format}-20261031`;
    snapshot.studioDocument=k.adaptStudioSnapshotToDocument({projectId:id,snapshot});
    const project={id,name:`Unmuted · We're Back · ${portrait?"Portrait":"Landscape"}`,createdAt:Date.now(),updatedAt:Date.now(),snapshot};
    const timeline=k.compileStudioTimelineForRender(snapshot.studioDocument).map(cut=>({...cut,url:sourceUrl}));
    const finish={version:1,enabled:true,...k.compileStudioFinishForRender(snapshot.studioDocument),
      reframe:{enabled:portrait,aspect:snapshot.reframeAspect,mode:snapshot.smartCropMode,zoom:1,keyframes:snapshot.reframeKeyframes}};
    const payload=k.buildViralRenderData({finalVideoUrl:sourceUrl,selectedClip:{start:0,end:total},
      overlays:k.compileStudioOverlaysForRender(snapshot.studioDocument,snapshot),extraOptions:{
        timelineSegments:timeline,autoCaptions:true,captionStyle:snapshot.captionStyle,captionPosition:snapshot.captionPosition,
        captionScale:snapshot.captionScale,captionCoverageMode:"selected",
        captionSegments:k.mapCaptionSegmentsToTimeline({captionSegments:captions,timelineSegments:timeline,fallbackSourceClipId:sourceId}),
        finishPlan:finish,compositionPlan:k.compileStudioCompositionForRender(snapshot.studioDocument),
        audioRestoration:snapshot.audioRestoration,smartCrop:portrait,smartCropMode:snapshot.smartCropMode,
        outputSettings:snapshot.exportSettings,professionalCleanup:false,brandWatermark:false,
      }});
    payload.local_source_sha256=sourceHash;
    fs.writeFileSync(path.join(report,`private-local/${format}-project.json`),JSON.stringify(project,null,2));
    fs.writeFileSync(path.join(report,`private-local/${format}-render-request.json`),JSON.stringify(payload,null,2));
  }
  fs.writeFileSync(path.join(report,"edit-plan.json"),JSON.stringify({source:path.basename(source),sourceHash,ranges,duration:total,fps:30,frames:824,
    story:["Return announcement","Deep, raw, authentic conversations","Guest welcome"],captionLines:captions.length,
    identity:"Unmuted Podcast, preserved from source",names:"Uncertain personal/show-segment names excluded",speechSource:"Original recording only"},null,2));
  console.log("Authored actual canonical Studio projects",total,"seconds",captions.length,"caption lines");
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

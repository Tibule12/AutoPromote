// Resolve catalogue media, then compile the ordinary production worker payload.
const fs = require("node:fs");
const crypto = require("node:crypto");
const k = require("../generated/studioDirectorReplayKernel.cjs");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function compileOfflineProgramme(document, assets) {
  k.validateStudioProjectDocument(document);
  if (!["editableStateVersion","visualStateVersion","editStateVersion"].every(key=>document.compatibility?.[key]===1)) throw Error("Save the current Studio project before export");
  const transport={timeline:document.clipOccurrences.map(item=>({id:item.occurrenceId}))};
  const s=k.projectStudioEditableStateToSnapshot(document,transport);
  const cuts=k.compileStudioTimelineForRender(document);
  const duration=cuts.reduce((sum,cut)=>sum+cut.duration,0);
  const hashes=new Set(document.assets.map(asset=>asset.contentHash));
  if(hashes.size!==1 || cuts.length>16 || !cuts.length || duration>60) throw Error("Offline production export supports one verified source, up to sixteen cuts and sixty seconds");
  const hash=[...hashes][0],source=assets.get(hash);
  if(!source || sha(fs.readFileSync(source.path))!==hash) throw Error("Import the original source into this local catalogue");
  if(cuts.some(cut=>cut.end_time>source.duration+.001)) throw Error("A selected cut exceeds its source");
  if(s.threeDScenes?.some(scene=>scene.enabled!==false)||s.subjectVfxScenes?.length||s.addMusic||s.musicTrack||s.voiceovers?.length||s.soundEffects?.length||s.extractedAudio)
    throw Error("Offline production export currently supports source speech, native graphics, captions and framing");
  if(s.previewSpeed!==1||s.speedKeyframes?.length||s.addHook||s.silenceRemoval||s.creativeEffectsEnabled||s.removeWatermark||s.enhanceQuality||s.stabilization?.enabled||s.audioRemix?.enabled||s.adjustmentLayers?.length)
    throw Error("Disable unsupported generated/source processing before offline export");
  if(!["16:9","9:16"].includes(s.reframeAspect)||!["off","speaker_track"].includes(s.smartCropMode)) throw Error("Choose landscape or a reviewed solo portrait frame");
  if((s.reframeModeCuts||[]).length||(s.speakerFocusCuts||[]).length) throw Error("Use reviewed framing marks for offline export");
  if((s.overlays||[]).length>32||s.overlays.some(layer=>layer.type!=="text"||layer.bRollMode||layer.isRainbow)) throw Error("Offline export accepts native ordinary text layers");
  if(s.captionSegments?.some(line=>line.reviewRequired||line.textReviewRequired&&!line.textReviewed)) throw Error("Review flagged caption wording before export");
  const url=`local:${hash}`;
  const timeline=cuts.map(cut=>({...cut,url}));
  const payload=k.buildViralRenderData({finalVideoUrl:url,selectedClip:{start:0,end:duration},overlays:k.compileStudioOverlaysForRender(document,transport),extraOptions:{
    timelineSegments:timeline,autoCaptions:s.autoCaptions,captionStyle:s.captionStyle,captionPosition:s.captionPosition,captionScale:s.captionScale,
    captionCoverageMode:s.captionCoverageMode,captionSegments:k.mapCaptionSegmentsToTimeline({captionSegments:s.captionSegments,timelineSegments:timeline}),
    compositionPlan:k.compileStudioCompositionForRender(document),finishPlan:{version:1,enabled:true,...k.compileStudioFinishForRender(document),
      reframe:{enabled:s.smartCrop,aspect:s.reframeAspect,mode:s.smartCropMode,zoom:s.speakerTrackZoom||1,keyframes:s.reframeKeyframes||[]}},
    audioRestoration:s.audioRestoration,audioTrackStates:s.trackStates,audioAutomation:{keyframes:s.audioKeyframes},
    smartCrop:s.smartCrop,smartCropMode:s.smartCropMode,muteAudio:s.muteOriginalAudio,
    outputSettings:{...s.exportSettings,resolution:"720p"},professionalCleanup:false,brandWatermark:false,
    motionGraphics:{version:1,scenes:s.motionScenes||[]},
  }});
  payload.local_source_sha256=hash;
  return {payload,source,documentHash:sha(JSON.stringify(document))};
}
module.exports={compileOfflineProgramme};

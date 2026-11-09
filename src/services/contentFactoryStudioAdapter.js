const studio = require("../generated/studioDirectorReplayKernel.cjs");
const { error, digest } = require("./contentFactoryContract");
const { validateScenePerformanceReview } = require('./contentFactoryScenePerformance');

function compileFactoryEdit({ jobId, ownerUid, assets, output, urlFor }) {
  const accepted = new Map(assets.filter(a => a.status === "accepted").map(a => [a.assetId, a]));
  const music = output.musicAssetId ? accepted.get(output.musicAssetId) : [...accepted.values()].find(a=>a.type==="audio" && a.audioRole==="music");
  if(output.musicAssetId && (!music || music.type!=="audio" || music.audioRole!=="music" || !music.review?.accepted)) throw error("CONTENT_FACTORY_UNREVIEWED_AUDIO",409);
  const soundEffects = (output.audioCues || []).map((cue,i)=>{
    const asset=accepted.get(cue.assetId);
    if(!asset || asset.type!=="audio" || !asset.review?.accepted || (cue.trimStart || 0)+cue.duration>asset.artifact.duration+1/24)
      throw error("CONTENT_FACTORY_UNREVIEWED_AUDIO",409);
    return {id:`${output.outputId}-audio-${i+1}`,name:cue.assetId,kind:cue.kind,url:urlFor(asset.artifact),
      sourceClipId:asset.assetId,storagePath:asset.artifact.path,contentHash:asset.artifact.sha256,
      startTime:cue.startTime,duration:cue.duration,trimStart:cue.trimStart || 0,volume:cue.volume,fadeIn:.02,fadeOut:.05,enabled:true};
  });
  const timeline = output.sequence.map((shot, index) => {
    const asset = accepted.get(shot.assetId);
    if (!asset || !asset.artifact?.sha256 || !asset.review?.accepted ||
        shot.start + shot.duration > asset.artifact.duration + 1 / 24) throw error("CONTENT_FACTORY_UNREVIEWED_SOURCE", 409);
    validateScenePerformanceReview({ scene: asset.provenance?.creativeScene, artifact: asset.artifact, review: asset.review });
    return { id: `${output.outputId}-${index + 1}`, sourceClipId: asset.assetId,
      startRequest: shot.start, endRequest: shot.start + shot.duration, duration: shot.duration,
      contentHash: asset.artifact.sha256, storagePath: asset.artifact.path, name: asset.assetId };
  });
  const keepIdentAudio=output.sequence.some(shot=>['brand_ident','scene_mix'].includes(accepted.get(shot.assetId).audioRole) && accepted.get(shot.assetId).artifact.hasAudio);
  const projectMedia = [...new Set(output.sequence.map(shot => shot.assetId))].map(id => {
    const asset = accepted.get(id);
    return { id, name: id, type: 'video', status: 'ready', url: urlFor(asset.artifact),
      duration: asset.artifact.duration, width: asset.artifact.width, height: asset.artifact.height,
      contentHash: asset.artifact.sha256, artifactPath: asset.artifact.path,
      storagePath: asset.artifact.storagePath || null,
      generationProvenance: structuredClone({ ...asset.provenance, review: asset.review }) };
  });
  const snapshot = { timeline, projectMedia, orderedClips: [], selectedClipId: null, reframeAspect: output.aspect,
    exportSettings: { resolution: "1080p", fps: 24, codec: "h264", audioCodec: "aac" },
    overlays: output.overlays || [], motionScenes: output.motionScenes || [],
    captionSegments: output.captionSegments || [], autoCaptions: !!output.captionSegments?.length,
    soundEffects, speedKeyframes: [], trackStates: {},
    muteOriginalAudio: !keepIdentAudio, musicDucking: false, musicDuckingStrength: 0,
    addMusic: !!music, musicVolume: output.musicVolume ?? 0.85,
    musicLoop: false, musicFadeIn: .25, musicFadeOut: .6,
    musicTrack: music ? { id: music.assetId, url: urlFor(music.artifact), duration: music.artifact.duration,
      storagePath: music.artifact.path, contentHash: music.artifact.sha256 } : null };
  const projectId = `factory:${jobId}:${output.outputId}`;
  // Director receives full accepted takes, then executes released trim_clip
  // operations through the same command kernel as the customer editor. Motion
  // and audio are attached after editorial timing is established.
  const rawSnapshot = { ...snapshot, overlays: [], motionScenes: [], soundEffects: [],
    timeline: timeline.map(clip => ({ ...clip, startRequest: 0,
      endRequest: accepted.get(clip.sourceClipId).artifact.duration,
      duration: accepted.get(clip.sourceClipId).artifact.duration })) };
  const rawDocument = studio.adaptStudioSnapshotToDocument({ snapshot: rawSnapshot, projectId });
  const directorBatch = { projectId, baseRevision: rawDocument.revision,
    idempotencyKey: `factory-edit-${jobId.slice(0,24)}-${output.outputId}`,
    actor: { type: "ai", id: "content_factory_director" },
    operations: timeline.map(clip => ({ type: "trim_clip", target: { occurrenceId: clip.id },
      keep: { space: "source", startTick: Math.round(clip.startRequest * 90000), endTick: Math.round(clip.endRequest * 90000) } })) };
  const directorPreview = studio.dryRunStudioCommandBatch(rawDocument, directorBatch);
  const document = studio.adaptStudioSnapshotToDocument({ snapshot, projectId, previousDocument: directorPreview.previewDocument });
  studio.validateStudioProjectDocument(document);
  const editable = studio.projectStudioEditableStateToSnapshot(document, snapshot);
  const segments = studio.compileStudioTimelineForRender(document).map(segment => ({
    ...segment, url: urlFor(accepted.get(segment.source_clip_id).artifact),
  }));
  studio.assertStudioExportTimelineMatchesDocument(document, segments);
  const request = studio.buildViralRenderData({ finalVideoUrl: segments[0].url,
    selectedClip: { start: 0, end: segments.reduce((s, v) => s + v.duration, 0) },
    overlays: editable.overlays, extraOptions: {
      timelineSegments: segments, autoCaptions: !!output.captionSegments?.length, captionSegments: output.captionSegments || [],
      captionStyle: output.captionStyle || "minimal", captionPosition: "bottom", captionScale: output.captionScale ?? .72, brandWatermark: false, muteAudio: !keepIdentAudio,
      outputSettings: snapshot.exportSettings, creativeIntent: output.purpose,
      smartCrop: true, smartCropMode: "safe_fit",
      finishPlan: { version: 1, enabled: true, reframe: { enabled: true, aspect: output.aspect, mode: "off" } },
      motionGraphics: { version: 1, scenes: editable.motionScenes }, soundEffects: editable.soundEffects,
      ...(music ? { addMusic: editable.addMusic, musicUrl: editable.musicTrack.url, musicName: editable.musicTrack.id,
        musicVolume: editable.musicVolume, musicLoop: editable.musicLoop, musicDucking: editable.musicDucking,
        musicFadeIn: editable.musicFadeIn, musicFadeOut: editable.musicFadeOut } : {}),
    } });
  return { projectId, ownerUid, document, snapshot, directorBatch, directorPreview,
    renderRequest: request, documentHash: digest(document),
    sourceEvidence: [...new Set([...output.sequence.map(s => s.assetId), ...(output.audioCues || []).map(c=>c.assetId), ...(music ? [music.assetId] : [])])].map(id => ({
      assetId: id, contentHash: accepted.get(id).artifact.sha256, provenanceHash: digest(accepted.get(id).provenance),
      reviewEvidenceHash: accepted.get(id).review.evidenceSha256,
    })) };
}
module.exports = { compileFactoryEdit };

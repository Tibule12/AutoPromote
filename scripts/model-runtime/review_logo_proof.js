#!/usr/bin/env node
// Canonical source trims reject the bad lettering entrance in the retained take.
// The saved take's original implementation/provenance is never rewritten.
const fs = require('fs/promises'), path = require('path');
const { root, projectId } = require('./proof');
const { hash, stable } = require('../../src/modelRuntime/contract');
const { immutableJson } = require('../../src/modelRuntime/stores');
const studio = require('../../src/generated/studioDirectorReplayKernel.cjs');

async function main() {
  const target = path.join(root, 'logo-ident');
  const prior = JSON.parse(await fs.readFile(path.join(target, 'canonical-project-with-logo.json')));
  let previousDocument = prior.document;
  try {
    previousDocument = JSON.parse(await fs.readFile(path.join(target, 'canonical-project-reviewed.json'))).document;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const native = prior.snapshot.timeline.at(-1);
  const logo = [
    { ...native, id: 'native-ident-intro', startRequest: 0, endRequest: 2.25, duration: 2.25 },
    { ...native, id: 'native-ident-lockup', startRequest: 4, endRequest: 6, duration: 2 },
  ];
  const snapshot = { ...prior.snapshot,
    exportSettings: { resolution: '720p', fps: 24, codec: 'h264', audioCodec: 'aac', audioBitrate: '256' },
    timeline: [...prior.snapshot.timeline.slice(0, -1), ...logo] };
  snapshot.orderedClips = snapshot.timeline.map(clip => {
    const source = snapshot.projectMedia.find(m => m.id === clip.sourceClipId);
    return { ...clip, url: source.url, start: clip.startRequest, end: clip.endRequest, sourceDuration: source.duration };
  });
  const document = studio.adaptStudioSnapshotToDocument({ snapshot, projectId, previousDocument });
  studio.validateStudioProjectDocument(document);
  const editable = studio.projectStudioEditableStateToSnapshot(document, snapshot);
  editable.studioDocument = document;
  editable.studioDocumentHash = hash(document);
  const sourcePaths = { 'proof-source': 'media/source.mp4', [native.sourceClipId]: 'logo-ident/native/preview.mp4' };
  const segments = studio.compileStudioTimelineForRender(document).map(segment => ({ ...segment,
    url: 'http://127.0.0.1:8765/' + (sourcePaths[segment.source_clip_id] || 'outputs/generate_video/generated_shot.mp4') }));
  studio.assertStudioExportTimelineMatchesDocument(document, segments);
  const cues = [
    { id: 'ident-rise', builtIn: true, tone: 'riser', startTime: .2, duration: 1.9, volume: .12, fadeIn: .2, fadeOut: .2 },
    { id: 'ident-lock', builtIn: true, tone: 'impact', startTime: 2.25, duration: .65, volume: .23, fadeIn: .015, fadeOut: .25 },
    { id: 'ident-wordmark', builtIn: true, tone: 'chime', startTime: 2.65, duration: 1.4, volume: .07, fadeIn: .015, fadeOut: .4 },
  ];
  const options = { autoCaptions: false, muteAudio: false,
    outputSettings: { resolution: '720p', fps: 24, codec: 'h264', audioCodec: 'aac', audioBitrate: '256' },
    brandWatermark: false, smartCrop: true, smartCropMode: 'safe_fit',
    finishPlan: { version: 1, enabled: true, reframe: { enabled: true, aspect: '16:9', mode: 'off' } } };
  const logoRequest = studio.buildViralRenderData({ finalVideoUrl: segments[2].url,
    selectedClip: { start: 0, end: 4.25 }, overlays: [],
    extraOptions: { ...options, timelineSegments: segments.slice(2), soundEffects: cues } });
  const combined = studio.buildViralRenderData({ finalVideoUrl: segments[0].url,
    selectedClip: { start: 0, end: 11.791666666666667 }, overlays: editable.overlays,
    extraOptions: { ...options, timelineSegments: segments,
      soundEffects: cues.map(cue => ({ ...cue, startTime: cue.startTime + 7.541666666666667 })) } });
  combined.subjectVfx = [JSON.parse(await fs.readFile(path.join(root, 'derived/resolved-subject.private.json')))];
  await fs.writeFile(path.join(target, 'logo-reviewed-render-request.json'), JSON.stringify(logoRequest, null, 2));
  await fs.writeFile(path.join(target, 'combined-reviewed-render-request.private.json'), JSON.stringify(combined, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(target, 'canonical-project-reviewed.json'), stable({ document, snapshot: editable,
    documentHash: hash(document), retainedModelEvidence: prior.retainedModelEvidence, nativeArtifact: prior.nativeArtifact }));
  const review = { schemaVersion: 1, parentArtifactHash: prior.nativeArtifact, reviewedAt: new Date().toISOString(),
    reviewKind: 'decoded_native_picture_inspection', reviewer: 'coding_agent', founderCreativeApproval: false,
    acceptedSourceRanges: [{ startTick: 0, endTick: 202500 }, { startTick: 360000, endTick: 540000 }],
    rejectedSourceRange: { startTick: 202500, endTick: 360000 },
    reason: 'The wordmark entrance stretched the glyphs vertically. Exclude it and cut to the readable lockup.',
    futureImplementationFix: 'Uniform glyph scale in studio_3d_renderer/brand_ident.py; the retained take was not silently relabelled as this corrected implementation.',
    programmeDuration: 4.25, projectRevision: document.revision, documentHash: hash(document) };
  await immutableJson(path.join(target, 'artifacts', hash(review), 'review.json'), review);
  await fs.writeFile(path.join(target, 'native-review.json'), JSON.stringify(review, null, 2));
  console.log(JSON.stringify({ projectId, revision: document.revision, mediaCount: editable.projectMedia.length,
    timelineCount: segments.length, modelArtifactRefs: editable.analysisRefs.length, approvedIdentDuration: 4.25 }));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

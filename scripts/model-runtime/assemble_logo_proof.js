#!/usr/bin/env node
// Preserve the existing real-model project and append the actual native ident.
// This private proof does not qualify an authenticated customer lifecycle.
const fs = require('fs/promises');
const path = require('path');
const { root, ownerUid, projectId, credentials } = require('./proof');
const { hash, stable } = require('../../src/modelRuntime/contract');
const { immutableJson } = require('../../src/modelRuntime/stores');
const studio = require('../../src/generated/studioDirectorReplayKernel.cjs');

async function main() {
  const target = path.join(root, 'logo-ident');
  const spec = JSON.parse(await fs.readFile(path.join(target, 'spec.json')));
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'native/receipt.json')));
  const bytes = await fs.readFile(path.join(target, 'native/preview.mp4'));
  const sha256 = hash(bytes);
  if (sha256 !== receipt.artifacts['preview.mp4'].sha256 || receipt.device.gpu_verified !== false)
    throw Error('Native ident byte identity or local device changed');
  const geometry = await fs.readFile(path.resolve(__dirname, '../../studio_3d_renderer/assets/autopromote-vector-logo.json'));
  const manifest = { schemaVersion: 1, projectId, ownerUid, capability: 'render_native_3d',
    executionKind: 'deterministic_local_software', model: null, modelRevision: null,
    sourceAssetId: 'autopromote-original-vector-v1', sourceSha256: hash(geometry),
    engine: 'Blender 4.5.9 / EEVEE', parameters: spec,
    creationTime: (await fs.stat(path.join(target, 'native/preview.mp4'))).mtime.toISOString(), status: 'rendered_pending_visual_review',
    outputSha256: sha256, outputBytes: bytes.length,
    sourceRange: { space: 'source', startTick: 0, endTick: 540000 },
    provenance: { geometry: 'assets/brand/autopromote-original-v1/logo-geometry.json',
      animationSourceSha256: hash(await fs.readFile(path.resolve(__dirname, '../../studio_3d_renderer/brand_ident.py'))),
      pipeline: 'existing Studio neon_logo -> studio_3d_renderer/render.py',
      generatedByAi: false, noProductionDeployment: true },
    metrics: { gpuCount: 0, paidGpuJobs: 0, nativeWidth: spec.width, nativeHeight: spec.height,
      fps: spec.fps, renderedFrames: spec.duration * spec.fps, device: receipt.device } };
  manifest.artifactHash = hash(manifest);
  await immutableJson(path.join(target, 'artifacts', manifest.artifactHash, 'manifest.json'), manifest);
  const id = `native-ident-${sha256.slice(0, 32)}`;
  const storagePath = `studio/sources/${ownerUid}/${id}.mp4`;
  const { bucket } = await credentials();
  const object = bucket.file(storagePath);
  const [exists] = await object.exists();
  if (!exists) await object.save(bytes, { resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'video/mp4',
      metadata: { ownerUid, purpose: 'studio_source', sha256, contentHash: sha256,
        projectId, nativeArtifactHash: manifest.artifactHash, generatedByAi: 'false' } } });
  const [metadata] = await object.getMetadata();
  const [stored] = await bucket.file(storagePath, { generation: metadata.generation }).download();
  if (metadata.metadata?.ownerUid !== ownerUid || metadata.metadata?.sha256 !== sha256
      || metadata.metadata?.nativeArtifactHash !== manifest.artifactHash || hash(stored) !== sha256)
    throw Error('Owned native source changed');
  const prior = JSON.parse(await fs.readFile(path.join(root, 'canonical-project.json')));
  const media = { id, name: 'AutoPromote native dimensional logo reveal',
    type: 'video', mediaType: 'video', status: 'ready', duration: 6,
    width: spec.width, height: spec.height, contentHash: sha256, storagePath,
    url: 'http://127.0.0.1:6021/factory-media/logo-ident/native/preview.mp4',
    nativeRenderProvenance: { artifactHash: manifest.artifactHash, executionKind: manifest.executionKind,
      geometrySha256: manifest.sourceSha256, generatedByAi: false } };
  const snapshot = { ...prior.snapshot, projectMedia: [...prior.snapshot.projectMedia, media],
    timeline: [...prior.snapshot.timeline, { id: 'native-ident-occurrence', sourceClipId: id,
      name: media.name, startRequest: 0, endRequest: 6, duration: 6, contentHash: sha256, storagePath }] };
  snapshot.orderedClips = snapshot.timeline.map(clip => {
    const source = snapshot.projectMedia.find(m => m.id === clip.sourceClipId);
    return { ...clip, url: source.url, start: clip.startRequest, end: clip.endRequest, sourceDuration: source.duration };
  });
  const document = studio.adaptStudioSnapshotToDocument({ snapshot, projectId, previousDocument: prior.document });
  studio.validateStudioProjectDocument(document);
  if (stable(document.analysisRefs) !== stable(prior.document.analysisRefs)) throw Error('Model references changed during native import');
  const editable = studio.projectStudioEditableStateToSnapshot(document, snapshot);
  editable.studioDocument = document;
  editable.studioDocumentHash = hash(document);
  const paths = { 'proof-source': 'media/source.mp4', [id]: 'logo-ident/native/preview.mp4' };
  const segments = studio.compileStudioTimelineForRender(document).map(segment => ({ ...segment,
    url: 'http://127.0.0.1:8765/' + (paths[segment.source_clip_id] || 'outputs/generate_video/generated_shot.mp4') }));
  studio.assertStudioExportTimelineMatchesDocument(document, segments);
  const cues = [
    { id: 'ident-rise', builtIn: true, tone: 'riser', startTime: .2, duration: 2.5, volume: .12, fadeIn: .2, fadeOut: .2 },
    { id: 'ident-lock', builtIn: true, tone: 'impact', startTime: 2.65, duration: .65, volume: .23, fadeIn: .015, fadeOut: .25 },
    { id: 'ident-wordmark', builtIn: true, tone: 'chime', startTime: 3.5, duration: 1.7, volume: .07, fadeIn: .015, fadeOut: .5 },
  ];
  const options = { autoCaptions: false, muteAudio: false,
    outputSettings: { resolution: '720p', fps: 24, codec: 'h264', audioCodec: 'aac', audioBitrate: '256' },
    brandWatermark: false, smartCrop: true, smartCropMode: 'safe_fit',
    finishPlan: { version: 1, enabled: true, reframe: { enabled: true, aspect: '16:9', mode: 'off' } } };
  const logoSegment = segments[2];
  const logoRequest = studio.buildViralRenderData({ finalVideoUrl: logoSegment.url,
    selectedClip: { start: 0, end: 6 }, overlays: [],
    extraOptions: { ...options, timelineSegments: [logoSegment], soundEffects: cues } });
  const combined = studio.buildViralRenderData({ finalVideoUrl: segments[0].url,
    selectedClip: { start: 0, end: segments.reduce((total, s) => total + s.duration, 0) }, overlays: editable.overlays,
    extraOptions: { ...options, timelineSegments: segments,
      soundEffects: cues.map(cue => ({ ...cue, startTime: cue.startTime + 7.541666666666667 })) } });
  combined.subjectVfx = [JSON.parse(await fs.readFile(path.join(root, 'derived/resolved-subject.private.json')))];
  await fs.writeFile(path.join(target, 'logo-render-request.json'), JSON.stringify(logoRequest, null, 2));
  await fs.writeFile(path.join(target, 'combined-render-request.private.json'), JSON.stringify(combined, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(target, 'canonical-project-with-logo.json'), stable({ document, snapshot: editable,
    documentHash: hash(document), retainedModelEvidence: prior.evidence, nativeArtifact: manifest.artifactHash }));
  await fs.writeFile(path.join(target, 'source-binding.json'), stable({ projectId, ownerUid, id, sha256, storagePath,
    generation: String(metadata.generation), nativeArtifactHash: manifest.artifactHash }));
  console.log(JSON.stringify({ status: 'CANONICAL_NATIVE_SOURCE_IMPORTED', projectId,
    projectRevision: document.revision, mediaCount: editable.projectMedia.length,
    timelineCount: segments.length, retainedModelRefs: editable.analysisRefs.length,
    nativeArtifactHash: manifest.artifactHash, sourceSha256: sha256 }));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

const { hash, fail, clean, validateOutput } = require('./contract');
function validateRequestCoverage(r, output) {
  const p=r.parameters, range=r.sourceRange;
  const count=Math.round((range.endTick-range.startTick)/3750);
  const sameRange=v=>hash(v)===hash(range);
  let valid=true;
  if(r.capability==='understand_video') {
    const indices=[...new Set(Array.from({length:p.sampleCount},(_,i)=>Math.round(i*(count-1)/(p.sampleCount-1))))];
    valid=output.subjects.every(s=>s.observedFrameIndices.every(i=>Number.isInteger(i)&&i>=0&&i<indices.length)) &&
      output.observations.every(o=>o.frameIndex<indices.length && o.sourceTick===range.startTick+indices[o.frameIndex]*3750);
  } else if(r.capability==='detect_object') {
    valid=output.frameIndex===p.frameIndex && output.sourceTick===range.startTick+p.frameIndex*3750 &&
      p.frameIndex<count && output.detections.every(d=>d.box[0]<d.box[2]&&d.box[1]<d.box[3]);
  } else if(r.capability==='segment_subject') {
    valid=output.subjectId===p.subjectId && sameRange(output.sourceRange) && output.frameCount===count &&
      output.fpsNumerator===24 && output.fpsDenominator===1;
  } else if(r.capability==='track_object') {
    valid=output.subjectId===p.subjectId && sameRange(output.sourceRange) &&
      output.dependencyArtifactHash===p.maskArtifactHash && output.samples.length===count &&
      output.samples.every((s,i)=>s.frameIndex===i && s.sourceTick===range.startTick+i*3750 &&
        s.visible===(s.point!==null) && (s.visible || s.box===null));
  } else if(r.capability==='generate_video') {
    valid=output.width===p.width && output.height===p.height && output.frameCount===p.frames &&
      output.fpsNumerator===p.fps && output.fpsDenominator===1 && output.durationTicks===Math.round(p.frames/p.fps*90000);
  }
  if(!valid)throw fail('MODEL_WORKER_COVERAGE_INVALID',502);
}
function buildArtifact({ job, result, createdAt = new Date().toISOString() }) {
  const { request: r, model } = job;
  if (!result || result.jobId !== job.id || result.attemptToken !== job.attemptToken || result.requestHash !== job.requestHash ||
      result.modelId !== model.id || result.revision !== model.revision || result.status !== 'completed')
    throw fail('MODEL_WORKER_RECEIPT_IDENTITY_INVALID', 502);
  const output = validateOutput(r.capability, result.output);
  validateRequestCoverage(r,output);
  if (!Array.isArray(result.files) || !result.files.length || result.files.length > 1000 ||
      result.files.some(f => !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes <= 0 ||
        !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,180}$/.test(f.name) || f.name.split('/').some(p => p === '..' || p === '.')) ||
      new Set(result.files.map(f => f.name)).size !== result.files.length)
    throw fail('MODEL_WORKER_BLOB_INVALID', 502);
  const metrics = result.metrics;
  if (!metrics || !Number.isFinite(metrics.runtimeSeconds) || metrics.runtimeSeconds < 0 ||
      !Number.isFinite(metrics.peakVramBytes) || metrics.peakVramBytes < 0 ||
      ![0,1].includes(metrics.gpuCount) || (model.requiredDevice === 'cuda' && metrics.gpuCount !== 1) ||
      typeof metrics.device !== 'string' || !result.provenance?.implementationSha256 ||
      !/^[a-f0-9]{64}$/.test(result.provenance.implementationSha256))
    throw fail('MODEL_WORKER_METRICS_INVALID', 502);
  for (const key of ['video','maskManifest','maskBundle']) {
    const ref = output[key];
    if (ref && !result.files.some(f => f.name === ref.name && f.sha256 === ref.sha256 && f.bytes === ref.bytes))
      throw fail('MODEL_WORKER_BLOB_REFERENCE_INVALID', 502);
  }
  const core = clean({ schemaVersion: 1, artifactVersion: 1, ownerUid: job.ownerUid,
    projectId: r.projectId, projectRevision: r.projectRevision, sourceAssetId: r.sourceAssetId,
    sourceSha256: r.sourceSha256, sourceRange: r.sourceRange, capability: r.capability,
    model: model.checkpoint, modelFamily: model.modelFamily, modelVersion: model.modelVersion,
    revision: model.revision, checkpoint: model.checkpointFile, license: model.license,
    registryVersion: job.registryVersion, registryEntryHash: hash(model), parameters: r.parameters,
    configHash: hash({ parameters: r.parameters, modelVersion: model.modelVersion, revision: model.revision }),
    dependencyHashes: [...new Set([r.sourceSha256, ...r.dependencyHashes])].sort(),
    confidence: output.confidence ?? null, status: 'completed', createdAt, output,
    files: result.files, metrics, provenance: { ...result.provenance,
      origin: r.capability === 'generate_video' ? 'generated_illustration' :
        (r.capability === 'track_object' && model.requiredDevice === 'cpu' ? 'derived_from_model_artifact' : 'model_inferred'),
      producer: 'autopromote-model-capability-runtime', jobId: job.id, requestHash: job.requestHash,
      attemptToken: job.attemptToken, workerImage: job.workerImage, sourceGeneration: job.source.generation },
    reviewRequired: true });
  if(Buffer.byteLength(JSON.stringify(core))>850*1024)throw fail('MODEL_ARTIFACT_TOO_LARGE',502);
  return { ...core, artifactHash: hash(core) };
}
function verifyArtifact(record, { ownerUid, projectId, sourceSha256 } = {}) {
  if (!record) throw fail('MODEL_ARTIFACT_MISSING', 404);
  const { artifactHash, ...core } = record;
  if (hash(core) !== artifactHash || core.schemaVersion !== 1 || core.status !== 'completed' ||
      (ownerUid !== undefined && core.ownerUid !== ownerUid) ||
      (projectId !== undefined && core.projectId !== projectId) ||
      (sourceSha256 !== undefined && core.sourceSha256 !== sourceSha256)) throw fail('MODEL_ARTIFACT_SCOPE_OR_HASH_INVALID', 409);
  validateOutput(core.capability, core.output);
  return clean(record);
}
module.exports = { buildArtifact, verifyArtifact, validateRequestCoverage };

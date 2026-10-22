const crypto = require("crypto");
const axios = require("axios");
const { readStudioWorker, cancelStudioWorkerJob } = require("./studioWorkerRead");
const admin = require("firebase-admin");
const { getStudioSourceBucket, resolveOwnedStudioVideoSource } = require("./studioSourceService");
const {
  validateSubjectVfxScene,
  stable,
} = require("../../frontend/src/components/studioSubjectVfxContract");
const hash = value =>
  crypto
    .createHash("sha256")
    .update(Buffer.isBuffer(value) || typeof value === "string" ? value : stable(value))
    .digest("hex");
const error = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const validId = value => /^[A-Za-z0-9_-]{8,128}$/.test(value || "");
const MAX_OUTPUT_BYTES = 75 * 1024 * 1024;
const { resolveSubjectReplacementAssets, replacementIdentity } = require('./studioSubjectReplacementAssets');

function workerConfig(kind) {
  const cpu=kind==='model_artifact_cpu';
  const raw = process.env[cpu?'STUDIO_MODEL_VFX_URL':'STUDIO_NVIDIA_VFX_URL'];
  const secret = process.env[cpu?'STUDIO_MODEL_VFX_SECRET':'STUDIO_NVIDIA_VFX_SECRET'];
  if (!raw || !secret || secret.length < 32)
    throw error(
      503,
      cpu?"Subject preview is unavailable. Your edit is saved.":"NVIDIA subject rendering is offline. Your edit is saved; connect the VFX worker to render it."
    );
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw error(503, cpu?"Subject preview configuration is unavailable.":"Invalid NVIDIA worker configuration.");
  return { url: raw.replace(/\/$/, ""), headers: { Authorization: `Bearer ${secret}` } };
}
const db = () => admin.firestore();
const jobs = () => db().collection("studio_subject_vfx_jobs");
const lease = kind => db().collection("studio_subject_vfx_capacity").doc(kind==='model_artifact_cpu'?'model_artifact_cpu':'nvidia');
const bucket = () => getStudioSourceBucket();
async function sourceIdentity(ownerUid, scene) {
  const source = await resolveOwnedStudioVideoSource({
    storagePath: scene.sourceStoragePath,
    userId: ownerUid,
  });
  const sourceBucket = getStudioSourceBucket(source.kind);
  const [metadata] = await sourceBucket.file(source.storagePath).getMetadata();
  if (metadata.metadata?.ownerUid !== ownerUid || Number(metadata.size) !== source.size)
    throw error(
      409,
      "The source changed while checking its owner. Save it again before rendering."
    );
  if (!metadata.generation)
    throw error(
      409,
      "This source has no immutable storage version. Save the source again before rendering."
    );
  if (Number(source.size) > 512 * 1024 * 1024)
    throw error(422, "Subject rendering currently supports source files up to 512 MB.");
  return { source, sourceBucket, generation: String(metadata.generation),sha256:metadata.metadata?.sha256 || metadata.metadata?.contentHash };
}
const requestIdentity=(scene,generation,modelArtifactRef,replacements=[])=>hash({scene,generation,...(modelArtifactRef?{modelArtifactHash:modelArtifactRef.artifactHash}:{}),
  ...(replacements.length?{replacementAssets:replacementIdentity(replacements)}:{})});
async function release(jobId,kind) {
  await db().runTransaction(async tx => {
    const ref = lease(kind),
      current = await tx.get(ref);
    if (current.data()?.jobId === jobId) tx.delete(ref);
  });
}
async function createSubjectVfxPreview({ ownerUid, scene: input, clientRequestId, modelArtifactRef }) {
  if (!validId(clientRequestId)) throw error(400, "Invalid render request identity.");
  if(modelArtifactRef!==undefined && (!modelArtifactRef || typeof modelArtifactRef!=='object' || Array.isArray(modelArtifactRef)))
    throw error(422,'Invalid immutable mask reference.');
  const scene = validateSubjectVfxScene(input);
  const executionKind=modelArtifactRef?'model_artifact_cpu':undefined;
  const config = workerConfig(executionKind);
  const { source, sourceBucket, generation,sha256 } = await sourceIdentity(ownerUid, scene);
  const modelInput=modelArtifactRef?await require('./studioModelCapabilityService').resolveSubjectMaskInputs({
    ownerUid,scene,modelArtifactRef,sourceSha256:sha256,sourceGeneration:generation}):null;
  let replacementAssets=[];
  if(scene.effects.some(effect=>effect.type==='background_replace')) {
    if(!modelArtifactRef)throw error(422,'Create a saved subject mask before replacing the background.');
    const artifact=await require('./studioModelCapabilityService').ownedModelArtifact({uid:ownerUid,artifactHash:modelArtifactRef.artifactHash});
    replacementAssets=await resolveSubjectReplacementAssets({ownerUid,projectId:artifact.projectId,scene});
  }
  const requestHash = requestIdentity(scene,generation,modelArtifactRef,replacementAssets);
  const requestRef = db()
    .collection("studio_subject_vfx_requests")
    .doc(hash(`${ownerUid}:${clientRequestId}`));
  if (executionKind === 'model_artifact_cpu') {
    // A closed browser may stop polling after the CPU job finishes. Reconcile
    // only this owner's lease through the normal receipt/ownership checks;
    // never resubmit work or release an unconfirmed/busy worker.
    const retained = (await lease(executionKind).get()).data();
    if (retained?.ownerUid === ownerUid && retained.expiresAtMs > Date.now()) {
      try {
        const previous = await getSubjectVfxPreview({ ownerUid, jobId: retained.jobId });
        if (['completed', 'failed', 'cancelled'].includes(previous.status)) await release(retained.jobId, executionKind);
      } catch (_) { /* The transaction below retains the unavailable lease. */ }
    }
  }
  const jobId = crypto.randomUUID();
  const result = await db().runTransaction(async tx => {
    const [existing, capacity] = await Promise.all([tx.get(requestRef), tx.get(lease(executionKind))]);
    if (existing.exists) {
      if (existing.data().requestHash !== requestHash)
        throw error(409, "This render request ID belongs to another edit.");
      return { jobId: existing.data().jobId, reused: true };
    }
    const now = Date.now();
    if (capacity.data()?.expiresAtMs > now)
      throw error(429, executionKind==='model_artifact_cpu'?"Subject preview is processing another edit. Retry when it finishes.":"The NVIDIA renderer is working on another edit. Retry when it finishes.");
    tx.create(requestRef, { ownerUid, requestHash, jobId });
    tx.create(jobs().doc(jobId), {
      ownerUid,
      // Firestore does not support arrays inside arrays (prompt points are
      // [x, y] pairs). Keep the exact validated scene in canonical JSON.
      sceneJson: stable(scene),
      generation,
      requestHash,
      status: "queued",
      createdAtMs: now,
      expiresAtMs: now + 86400000,
      ...(modelArtifactRef?{executionKind,modelArtifactRef,sourceSha256:sha256}:{}),
      ...(replacementAssets.length?{replacementAssets:replacementIdentity(replacementAssets)}:{}),
    });
    tx.set(lease(executionKind), { jobId, ownerUid, expiresAtMs: now + 20 * 60000 });
    return { jobId, reused: false };
  });
  if (result.reused) {
    const previous = (await jobs().doc(result.jobId).get()).data();
    if (["completed", "failed", "cancelled"].includes(previous?.status)) return result;
  }
  const dispatchedJobId = result.jobId;
  try {
    const [sourceUrl] = await sourceBucket
      .file(source.storagePath)
      .getSignedUrl({
        action: "read",
        expires: Date.now() + 20 * 60000,
        queryParams: { generation },
      });
    const response = await axios.post(
      `${config.url}/jobs`,
      { jobId: dispatchedJobId, ownerUid, requestHash, sourceUrl, scene,...(modelInput?{modelInput}:{}),
        ...(replacementAssets.length?{replacementAssets}:{}) },
      { headers: config.headers, timeout: 15000, maxRedirects: 0 }
    );
    if (response.data?.jobId !== dispatchedJobId)
      throw new Error("Worker did not acknowledge this render.");
  } catch (cause) {
    // An uncertain dispatch is retained. Poll the same job ID; never resubmit a new job automatically.
    const rejected = [400, 401, 403, 409, 413, 422, 429, 503].includes(cause.response?.status);
    await jobs()
      .doc(dispatchedJobId)
      .update({
        status: rejected ? "failed" : "dispatch_uncertain",
        error: rejected
          ? executionKind==='model_artifact_cpu'?"Subject preview could not start. Your edit is saved.":"The NVIDIA worker could not accept this render."
          : "Checking whether the NVIDIA worker received this render.",
      });
    if (rejected) {
      await release(dispatchedJobId,executionKind);
      throw error(
        cause.response?.status || 503,
        executionKind==='model_artifact_cpu'?"Subject preview could not start. Your edit is saved.":"The NVIDIA worker could not accept this render. Your edit is saved."
      );
    }
  }
  return result;
}
async function getOwnedJob(ownerUid, jobId) {
  if (!validId(jobId)) throw error(400, "Invalid render identity.");
  const doc = await jobs().doc(jobId).get();
  if (!doc.exists || doc.data().ownerUid !== ownerUid)
    throw error(404, "Subject render not found.");
  const data = doc.data();
  const scene = validateSubjectVfxScene(data.scene || JSON.parse(data.sceneJson));
  return { ref: jobs().doc(jobId), data: { ...data, scene } };
}
async function getSubjectVfxPreview({ ownerUid, jobId }) {
  const { ref, data } = await getOwnedJob(ownerUid, jobId);
  if (data.expiresAtMs <= Date.now())
    throw error(410, "Subject render expired. Render the saved effect again.");
  if (!["completed", "failed", "cancelled"].includes(data.status)) {
    const config = workerConfig(data.executionKind);
    const response = await readStudioWorker(config, jobId, {
      timeout: 15000,
      maxRedirects: 0,
    });
    const state = response.data;
    if (
      state.jobId !== jobId ||
      state.ownerUid !== ownerUid ||
      state.requestHash !== data.requestHash
    )
      throw error(502, "Worker render identity changed.");
    if (state.status === "completed") {
      const receipt = state.receipt;
      const seconds = data.scene.sourceRange.end - data.scene.sourceRange.start;
      const mask=data.modelArtifactRef?await require('./studioModelCapabilityService').resolveSubjectMaskInputs({
        ownerUid,scene:data.scene,modelArtifactRef:data.modelArtifactRef,sourceSha256:data.sourceSha256,
        sourceGeneration:data.generation,signFiles:false}):null;
      if (
        !receipt ||
        receipt.requestHash !== data.requestHash ||
        typeof receipt.seconds !== "number" ||
        !Number.isFinite(receipt.seconds) ||
        !/^[a-f0-9]{64}$/.test(receipt.output_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.pixel_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.original_source_sha256 || "") ||
        receipt.encoder !== (data.executionKind==='model_artifact_cpu'?"libx264":"h264_nvenc") ||
        (data.executionKind==='model_artifact_cpu' && (receipt.modelArtifactHash!==data.modelArtifactRef?.artifactHash ||
          receipt.original_source_sha256!==data.sourceSha256 || receipt.gpuCount!==0 ||
          receipt.mask_manifest_sha256!==mask?.manifestSha256 ||
          !Number.isFinite(receipt.elapsed_seconds) || receipt.elapsed_seconds<0 ||
          !/^[a-f0-9]{64}$/.test(receipt.implementation_sha256 || ''))) ||
        (data.replacementAssets?.length && stable(receipt.replacementAssets)!==stable(data.replacementAssets)) ||
        Math.abs(receipt.seconds - seconds) > 1 / 24 + 0.001 ||
        receipt.frames !== Math.round(seconds * 24)
      )
        throw error(502, "Subject render did not preserve the selected picture clock.");
      const media = await readStudioWorker(config, jobId, {
        media: true,
        responseType: "arraybuffer",
        timeout: 60000,
        maxRedirects: 0,
        maxContentLength: MAX_OUTPUT_BYTES,
      });
      const bytes = Buffer.from(media.data);
      if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES || hash(bytes) !== receipt.output_sha256)
        throw error(502, "Subject render media checksum failed.");
      const storagePath = `temp_studio_vfx/${ownerUid}/${jobId}/render.mp4`;
      try { await bucket()
        .file(storagePath)
        .save(bytes, {
          resumable: false,
          ...(data.executionKind==='model_artifact_cpu'?{preconditionOpts:{ifGenerationMatch:0}}:{}),
          metadata: {
            contentType: "video/mp4",
            metadata: {
              ownerUid,
              requestHash: data.requestHash,
              sha256: receipt.output_sha256,
              ...(data.modelArtifactRef?{modelArtifactHash:data.modelArtifactRef.artifactHash}:{}),
              deleteAfter: new Date(data.expiresAtMs).toISOString(),
            },
          },
        }); } catch(cause) {
          if(data.executionKind!=='model_artifact_cpu' || Number(cause.code)!==412)throw cause;
          const [existing]=await bucket().file(storagePath).getMetadata();
          if(existing.metadata?.ownerUid!==ownerUid || existing.metadata?.requestHash!==data.requestHash ||
             existing.metadata?.sha256!==receipt.output_sha256 || existing.metadata?.modelArtifactHash!==data.modelArtifactRef.artifactHash ||
             Number(existing.size)!==bytes.length)throw error(409,'Immutable subject render conflict.');
        }
      if(data.modelArtifactRef) {
        const artifact={schemaVersion:1,artifactVersion:1,kind:'deterministic_subject_composite',ownerUid,
          projectId:mask.projectId,projectRevision:mask.projectRevision,model:mask.model,revision:mask.revision,
          checkpoint:mask.checkpoint,modelVersion:mask.modelVersion,capability:'deterministic_subject_composite',
          sourceAssetId:data.scene.sourceId,sourceSha256:data.sourceSha256,sourceGeneration:data.generation,
          sourceRange:data.modelArtifactRef.sourceRange,confidence:null,parentArtifactHash:data.modelArtifactRef.artifactHash,parameters:data.scene,
          createdAt:new Date(data.createdAtMs).toISOString(),status:'completed',
          output:{storagePath,sha256:receipt.output_sha256,bytes:bytes.length,pixelSha256:receipt.pixel_sha256},
          provenance:{producer:'studio_subject_vfx',requestHash:data.requestHash,jobId,implementationSha256:receipt.implementation_sha256,
            ...(data.replacementAssets?.length?{replacementAssets:data.replacementAssets}:{})},
          metrics:{gpuCount:0,device:'cpu',runtimeSeconds:receipt.elapsed_seconds}};
        const artifactHash=hash(artifact),artifactBytes=Buffer.from(stable({...artifact,artifactHash}));
        const file=bucket().file(`temp_studio_vfx/${ownerUid}/${jobId}/artifact-${artifactHash}.json`);
        try {await file.save(artifactBytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},
          metadata:{contentType:'application/json',metadata:{ownerUid,sha256:hash(artifactBytes),modelArtifactHash:data.modelArtifactRef.artifactHash}}});}
        catch(cause){if(Number(cause.code)!==412)throw cause;const [meta]=await file.getMetadata();
          if(meta.metadata?.ownerUid!==ownerUid || meta.metadata?.sha256!==hash(artifactBytes))throw error(409,'Immutable subject artifact conflict.');}
        receipt.derivativeArtifactHash=artifactHash;
      }
      const accepted = await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (["failed", "cancelled"].includes(current?.status)) return false;
        tx.update(ref, { status: "completed", storagePath, receipt });
        return true;
      });
      if (!accepted) return getSubjectVfxPreview({ ownerUid, jobId });
      await release(jobId,data.executionKind);
      Object.assign(data, { status: "completed", storagePath, receipt });
    } else if (["failed", "cancelled"].includes(state.status)) {
      await ref.update({
        status: state.status,
        error: String(state.error || "Subject render failed.").slice(0, 600),
      });
      await release(jobId,data.executionKind);
      Object.assign(data, { status: state.status, error: state.error });
    } else if (!["queued", "processing"].includes(state.status))
      throw error(502, "Invalid subject render state.");
    else data.status = state.status;
  }
  const result = { jobId, status: data.status, error: data.error || null };
  if (data.status === "completed") {
    const [url] = await bucket()
      .file(data.storagePath)
      .getSignedUrl({ action: "read", expires: Date.now() + 15 * 60000 });
    Object.assign(result, { url, receipt: data.receipt });
  }
  return result;
}
async function cancelSubjectVfxPreview({ ownerUid, jobId }) {
  const { ref, data } = await getOwnedJob(ownerUid, jobId);
  if (["completed", "failed", "cancelled"].includes(data.status))
    return { jobId, status: data.status };
  const config = workerConfig(data.executionKind);
  const response = await cancelStudioWorkerJob(config, jobId);
  if (response.data?.status !== "cancelled")
    throw error(502, "Cancellation has not been confirmed. Check this job again.");
  await ref.update({ status: "cancelled" });
  await release(jobId,data.executionKind);
  return { jobId, status: "cancelled" };
}
async function resolveSubjectVfxExport({ ownerUid, items, timeline }) {
  if (!Array.isArray(items) || items.length > 8)
    throw error(422, "Invalid subject render references.");
  const result = [];
  for (const item of items) {
    if (!item || Object.keys(item).sort().join() !== "jobId,scene" || !validId(item.jobId))
      throw error(422, "Use saved subject render references, without browser URLs.");
    const scene = validateSubjectVfxScene(item.scene),
      { data } = await getOwnedJob(ownerUid, item.jobId);
    const { generation,sha256 } = await sourceIdentity(ownerUid, scene);
    const mask=data.modelArtifactRef?await require('./studioModelCapabilityService').resolveSubjectMaskInputs({
      ownerUid,scene,modelArtifactRef:data.modelArtifactRef,sourceSha256:sha256,sourceGeneration:generation,signFiles:false}):null;
    const replacementAssets=data.replacementAssets?.length?await resolveSubjectReplacementAssets({ownerUid,projectId:mask.projectId,scene,signFiles:false}):[];
    if (
      data.status !== "completed" ||
      data.expiresAtMs <= Date.now() ||
      data.requestHash !== requestIdentity(scene,generation,data.modelArtifactRef,replacementAssets)
    )
      throw error(409, "The source or subject effect changed. Render and review it again.");
    const clips = (timeline || []).filter(
      clip =>
        String(clip.source_clip_id) === scene.sourceId &&
        clip.start_time < scene.sourceRange.end &&
        clip.end_time > scene.sourceRange.start
    );
    if (
      !clips.length ||
      clips.some(
        clip =>
          clip.start_time < scene.sourceRange.start - 0.001 ||
          clip.end_time > scene.sourceRange.end + 0.001 ||
          clip.sourceStoragePath !== scene.sourceStoragePath
      )
    )
      throw error(
        422,
        "Split the timeline at the effect range edges; source references must match the rendered clip."
      );
    if (
      result.some(
        other =>
          other.source_clip_id === scene.sourceId &&
          other.start_time < scene.sourceRange.end &&
          other.end_time > scene.sourceRange.start
      )
    )
      throw error(422, "Overlapping subject renders must be combined.");
    const expected = `temp_studio_vfx/${ownerUid}/${item.jobId}/render.mp4`;
    if (data.storagePath !== expected) throw error(409, "Subject render storage binding changed.");
    const [metadata] = await bucket().file(expected).getMetadata();
    if (
      Number(metadata.size) <= 0 ||
      Number(metadata.size) > MAX_OUTPUT_BYTES ||
      metadata.contentType !== "video/mp4" ||
      metadata.metadata?.ownerUid !== ownerUid ||
      metadata.metadata?.requestHash !== data.requestHash ||
      metadata.metadata?.sha256 !== data.receipt?.output_sha256 ||
      (data.modelArtifactRef && metadata.metadata?.modelArtifactHash!==data.modelArtifactRef.artifactHash)
    )
      throw error(409, "The reviewed subject render is unavailable or changed.");
    const [url] = await bucket()
      .file(expected)
      .getSignedUrl({ action: "read", expires: Date.now() + 2 * 3600000 });
    result.push({
      jobId: item.jobId,
      ownerUid,
      source_clip_id: scene.sourceId,
      start_time: scene.sourceRange.start,
      end_time: scene.sourceRange.end,
      url,
      sha256: data.receipt.output_sha256,
      pixel_sha256: data.receipt.pixel_sha256,
      source_sha256: data.receipt.original_source_sha256,
    });
  }
  return result;
}
module.exports = {
  createSubjectVfxPreview,
  getSubjectVfxPreview,
  cancelSubjectVfxPreview,
  resolveSubjectVfxExport,
};

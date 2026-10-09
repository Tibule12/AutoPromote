const crypto = require("crypto");
const axios = require("axios");
const { readStudioWorker } = require("./studioWorkerRead");
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

function workerConfig() {
  const raw = process.env.STUDIO_NVIDIA_VFX_URL;
  const secret = process.env.STUDIO_NVIDIA_VFX_SECRET;
  if (!raw || !secret || secret.length < 32)
    throw error(
      503,
      "NVIDIA subject rendering is offline. Your edit is saved; connect the VFX worker to render it."
    );
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw error(503, "Invalid NVIDIA worker configuration.");
  return { url: raw.replace(/\/$/, ""), headers: { Authorization: `Bearer ${secret}` } };
}
const db = () => admin.firestore();
const jobs = () => db().collection("studio_subject_vfx_jobs");
const lease = () => db().collection("studio_subject_vfx_capacity").doc("nvidia");
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
  return { source, sourceBucket, generation: String(metadata.generation) };
}
async function release(jobId) {
  await db().runTransaction(async tx => {
    const ref = lease(),
      current = await tx.get(ref);
    if (current.data()?.jobId === jobId) tx.delete(ref);
  });
}
async function createSubjectVfxPreview({ ownerUid, scene: input, clientRequestId }) {
  if (!validId(clientRequestId)) throw error(400, "Invalid render request identity.");
  const scene = validateSubjectVfxScene(input);
  const config = workerConfig();
  const { source, sourceBucket, generation } = await sourceIdentity(ownerUid, scene);
  const requestHash = hash({ scene, generation });
  const requestRef = db()
    .collection("studio_subject_vfx_requests")
    .doc(hash(`${ownerUid}:${clientRequestId}`));
  const jobId = crypto.randomUUID();
  const result = await db().runTransaction(async tx => {
    const [existing, capacity] = await Promise.all([tx.get(requestRef), tx.get(lease())]);
    if (existing.exists) {
      if (existing.data().requestHash !== requestHash)
        throw error(409, "This render request ID belongs to another edit.");
      return { jobId: existing.data().jobId, reused: true };
    }
    const now = Date.now();
    if (capacity.data()?.expiresAtMs > now)
      throw error(429, "The NVIDIA renderer is working on another edit. Retry when it finishes.");
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
    });
    tx.set(lease(), { jobId, ownerUid, expiresAtMs: now + 20 * 60000 });
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
      { jobId: dispatchedJobId, ownerUid, requestHash, sourceUrl, scene },
      { headers: config.headers, timeout: 15000, maxRedirects: 0 }
    );
    if (response.data?.jobId !== dispatchedJobId)
      throw new Error("Worker did not acknowledge this render.");
  } catch (cause) {
    // An uncertain dispatch is retained. Poll the same job ID; never resubmit a new job automatically.
    const rejected = [400, 401, 403, 409, 422, 429, 503].includes(cause.response?.status);
    await jobs()
      .doc(dispatchedJobId)
      .update({
        status: rejected ? "failed" : "dispatch_uncertain",
        error: rejected
          ? "The NVIDIA worker could not accept this render."
          : "Checking whether the NVIDIA worker received this render.",
      });
    if (rejected) {
      await release(dispatchedJobId);
      throw error(
        cause.response?.status || 503,
        "The NVIDIA worker could not accept this render. Your edit is saved."
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
    const config = workerConfig();
    const response = await readStudioWorker(`${config.url}/jobs/${jobId}`, {
      headers: config.headers,
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
      if (
        !receipt ||
        receipt.requestHash !== data.requestHash ||
        typeof receipt.seconds !== "number" ||
        !Number.isFinite(receipt.seconds) ||
        !/^[a-f0-9]{64}$/.test(receipt.output_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.pixel_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.original_source_sha256 || "") ||
        receipt.encoder !== "h264_nvenc" ||
        Math.abs(receipt.seconds - seconds) > 1 / 24 + 0.001 ||
        receipt.frames !== Math.round(seconds * 24)
      )
        throw error(502, "Subject render did not preserve the selected picture clock.");
      const media = await readStudioWorker(`${config.url}/jobs/${jobId}/media`, {
        headers: config.headers,
        responseType: "arraybuffer",
        timeout: 60000,
        maxRedirects: 0,
        maxContentLength: MAX_OUTPUT_BYTES,
      });
      const bytes = Buffer.from(media.data);
      if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES || hash(bytes) !== receipt.output_sha256)
        throw error(502, "Subject render media checksum failed.");
      const storagePath = `temp_studio_vfx/${ownerUid}/${jobId}/render.mp4`;
      await bucket()
        .file(storagePath)
        .save(bytes, {
          resumable: false,
          metadata: {
            contentType: "video/mp4",
            metadata: {
              ownerUid,
              requestHash: data.requestHash,
              sha256: receipt.output_sha256,
              deleteAfter: new Date(data.expiresAtMs).toISOString(),
            },
          },
        });
      const accepted = await db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (["failed", "cancelled"].includes(current?.status)) return false;
        tx.update(ref, { status: "completed", storagePath, receipt });
        return true;
      });
      if (!accepted) return getSubjectVfxPreview({ ownerUid, jobId });
      await release(jobId);
      Object.assign(data, { status: "completed", storagePath, receipt });
    } else if (["failed", "cancelled"].includes(state.status)) {
      await ref.update({
        status: state.status,
        error: String(state.error || "Subject render failed.").slice(0, 600),
      });
      await release(jobId);
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
  const config = workerConfig();
  const response = await axios.delete(`${config.url}/jobs/${jobId}`, {
    headers: config.headers,
    timeout: 15000,
    maxRedirects: 0,
  });
  if (response.data?.status !== "cancelled")
    throw error(502, "Cancellation has not been confirmed. Check this job again.");
  await ref.update({ status: "cancelled" });
  await release(jobId);
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
    const { generation } = await sourceIdentity(ownerUid, scene);
    if (
      data.status !== "completed" ||
      data.expiresAtMs <= Date.now() ||
      data.requestHash !== hash({ scene, generation })
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
      metadata.metadata?.sha256 !== data.receipt?.output_sha256
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

// Keep transient NVIDIA/local-worker outputs in the existing private bucket.
// The workstation/backend owns credentials; the media worker never needs them.
const admin = require("firebase-admin");
const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

function isTransientWorkerOutput(value, workerUrl) {
  try {
    const output = new URL(value), worker = new URL(workerUrl);
    const loopback = host => ["localhost", "127.0.0.1", "[::1]"].includes(host);
    const sameHost = output.hostname === worker.hostname ||
      (loopback(output.hostname) && loopback(worker.hostname));
    return ["http:", "https:"].includes(output.protocol) &&
      output.protocol === worker.protocol && output.port === worker.port && sameHost &&
      !output.username && !output.password && !output.search && !output.hash &&
      /^\/local-output\/[A-Za-z0-9_.-]+\.(mp4|mov|webm|jpg|jpeg|png)$/i.test(output.pathname);
  } catch { return false; }
}

function outputBucket() {
  const name = String(process.env.FIREBASE_STORAGE_BUCKET || "").replace(/^gs:\/\//, "").replace(/\/$/, "");
  return name ? admin.storage().bucket(name) : admin.storage().bucket();
}

async function persistWorkerOutput({ url, workerUrl, userId, jobId, thumbnail = false }) {
  if (!isTransientWorkerOutput(url, workerUrl)) throw new Error("Untrusted transient worker output");
  if (![userId, jobId].every(value => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value))) {
    throw new Error("Invalid Studio output owner or job");
  }
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  const contentType = ({ ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" })[extension];
  if (thumbnail !== contentType.startsWith("image/")) throw new Error("Unexpected worker output media type");
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "studio-output-"));
  const local = path.join(directory, "output" + extension);
  const maximum = thumbnail ? 20 * 1024 * 1024 : 1024 * 1024 * 1024;
  let response, uploaded = false;
  const bucket = outputBucket();
  const storagePath = `studio/exports/${userId}/${jobId}/${thumbnail ? "thumbnail" : "render"}${extension}`;
  const file = bucket.file(storagePath);
  try {
    // Never follow a worker redirect to an arbitrary host or credential endpoint.
    response = await axios.get(url, { responseType: "stream", maxRedirects: 0, timeout: 120000 });
    if (Number(response.headers["content-length"] || 0) > maximum) throw new Error("Studio output exceeds transfer limit");
    let bytes = 0;
    const hash = crypto.createHash("sha256");
    const bounded = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maximum) return callback(new Error("Studio output exceeds transfer limit"));
      hash.update(chunk); callback(null, chunk);
    } });
    await pipeline(response.data, bounded, fs.createWriteStream(local, { flags: "wx" }));
    if (!bytes) throw new Error("Studio worker returned an empty output");
    const sha256 = hash.digest("hex");
    await bucket.upload(local, { destination: storagePath, resumable: false,
      metadata: { contentType, cacheControl: "private, max-age=3600",
        metadata: { ownerUid: userId, jobId, purpose: "studio_export", sha256 } } });
    uploaded = true;
    const [signedUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 24 * 3600000 });
    return { url: signedUrl, storagePath, sha256, bytes };
  } catch (error) {
    if (uploaded) await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  } finally {
    response?.data?.destroy();
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function refreshOwnedStudioOutput({ storagePath, userId, jobId, download = false }) {
  const prefix = `studio/exports/${userId}/${jobId}/`;
  if (typeof storagePath !== "string" || !storagePath.startsWith(prefix) ||
      !/^render\.(mp4|mov|webm)$/.test(storagePath.slice(prefix.length))) {
    throw new Error("Invalid owned Studio export path");
  }
  const file = outputBucket().file(storagePath);
  const [metadata] = await file.getMetadata();
  if (metadata.metadata?.ownerUid !== userId || metadata.metadata?.jobId !== jobId || !Number(metadata.size)) {
    throw new Error("Studio export ownership or content is invalid");
  }
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 24 * 3600000,
    ...(download ? { responseDisposition: `attachment; filename="viral_clip_rendered${path.extname(storagePath)}"` } : {}) });
  return url;
}

module.exports = { isTransientWorkerOutput, persistWorkerOutput, refreshOwnedStudioOutput };

// A signed worker URL expires even while its bytes remain in the bucket. Only
// the exact server-generated job object in the configured bucket may be adopted.
function workerBucketOutputPath(value, jobId, bucketName) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(jobId || '')) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    let bucket, object;
    if (url.hostname === 'storage.googleapis.com') {
      const parts = url.pathname.slice(1).split('/');
      bucket = decodeURIComponent(parts.shift()); object = decodeURIComponent(parts.join('/'));
    } else if (url.hostname === 'firebasestorage.googleapis.com') {
      const parts = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
      if (!parts) return null;
      bucket = decodeURIComponent(parts[1]); object = decodeURIComponent(parts[2]);
    } else return null;
    return bucket === bucketName && object === `processed/${jobId}_viral.mp4` ? object : null;
  } catch { return null; }
}

async function persistWorkerBucketOutput({ url, userId, jobId, expectedSha256, legacy = false }) {
  // Unrelated legacy providers keep their existing contract. No arbitrary HTTP
  // fetch occurs: accepted source objects are read through the Storage SDK.
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return null; }
  if (!['storage.googleapis.com','firebasestorage.googleapis.com'].includes(hostname)) return null;
  if (![userId,jobId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value)) ||
      !/^[a-f0-9]{64}$/.test(expectedSha256 || '')) {
    if (legacy) return null;
    throw new Error('Invalid Studio output identity or hash');
  }
  const bucket = outputBucket(), sourcePath = workerBucketOutputPath(url,jobId,bucket.name);
  if (!sourcePath) {
    if (legacy) return null;
    throw new Error('Worker output is not the configured job object');
  }
  const storagePath = `studio/exports/${userId}/${jobId}/render.mp4`;
  const target = bucket.file(storagePath), maximum = 1024*1024*1024;
  async function existing() {
    let metadata;
    try { [metadata] = await target.getMetadata(); }
    catch (error) { if (Number(error.code) === 404) return null; throw error; }
    const bytes = Number(metadata.size);
    if (metadata.metadata?.ownerUid !== userId || metadata.metadata?.jobId !== jobId ||
        metadata.metadata?.sha256 !== expectedSha256 || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maximum)
      throw new Error('Existing Studio export identity conflicts with this result');
    const [signedUrl] = await target.getSignedUrl({action:'read',expires:Date.now()+24*3600000});
    return {url:signedUrl,storagePath,sha256:expectedSha256,bytes,generation:metadata.generation};
  }
  const saved = await existing(); if (saved) return saved;
  const source = bucket.file(sourcePath), [sourceMetadata] = await source.getMetadata();
  const sourceBytes = Number(sourceMetadata.size);
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 || sourceBytes > maximum || !sourceMetadata.generation)
    throw new Error('Worker bucket output has invalid size or generation');
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(),'studio-bucket-output-'));
  const local = path.join(directory,'render.mp4');
  try {
    let bytes = 0; const digest = crypto.createHash('sha256');
    const bounded = new Transform({transform(chunk,encoding,callback) {
      bytes += chunk.length;
      if (bytes > maximum) return callback(new Error('Studio output exceeds transfer limit'));
      digest.update(chunk); callback(null,chunk);
    }});
    await pipeline(bucket.file(sourcePath,{generation:sourceMetadata.generation}).createReadStream(),
      bounded,fs.createWriteStream(local,{flags:'wx'}));
    if (bytes !== sourceBytes || digest.digest('hex') !== expectedSha256)
      throw new Error('Worker bucket output differs from the completed render hash');
    try {
      await bucket.upload(local,{destination:storagePath,resumable:false,preconditionOpts:{ifGenerationMatch:0},
        metadata:{contentType:'video/mp4',cacheControl:'private, max-age=3600',
          metadata:{ownerUid:userId,jobId,purpose:'studio_export',sha256:expectedSha256,
            sourceGeneration:String(sourceMetadata.generation)}}});
    } catch (error) { if (Number(error.code) !== 412) throw error; }
    // A simultaneous adopter may win creation; validate its exact identity.
    const result = await existing();
    if (!result) throw new Error('Studio export was not persisted');
    return result;
  } finally { await fs.promises.rm(directory,{recursive:true,force:true}); }
}
module.exports.workerBucketOutputPath = workerBucketOutputPath;
module.exports.persistWorkerBucketOutput = persistWorkerBucketOutput;

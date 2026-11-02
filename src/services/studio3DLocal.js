// Explicit local transport for the existing validated Blender renderer.
// The detached worker writes durable local outcomes; API polling reconciles
// verified artifacts after an API restart without submitting another render.
const fs = require("node:fs/promises"), constants = require("node:fs").constants;
const path = require("node:path"), crypto = require("node:crypto"), { spawn, execFile } = require("node:child_process");
const execute = require("node:util").promisify(execFile);
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value);
function configuration(env = process.env) {
  if (env.STUDIO_3D_LOCAL_ENABLED !== "true") return null;
  if (env.NODE_ENV === "production") throw Error("Local Blender transport is restricted to nonproduction");
  const root = env.STUDIO_3D_LOCAL_ROOT, blender = env.STUDIO_3D_BLENDER_BIN, python = env.STUDIO_3D_PYTHON_BIN;
  if (![root, blender, python].every(value => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0"))) throw Error("Configure absolute local Blender runtime and spool paths");
  const quality = env.STUDIO_3D_LOCAL_QUALITY || "draft";
  if (!["draft", "720p"].includes(quality)) throw Error("Unknown local Blender quality profile");
  const device = env.STUDIO_3D_LOCAL_DEVICE || "cpu";
  if (!["cpu", "cuda"].includes(device)) throw Error("Unknown local Blender device");
  const samples = Number(env.STUDIO_3D_LOCAL_SAMPLES || (quality === "720p" ? 32 : 8));
  if (!(quality === "720p" ? [16, 32] : [8]).includes(samples)) throw Error("Unknown local Blender sample budget");
  return { root: path.resolve(root), blender, python, quality, samples, device, renderer: path.resolve(__dirname, "../../studio_3d_renderer") };
}
async function privateRoot(config) {
  await fs.mkdir(config.root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(config.root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || await fs.realpath(config.root) !== config.root) throw Error("Local Blender spool must be a private real directory");
  await Promise.all([fs.access(config.blender, constants.X_OK), fs.access(config.python, constants.X_OK)]);
}
async function readJson(file, limit = 512 * 1024) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > limit) throw Error("Invalid local Blender record"); return JSON.parse(await handle.readFile("utf8")); }
  finally { await handle.close(); }
}
async function available(config) {
  await privateRoot(config);
  try { await fs.access(path.join(config.root, "active.json")); throw Error("Local Blender capacity is busy; check the accepted job"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function launch({ config, jobId, spec, sceneHash, bucket, beforeSpawn = async () => {} }) {
  if (!validId(jobId) || !/^[A-Za-z0-9_-]{1,100}$/.test(spec.ownerUid) || !/^[a-f\d]{64}$/.test(sceneHash)) throw Error("Invalid local Blender identity");
  await privateRoot(config);
  const directory = path.join(config.root, jobId); await fs.mkdir(directory, { mode: 0o700 });
  const input = { version: 1, jobId, ownerUid: spec.ownerUid, sceneHash, spec,
    runtime: { device: config.device || "cpu", samples: config.samples || (config.quality === "720p" ? 32 : 8), threads: config.quality === "720p" ? 8 : 4,
      deadlineSeconds: config.quality === "720p" ? 1800 : 900 } },
    serialized = JSON.stringify(input), inputSha256 = sha(serialized);
  await fs.writeFile(path.join(directory, "input.json"), serialized, { flag: "wx", mode: 0o600 });
  if (spec.scene.assetStoragePath) {
    const file = path.join(directory, "asset"); await bucket.file(spec.scene.assetStoragePath).download({ destination: file });
    const stat = await fs.stat(file); if (!stat.size || stat.size > 5 * 1024 ** 2) throw Error("Local Blender image exceeds the owned asset limit");
  }
  const lease = await fs.open(path.join(config.root, "active.json"), "wx", 0o600);
  await lease.writeFile(JSON.stringify({ jobId, inputSha256 })); await lease.close();
  const log = await fs.open(path.join(directory, "worker.log"), "wx", 0o600);
  try {
    const execution = { executionName: `local-blender/${jobId}`, localInputSha256: inputSha256, localRenderDevice: input.runtime.device, localRenderQuality: config.quality || "draft" };
    await beforeSpawn(execution);
    const child = spawn(process.execPath, [path.join(config.renderer, "local_worker.cjs"), directory, inputSha256, config.blender, config.python], {
      detached: true, stdio: ["ignore", log.fd, log.fd], env: {
        PATH: process.env.PATH, TMPDIR: process.env.TMPDIR || "/tmp", LANG: "C.UTF-8",
        STUDIO_3D_DEVICE: config.device || "cpu", STUDIO_3D_SAMPLES: String(input.runtime.samples),
        STUDIO_3D_THREADS: config.quality === "720p" ? "8" : "4",
      },
    });
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref(); return execution;
  } catch (error) { await fs.unlink(path.join(config.root, "active.json")); throw error; }
  finally { await log.close(); }
}
const reconciling = new Map();
async function reconcile({ config, jobId, data, bucket, jobRef, db }) {
  if (!validId(jobId) || data.executionName !== `local-blender/${jobId}` || !/^[a-f\d]{64}$/.test(data.localInputSha256 || "")) throw Error("Invalid local Blender job binding");
  const key = `${config.root}/${jobId}`;
  if (reconciling.has(key)) return reconciling.get(key);
  const task = (async () => {
    await privateRoot(config); const directory = path.join(config.root, jobId);
    if (await fs.realpath(directory) !== directory) throw Error("Invalid local Blender job directory");
    let outcome;
    try { outcome = await readJson(path.join(directory, "status.json")); }
    catch (error) { if (error.code === "ENOENT") return data; throw error; }
    if (outcome.jobId !== jobId || outcome.inputSha256 !== data.localInputSha256 || outcome.ownerUid !== data.ownerUid || outcome.sceneHash !== data.hash) throw Error("Local Blender outcome does not match the accepted job");
    if (!["completed", "failed"].includes(outcome.status)) return { ...data, status: "rendering" };
    let patch;
    if (outcome.status === "failed") patch = { status: "failed", errorCode: "LOCAL_RENDER_FAILED" };
    else {
      const receipt = await readJson(path.join(directory, "output/receipt.json"));
      const cuda = data.localRenderDevice === "cuda";
      if (receipt.device?.backend !== (cuda ? "CUDA" : "CPU") || receipt.device?.gpu_verified !== cuda ||
          (cuda && (!Array.isArray(receipt.device.devices) || !receipt.device.devices.length))) throw Error("Local Blender device receipt is invalid");
      const artifacts = [];
      for (const [name, contentType, limit] of [["preview.mp4", "video/mp4", 100 * 1024 ** 2], ["overlay.mov", "video/quicktime", 750 * 1024 ** 2]]) {
        const file = path.join(directory, "output", name), expected = receipt.artifacts?.[name], stat = await fs.lstat(file);
        if (!expected || !stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > limit || stat.size !== expected.bytes || sha(await fs.readFile(file)) !== expected.sha256) throw Error("Local Blender artifact failed integrity validation");
        const { stdout } = await execute("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { timeout: 30000, maxBuffer: 1024 * 1024 });
        const probe = JSON.parse(stdout), video = probe.streams?.[0];
        const sculptural = data.spec.scene?.lightingRig === "sculpture";
        if (probe.streams?.length !== 1 || video?.width !== data.spec.width || video?.height !== data.spec.height || Math.abs(Number(probe.format?.duration) - data.spec.duration) > 1 / data.spec.fps || video.codec_name !== (name === "preview.mp4" ? "h264" : sculptural ? "png" : "qtrle") || (name === "overlay.mov" && video.pix_fmt !== (sculptural ? "rgba" : "argb"))) throw Error("Local Blender artifact format does not match the accepted scene");
        const destination = `temp_studio_3d/${data.ownerUid}/${jobId}/${name}`;
        artifacts.push({ file, destination, contentType, sha256: expected.sha256 });
      }
      // Keep uploads bounded. The explicit emulator adapter translates large
      // alpha transfers to Firebase's native resumable protocol.
      for (const artifact of artifacts) await bucket.upload(artifact.file, { destination: artifact.destination,
        resumable: receipt.artifacts[path.basename(artifact.file)].bytes > 100 * 1024 ** 2,
        ...(receipt.artifacts[path.basename(artifact.file)].bytes > 100 * 1024 ** 2 ? { chunkSize: 8 * 1024 ** 2 } : {}),
        metadata: { contentType: artifact.contentType, metadata: { ownerUid: data.ownerUid, sha256: artifact.sha256, jobId } } });
      patch = { status: "completed", previewPath: `temp_studio_3d/${data.ownerUid}/${jobId}/preview.mp4`, overlayPath: `temp_studio_3d/${data.ownerUid}/${jobId}/overlay.mov`,
        previewBytes: receipt.artifacts["preview.mp4"].bytes, overlayBytes: receipt.artifacts["overlay.mov"].bytes, renderReceipt: receipt };
    }
    await db.runTransaction(async tx => {
      const current = await tx.get(jobRef);
      if (current.data()?.localInputSha256 !== data.localInputSha256 || current.data()?.ownerUid !== data.ownerUid || current.data()?.hash !== data.hash) throw Error("Local Blender job changed during reconciliation");
      const leaseRef = db.collection("studio_3d_capacity").doc("global");
      const lease = await tx.get(leaseRef);
      tx.update(jobRef, { ...patch, completedAtMs: Date.now() });
      if (lease.data()?.jobId === jobId) tx.delete(leaseRef);
    });
    return { ...data, ...patch };
  })();
  reconciling.set(key, task); try { return await task; } finally { reconciling.delete(key); }
}
module.exports = { configuration, available, launch, reconcile };

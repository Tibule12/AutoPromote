// Optional retained-NVIDIA transport for the existing Blender renderer. Cloud
// credentials stay in the API: the GPU receives only validated JSON and media.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execute = promisify(execFile);
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";

function configuration(env = process.env, { requireWindow = true } = {}) {
  if (!env.STUDIO_3D_SSH_HOST) return null;
  const host = env.STUDIO_3D_SSH_HOST;
  const root = env.STUDIO_3D_SSH_ROOT;
  const image = env.STUDIO_3D_SSH_IMAGE;
  const lock = env.STUDIO_3D_SSH_LOCK;
  const deadline = Number(env.STUDIO_3D_SSH_DEADLINE_EPOCH);
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,200}$/.test(host) ||
      !/^\/data\/[A-Za-z0-9_/-]+$/.test(root || '') || root.includes('..') ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,200}$/.test(image || '') || image.includes('..') ||
      !/^\/data\/[A-Za-z0-9_/-]+\.lock$/.test(lock || '') || lock.includes('..') ||
      !Number.isSafeInteger(deadline) || deadline <= 0 || (requireWindow && deadline * 1000 < Date.now() + 60000)) {
    throw new Error('Retained NVIDIA 3D configuration or execution window is invalid');
  }
  return { host, root, image, lock, deadline };
}

const sshOptions = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3'];
async function ssh(config, command, timeout = 30000) {
  return execute('ssh', [...sshOptions, config.host, command], { timeout, maxBuffer: 8 * 1024 * 1024 });
}
async function available(config) {
  try {
    await ssh(config, `flock -n -E 75 ${quote(config.lock)} true`);
  } catch (error) {
    if (error.code === 75) throw new Error('3D preview capacity is busy; retry shortly');
    throw new Error('Retained NVIDIA renderer is unreachable');
  }
}
async function copy(config, local, remote, download = false) {
  const args = ['-q', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];
  const remotePath = `${config.host}:${remote}`;
  await execute('scp', [...args, ...(download ? [remotePath, local] : [local, remotePath])], {
    timeout: 120000, maxBuffer: 1024 * 1024,
  });
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(file, 'r');
  try { for await (const chunk of handle.createReadStream()) hash.update(chunk); }
  finally { await handle.close(); }
  return hash.digest('hex');
}

function boundedLaunch(config, container, remote, assetArgs = '', now = Date.now()) {
  const remaining = Math.floor(config.deadline - now / 1000) - 15;
  if (remaining < 60) throw new Error('NVIDIA execution window expired');
  const wait = Math.min(900, remaining - 60);
  // Capacity can change while the validated scene is being uploaded. Queue
  // this already accepted job on the same lock, then recalculate its execution
  // budget after acquisition. Both the wait and render obey the original cutoff.
  const launch = `studio_remaining=$((${config.deadline}-$(date +%s)-15)); ` +
    `[ "$studio_remaining" -ge 60 ] || exit 76; ` +
    `[ "$studio_remaining" -le 900 ] || studio_remaining=900; ` +
    `exec timeout --signal=TERM --kill-after=15s "$studio_remaining"s docker run --rm --name ${quote(container)} --gpus all --runtime nvidia --network none --user "$(id -u):$(id -g)" -e HOME=/tmp -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video,graphics,display -e STUDIO_3D_DEVICE=optix -v ${quote(remote + ':/job')} -v ${quote(remote + '/renderer:/app:ro')} ${quote(config.image)} --spec /job/spec.json --output /job/output${assetArgs}`;
  const total = Math.min(remaining, wait + 900);
  return { command: `timeout --signal=TERM --kill-after=15s ${total}s flock -w ${wait} -E 75 ${quote(config.lock)} sh -c ${quote(launch)}`,
    timeoutMs: (total + 30) * 1000 };
}

async function render({ config, jobId, spec, bucket, onRendering }) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(jobId) || !/^[A-Za-z0-9_-]{1,100}$/.test(spec.ownerUid)) throw new Error('Invalid NVIDIA job identity');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-3d-'));
  const remote = `${config.root}/${jobId}`;
  const container = `autopromote-studio-3d-${jobId}`;
  let launched = false;
  try {
    await ssh(config, `umask 077; mkdir -p ${quote(remote + '/renderer/assets')} ${quote(remote + '/output')}`);
    const renderer = path.resolve(__dirname, '../..', 'studio_3d_renderer');
    for (const name of ['spec.py', 'render.py', 'blender_scene.py', 'brand_ident.py', 'vector_geometry.py', 'assets/autopromote-vector-logo.json']) await copy(config, path.join(renderer, name), `${remote}/renderer/${name}`);
    const specFile = path.join(directory, 'spec.json');
    await fs.writeFile(specFile, JSON.stringify(spec), { mode: 0o600 });
    await copy(config, specFile, `${remote}/spec.json`);
    let assetArgs = '';
    if (spec.scene.assetStoragePath) {
      const expected = `temp_studio_3d/${spec.ownerUid}/${jobId}/asset.`;
      if (!spec.scene.assetStoragePath.startsWith(expected) || !/^(png|jpg|webp)$/.test(spec.scene.assetStoragePath.slice(expected.length))) throw new Error('Invalid NVIDIA asset path');
      const asset = path.join(directory, 'asset');
      await bucket.file(spec.scene.assetStoragePath).download({ destination: asset });
      const data = await fs.readFile(asset);
      if (!data.length || data.length > 5 * 1024 * 1024 || !(
        data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
        data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ||
        (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP')
      )) throw new Error('Invalid NVIDIA image content');
      await copy(config, asset, `${remote}/asset`);
      assetArgs = ' --asset /job/asset';
    }
    // There is no instance-start operation here. The shared lock prevents a
    // Studio render from overlapping a Factory/model job on the retained GPU.
    const launch = boundedLaunch(config, container, remote, assetArgs);
    await onRendering();
    launched = true;
    await ssh(config, launch.command, launch.timeoutMs);
    await copy(config, path.join(directory, 'receipt.json'), `${remote}/output/receipt.json`, true);
    const receipt = JSON.parse(await fs.readFile(path.join(directory, 'receipt.json'), 'utf8'));
    if (receipt.device?.gpu_verified !== true || receipt.device.backend !== 'OPTIX' || !Array.isArray(receipt.device.devices) || !receipt.device.devices.some(name => /L40S/.test(name))) throw new Error('NVIDIA GPU execution was not verified');
    const outputs = [];
    for (const [name, type, limit] of [['preview.mp4', 'video/mp4', 100 * 1024 * 1024], ['overlay.mov', 'video/quicktime', 750 * 1024 * 1024]]) {
      const expected = receipt.artifacts?.[name];
      if (!expected || !Number.isSafeInteger(expected.bytes) || expected.bytes <= 0 || expected.bytes > limit || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error('Invalid NVIDIA output receipt');
      const file = path.join(directory, name);
      await copy(config, file, `${remote}/output/${name}`, true);
      if ((await fs.stat(file)).size !== expected.bytes || await hashFile(file) !== expected.sha256) throw new Error('NVIDIA artifact transfer failed integrity validation');
      const { stdout } = await execute('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30000 });
      const probe = JSON.parse(stdout);
      const video = probe.streams?.[0];
      if (probe.streams?.length !== 1 || video?.codec_type !== 'video' || video.width !== spec.width || video.height !== spec.height || Math.abs(Number(probe.format?.duration) - spec.duration) > .1 || video.codec_name !== (name === 'preview.mp4' ? 'h264' : 'qtrle') || (name === 'overlay.mov' && video.pix_fmt !== 'argb')) throw new Error('NVIDIA output failed independent validation');
      await execute('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { timeout: 120000, maxBuffer: 1024 * 1024 });
      const destination = `temp_studio_3d/${spec.ownerUid}/${jobId}/${name}`;
      await bucket.upload(file, { destination, resumable: false, metadata: { contentType: type, metadata: { ownerUid: spec.ownerUid, sha256: expected.sha256 } } });
      outputs.push({ name, destination, ...expected });
    }
    return { receipt, outputs };
  } finally {
    if (launched) await ssh(config, `docker stop -t 5 ${quote(container)} >/dev/null 2>&1 || true`, 20000).catch(() => {});
    // Remove only this UUID's data. Cleanup errors cannot turn a valid artifact
    // into a render failure; expiry cleanup remains a separate concern.
    await ssh(config, `rm -rf -- ${quote(remote)}`, 20000).catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { configuration, available, render, boundedLaunch };

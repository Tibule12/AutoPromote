const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const local = require('../src/services/studio3DLocalDurable');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let root, fixture;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-local-boundary-'));
  fixture = path.join(root, 'fixture'); await fs.mkdir(fixture);
  for (const [name, codec, pixels] of [['preview.mp4', 'libx264', 'yuv420p'], ['overlay.mov', 'qtrle', 'argb']]) {
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=purple:s=160x160:r=12:d=0.5', '-c:v', codec, '-pix_fmt', pixels, '-an', path.join(fixture, name)]);
  }
});
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });
test('local execution must be explicitly enabled and cannot run as production', () => {
  expect(local.configuration({})).toBeNull();
  expect(() => local.configuration({ STUDIO_3D_LOCAL_ENABLED: 'true', NODE_ENV: 'production' })).toThrow('nonproduction');
  expect(() => local.configuration({ STUDIO_3D_LOCAL_ENABLED: 'true', STUDIO_3D_LOCAL_ROOT: '../spool' })).toThrow('absolute');
});
test('720p sample budgets stay explicit and bounded while legacy defaults remain', () => {
  const env={STUDIO_3D_LOCAL_ENABLED:'true',STUDIO_3D_LOCAL_ROOT:'/tmp/private-spool',STUDIO_3D_BLENDER_BIN:'/usr/bin/true',STUDIO_3D_PYTHON_BIN:'/usr/bin/true',STUDIO_3D_LOCAL_QUALITY:'720p'};
  expect(local.configuration(env).samples).toBe(32);
  expect(local.configuration({...env,STUDIO_3D_LOCAL_SAMPLES:'16'}).samples).toBe(16);
  for(const value of ['0','8','17','1024','NaN'])expect(()=>local.configuration({...env,STUDIO_3D_LOCAL_SAMPLES:value})).toThrow('sample budget');
});
async function accepted(suffix) {
  const spool = path.join(root, suffix); await fs.mkdir(spool, { mode: 0o700 });
  const jobId = 'accepted-job-123', directory = path.join(spool, jobId); await fs.mkdir(path.join(directory, 'output'), { recursive: true });
  const inputSha = 'a'.repeat(64), sceneHash = 'b'.repeat(64);
  const outcome = { jobId, ownerUid: 'owner', inputSha256: inputSha, sceneHash, status: 'completed' };
  const receipt = { device: { backend: 'CPU', gpu_verified: false }, artifacts: {} };
  for (const name of ['preview.mp4', 'overlay.mov']) {
    const bytes = await fs.readFile(path.join(fixture, name)); await fs.writeFile(path.join(directory, 'output', name), bytes);
    receipt.artifacts[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  await fs.writeFile(path.join(directory, 'output/receipt.json'), JSON.stringify(receipt));
  await fs.writeFile(path.join(directory, 'status.json'), JSON.stringify(outcome));
  const data = { ownerUid: 'owner', localInputSha256: inputSha, hash: sceneHash, executionName: `local-blender/${jobId}`, status: 'queued', spec: { width: 160, height: 160, duration: .5, fps: 12 } };
  const tx = { get: jest.fn(async ref => ({ data: () => ref === 'job' ? data : { jobId } })), update: jest.fn(), delete: jest.fn() };
  const db = { runTransaction: fn => fn(tx), collection: () => ({ doc: () => 'lease' }) }, bucket = { upload: jest.fn() };
  return { config: { root: spool, blender: '/usr/bin/true', python: '/usr/bin/true' }, jobId, data, bucket, db, jobRef: 'job', directory, outcome, receipt, tx };
}
test('a fresh API reconciles real validated files once under simultaneous owner polls', async () => {
  const args = await accepted('restart');
  const [first, second] = await Promise.all([local.reconcile(args), local.reconcile(args)]);
  expect(first.status).toBe('completed'); expect(second.status).toBe('completed');
  expect(args.bucket.upload).toHaveBeenCalledTimes(2);
  expect(args.tx.update).toHaveBeenCalledTimes(1); expect(args.tx.delete).toHaveBeenCalledWith('lease');
  expect(args.bucket.upload.mock.calls[1][1].destination).toBe('temp_studio_3d/owner/accepted-job-123/overlay.mov');
});
test.each(['ownerUid', 'sceneHash', 'inputSha256'])('rejects another accepted request’s %s before uploading', async field => {
  const args = await accepted(`binding-${field}`);
  await fs.writeFile(path.join(args.directory, 'status.json'), JSON.stringify({ ...args.outcome, [field]: 'wrong-binding' }));
  await expect(local.reconcile(args)).rejects.toThrow('accepted job'); expect(args.bucket.upload).not.toHaveBeenCalled();
});
test('rejects altered overlay bytes before accepting the completed result', async () => {
  const args = await accepted('corrupt'); await fs.appendFile(path.join(args.directory, 'output/overlay.mov'), 'modified');
  await expect(local.reconcile(args)).rejects.toThrow('integrity'); expect(args.tx.update).not.toHaveBeenCalled();
  expect(args.bucket.upload).not.toHaveBeenCalled();
});
test('rejects dimensions that differ from the accepted profile', async () => {
  const args = await accepted('dimensions'); args.data.spec.width = 320;
  await expect(local.reconcile(args)).rejects.toThrow('format'); expect(args.bucket.upload).not.toHaveBeenCalled();
});
test('an ambiguous accepted job keeps its state and capacity without rerunning', async () => {
  const args = await accepted('ambiguous'); await fs.unlink(path.join(args.directory, 'status.json'));
  expect(await local.reconcile(args)).toEqual(args.data);
  expect(args.bucket.upload).not.toHaveBeenCalled(); expect(args.tx.delete).not.toHaveBeenCalled();
  await fs.writeFile(path.join(args.config.root, 'active.json'), '{}');
  await expect(local.available(args.config)).rejects.toThrow('busy');
});
test('an accepted local CUDA job requires actual GPU evidence and never silently settles a CPU fallback', async () => {
  const args = await accepted('cuda'); args.data.localRenderDevice = 'cuda';
  await expect(local.reconcile(args)).rejects.toThrow('device receipt'); expect(args.bucket.upload).not.toHaveBeenCalled();
  args.receipt.device = { backend: 'CUDA', gpu_verified: true, devices: ['controlled-test-device'] };
  await fs.writeFile(path.join(args.directory, 'output/receipt.json'), JSON.stringify(args.receipt));
  expect((await local.reconcile(args)).status).toBe('completed');
});
test('sculptural input requires its exact lossless PNG alpha profile while legacy input retains qtrle', async () => {
  const args = await accepted('sculptural'); args.data.spec.scene = { lightingRig: 'sculpture' };
  await expect(local.reconcile(args)).rejects.toThrow('format'); expect(args.bucket.upload).not.toHaveBeenCalled();
  const file = path.join(args.directory, 'output/overlay.mov');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=purple:s=160x160:r=12:d=0.5', '-c:v', 'png', '-pix_fmt', 'rgba', '-an', file]);
  const bytes = await fs.readFile(file); args.receipt.artifacts['overlay.mov'] = { bytes: bytes.length, sha256: hash(bytes) };
  await fs.writeFile(path.join(args.directory, 'output/receipt.json'), JSON.stringify(args.receipt));
  expect((await local.reconcile(args)).status).toBe('completed');
});

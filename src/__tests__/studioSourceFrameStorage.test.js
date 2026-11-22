const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const mockResolve = jest.fn();
const mockFile = jest.fn();
jest.mock('../services/studioSourceService', () => ({
  resolveOwnedStudioVideoSource: (...args) => mockResolve(...args),
  getStudioSourceBucket: () => ({ file: (...args) => mockFile(...args) }),
  sourceError: (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code }),
}));

let service;
let video;
beforeAll(() => {
  video = execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=s=64x48:r=30:d=1',
    '-c:v','libx264','-threads','1','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1']);
});
const request = { storagePath: 'studio/sources/owner/movie.mp4', sourceGeneration: '123',
  start: 0, end: 1, fps: 30, frameIndex: 5 };
const owned = { kind: 'durable_studio', bucketName: 'owned-bucket', storagePath: request.storagePath,
  generation: '123', size: 1024 };
beforeEach(() => {
  jest.resetModules(); mockResolve.mockReset(); mockFile.mockReset();
  service = require('../services/studioSourceFrameService');
  mockResolve.mockResolvedValue(owned);
});
afterEach(() => jest.restoreAllMocks());

test('a source above 128MiB streams to private disk and exact paused pixels survive cache reuse', async () => {
  // A legal MP4 free atom makes this a real large container without a large
  // allocation in the test or service. Network CRC validation remains enabled.
  const padding = 129 * 1024 * 1024, header = Buffer.alloc(8);
  header.writeUInt32BE(padding + 8); header.write('free', 4);
  const hash = crypto.createHash('sha256');
  const stream = jest.fn(() => Readable.from((async function* () {
    for (const chunk of [video, header]) { hash.update(chunk); yield chunk; }
    const block = Buffer.alloc(64 * 1024);
    for (let bytes = 0; bytes < padding; bytes += block.length) { hash.update(block); yield block; }
  })()));
  mockResolve.mockResolvedValue({ ...owned, size: video.length + 8 + padding });
  mockFile.mockReturnValue({ createReadStream: stream });
  const dirs = jest.spyOn(fs, 'mkdtemp');
  const frame = await service.getOwnedSourceFrame({ ownerUid: 'owner', input: request });
  expect(frame.sourceContentHash).toBe(hash.digest('hex'));
  expect(mockFile).toHaveBeenCalledWith(request.storagePath, { generation: '123' });
  expect(stream).toHaveBeenCalledWith({ validation: 'crc32c', decompress: false });
  const folder = await dirs.mock.results[0].value;
  expect((await fs.stat(folder)).mode & 0o777).toBe(0o700);
  expect((await fs.stat(folder+'/source')).mode & 0o777).toBe(0o600);
  const second = await service.getOwnedSourceFrame({ ownerUid: 'owner', input: { ...request, sourceContentHash: frame.sourceContentHash } });
  expect(second.imageContentHash).toBe(frame.imageContentHash);
  expect(stream).toHaveBeenCalledTimes(1);
  expect(mockResolve).toHaveBeenCalledTimes(2);
  mockResolve.mockRejectedValueOnce(Object.assign(new Error('Not owned'), { statusCode: 403 }));
  await expect(service.getOwnedSourceFrame({ ownerUid: 'other', input: request })).rejects.toMatchObject({ statusCode: 403 });
  await expect(service.getOwnedSourceFrame({ ownerUid: 'owner', input: { ...request, sourceContentHash: '0'.repeat(64) } })).rejects.toMatchObject({ code: 'STUDIO_FRAME_SOURCE_CHANGED' });
  await fs.rm(folder, { recursive: true, force: true });
});

test.each(['overrun', 'truncated', 'cancel'])('failed %s download removes private partial bytes and permits retry', async reason => {
  let stream;
  mockFile.mockReturnValue({ createReadStream: () => {
    stream = new Readable({ read() {
      if (reason === 'overrun') { this.push(Buffer.alloc(1025)); this.push(null); }
      if (reason === 'truncated') { this.push(Buffer.alloc(10)); this.push(null); }
    } });
    return stream;
  } });
  const dirs = jest.spyOn(fs, 'mkdtemp');
  const controller = new AbortController();
  const result = service.getOwnedSourceFrame({ ownerUid: 'owner', input: request, signal: controller.signal });
  const assertion = expect(result).rejects.toMatchObject({ code: 'STUDIO_FRAME_SOURCE_UNAVAILABLE' });
  if (reason === 'cancel') {
    while (!stream) await new Promise(resolve => setImmediate(resolve));
    controller.abort();
  }
  await assertion;
  const folder = await dirs.mock.results[0].value;
  await expect(fs.stat(folder)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(stream.destroyed).toBe(true);
  mockResolve.mockResolvedValue({ ...owned, size: video.length });
  mockFile.mockReturnValue({ createReadStream: () => Readable.from([video]) });
  await expect(service.getOwnedSourceFrame({ ownerUid: 'owner', input: request })).resolves.toMatchObject({ contentType: 'image/png' });
  const retryFolder = await dirs.mock.results[1].value;
  await fs.rm(retryFolder, { recursive: true, force: true });
});

test('disk pressure and a source over 512MiB reject before opening storage', async () => {
  mockResolve.mockResolvedValueOnce({ ...owned, size: 512 * 1024 * 1024 + 1 });
  await expect(service.getOwnedSourceFrame({ ownerUid: 'owner', input: request })).rejects.toMatchObject({ code: 'STUDIO_FRAME_SOURCE_LIMIT' });
  jest.spyOn(fs, 'statfs').mockResolvedValue({ bavail: 1, bsize: 4096 });
  await expect(service.getOwnedSourceFrame({ ownerUid: 'owner', input: request })).rejects.toMatchObject({ code: 'STUDIO_FRAME_DISK_BUSY' });
  expect(mockFile).not.toHaveBeenCalled();
});

test('a RAM-backed temporary filesystem cannot turn the disk allowance into API memory', async () => {
  mockResolve.mockResolvedValue({ ...owned, size: 300 * 1024 * 1024 });
  jest.spyOn(fs, 'statfs').mockResolvedValue({ type: 0x01021994, bavail: 1024 * 1024, bsize: 4096 });
  await expect(service.getOwnedSourceFrame({ ownerUid: 'owner', input: request })).rejects.toMatchObject({ code: 'STUDIO_FRAME_SOURCE_LIMIT' });
  expect(mockFile).not.toHaveBeenCalled();
});

test('concurrent large sources reserve disk before download and cannot exceed the shared cache budget', async () => {
  const controllers = [new AbortController(), new AbortController()];
  let stream;
  mockResolve.mockImplementation(async ({storagePath}) => ({ ...owned, storagePath, size: 512 * 1024 * 1024 }));
  mockFile.mockReturnValue({ createReadStream: () => (stream = new Readable({ read() {} })) });
  const first = service.getOwnedSourceFrame({ ownerUid: 'owner', input: request, signal: controllers[0].signal });
  const firstAssert = expect(first).rejects.toMatchObject({ code: 'STUDIO_FRAME_SOURCE_UNAVAILABLE' });
  while (!stream) await new Promise(resolve => setImmediate(resolve));
  await expect(service.getOwnedSourceFrame({ ownerUid: 'other', input: { ...request, storagePath: 'studio/sources/other/movie.mp4' }, signal: controllers[1].signal }))
    .rejects.toMatchObject({ statusCode: 429, code: 'STUDIO_FRAME_BUSY' });
  expect(mockFile).toHaveBeenCalledTimes(1);
  controllers[0].abort(); await firstAssert;
});

test('pending downloads cannot overcommit free disk even when their total fits the cache cap', async () => {
  const controller = new AbortController();
  let stream;
  mockResolve.mockImplementation(async ({storagePath}) => ({ ...owned, storagePath, size: 256 * 1024 * 1024 }));
  jest.spyOn(fs, 'statfs').mockResolvedValue({ type: 0xef53, bavail: 512 * 1024, bsize: 1024 });
  mockFile.mockReturnValue({ createReadStream: () => (stream = new Readable({ read() {} })) });
  const first = service.getOwnedSourceFrame({ ownerUid: 'owner', input: request, signal: controller.signal });
  const firstAssert = expect(first).rejects.toMatchObject({ code: 'STUDIO_FRAME_SOURCE_UNAVAILABLE' });
  while (!stream) await new Promise(resolve => setImmediate(resolve));
  await expect(service.getOwnedSourceFrame({ ownerUid: 'other', input: { ...request, storagePath: 'studio/sources/other/movie.mp4' } }))
    .rejects.toMatchObject({ code: 'STUDIO_FRAME_DISK_BUSY' });
  expect(mockFile).toHaveBeenCalledTimes(1);
  controller.abort(); await firstAssert;
});

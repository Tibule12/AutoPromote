const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
jest.mock('../services/studioSourceService', () => ({
  ...jest.requireActual('../services/studioSourceService'),
  resolveOwnedStudioMediaSource: jest.fn(), getStudioSourceBucket: jest.fn(),
}));
const stores = require('../services/studioSourceService');
const { validateVoiceBusRequest, getOwnedVoiceBusPreview, renderVoiceBusPreview } = require('../services/studioVoiceBusPreviewService');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let folder, bytes;
const input = () => ({ version: 1, projectId: 'actual-voice-test', voices: [{ id: 'speech',
  storagePath: 'uploads/audios/owner/take.wav', sourceContentHash: digest(bytes),
  startTime: .5, duration: 1, trimStart: .1, volume: .7, fadeIn: .1, fadeOut: .1 }],
  speedPlan: [{ start_time: 0, end_time: 2, rate: 1 }], automation: [],
  ducking: { enabled: true, strength: .4 } });
beforeAll(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-voice-preview-test-'));
  const file = path.join(folder, 'source.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=2',
    '-af', 'volume=4', '-y', file]); bytes = await fs.readFile(file);
});
afterAll(async () => { await fs.rm(folder, { recursive: true, force: true }); });
beforeEach(() => {
  stores.resolveOwnedStudioMediaSource.mockReset(); stores.getStudioSourceBucket.mockReset();
  stores.resolveOwnedStudioMediaSource.mockImplementation(async ({ userId, storagePath }) => {
    if (userId !== 'owner') throw stores.sourceError(403, 'FORBIDDEN', 'Different owner');
    return { storagePath, size: bytes.length, contentType: 'audio/wav', generation: '1', kind: 'user_upload' };
  });
  stores.getStudioSourceBucket.mockReturnValue({ file: () => ({ createReadStream: () => Readable.from(bytes) }) });
});
test('rejects external URLs, non-contiguous clocks, duplicate takes, excessive work and invalid gains', () => {
  expect(validateVoiceBusRequest(input()).projectId).toBe('actual-voice-test');
  for (const change of [{ url: 'file:///etc/passwd' }, { voices: [input().voices[0], input().voices[0]] },
    { speedPlan: [{ start_time: .5, end_time: 2, rate: 1 }] },
    { speedPlan: [{ start_time: 0, end_time: 90, rate: .25 }] },
    { voices: [{ ...input().voices[0], volume: 200 }] }, { ducking: { enabled: true, strength: NaN } }])
    expect(() => validateVoiceBusRequest({ ...input(), ...change })).toThrow('parameters');
});
test('real CPU samples and compressor gains are hash-bound; cached requests recheck ownership', async () => {
  const result = await getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input() });
  expect(result.sampleCount).toBe(96000); expect(result.device).toBe('cpu');
  expect(digest(Buffer.from(result.voiceBase64, 'base64'))).toBe(result.voiceHash);
  const data = Buffer.from(result.duckBase64, 'base64');
  expect(digest(data)).toBe(result.duckHash);
  const at = seconds => data.readFloatLE(Math.round(seconds*48000)*4);
  expect(at(.25)).toBe(1); expect(at(.9)).toBeLessThan(.5); expect(at(1.95)).toBeGreaterThan(at(.9));
  expect(await getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input() })).toEqual(result);
  expect(stores.resolveOwnedStudioMediaSource).toHaveBeenCalledTimes(2);
  await expect(getOwnedVoiceBusPreview({ ownerUid: 'other', input: input() })).rejects.toMatchObject({ statusCode: 403 });
}, 20000);
test('changed source bytes and oversized objects fail before a preview can be returned', async () => {
  await expect(getOwnedVoiceBusPreview({ ownerUid: 'owner', input: {
    ...input(), voices: [{ ...input().voices[0], sourceContentHash: 'a'.repeat(64) }],
  } })).rejects.toMatchObject({ statusCode: 409 });
  stores.resolveOwnedStudioMediaSource.mockResolvedValue({ contentType: 'audio/wav', size: 9*1024*1024, generation: '2' });
  await expect(getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input() })).rejects.toMatchObject({ statusCode: 422 });
});

test('retained fade clocks are bounded, complete and part of prepared speech identity', async () => {
  const { validateVoiceBusRequest } = require('../services/studioVoiceBusPreviewService');
  const request = input();
  request.voices[0] = { ...request.voices[0], fadeOffset: 1, fadeDuration: 4 };
  expect(validateVoiceBusRequest(request)).toBe(request);
  const original = await getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input() });
  const retained = await getOwnedVoiceBusPreview({ ownerUid: 'owner', input: request });
  expect(retained.parametersHash).not.toBe(original.parametersHash);
  for (const phase of [{ fadeOffset: 1 }, { fadeDuration: 4 }, { fadeOffset: -1, fadeDuration: 4 },
    { fadeOffset: 4, fadeDuration: 4 }, { fadeOffset: 0, fadeDuration: 7201 }]) {
    expect(() => validateVoiceBusRequest({ ...input(), voices: [{ ...input().voices[0], ...phase }] })).toThrow();
  }
});
test('a cancelled request releases its owner slot and kills its decoder process group', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input(), signal: controller.signal }))
    .rejects.toMatchObject({ statusCode: 499 });
  await expect(renderVoiceBusPreview(folder, input(), controller.signal)).rejects.toMatchObject({ statusCode: 499 });
  expect((await getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input() })).sampleCount).toBe(96000);
});

test('cancelling while Storage awaits its response does not destroy its uninitialized internal pipeline', async () => {
  const { PassThrough } = require('node:stream');
  const stream = new PassThrough(), controller = new AbortController();
  let started;
  const reading = new Promise(resolve => { started = resolve; });
  stores.getStudioSourceBucket.mockReturnValueOnce({ file: () => ({ createReadStream: () => { started(); return stream; } }) });
  const pending = getOwnedVoiceBusPreview({ ownerUid: 'owner',
    input: { ...input(), projectId: 'pending-storage-cancel' }, signal: controller.signal });
  const checked = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await reading; controller.abort();
  expect(stream.destroyed).toBe(false);
  stream.end(bytes); await checked;
  expect(stream.destroyed).toBe(true);
  expect((await getOwnedVoiceBusPreview({ ownerUid: 'owner', input: input() })).sampleCount).toBe(96000);
});
test('an owned object cannot smuggle a playlist or external file reference into the decoder', async () => {
  const original = bytes;
  try {
    bytes = Buffer.from(`ffconcat version 1.0\nfile '${path.join(folder, 'source.wav')}'\n`);
    await expect(getOwnedVoiceBusPreview({ ownerUid: 'owner', input: { ...input(), projectId: 'unsafe-demuxer-test' } }))
      .rejects.toMatchObject({ statusCode: 503, code: 'STUDIO_VOICE_PREVIEW_RUNTIME' });
  } finally { bytes = original; }
});

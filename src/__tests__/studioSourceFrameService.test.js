const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateFrameRequest, decodeSourceFrame } = require('../services/studioSourceFrameService');

const request = { storagePath: 'studio/sources/owner/video.mp4', sourceContentHash: 'a'.repeat(64),
  start: .125, end: 1.125, fps: 24, frameIndex: 5 };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('sampling cannot accept caller URLs, invalid windows or a frame outside the trim', () => {
  expect(validateFrameRequest(request)).toBe(request);
  for (const extra of [{ url: 'file:///etc/passwd' }, { start: -1 }, { end: 100 },
    { fps: Infinity }, { fps: 0 }, { frameIndex: 24 }, { frameIndex: .5 }, { sourceContentHash: 'bad' }]) {
    expect(() => validateFrameRequest({ ...request, ...extra })).toThrow('inside a saved source');
  }
});

test('legacy requests require an exact generation and cannot weaken a supplied digest', () => {
  const { sourceContentHash, ...legacy } = request;
  expect(() => validateFrameRequest(legacy)).toThrow('inside a saved source');
  expect(validateFrameRequest({ ...legacy, sourceGeneration: '1791917104896000' })).toMatchObject({ sourceGeneration: '1791917104896000' });
  for (const sourceGeneration of [12, '0', '-1', '1e3', 'x', '1'.repeat(33)])
    expect(() => validateFrameRequest({ ...legacy, sourceGeneration })).toThrow('inside a saved source');
  expect(() => validateFrameRequest({ ...legacy, sourceGeneration: '12', sourceContentHash: 'bad' })).toThrow('inside a saved source');
});

describe('actual FFmpeg sampling matches a separately decoded full sequence', () => {
  let folder;
  beforeAll(async () => { folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-frame-test-')); });
  afterAll(async () => { await fs.rm(folder, { recursive: true, force: true }); });
  test.each(['24000/1001', '30', 'variable'])('%s source with fractional trim', async rate => {
    const source = path.join(folder, `${rate.replace('/', '-')}.mkv`);
    const filter = rate === 'variable' ?
      'testsrc2=size=320x180:rate=60:duration=2,select=if(lt(t\\,1)\\,not(mod(n\\,2))\\,not(mod(n\\,3)))' :
      `testsrc2=size=320x180:rate=${rate}:duration=2`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', filter,
      '-fps_mode', 'vfr', '-c:v', 'ffv1', '-y', source]);
    const frames = path.join(folder, `${rate.replace('/', '-')}-frame-%02d.png`);
    // Independent whole trimmed sequence, without the sampler's select filter.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '0.125', '-i', source,
      '-t', '1', '-vf', 'fps=24,setpts=PTS-STARTPTS', '-an', '-threads', '2', '-y', frames]);
    for (const index of [0, 1, 5, 17, 23]) {
      const actual = await decodeSourceFrame(source, { ...request, frameIndex: index });
      const expected = await fs.readFile(frames.replace('%02d', String(index+1).padStart(2, '0')));
      expect(digest(actual)).toBe(digest(expected));
    }
  }, 20000);
  test('a cancelled seek cannot leave its FFmpeg decoder running', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(decodeSourceFrame(path.join(folder, '30.mkv'), request, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

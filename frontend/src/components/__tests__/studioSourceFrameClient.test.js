import { loadStudioSourceFrame } from '../studioSourceFrameClient';
import { getMediaAuthToken } from '../../utils/mediaAuth';
jest.mock('../../utils/mediaAuth', () => ({ getMediaAuthToken: jest.fn() }));

const request = { storagePath: 'studio/sources/owner/video.mp4', sourceContentHash: 'a'.repeat(64),
  start: 0, end: 1, fps: 24, frameIndex: 3 };
const receipt = { ...request, sampler: 'studio-sequence-source-frame-v1', contentType: 'image/png', image: 'source-picture' };
const RealImage = global.Image;
beforeEach(() => {
  getMediaAuthToken.mockResolvedValue('owned-session');
  global.fetch = jest.fn();
  global.Image = class { set src(value) { this._src=value; if(value) Promise.resolve().then(() => this.onload?.()); } };
});
afterEach(() => { global.Image=RealImage; jest.clearAllMocks(); });
const response = result => ({ ok: true, status: 200, json: async () => result });

test('normal authenticated sampling returns only the requested source picture', async () => {
  fetch.mockResolvedValue(response(receipt));
  const frame = await loadStudioSourceFrame(request, new AbortController().signal);
  expect(frame.receipt.frameIndex).toBe(3);
  expect(frame.image._src).toBe('data:image/png;base64,source-picture');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer owned-session');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(request);
});

test('a valid source hash cannot disguise another fractional programme phase', async () => {
  const fractional={...request,sampling:'studio-sequence-source-frame-v2',programmeStart:.7,programmeDuration:2};
  for (const patch of [{programmeStart:.71},{programmeDuration:3},{sampling:undefined},{sampler:receipt.sampler}]) {
    fetch.mockResolvedValue(response({...receipt,...fractional,sampler:fractional.sampling,...patch}));
    await expect(loadStudioSourceFrame(fractional,new AbortController().signal)).rejects.toThrow('receipt does not match');
  }
  fetch.mockResolvedValue(response({...receipt,...fractional,sampler:fractional.sampling}));
  expect((await loadStudioSourceFrame(fractional,new AbortController().signal)).receipt.sampler).toBe(fractional.sampling);
});

test.each([{ sourceContentHash: 'b'.repeat(64) }, { frameIndex: 4 },
  { sampler: 'studio-3d-texture-frame-v1' }, { fps: 30 }])('a mismatched receipt cannot become a programme picture: %s', async patch => {
  fetch.mockResolvedValue(response({ ...receipt, ...patch }));
  await expect(loadStudioSourceFrame(request, new AbortController().signal)).rejects.toThrow('receipt does not match');
});

test('a cancelled queued seek never starts another source decoder', async () => {
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
  const first=loadStudioSourceFrame(request,new AbortController().signal);
  const cancelled=new AbortController();
  const second=loadStudioSourceFrame({ ...request, frameIndex: 4 },cancelled.signal);
  const rejected=expect(second).rejects.toMatchObject({name:'AbortError'});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(fetch).toHaveBeenCalledTimes(1);
  cancelled.abort();finish(response(receipt));await first;await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('texture and programme callers share the same queue and bound sampler identity', async () => {
  const texture={...request,fps:30,sampling:'studio-3d-texture-frame-v1'};
  fetch.mockResolvedValue(response({...receipt,...texture,sampler:texture.sampling}));
  const frame=await loadStudioSourceFrame(texture,new AbortController().signal);
  expect(frame.receipt.sampler).toBe(texture.sampling);
});

test('an unauthenticated inspection cannot request source bytes', async () => {
  getMediaAuthToken.mockResolvedValue(null);
  await expect(loadStudioSourceFrame(request,new AbortController().signal)).rejects.toThrow('unavailable');
  expect(fetch).not.toHaveBeenCalled();
});

test('an abandoned source preparation can settle before the latest seek retries', async () => {
  fetch.mockResolvedValue(response(receipt));
  for(let index=0;index<3;index++)fetch.mockResolvedValueOnce({ok:false,status:429,json:async()=>({code:'STUDIO_FRAME_BUSY'})});
  const frame=await loadStudioSourceFrame(request,new AbortController().signal);
  expect(frame.receipt.frameIndex).toBe(3);
  expect(fetch).toHaveBeenCalledTimes(4);
});

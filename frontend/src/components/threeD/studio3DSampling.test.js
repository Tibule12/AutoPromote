import { studio3DFrameSample, studio3DTextureFrameRequest, studio3DCanShareVideo } from './studio3DSampling';

const scene = { startTime: 5.5, duration: 3.3, assetType: 'video', assetSourceStart: 5.5,
  assetStoragePath: 'studio/sources/owner/video.mp4', assetContentHash: 'a'.repeat(64) };

test('24fps programme frames hold the same 30fps scene sample as native alpha', () => {
  expect(studio3DFrameSample(scene, 197/24)).toEqual({ frameIndex: 81, localTime: 2.7, programmeTime: 8.2 });
  expect(studio3DFrameSample(scene, 6.5).frameIndex).toBe(30);
  expect(studio3DFrameSample(scene, 6.166666).frameIndex).toBe(20);
  expect(studio3DFrameSample(scene, 6.166667).frameIndex).toBe(20);
  expect(studio3DFrameSample(scene, 6.16665).frameIndex).toBe(19);
});

test('shared decoding requires the same owned bytes, path, current frame and source time', () => {
  const source={video:{readyState:2,seeking:false},contentHash:scene.assetContentHash,
    storagePath:scene.assetStoragePath,sourceTime:6.5};
  expect(studio3DCanShareVideo(scene,6.5,source)).toBe(true);
  for(const patch of [{contentHash:'b'.repeat(64)},{storagePath:'other.mp4'},
    {sourceTime:6.5+1/24},{sourceTime:NaN},{video:{readyState:2,seeking:true}},{video:{readyState:1}}])
    expect(studio3DCanShareVideo(scene,6.5,{...source,...patch})).toBe(false);
  expect(studio3DCanShareVideo({...scene,assetSourceStart:6},6.5,source)).toBe(false);
});

test('frame rounding cannot extend an enabled scene across either visibility boundary', () => {
  for (const time of [5.499999, 8.8, NaN, Infinity]) expect(studio3DFrameSample(scene, time)).toBeNull();
  expect(studio3DFrameSample({ ...scene, enabled: false }, 6.5)).toBeNull();
  expect(studio3DFrameSample(scene, 8.799999).frameIndex).toBe(98);
});

test('texture receipts bind native sampler, source interval and bytes without signed URLs', () => {
  expect(studio3DTextureFrameRequest(scene, 197/24)).toEqual({ storagePath: scene.assetStoragePath,
    sourceContentHash: scene.assetContentHash, start: 5.5, end: 8.8, fps: 30,
    frameIndex: 81, sampling: 'studio-3d-texture-frame-v1' });
  for (const patch of [{ assetType: undefined }, { assetContentHash: '' }, { assetStoragePath: '' },
    { assetSourceStart: -1 }, { duration: 11 }])
    expect(studio3DTextureFrameRequest({ ...scene, ...patch }, 6.5)).toBeNull();
});

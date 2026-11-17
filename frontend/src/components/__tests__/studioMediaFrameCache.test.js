import {
  computePrefetchWindow,
  createStudioFrameRingBuffer,
  createStudioWebCodecsController,
  selectOptimalSourceUrl,
} from "../studioMediaFrameCache";

describe("studioMediaFrameCache", () => {
  test('overlapping captures are skipped and HQ retains the source size', async () => {
    const original=globalThis.createImageBitmap;
    const bitmap={width:640,height:360,close:jest.fn()};
    let finish;
    const capture=jest.fn(()=>new Promise(resolve=>{finish=resolve}));
    globalThis.createImageBitmap=capture;
    const controller=createStudioWebCodecsController();
    const video={readyState:4,videoWidth:1920,videoHeight:1080};
    try {
      const first=controller.captureVideoElementFrame({video,assetId:'source',frameIndex:1,quality:'proxy'});
      expect(capture).toHaveBeenCalledWith(video);
      expect(await controller.captureVideoElementFrame({video,assetId:'source',frameIndex:2,quality:'proxy'})).toBeNull();
      expect(capture).toHaveBeenCalledTimes(1);finish(bitmap);expect(await first).toBe(bitmap);
      expect(await controller.captureVideoElementFrame({video,assetId:'source',frameIndex:1,quality:'proxy'})).toBe(bitmap);
      const hq=controller.captureVideoElementFrame({video,assetId:'source',frameIndex:2,quality:'hq'});
      expect(capture).toHaveBeenLastCalledWith(video);finish({...bitmap,width:1920,height:1080});await hq;
    } finally {controller.destroy();globalThis.createImageBitmap=original;}
  });
  test('a capture resolving after controller teardown closes its bitmap without caching it', async () => {
    const original=globalThis.createImageBitmap;let finish;
    globalThis.createImageBitmap=()=>new Promise(resolve=>{finish=resolve});
    const controller=createStudioWebCodecsController(),bitmap={width:640,height:360,close:jest.fn()};
    try {
      const pending=controller.captureVideoElementFrame({video:{readyState:4,videoWidth:640,videoHeight:360},assetId:'source',frameIndex:1});
      controller.destroy();finish(bitmap);expect(await pending).toBeNull();
      expect(bitmap.close).toHaveBeenCalledTimes(1);expect(controller.cache.stats().frames).toBe(0);
    }finally{controller.destroy();globalThis.createImageBitmap=original;}
  });
  test("selects intra proxy when scrubbing and full resolution when settled", () => {
    const clip = {
      url: "https://cdn.example.com/master_4k.mp4",
      proxyUrl: "https://cdn.example.com/proxy_intra_720p.mp4",
    };
    expect(selectOptimalSourceUrl(clip, { scrubbing: true })).toBe(clip.proxyUrl);
    expect(selectOptimalSourceUrl(clip, { scrubbing: false })).toBe(clip.url);
    expect(selectOptimalSourceUrl({ url: clip.url }, { scrubbing: true })).toBe(clip.url);
  });

  test("computes directional shuttle prefetch windows ahead of travel", () => {
    const forward = computePrefetchWindow({
      currentFrame: 30,
      direction: 1,
      speed: 2,
      totalFrames: 120,
      radius: 4,
    });
    expect(forward[0]).toBe(30);
    expect(forward).toEqual(expect.arrayContaining([32, 34, 36, 38, 28]));

    const reverse = computePrefetchWindow({
      currentFrame: 30,
      direction: -1,
      speed: 1,
      totalFrames: 120,
      radius: 4,
    });
    expect(reverse[0]).toBe(30);
    expect(reverse).toEqual(expect.arrayContaining([29, 28, 27, 26, 31]));
  });

  test("evicts least-recently-used frames and invokes .close() on VideoFrame/ImageBitmap handles", () => {
    const closed = [];
    const makeFrame = id => ({
      width: 100,
      height: 100,
      close: () => closed.push(id),
    });

    const ring = createStudioFrameRingBuffer({ maxFrames: 4, maxBytes: 10 * 1024 * 1024 });
    ring.set({ assetId: "clip-1", frameIndex: 0, frame: makeFrame("f0") });
    ring.set({ assetId: "clip-1", frameIndex: 1, frame: makeFrame("f1") });
    ring.set({ assetId: "clip-1", frameIndex: 2, frame: makeFrame("f2") });
    ring.set({ assetId: "clip-1", frameIndex: 3, frame: makeFrame("f3") });

    // Touch frame 0 so frame 1 becomes LRU
    expect(ring.get("clip-1", 0)).toBeTruthy();

    ring.set({ assetId: "clip-1", frameIndex: 4, frame: makeFrame("f4") });
    expect(closed).toEqual(["f1"]);
    expect(ring.get("clip-1", 1)).toBeNull();
    expect(ring.get("clip-1", 0)).toBeTruthy();

    const nearest = ring.getNearest("clip-1", 5, { maxDistance: 2 });
    expect(nearest).toMatchObject({ frameIndex: 4, exact: false });

    ring.invalidateAsset("clip-1");
    expect(closed.sort()).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    expect(ring.stats().frames).toBe(0);
  });

  test("WebCodecs controller cleans up cached frames on destroy", () => {
    const controller = createStudioWebCodecsController({ maxFrames: 8 });
    let closed = false;
    controller.cache.set({
      assetId: "clip-2",
      frameIndex: 10,
      frame: { width: 64, height: 64, close: () => { closed = true; } },
    });
    expect(controller.cache.stats().frames).toBe(1);
    controller.destroy();
    expect(closed).toBe(true);
    expect(controller.cache.stats().frames).toBe(0);
  });
});

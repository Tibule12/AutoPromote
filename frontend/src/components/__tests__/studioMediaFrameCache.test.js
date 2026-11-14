import {
  computePrefetchWindow,
  createStudioFrameRingBuffer,
  createStudioWebCodecsController,
  selectOptimalSourceUrl,
} from "../studioMediaFrameCache";

describe("studioMediaFrameCache", () => {
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

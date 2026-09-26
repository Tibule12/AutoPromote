import {
  createStudioAngleGroup,
  createStudioAngleShot,
  getAngleGroupSharedDuration,
  setStudioAngleOffset,
} from "../studioAngleGroups";

const assets = [
  { id: "cam-a", name: "A cam.mp4", url: "https://example.test/a", storagePath: "studio/sources/user/a", duration: 12 },
  { id: "cam-b", name: "B cam.mp4", url: "https://example.test/b", storagePath: "studio/sources/user/b", duration: 10 },
];

describe("Studio film camera takes", () => {
  test("maps manually selected shared shot ranges to each camera's source time", () => {
    let group = createStudioAngleGroup({ id: "take-1", name: "Scene 1 take 2", assets });
    group = setStudioAngleOffset({ group, assetId: "cam-a", offsetSeconds: 2, assets });

    expect(getAngleGroupSharedDuration(group, assets)).toBe(10);
    const wide = createStudioAngleShot({ group, asset: assets[0], sharedStart: 0, sharedEnd: 3, clipId: "wide" });
    const closeup = createStudioAngleShot({ group, asset: assets[1], sharedStart: 3, sharedEnd: 7, clipId: "closeup" });
    expect(wide).toMatchObject({
      sourceStoragePath: assets[0].storagePath,
      angleGroupId: "take-1",
      startRequest: 2,
      endRequest: 5,
      duration: 3,
    });
    expect(closeup).toMatchObject({
      sourceStoragePath: assets[1].storagePath,
      angleGroupId: "take-1",
      startRequest: 3,
      endRequest: 7,
      duration: 4,
    });
  });

  test("blocks unready cameras and shot ranges outside their shared footage", () => {
    expect(() => createStudioAngleGroup({
      id: "take-2",
      assets: [assets[0], { ...assets[1], storagePath: "" }],
    })).toThrow(/saved videos/i);
    const group = createStudioAngleGroup({ id: "take-3", assets });
    expect(() => setStudioAngleOffset({ group, assetId: "cam-b", offsetSeconds: 11, assets })).toThrow(/shorter than/i);
    expect(() => createStudioAngleShot({
      group, asset: assets[1], sharedStart: 8, sharedEnd: 11, clipId: "too-long",
    })).toThrow(/shot range/i);
  });
});

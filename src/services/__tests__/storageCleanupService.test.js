jest.mock("../../firebaseAdmin", () => ({ storage: null, db: null }));
jest.mock("../../utils/cleanupSource", () => ({
  cleanupSourceFile: jest.fn(),
  extractOwnedStoragePathFromUrl: jest.fn(() => null),
}));

const { getMulticamStoragePaths } = require("../storageCleanupService");

describe("multicam storage cleanup", () => {
  it("collects the master, thumbnail, and manifest exactly once", () => {
    expect(
      getMulticamStoragePaths({
        outputStoragePath: "processed/multicam_job-123.mp4",
        thumbnail_storage_path: "processed/thumbnails/multicam_job-123.jpg",
        manifest_storage_path: "processed/manifests/multicam_job-123.json",
        result: {
          output_storage_path: "processed/multicam_job-123.mp4",
          manifest_storage_path: "processed/manifests/multicam_job-123.json",
        },
      })
    ).toEqual([
      "processed/multicam_job-123.mp4",
      "processed/thumbnails/multicam_job-123.jpg",
      "processed/manifests/multicam_job-123.json",
    ]);
  });

  it("rejects unrelated storage paths", () => {
    expect(
      getMulticamStoragePaths({
        outputStoragePath: "uploads/user/private.mp4",
        manifest_storage_path: "processed/manifests/not-a-multicam-file.json",
      })
    ).toEqual([]);
  });
});

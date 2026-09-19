import { uploadSourceFileViaBackend, uploadTemporaryVideoSource } from "../sourceUpload";
import { uploadBytesResumable, ref } from "firebase/storage";
import { uploadMulticamSourceResumable } from "../multicamResumableUpload";

jest.mock("../../firebaseClient", () => ({
  auth: { currentUser: { uid: "secure-user" } },
  storage: { name: "test-storage" },
}));

jest.mock("firebase/storage", () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn((_storage, path) => ({ fullPath: path })),
  uploadBytesResumable: jest.fn(),
}));

jest.mock("../multicamResumableUpload", () => ({
  uploadMulticamSourceResumable: jest.fn(),
}));

describe("temporary source uploads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((_storage, path) => ({ fullPath: path }));
    uploadBytesResumable.mockImplementation((_fileRef, file, metadata) => {
      const task = {
        snapshot: { metadata: { size: file.size } },
        on: (_event, onProgress, _onError, onComplete) => {
          onProgress({ bytesTransferred: file.size, totalBytes: file.size });
          onComplete();
        },
      };
      task.uploadMetadata = metadata;
      return task;
    });
  });

  it("uploads a viral scan to the signed-in user's temporary path with owner metadata", async () => {
    const file = new File(["secure-video"], "My clip.mp4", { type: "video/mp4" });
    const onProgress = jest.fn();

    const result = await uploadTemporaryVideoSource({
      file,
      purpose: "viral_scan",
      onProgress,
    });

    expect(result.storagePath).toMatch(/^temp_scans\/secure-user\/\d+_My_clip\.mp4$/);
    expect(ref).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^temp_scans\/secure-user\//)
    );
    expect(uploadBytesResumable).toHaveBeenCalledWith(
      expect.anything(),
      file,
      expect.objectContaining({
        contentType: "video/mp4",
        customMetadata: expect.objectContaining({
          ownerUid: "secure-user",
          sourcePurpose: "viral_scan",
        }),
      })
    );
    expect(onProgress).toHaveBeenCalledWith(file.size, file.size);
  });

  it("rejects unknown temporary upload purposes", async () => {
    const file = new File(["secure-video"], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadTemporaryVideoSource({ file, purpose: "unknown" })
    ).rejects.toThrow("Invalid temporary upload purpose");
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });

  it("uses the secure resumable path for a full Studio podcast larger than 500 MB", async () => {
    const file = new File(["video"], "full-podcast.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { configurable: true, value: 2_611_147_007 });
    const getToken = jest.fn(() => Promise.resolve("fresh-token"));
    const onProgress = jest.fn();
    uploadMulticamSourceResumable.mockResolvedValue({
      url: "https://storage.example/full-podcast.mp4",
      storagePath: "temp/multicam-ingest/secure-user/full-podcast.mp4",
      size: file.size,
    });

    const result = await uploadSourceFileViaBackend({
      file,
      token: "token",
      getToken,
      mediaType: "video",
      purpose: "studio_source",
      onProgress,
    });

    expect(uploadMulticamSourceResumable).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        token: "token",
        getToken,
        purpose: "studio_source",
        onProgress,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        storagePath: "temp/multicam-ingest/secure-user/full-podcast.mp4",
        uploadMode: "studio_resumable",
      })
    );
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });
});

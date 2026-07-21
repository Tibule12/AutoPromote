import { uploadTemporaryVideoSource } from "../sourceUpload";
import { uploadBytesResumable, ref } from "firebase/storage";

jest.mock("../../firebaseClient", () => ({
  auth: { currentUser: { uid: "secure-user" } },
  storage: { name: "test-storage" },
}));

jest.mock("firebase/storage", () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn((_storage, path) => ({ fullPath: path })),
  uploadBytesResumable: jest.fn(),
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
});

const mockExists = jest.fn();
const mockGetMetadata = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockDelete = jest.fn();
const mockFile = jest.fn(() => ({
  exists: mockExists,
  getMetadata: mockGetMetadata,
  getSignedUrl: mockGetSignedUrl,
  delete: mockDelete,
}));

jest.mock("firebase-admin", () => ({
  storage: () => ({
    bucket: () => ({ file: mockFile }),
  }),
}));

const {
  normalizeOwnedTemporaryPath,
  resolveOwnedTemporaryVideoSource,
} = require("../ownedTemporaryMediaService");

describe("owned temporary media service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExists.mockResolvedValue([true]);
    mockGetMetadata.mockResolvedValue([
      {
        size: "1024",
        contentType: "video/mp4",
        metadata: { ownerUid: "owner-1", sourcePurpose: "viral_scan" },
      },
    ]);
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-source"]);
  });

  it("rejects another user's temporary path before accessing storage", () => {
    expect(() =>
      normalizeOwnedTemporaryPath("temp_scans/owner-2/video.mp4", "owner-1", "viral_scan")
    ).toThrow("does not belong");
    expect(mockFile).not.toHaveBeenCalled();
  });

  it("verifies owner metadata and returns a short-lived signed worker URL", async () => {
    const result = await resolveOwnedTemporaryVideoSource({
      storagePath: "temp_scans/owner-1/video.mp4",
      userId: "owner-1",
      purpose: "viral_scan",
    });

    expect(result).toMatchObject({
      storagePath: "temp_scans/owner-1/video.mp4",
      signedUrl: "https://storage.googleapis.com/signed-source",
      temporary: true,
    });
    expect(mockGetSignedUrl).toHaveBeenCalledWith({
      action: "read",
      expires: expect.any(Number),
    });
  });

  it("rejects mismatched owner metadata", async () => {
    mockGetMetadata.mockResolvedValue([
      {
        size: "1024",
        contentType: "video/mp4",
        metadata: { ownerUid: "owner-2", sourcePurpose: "viral_scan" },
      },
    ]);

    await expect(
      resolveOwnedTemporaryVideoSource({
        storagePath: "temp_scans/owner-1/video.mp4",
        userId: "owner-1",
        purpose: "viral_scan",
      })
    ).rejects.toMatchObject({ code: "TEMP_SOURCE_NOT_OWNED", statusCode: 403 });
  });
});

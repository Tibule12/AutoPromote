const mockFileObjects = new Map();

jest.mock("firebase-admin", () => ({
  app: jest.fn(() => ({ options: { storageBucket: "test-bucket" } })),
  storage: jest.fn(() => ({
    bucket: jest.fn(bucketName => ({
      file: jest.fn(storagePath => {
        const key = `${bucketName}/${storagePath}`;
        if (!mockFileObjects.has(key)) {
          mockFileObjects.set(key, {
            createResumableUpload: jest.fn(async () => ["https://upload.example/session"]),
            getMetadata: jest.fn(),
            delete: jest.fn(async () => {}),
          });
        }
        return mockFileObjects.get(key);
      }),
    })),
  })),
}));

const {
  buildIngestStoragePath,
  completeMulticamUpload,
  startMulticamUpload,
  verifyMulticamRenderInputs,
} = require("../multicamUploadService");

describe("multicam upload service", () => {
  beforeEach(() => {
    mockFileObjects.clear();
    process.env.MULTICAM_INGEST_BUCKET = "test-bucket";
  });

  it("builds a stable, owner-scoped object path", () => {
    const input = {
      userId: "user-1",
      fileName: "Camera One.MOV",
      sizeBytes: 1234,
      lastModified: 999,
      fingerprint: "camera-one:1234:999",
    };
    const first = buildIngestStoragePath(input);
    const second = buildIngestStoragePath(input);

    expect(first).toBe(second);
    expect(first).toMatch(/^temp\/multicam-ingest\/user-1\/[a-f0-9]{24}_Camera_One\.MOV$/);
  });

  it("starts a private resumable upload with expiry metadata", async () => {
    const result = await startMulticamUpload({
      userId: "user-1",
      fileName: "camera.mov",
      contentType: "video/quicktime",
      sizeBytes: 2048,
      lastModified: 999,
      fingerprint: "camera:2048:999",
      purpose: "camera_original",
      origin: "https://autopromote.org",
    });

    expect(result.uploadUrl).toBe("https://upload.example/session");
    expect(result.storagePath).toContain("temp/multicam-ingest/user-1/");
    const file = mockFileObjects.get(`test-bucket/${result.storagePath}`);
    expect(file.createResumableUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "https://autopromote.org",
        private: true,
        metadata: expect.objectContaining({ contentType: "video/quicktime" }),
      })
    );
  });

  it("rejects completion when the uploaded byte count is incomplete", async () => {
    const storagePath = buildIngestStoragePath({
      userId: "user-1",
      fileName: "camera.mov",
      sizeBytes: 2048,
      lastModified: 999,
      fingerprint: "camera:2048:999",
    });
    const file = mockFileObjects.get(`test-bucket/${storagePath}`) || (() => {
      const mock = {
        createResumableUpload: jest.fn(),
        getMetadata: jest.fn(),
        delete: jest.fn(),
      };
      mockFileObjects.set(`test-bucket/${storagePath}`, mock);
      return mock;
    })();
    file.getMetadata.mockResolvedValue([
      {
        size: "1024",
        metadata: {
          ownerUid: "user-1",
          expectedSizeBytes: "2048",
          firebaseStorageDownloadTokens: "token-1",
        },
      },
    ]);

    await expect(
      completeMulticamUpload({
        userId: "user-1",
        storagePath,
        downloadToken: "token-1",
        sizeBytes: 2048,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("verifies render URLs against owner, purpose, path, and download token", async () => {
    const storagePath = "temp/multicam-ingest/user-1/camera.mp4";
    const file = {
      createResumableUpload: jest.fn(),
      getMetadata: jest.fn().mockResolvedValue([
        {
          size: "4096",
          metadata: {
            ownerUid: "user-1",
            purpose: "camera_original",
            firebaseStorageDownloadTokens: "token-1",
            deleteAfter: new Date(Date.now() + 60000).toISOString(),
          },
        },
      ]),
      delete: jest.fn(),
    };
    mockFileObjects.set(`test-bucket/${storagePath}`, file);

    await expect(
      verifyMulticamRenderInputs({
        userId: "user-1",
        sources: [
          {
            storagePath,
            url: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/camera?alt=media&token=token-1",
          },
        ],
      })
    ).resolves.toHaveLength(1);
  });

  it("rejects another user's ingest path before dispatch", async () => {
    await expect(
      verifyMulticamRenderInputs({
        userId: "user-1",
        sources: [
          {
            storagePath: "temp/multicam-ingest/user-2/camera.mp4",
            url: "https://example.test/video?token=token-1",
          },
        ],
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

const express = require("express");
const request = require("supertest");

const firestoreDocs = [];
const mockRecoverMulticamUpload = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => ({ docs: firestoreDocs })),
          })),
        })),
      })),
    })),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
      },
    }
  ),
  storage: jest.fn(() => ({ bucket: jest.fn() })),
}));

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "user-1" };
  req.userId = "user-1";
  next();
});

jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));

jest.mock("../services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({
    startMulticamRenderJob: jest.fn(),
  }))
);

jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));

jest.mock("../services/multicamUploadService", () => ({
  abortMulticamUpload: jest.fn(),
  completeMulticamUpload: jest.fn(),
  recoverMulticamUpload: mockRecoverMulticamUpload,
  startMulticamUpload: jest.fn(),
  verifyMulticamRenderInputs: jest.fn(),
}));

const mediaRoutes = require("../mediaRoutes");

const asFirestoreDoc = (id, data) => ({ id, data: () => data });

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

const cloudSources = [
  {
    id: "cam-1",
    label: "Camera 1",
    url: "/home/user/project/tmp/camera-1.mov",
    storagePath: "temp/multicam-ingest/user-1/camera-1.mov",
  },
  {
    id: "cam-2",
    label: "Camera 2",
    url: "/home/user/project/tmp/camera-2.mov",
    storagePath: "temp/multicam-ingest/user-1/camera-2.mov",
  },
];

describe("mediaRoutes recoverable multicam project", () => {
  beforeEach(() => {
    firestoreDocs.length = 0;
    mockRecoverMulticamUpload.mockReset();
    mockRecoverMulticamUpload.mockImplementation(async ({ source }) => ({
      url: `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(
        source.storagePath
      )}?alt=media&token=fresh-token`,
      storagePath: source.storagePath,
      cacheKey: `test/${source.storagePath}#current`,
    }));
  });

  it("skips local-only jobs and returns rebuilt cloud URLs for the newest reusable job", async () => {
    firestoreDocs.push(
      asFirestoreDoc("local-only-job", {
        userId: "user-1",
        type: "multicam_render",
        status: "failed",
        updatedAt: "2026-07-14T12:00:00.000Z",
        multicamRequest: {
          totalDurationSeconds: 60,
          sources: [
            { id: "local-1", url: "/home/user/project/tmp/local-1.mov" },
            { id: "local-2", url: "/home/user/project/tmp/local-2.mov" },
          ],
        },
      }),
      asFirestoreDoc("reusable-proof-job", {
        userId: "user-1",
        type: "multicam_render",
        status: "failed",
        updatedAt: "2026-07-14T11:00:00.000Z",
        multicamRequest: {
          totalDurationSeconds: 60,
          outputAspectRatio: "16:9",
          sources: cloudSources,
        },
      }),
      asFirestoreDoc("older-full-job", {
        userId: "user-1",
        type: "multicam_render",
        status: "failed",
        updatedAt: "2026-07-14T10:00:00.000Z",
        multicamRequest: {
          totalDurationSeconds: 2640,
          sources: cloudSources,
        },
      })
    );

    const response = await request(buildApp()).get("/api/media/multicam/recoverable-project");

    expect(response.statusCode).toBe(200);
    expect(response.body.project.previousJobId).toBe("reusable-proof-job");
    expect(response.body.project.duration).toBe(2640);
    expect(response.body.project.sources).toHaveLength(2);
    expect(response.body.project.sources.every(source => source.url.startsWith("https://"))).toBe(
      true
    );
    expect(JSON.stringify(response.body)).not.toContain("/home/user/project/tmp");
    expect(mockRecoverMulticamUpload).toHaveBeenCalledTimes(2);
  });

  it("returns a clear 404 instead of exposing an unrecoverable filesystem path", async () => {
    firestoreDocs.push(
      asFirestoreDoc("local-only-job", {
        userId: "user-1",
        type: "multicam_render",
        status: "failed",
        updatedAt: "2026-07-14T12:00:00.000Z",
        multicamRequest: {
          sources: [
            { id: "local-1", url: "/home/user/project/tmp/local-1.mov" },
            { id: "local-2", url: "/home/user/project/tmp/local-2.mov" },
          ],
        },
      })
    );

    const response = await request(buildApp()).get("/api/media/multicam/recoverable-project");

    expect(response.statusCode).toBe(404);
    expect(response.body.message).toBe("No reusable Firebase Cam Combiner originals were found");
    expect(mockRecoverMulticamUpload).not.toHaveBeenCalled();
  });
});

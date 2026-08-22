const express = require("express");
const request = require("supertest");

const mockFirestoreDocs = [];
const mockRecoverMulticamUpload = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => {
        const filters = [];
        let queryLimit = Infinity;
        const query = {
          where: jest.fn((field, operator, value) => {
            filters.push({ field, operator, value });
            return query;
          }),
          limit: jest.fn(value => {
            queryLimit = Number(value) || Infinity;
            return query;
          }),
          get: jest.fn(async () => ({
            docs: mockFirestoreDocs
              .filter(doc =>
                filters.every(filter => {
                  if (filter.operator !== "==") return true;
                  return doc.data()?.[filter.field] === filter.value;
                })
              )
              .slice(0, queryLimit),
          })),
        };
        return query;
      }),
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
    mockFirestoreDocs.length = 0;
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
    mockFirestoreDocs.push(
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
          directorChannelCameraIds: ["cam-2", "cam-1"],
          trustedDirectorChannelMap: {
            status: "approved",
            proof_kind: "owner_verified_test_contract",
            channel_camera_ids: ["cam-2", "cam-1"],
          },
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
    expect(response.body.project.channelMapApproved).toBe(true);
    expect(response.body.project.suggestedChannelCameraIds).toEqual(["cam-2", "cam-1"]);
    expect(response.body.project.sources.every(source => source.url.startsWith("https://"))).toBe(
      true
    );
    expect(JSON.stringify(response.body)).not.toContain("/home/user/project/tmp");
    expect(mockRecoverMulticamUpload).toHaveBeenCalledTimes(2);
  });

  it("returns a clear 404 instead of exposing an unrecoverable filesystem path", async () => {
    mockFirestoreDocs.push(
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

  it("finds reusable originals beyond fifty unrelated media jobs", async () => {
    for (let index = 0; index < 60; index += 1) {
      mockFirestoreDocs.push(
        asFirestoreDoc(`unrelated-${index}`, {
          userId: "user-1",
          type: "audio_extraction",
          status: "completed",
          createdAt: `2026-08-20T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
        })
      );
    }
    mockFirestoreDocs.push(
      asFirestoreDoc("reusable-after-crowded-history", {
        userId: "user-1",
        type: "multicam_render",
        status: "completed",
        updatedAt: "2026-08-20T12:00:00.000Z",
        multicamRequest: {
          totalDurationSeconds: 3600,
          outputAspectRatio: "16:9",
          sources: cloudSources,
        },
      })
    );

    const response = await request(buildApp()).get("/api/media/multicam/recoverable-project");

    expect(response.statusCode).toBe(200);
    expect(response.body.project.previousJobId).toBe("reusable-after-crowded-history");
    expect(response.body.project.sources).toHaveLength(2);
    expect(mockRecoverMulticamUpload).toHaveBeenCalledTimes(2);
  });
});

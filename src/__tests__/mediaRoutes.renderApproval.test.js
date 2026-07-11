const express = require("express");
const request = require("supertest");

const docs = new Map();

const makeDoc = id => ({
  id,
  exists: docs.has(id),
  data: () => docs.get(id),
});

const docRef = id => ({
  get: jest.fn(async () => makeDoc(id)),
  set: jest.fn(async (update, options = {}) => {
    const current = docs.get(id) || {};
    docs.set(id, options.merge ? { ...current, ...update } : update);
  }),
});

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(id => docRef(id)),
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => ({ docs: [] })),
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

jest.mock("../services/videoEditingService", () => {
  return jest.fn().mockImplementation(() => ({
    startMulticamRenderJob: jest.fn(),
  }));
});

jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));

const mediaRoutes = require("../mediaRoutes");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

describe("mediaRoutes render approval", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("job-1", {
      userId: "user-1",
      type: "multicam_render",
      status: "completed",
      output_url: "https://cdn.example.com/held.mp4",
      renderSpecVersion: 2,
      totalDurationSeconds: 2640,
      checkpointSeconds: 300,
      checkpointedRender: true,
      expectedCheckpointCount: 9,
      renderCheckpoint: {
        stage: "rendering_chunks",
        currentIndex: 4,
        completedCount: 4,
        expectedCount: 9,
        completedDurationSeconds: 1200,
        totalDurationSeconds: 2640,
        chunks: ["intentionally-not-exposed"],
      },
      manifest_url: "https://cdn.example.com/multicam-job-1.json",
      manifest_storage_path: "processed/manifests/multicam_job-1.json",
      result: {
        url: "https://cdn.example.com/held.mp4",
        duration: 90,
      },
    });
  });

  it("returns needs_review status and hides downloadable output before approval", async () => {
    const response = await request(buildApp()).get("/api/media/status/job-1");

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("needs_review");
    expect(response.body.approvalStatus).toBe("needs_review");
    expect(response.body.output_url).toBeNull();
    expect(response.body.outputUrl).toBeNull();
    expect(response.body.result.url).toBeUndefined();
    expect(response.body.previewUrl).toBe("https://cdn.example.com/held.mp4");
    expect(response.body.renderCheckpoint).toEqual({
      stage: "rendering_chunks",
      status: null,
      resumable: false,
      currentIndex: 4,
      completedCount: 4,
      expectedCount: 9,
      completedDurationSeconds: 1200,
      totalDurationSeconds: 2640,
    });
    expect(response.body.renderCheckpoint.chunks).toBeUndefined();
    expect(response.body.manifestUrl).toBe("https://cdn.example.com/multicam-job-1.json");
    expect(response.body.manifestStoragePath).toBe(
      "processed/manifests/multicam_job-1.json"
    );
  });

  it("approves a held render and exposes the approved output URL", async () => {
    const approveResponse = await request(buildApp())
      .post("/api/media/render-jobs/job-1/approve")
      .send({ notes: "reviewed" });

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.body.job.approvalStatus).toBe("approved");
    expect(approveResponse.body.job.outputUrl).toBe("https://cdn.example.com/held.mp4");

    const statusResponse = await request(buildApp()).get("/api/media/status/job-1");
    expect(statusResponse.body.status).toBe("completed");
    expect(statusResponse.body.canDownload).toBe(true);
    expect(statusResponse.body.output_url).toBe("https://cdn.example.com/held.mp4");
  });

  it("rejects a held render and keeps download blocked", async () => {
    const rejectResponse = await request(buildApp())
      .post("/api/media/render-jobs/job-1/reject")
      .send({ notes: "bad output" });

    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.body.job.approvalStatus).toBe("rejected");
    expect(rejectResponse.body.job.outputUrl).toBeNull();

    const statusResponse = await request(buildApp()).get("/api/media/status/job-1");
    expect(statusResponse.body.status).toBe("rejected");
    expect(statusResponse.body.canDownload).toBe(false);
    expect(statusResponse.body.output_url).toBeNull();
  });
});

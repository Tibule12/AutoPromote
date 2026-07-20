const express = require("express");
const request = require("supertest");

const mockDocs = new Map();
const mockExistingObjects = new Set();
const mockAnalyzeVideo = jest.fn();
const mockStartProcessingJob = jest.fn();

const makeDoc = id => ({
  id,
  exists: mockDocs.has(id),
  data: () => mockDocs.get(id),
});

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(id => ({
          get: jest.fn(async () => makeDoc(id)),
        })),
      })),
    })),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
      },
    }
  ),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(path => ({
        exists: jest.fn(async () => [mockExistingObjects.has(path)]),
      })),
    })),
  })),
}));

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "owner-1" };
  req.userId = "owner-1";
  next();
});

jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));

jest.mock("../services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({
    analyzeVideo: mockAnalyzeVideo,
    startProcessingJob: mockStartProcessingJob,
  }))
);

jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));

jest.mock(
  "../services/clipOutcomeLearningService",
  () => ({
    getClipLearningProfile: jest.fn().mockResolvedValue(null),
  }),
  { virtual: true }
);

const mediaRoutes = require("../mediaRoutes");
const { deductCredits, getCreditBreakdown } = require("../creditSystem");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

describe("Cam Combiner master reuse for Find Viral Clips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocs.clear();
    mockExistingObjects.clear();
    mockDocs.set("render-1", {
      userId: "owner-1",
      type: "multicam_render",
      status: "completed",
      outputUrl: "https://storage.example.com/processed/multicam_render-1.mp4?token=stored",
      outputStoragePath: "processed/multicam_render-1.mp4",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      result: {
        url: "https://storage.example.com/processed/multicam_render-1.mp4?token=stored",
      },
    });
    mockExistingObjects.add("processed/multicam_render-1.mp4");
    deductCredits.mockResolvedValue({
      success: true,
      remaining: 92,
      deducted: 8,
      fromMonthly: 8,
      fromTopUp: 0,
      monthKey: "2026-07",
    });
    getCreditBreakdown.mockResolvedValue({
      totalAvailable: 100,
      tier: "premium",
      localCreditBypass: false,
    });
    mockAnalyzeVideo.mockResolvedValue([{ id: "clip-1", start: 3, end: 15 }]);
    mockStartProcessingJob.mockResolvedValue({ jobId: "clip-render-1" });
  });

  it("analyzes the owned stored master without accepting a replacement browser URL", async () => {
    const response = await request(buildApp()).post("/api/media/analyze").send({
      renderJobId: "render-1",
      fileUrl: "https://attacker.example.com/not-the-master.mp4",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.reusedMulticamMaster).toBe(true);
    expect(response.body.sourceRenderJobId).toBe("render-1");
    expect(mockAnalyzeVideo).toHaveBeenCalledWith(
      "https://storage.example.com/processed/multicam_render-1.mp4?token=stored",
      "owner-1",
      expect.objectContaining({ localPath: null })
    );
    expect(deductCredits).toHaveBeenCalledWith("owner-1", 8, "/analyze", expect.any(Object));
  });

  it("rejects another user's master before charging credits", async () => {
    mockDocs.set("render-1", { ...mockDocs.get("render-1"), userId: "someone-else" });

    const response = await request(buildApp())
      .post("/api/media/analyze")
      .send({ renderJobId: "render-1" });

    expect(response.statusCode).toBe(403);
    expect(response.body.code).toBe("MULTICAM_MASTER_FORBIDDEN");
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockAnalyzeVideo).not.toHaveBeenCalled();
  });

  it("rejects a deleted Firebase master before charging credits", async () => {
    mockExistingObjects.clear();

    const response = await request(buildApp())
      .post("/api/media/analyze")
      .send({ renderJobId: "render-1" });

    expect(response.statusCode).toBe(410);
    expect(response.body.code).toBe("MULTICAM_MASTER_DELETED");
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockAnalyzeVideo).not.toHaveBeenCalled();
  });

  it("requires the full master instead of scanning a 60-second production proof", async () => {
    mockDocs.set("render-1", {
      ...mockDocs.get("render-1"),
      renderPurpose: "production_proof",
    });

    const response = await request(buildApp())
      .post("/api/media/analyze")
      .send({ renderJobId: "render-1" });

    expect(response.statusCode).toBe(409);
    expect(response.body.code).toBe("FULL_MULTICAM_MASTER_REQUIRED");
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockAnalyzeVideo).not.toHaveBeenCalled();
  });

  it("reuses the same master for final clip generation and charges the 5-credit clip rate", async () => {
    deductCredits.mockResolvedValue({
      success: true,
      remaining: 87,
      deducted: 5,
      fromMonthly: 5,
      fromTopUp: 0,
      monthKey: "2026-07",
    });

    const response = await request(buildApp())
      .post("/api/media/process")
      .send({
        renderJobId: "render-1",
        fileUrl: "https://attacker.example.com/not-the-master.mp4",
        options: {
          renderViral: true,
          viralData: {
            video_url: "https://attacker.example.com/not-the-master.mp4",
            timeline_segments: [
              {
                id: "main",
                url: "https://attacker.example.com/not-the-master.mp4",
                start_time: 3,
                end_time: 15,
              },
            ],
          },
        },
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.reusedMulticamMaster).toBe(true);
    expect(deductCredits).toHaveBeenCalledWith("owner-1", 5, "render-clip", {});
    expect(mockStartProcessingJob).toHaveBeenCalledWith(
      "https://storage.example.com/processed/multicam_render-1.mp4?token=stored",
      expect.objectContaining({
        viralData: expect.objectContaining({
          video_url: "https://storage.example.com/processed/multicam_render-1.mp4?token=stored",
          timeline_segments: [
            expect.objectContaining({
              id: "main",
              url: "https://storage.example.com/processed/multicam_render-1.mp4?token=stored",
            }),
          ],
        }),
      }),
      "owner-1"
    );
  });
});

const express = require("express");
const request = require("supertest");

const mockStartAudioExtractionJob = jest.fn();
const mockFirestoreGet = jest.fn();

jest.mock("../src/authMiddleware", () => (req, res, next) => {
  req.user = { uid: "testUser123" };
  next();
});

jest.mock("../src/creditSystem", () => ({
  deductCredits: jest.fn(),
}));

jest.mock("../src/services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({
    startAudioExtractionJob: mockStartAudioExtractionJob,
  }))
);

jest.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: () => ({
      doc: () => ({
        get: mockFirestoreGet,
      }),
    }),
  }),
}));

const mediaRoutes = require("../src/mediaRoutes");

describe("media audio extraction routes", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/media", mediaRoutes);
  });

  test("POST /api/media/extract-audio queues extraction for the authenticated user", async () => {
    mockStartAudioExtractionJob.mockResolvedValue({ jobId: "job-123" });

    const res = await request(app)
      .post("/api/media/extract-audio")
      .send({
        fileUrl: "  https://cdn.example.com/source.mp4  ",
        sourceLabel: "  My clip.mp4  ",
      })
      .expect(200);

    expect(mockStartAudioExtractionJob).toHaveBeenCalledWith(
      "https://cdn.example.com/source.mp4",
      "testUser123",
      { sourceLabel: "My clip.mp4" }
    );
    expect(res.body).toEqual({
      success: true,
      jobId: "job-123",
      message: "Audio extraction started",
    });
  });

  test("POST /api/media/extract-audio rejects missing fileUrl", async () => {
    const res = await request(app).post("/api/media/extract-audio").send({}).expect(400);

    expect(mockStartAudioExtractionJob).not.toHaveBeenCalled();
    expect(res.body).toEqual(expect.objectContaining({ message: "No file provided" }));
  });

  test("GET /api/media/status/:jobId includes extracted audio URLs for owned jobs", async () => {
    mockFirestoreGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: "testUser123",
        status: "completed",
        stage: "completed",
        progress: 100,
        audio_url: "https://storage.example.com/audio.mp3",
        result: {
          audioUrl: "https://storage.example.com/audio.mp3",
          audioDuration: 19.4,
        },
      }),
    });

    const res = await request(app).get("/api/media/status/job-123").expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        status: "completed",
        stage: "completed",
        progress: 100,
        audio_url: "https://storage.example.com/audio.mp3",
        result: expect.objectContaining({
          audioUrl: "https://storage.example.com/audio.mp3",
          audioDuration: 19.4,
        }),
      })
    );
  });
});
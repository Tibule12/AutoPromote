const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");

jest.mock("../../services/youtubeService", () => ({ uploadVideo: jest.fn() }));
const { uploadVideo } = require("../../services/youtubeService");

// Mock authMiddleware to allow requests
jest.mock("../../authMiddleware", () => (req, res, next) => {
  req.userId = "test-uid";
  req.user = { uid: "test-uid" };
  next();
});

// Mock admin.storage for multipart upload handling
const { admin, db } = require("../../../firebaseAdmin");

describe("POST /api/youtube/upload", () => {
  let app;

  beforeEach(() => {
    // Lightweight express app that mounts the router under /api/youtube
    // Ensure authMiddleware used in tests is a noop (server usually sets this)
    // Require the router after setting globals so it picks up mocked modules
    app = express();
    app.use(bodyParser.json());

    // Simple auth middleware to set req.userId for testing
    app.use((req, res, next) => {
      req.userId = "test-uid";
      next();
    });

    // Mount the real router
    const ytRouter = require("../youtubeRoutes");
    app.use("/api/youtube", ytRouter);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("uses content.processedUrl when contentId provided", async () => {
    // Mock content doc
    const contentDoc = {
      exists: true,
      data: () => ({ processedUrl: "https://signed.example/video.mp4", tags: ["x"] }),
    };
    db.collection = jest.fn(() => ({
      doc: jest.fn(() => ({ get: jest.fn(async () => contentDoc) })),
    }));

    uploadVideo.mockResolvedValue({ success: true, videoId: "vid123" });

    const res = await request(app)
      .post("/api/youtube/upload")
      .send({ title: "My Test", contentId: "content-1" })
      .expect(200);

    expect(uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({ fileUrl: "https://signed.example/video.mp4", title: "My Test" })
    );
    expect(res.body).toEqual({ success: true, videoId: "vid123" });
  });
});

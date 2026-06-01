const express = require("express");
const request = require("supertest");

const mockStartMulticamRenderJob = jest.fn();

jest.mock("../src/authMiddleware", () => (req, res, next) => {
  req.user = { uid: "testUser123" };
  next();
});

jest.mock("../src/creditSystem", () => ({
  deductCredits: jest.fn().mockResolvedValue({ success: true, remaining: 85 }),
}));

jest.mock("../src/services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "pro" }),
}));

jest.mock("../src/config/subscriptionPlans", () => {
  const actual = jest.requireActual("../src/config/subscriptionPlans");
  return {
    ...actual,
    getPlanCapabilities: jest.fn(() => ({
      planId: "pro",
      planName: "Studio",
      multicam: true,
    })),
  };
});

jest.mock("../src/services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({
    startMulticamRenderJob: mockStartMulticamRenderJob,
  }))
);

const mediaRoutes = require("../src/mediaRoutes");

describe("media multicam render route", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/media", mediaRoutes);
  });

  test("POST /api/media/render-multicam forwards primary audio and aggressiveness", async () => {
    mockStartMulticamRenderJob.mockResolvedValue({ jobId: "job-456" });

    const payload = {
      sources: [
        { id: "cam-1", url: "https://cdn.example.com/cam-1.mp4", offsetSeconds: 0 },
        { id: "cam-2", url: "https://cdn.example.com/cam-2.mp4", offsetSeconds: 1.2 },
      ],
      segments: [
        {
          id: "segment-1",
          cameraId: "cam-1",
          timelineStart: 0,
          timelineEnd: 3.5,
          sourceStart: 1.2,
          sourceEnd: 4.7,
        },
        {
          id: "segment-2",
          cameraId: "cam-2",
          timelineStart: 3.5,
          timelineEnd: 10.4,
          sourceStart: 0,
          sourceEnd: 6.9,
        },
      ],
      switches: [
        { id: "switch-1", cameraId: "cam-1", startTime: 0 },
        { id: "switch-2", cameraId: "cam-2", startTime: 3.5 },
      ],
      autoSwitch: false,
      audioBasedAutoSwitch: true,
      autoSwitchInterval: 2.75,
      autoSwitchAggressiveness: "high",
      primaryAudioCameraId: "cam-2",
      overlapStart: 1.2,
      overlapDuration: 10.4,
      outputAspectRatio: "16:9",
    };

    const res = await request(app).post("/api/media/render-multicam").send(payload).expect(200);

    expect(mockStartMulticamRenderJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: payload.sources,
        segments: payload.segments,
        switches: payload.switches,
        autoSwitch: false,
        audioBasedAutoSwitch: true,
        autoSwitchInterval: 2.75,
        autoSwitchAggressiveness: "high",
        primaryAudioCameraId: "cam-2",
        overlapStart: 1.2,
        overlapDuration: 10.4,
        outputAspectRatio: "16:9",
      }),
      "testUser123"
    );

    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        jobId: "job-456",
        message: "Multi-camera render started",
      })
    );
  });

  test("POST /api/media/render-multicam rejects requests with fewer than two sources", async () => {
    const res = await request(app)
      .post("/api/media/render-multicam")
      .send({
        sources: [{ id: "cam-1", url: "https://cdn.example.com/cam-1.mp4" }],
      })
      .expect(400);

    expect(mockStartMulticamRenderJob).not.toHaveBeenCalled();
    expect(res.body).toEqual(
      expect.objectContaining({ message: "At least two camera sources are required" })
    );
  });
});

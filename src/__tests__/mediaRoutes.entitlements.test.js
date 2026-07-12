const express = require("express");
const request = require("supertest");

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "user-1" };
  req.userId = "user-1";
  next();
});

jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
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

jest.mock("../config/subscriptionPlans", () => {
  const actual = jest.requireActual("../config/subscriptionPlans");
  return {
    ...actual,
    getPlanCapabilities: jest.fn(() => ({
      planId: "premium",
      planName: "Creator",
      multicam: false,
    })),
  };
});

const mediaRoutes = require("../mediaRoutes");
const { deductCredits } = require("../creditSystem");

describe("mediaRoutes entitlement enforcement", () => {
  it("blocks multicam rendering for plans without multicam access before charging credits", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/media", mediaRoutes);

    const response = await request(app)
      .post("/api/media/render-multicam")
      .send({
        sources: [{ id: "cam-1" }, { id: "cam-2" }],
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.code).toBe("MULTICAM_PLAN_REQUIRED");
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it("requires confirmed stereo channel ownership before a paid auto-director request", () => {
    const result = mediaRoutes.validateTrustedDirectorChannelMapRequest({
      sources: [{ id: "cam-1" }, { id: "cam-2" }],
      autoSwitch: true,
      externalAudio: { url: "https://cdn.example.com/clean.wav" },
      directorChannelCameraIds: ["cam-1", "cam-2"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        required: true,
      })
    );
  });

  it("accepts a human-confirmed stereo channel contract before charging", () => {
    const result = mediaRoutes.validateTrustedDirectorChannelMapRequest({
      sources: [{ id: "cam-1" }, { id: "cam-2" }],
      autoSwitch: true,
      externalAudio: { url: "https://cdn.example.com/clean.wav" },
      directorChannelCameraIds: ["cam-2", "cam-1"],
      trustedDirectorChannelMap: {
        status: "approved",
        proof_kind: "human_confirmed_ui_v1",
        channel_camera_ids: ["cam-2", "cam-1"],
      },
    });

    expect(result).toEqual({
      ok: true,
      required: true,
      channelCameraIds: ["cam-2", "cam-1"],
    });
  });
});

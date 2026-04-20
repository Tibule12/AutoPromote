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
});

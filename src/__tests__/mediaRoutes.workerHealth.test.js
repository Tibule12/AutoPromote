const express = require("express");
const request = require("supertest");

const mockAxiosGet = jest.fn();

jest.mock("axios", () => ({
  get: mockAxiosGet,
  post: jest.fn(),
}));

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "worker-health-user" };
  req.userId = "worker-health-user";
  next();
});

jest.mock("../utils/cloudRunAuth", () => ({
  buildWorkerRequestConfig: jest.fn(async (_url, config) => config),
}));

jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));

jest.mock("../services/videoEditingService", () => jest.fn().mockImplementation(() => ({})));

const mediaRoutes = require("../mediaRoutes");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

describe("media worker health gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows enough time for a Cloud Run cold start", async () => {
    mockAxiosGet.mockResolvedValue({ data: { status: "ok" } });

    const response = await request(buildApp()).get("/api/media/worker-health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      worker: { status: "ok" },
    });
    expect(response.body.wakeDurationMs).toEqual(expect.any(Number));
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringMatching(/\/health$/),
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it("returns a retryable message and confirms that no upload or charge occurred", async () => {
    const timeoutError = new Error("timeout of 60000ms exceeded");
    timeoutError.code = "ECONNABORTED";
    mockAxiosGet.mockRejectedValue(timeoutError);

    const response = await request(buildApp()).get("/api/media/worker-health");

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "MEDIA_WORKER_WAKE_TIMEOUT",
      retryable: true,
    });
    expect(response.body.message).toMatch(/video was not uploaded and no credits were used/i);
  });
});

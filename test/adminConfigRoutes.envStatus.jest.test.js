const express = require("express");
const request = require("supertest");

describe("adminConfigRoutes /env-status", () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.ENABLE_BACKGROUND_JOBS = "true";
    process.env.WORKER_STATUS_STALE_SEC = "900";

    const docs = new Map([
      ["statsPoller", { lastRun: new Date().toISOString(), status: "ok" }],
      ["promotionTasks", { lastRun: new Date().toISOString(), status: "ok" }],
      ["platformMetrics", { lastRun: new Date().toISOString(), status: "ok" }],
      ["earningsAggregator", { lastRun: new Date().toISOString(), status: "ok" }],
    ]);

    jest.doMock("../src/authMiddleware", () => (req, _res, next) => {
      req.user = { uid: "admin-1", isAdmin: true, role: "admin" };
      req.userId = "admin-1";
      next();
    });
    jest.doMock("../src/middlewares/adminOnly", () => (req, res, next) => {
      if (req.user && (req.user.isAdmin || req.user.role === "admin")) return next();
      return res.status(403).json({ ok: false, error: "forbidden" });
    });
    jest.doMock("../src/middlewares/globalRateLimiter", () => ({
      rateLimiter: () => (_req, _res, next) => next(),
    }));
    jest.doMock("../src/utils/envValidator", () => ({
      validateEnv: () => ({ errors: [], warnings: [] }),
    }));
    jest.doMock("../src/firebaseAdmin", () => ({
      db: {
        collection(name) {
          if (name !== "system_status") {
            return {
              where() {
                return { get: async () => ({ forEach() {} }) };
              },
            };
          }

          return {
            where() {
              return {
                async get() {
                  return {
                    forEach(callback) {
                      docs.forEach((value, key) => callback({ id: key, data: () => value }));
                    },
                  };
                },
              };
            },
          };
        },
      },
    }));

    const router = require("../src/routes/adminConfigRoutes");
    app = express();
    app.use(express.json());
    app.use("/api/admin/config", router);
  });

  afterEach(() => {
    delete process.env.ENABLE_BACKGROUND_JOBS;
    delete process.env.WORKER_STATUS_STALE_SEC;
  });

  test("includes worker heartbeat status in env diagnostics", async () => {
    const res = await request(app).get("/api/admin/config/env-status").expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.backgroundJobsEnabled).toBe(true);
    expect(res.body.workerStatus).toBeDefined();
    expect(res.body.workerStatus.required).toContain("promotionTasks");
    expect(res.body.workerStatus.allHealthy).toBe(true);
    expect(res.body.workerStatus.details.promotionTasks).toMatchObject({
      found: true,
      ok: true,
      status: "ok",
    });
  });
});
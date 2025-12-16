const express = require("express");
const request = require("supertest");
const logger = require("../src/utils/logger");

describe("Frontend logs route", () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/internal", require("../src/routes/frontendLogsRoutes"));
  });

  it("accepts valid log payload and calls logger", async () => {
    const spy = jest.spyOn(logger, "info").mockImplementation(() => {});
    const res = await request(app)
      .post("/api/internal/frontend-logs")
      .send({ level: "info", message: "Test log", meta: { a: 1 } })
      .expect(202);
    expect(res.body.accepted).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects invalid payloads", async () => {
    await request(app).post("/api/internal/frontend-logs").send({}).expect(400);
  });
});

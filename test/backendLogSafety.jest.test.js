const express = require("express");
const request = require("supertest");
const {
  errorSummary,
  mediaOperationSummary,
  requestLogPath,
  safeLogText,
} = require("../src/utils/logSanitizer");
const accessLog = require("../src/middlewares/accessLog");

test("large render graphs and signed URLs never enter the operation log", () => {
  const options = {
    renderViral: true,
    smartCrop: true,
    userEmail: "private@example.test",
    viralData: {
      video_url: "https://media.test/a?Signature=secret",
      timeline_segments: [{ url: "secret" }],
      overlays: Array.from({ length: 1000 }, () => ({ text: "private creative text" })),
    },
  };
  const log = JSON.stringify(mediaOperationSummary(options, "viral_test"));
  expect(log).not.toMatch(/secret|private|media\.test/);
  expect(log.length).toBeLessThan(250);
  expect(JSON.parse(log)).toMatchObject({
    jobId: "viral_test",
    timelineSegments: 1,
    overlays: 1000,
  });
});

test("worker errors exclude signed URLs, bearer credentials, email and Axios config", () => {
  const error = new Error(
    "Failed https://storage.test/private.mp4?Signature=secret&Expires=123 for owner@example.test Bearer abc-secret\nsecond line"
  );
  error.response = { status: 403, data: { token: "secret" } };
  error.config = { headers: { Authorization: "secret" }, data: "secret" };
  error.request = error;
  const output = errorSummary(error);
  expect(output.status).toBe(403);
  expect(JSON.stringify(output)).not.toMatch(/secret|owner@|Signature|storage\.test|Authorization/);
  expect(output.message).not.toContain("\n");
  expect(safeLogText("x".repeat(100000))).toHaveLength(400);
  expect(requestLogPath("/api/discord/auth/callback?code=secret&state=secret")).toBe(
    "/api/discord/auth/callback"
  );
});

test("access logs redact every query, count the actual JSON body once and cannot inject another line", async () => {
  const logger = { info: jest.fn() },
    file = jest.fn();
  const payload = { content: Array.from({ length: 20 }, (_, id) => ({ id, title: "Café" })) };
  let serializations = 0;
  const app = express();
  app.use(accessLog(logger, file));
  app.get("/callback", (_req, res) =>
    res.json({
      ...payload,
      toJSON() {
        serializations++;
        return payload;
      },
    })
  );
  const response = await request(app)
    .get("/callback?code=secret&token=private")
    .set("User-Agent", 'Browser"test')
    .expect(200);
  expect(serializations).toBe(1);
  expect(logger.info).toHaveBeenCalledTimes(1);
  const line = logger.info.mock.calls[0][0];
  expect(line).toContain("GET /callback status=200");
  expect(line).toContain(`responseBytes=${Buffer.byteLength(response.text)}`);
  expect(line).not.toMatch(/secret|private|code=|token=/);
  expect(file.mock.calls[0][0]).toBe(line);
});

test("hosted runtimes suppress verbose account debug even if debug flags remain set", () => {
  const logger = require("../src/utils/logger");
  const prior = { RENDER: process.env.RENDER, DEBUG_TEST_LOGS: process.env.DEBUG_TEST_LOGS };
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  try {
    process.env.RENDER = "true";
    process.env.DEBUG_TEST_LOGS = "1";
    logger.debug("private@example.test", { token: "secret" });
    expect(log).not.toHaveBeenCalled();
  } finally {
    for (const [key, value] of Object.entries(prior))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    log.mockRestore();
  }
});

test("an unavailable logging sink cannot break an otherwise successful request", async () => {
  const app = express();
  app.use(
    accessLog({
      info() {
        throw new Error("sink unavailable");
      },
    })
  );
  app.get("/ok", (_req, res) => res.json({ ok: true }));
  expect((await request(app).get("/ok").expect(200)).body).toEqual({ ok: true });
});

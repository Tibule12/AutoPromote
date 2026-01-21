const request = require("supertest");
let server;
let app;

beforeAll(done => {
  // Ensure we use test bypass for Firestore admin shim during tests
  process.env.FIREBASE_ADMIN_BYPASS = "1";
  process.env.ENABLE_SLACK_ALERTS = "true";
  process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/ABC/XYZ";
  // Import app and start server
  app = require("../../server");
  server = app.listen(0, () => done());
});

afterAll(async () => {
  try {
    if (server && server.close) await new Promise(r => server.close(r));
  } catch (_) {}
});

describe("Metrics routes integration", () => {
  test("POST /api/metrics/test-alert sends Slack alert (admin token)", async () => {
    const slack = require("../../services/slackAlertService");
    const spy = jest.spyOn(slack, "sendSlackAlert").mockResolvedValue({ ok: true });

    const agent = request.agent(server);
    const res = await agent
      .post("/api/metrics/test-alert")
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ text: "Integration test alert" })
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.ok).toBe(true);
    expect(res.body.sent).toBeDefined();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  test("POST /api/metrics/test-alert fails when alerts disabled", async () => {
    // Temporarily disable
    process.env.ENABLE_SLACK_ALERTS = "false";
    const agent = request.agent(server);
    const res = await agent
      .post("/api/metrics/test-alert")
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ text: "Should not send" })
      .expect(400);
    expect(res.body.ok).toBe(false);
    // restore
    process.env.ENABLE_SLACK_ALERTS = "true";
  });
});

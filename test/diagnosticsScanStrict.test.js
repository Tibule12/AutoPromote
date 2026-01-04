const request = require("supertest");
const app = require("../src/server");
let server, agent;

describe("Diagnostics Integration Scan Strict", () => {
  beforeAll(done => {
    server = app.listen(0, () => {
      agent = request.agent(server);
      done();
    });
  });

  afterAll(async () => {
    try {
      await server.close();
    } catch (e) {}
  });

  it('scan should not fail (overall !== "failed") for seeded test environment', async () => {
    const res = await agent
      .get("/api/diagnostics/scan?dashboard=user")
      .set("Authorization", "Bearer test-token-for-testUser123")
      .expect(200);
    expect(res.body.results).toBeDefined();
    expect(["ok", "warning", "failed"]).toContain(res.body.results.overall);
    expect(res.body.results.overall).not.toBe("failed");
  }, 20000);
});

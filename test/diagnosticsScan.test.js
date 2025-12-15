const request = require("supertest");
const app = require("../src/server");
let server, agent;

describe("Diagnostics Integration Scan", () => {
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

  it("should run user-level scan and return checks", async () => {
    const res = await agent
      .get("/api/diagnostics/scan?dashboard=user")
      .set("Authorization", "Bearer test-token-for-testUser123")
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toBeDefined();
    expect(res.body.results.checks).toBeDefined();
    expect(["ok", "warning", "failed"]).toContain(res.body.results.overall);
    // Ensure recommendations are present for checks
    Object.entries(res.body.results.checks).forEach(([k, v]) => {
      expect(v.recommendation).toBeDefined();
    });
  });

  it("should run admin-level scan for admin users", async () => {
    const res = await agent
      .get("/api/diagnostics/scan?dashboard=admin")
      .set("Authorization", "Bearer test-token-for-adminUser")
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toBeDefined();
    expect(res.body.results.checks.admin).toBeDefined();
  });

  it("should not allow non-admin to run admin-level scan", async () => {
    await agent
      .get("/api/diagnostics/scan?dashboard=admin")
      .set("Authorization", "Bearer test-token-for-testUser123")
      .expect(403);
  });

  it("should store scan record when requested by admin", async () => {
    const res = await agent
      .get("/api/diagnostics/scan?dashboard=admin&store=1")
      .set("Authorization", "Bearer test-token-for-adminUser")
      .expect(200);
    expect(res.body.success).toBe(true);
    // Verify the scan is stored in DB
    const { db } = require("../src/firebaseAdmin");
    const snap = await db.collection("system_scans").orderBy("createdAt", "desc").limit(1).get();
    expect(!snap.empty).toBe(true);
  });

  it("admin can list stored scans", async () => {
    const res = await agent
      .get("/api/diagnostics/scans")
      .set("Authorization", "Bearer test-token-for-adminUser")
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.scans)).toBe(true);
  });
});

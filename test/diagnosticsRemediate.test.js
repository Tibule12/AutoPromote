const request = require("supertest");
const app = require("../src/server");
let server, agent;
const { db } = require("../src/firebaseAdmin");

describe("Diagnostics Remediation", () => {
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

  it("applies remediation for missing admin collection", async () => {
    // Ensure there is a stored scan simulating missing admin collection
    const { result } = await agent
      .get("/api/diagnostics/scan?dashboard=admin")
      .set("Authorization", "Bearer test-token-for-adminUser")
      .then(r => r.body);
    // Force the scan to have an 'admin' warning by clearing admins collection
    await db.collection("admins").doc("adminUser").delete();
    const store = await agent
      .get("/api/diagnostics/scan?dashboard=admin&store=1")
      .set("Authorization", "Bearer test-token-for-adminUser");
    // Find latest stored scan
    const snap = await db.collection("system_scans").orderBy("createdAt", "desc").limit(1).get();
    const scanDoc = snap.docs[0];
    expect(scanDoc.exists).toBe(true);
    // Remediate admin check
    const res = await agent
      .post(`/api/diagnostics/scans/${scanDoc.id}/remediate`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ checks: ["admin"] })
      .expect(200);
    expect(res.body.success).toBe(true);
    // After remediation, admin doc should exist
    const adminDoc = await db.collection("admins").doc("adminUser").get();
    expect(adminDoc.exists).toBe(true);
  }, 20000);
});

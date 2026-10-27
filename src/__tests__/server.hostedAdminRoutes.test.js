const request = require("supertest");

describe("hosted runtime admin setup isolation", () => {
  let app;
  const previous = process.env.K_SERVICE;
  beforeAll(() => {
    process.env.K_SERVICE = "isolated-hosted-fixture";
    process.env.FIREBASE_ADMIN_BYPASS = "1";
    process.env.CI_ROUTE_IMPORTS = "1";
    app = require("../server");
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = previous;
  });
  it("does not mount the unauthenticated admin provisioning endpoint", async () => {
    const result = await request(app).post("/api/setup-admin").send({});
    expect(result.status).toBe(404);
  });
});

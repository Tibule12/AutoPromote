/* eslint-disable no-undef */
const request = require("supertest");
const express = require("express");

// Setup app with the afterDarkRoutes mounted behind simple auth+requireAdultAccess stubs
const afterDarkRoutes = require("../../routes/afterDarkRoutes");

function makeApp(user) {
  const app = express();
  app.use(express.json());
  // simple auth middleware stub
  app.use((req, res, next) => {
    req.user = user || null;
    req.userId = user && user.uid;
    next();
  });
  // requireAdultAccess - reuse the real middleware
  const requireAdult = require("../../middleware/requireAdultAccess");
  app.use("/afterdark", requireAdult, afterDarkRoutes);
  return app;
}

describe("AfterDark routes", () => {
  test("GET /afterdark returns list for allowed user", async () => {
    const app = makeApp({ uid: "u1", kycVerified: true });
    const res = await request(app).get("/afterdark");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("shows");
  });

  test("POST /afterdark/show creates show for performer with kyc", async () => {
    const app = makeApp({ uid: "performer1", kycVerified: true, role: "performer" });
    const res = await request(app)
      .post("/afterdark/show")
      .send({ title: "Test Show", description: "desc" });
    expect([201, 202]).toContain(res.statusCode);
    if (res.statusCode === 201) expect(res.body.show).toHaveProperty("id");
  });

  test("POST /afterdark/show denied for non-kyc user", async () => {
    const app = makeApp({ uid: "u2" });
    const res = await request(app).post("/afterdark/show").send({ title: "x" });
    expect(res.statusCode).toBe(403);
  });
});

const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

jest.setTimeout(20000);

describe("soundProviderRoutes", () => {
  test("POST /api/sounds/import-provider imports from mocked provider", async () => {
    // mock provider
    jest.mock("../../services/providers/spotifyProvider", () => ({
      fetchTrending: async () => [{ id: "p1", title: "X" }],
    }));
    const originalDb = require("../../firebaseAdmin").db;
    // use in-memory stubbed db
    const testDb = require("../../firebaseAdmin").db;

    require("../../firebaseAdmin").db = testDb;
    const app = express();
    app.use(bodyParser.json());
    app.use("/api/sounds", require("../../routes/soundProviderRoutes"));
    const res = await request(app)
      .post("/api/sounds/import-provider")
      .send({ provider: "spotify", options: { limit: 1 } });
    expect(res.status).toBe(200);
    expect(res.body.addedCount).toBeGreaterThanOrEqual(1);

    require("../../firebaseAdmin").db = originalDb;
  });
});

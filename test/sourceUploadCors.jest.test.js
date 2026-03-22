const request = require("supertest");

process.env.CORS_ALLOW_ALL = "true";
process.env.FIREBASE_ADMIN_BYPASS = "1";

const app = require("../src/server");

describe("source upload CORS preflight", () => {
  test("OPTIONS /api/content/upload/source-file allows auth and content-type headers", async () => {
    const res = await request(app)
      .options("/api/content/upload/source-file")
      .set("Origin", "http://localhost:3001")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(String(res.headers["access-control-allow-origin"] || "")).toBe(
      "http://localhost:3001"
    );
    expect(String(res.headers["access-control-allow-headers"] || "")).toMatch(/authorization/i);
    expect(String(res.headers["access-control-allow-headers"] || "")).toMatch(/content-type/i);
  });
});
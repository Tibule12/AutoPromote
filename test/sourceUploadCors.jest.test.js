const request = require("supertest");

process.env.CORS_ALLOW_ALL = "true";
process.env.FIREBASE_ADMIN_BYPASS = "1";

const app = require("../src/server");

describe("API CORS preflight", () => {
  test("production ignores the broad override and preserves canonical site access", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const blocked = await request(app)
        .options("/api/auth/register")
        .set("Origin", "https://untrusted.example")
        .set("Access-Control-Request-Method", "POST");
      expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
      expect(blocked.status).toBeGreaterThanOrEqual(400);
      await request(app)
        .options("/api/auth/register")
        .set("Origin", "https://autopromote.org")
        .set("Access-Control-Request-Method", "POST")
        .expect(204);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
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

  test("OPTIONS /api/workspaces allows the active workspace header", async () => {
    const res = await request(app)
      .options("/api/workspaces")
      .set("Origin", "https://autopromote.org")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type,x-workspace-id")
      .expect(204);

    expect(String(res.headers["access-control-allow-origin"] || "")).toBe(
      "https://autopromote.org"
    );
    expect(String(res.headers["access-control-allow-headers"] || "")).toMatch(
      /x-workspace-id/i
    );
  });
});

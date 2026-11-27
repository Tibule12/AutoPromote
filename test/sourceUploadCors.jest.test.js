const request = require("supertest");

process.env.CORS_ALLOW_ALL = "true";
process.env.FIREBASE_ADMIN_BYPASS = "1";

const app = require("../src/server");

describe("API CORS preflight", () => {
  test("the public PayPal webhook reaches payment signature validation before generic platform routes", async () => {
    const previous = process.env.PAYPAL_WEBHOOK_ID;
    process.env.PAYPAL_WEBHOOK_ID = "WH-ROUTING-TEST";
    try {
      const res = await request(app).post("/api/paypal/webhook").send({}).expect(400);
      expect(res.body.error).toBe("missing_headers");
      expect(res.body.missing).toContain("paypal-transmission-sig");
      const platform = await request(app).post("/api/unknown/webhook").send({}).expect(400);
      expect(platform.body.error).toBe("unsupported_platform_for_webhook");
    } finally {
      if (previous === undefined) delete process.env.PAYPAL_WEBHOOK_ID;
      else process.env.PAYPAL_WEBHOOK_ID = previous;
    }
  });
  test.each(["/api/media/process", "/api/media/render-multicam", "/api/paypal-subscriptions/create-subscription"])(
    "the public browser can send approved-token and deduplication headers to %s",
    async path => {
      const res = await request(app).options(path)
        .set("Origin", "https://autopromote.org")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "authorization,content-type,idempotency-key,x-processing-tokens-approved")
        .expect(204);
      const headers = String(res.headers["access-control-allow-headers"]).toLowerCase().split(",").map(h => h.trim());
      expect(headers).toEqual(expect.arrayContaining(["authorization", "content-type", "idempotency-key", "x-processing-tokens-approved"]));
      expect(res.headers["access-control-allow-origin"]).toBe("https://autopromote.org");
    }
  );
  test("browser clients can read the declared upload retry cooldown", async () => {
    const res = await request(app).get("/health").set("Origin", "https://autopromote.org");
    expect(res.headers["access-control-allow-origin"]).toBe("https://autopromote.org");
    expect(String(res.headers["access-control-expose-headers"] || "")).toMatch(/retry-after/i);
  });

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

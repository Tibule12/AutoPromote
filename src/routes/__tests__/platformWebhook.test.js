const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");

jest.mock("../../firebaseAdmin", () => {
  // Minimal stub for db.collection('content').doc().get()/update()
  const docMock = (data = {}) => {
    let _data = data;
    return {
      get: async () => ({ exists: !!_data, id: _data.id || "stubid", data: () => _data }),
      update: async updates => {
        _data = { ..._data, ...updates };
        return true;
      },
    };
  };
  return {
    db: {
      collection: _name => ({
        doc: id => docMock({ id: id, idempotency_key: null }),
        where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
      }),
    },
    admin: { auth: () => ({}) },
  };
});

describe("platform webhook handler", () => {
  let app;

  beforeEach(() => {
    delete require.cache[require.resolve("../../routes/platformRoutes")];
    const router = require("../../routes/platformRoutes");
    app = express();
    app.use(bodyParser.json());
    app.use("/api", router);
  });

  test("rejects unsupported platform for webhook", async () => {
    const res = await request(app).post("/api/unknown/webhook").send({}).expect(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("unsupported_platform_for_webhook");
  });

  test("updates content when valid TikTok webhook received", async () => {
    const payload = {
      content_id: "abc123",
      status: "published",
      platform_post_url: "https://tiktok/123",
      published: true,
    };
    const res = await request(app).post("/api/tiktok/webhook").send(payload).expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.updated)).toBe(true);
  });

  test("rejects invalid secret when configured", async () => {
    process.env.TIKTOK_WEBHOOK_SECRET = "supersecret";
    const payload = { content_id: "abc123" };
    const res = await request(app)
      .post("/api/tiktok/webhook")
      .set("x-platform-webhook-secret", "wrong")
      .send(payload)
      .expect(401);
    expect(res.body.error).toBe("invalid_webhook_secret");
    delete process.env.TIKTOK_WEBHOOK_SECRET;
  });
});

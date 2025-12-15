const request = require("supertest");
const app = require("../src/server");

describe("Payments dev mock subscription", () => {
  beforeAll(() => {
    process.env.FIREBASE_ADMIN_BYPASS = "1";
    process.env.OPENAI_LOGGING_ENABLED = "1";
  });

  test("POST /api/payments/status/dev/mock/subscription simulates subscription", async () => {
    const res = await request(app)
      .post("/api/payments/status/dev/mock/subscription")
      .set("Authorization", "Bearer test-token-for-testUser123")
      .send({ plan: "premium", amount: 9.99 });
    expect([200, 201, 204]).toContain(res.statusCode);
  });
});

// Integration test for /api/content/upload
// Requires: jest, supertest, and your Express app

const request = require("supertest");
const app = require("../server");
let server;
let agent;

// Optional: Clean up Firestore and timers after tests to avoid Jest teardown errors
const { db } = require("../firebaseAdmin");

describe("Content Upload & Promotion Integration", () => {
  beforeAll(done => {
    server = app.listen(0, () => {
      agent = request.agent(server);
      done();
    });
  }, 30000); // Increase beforeAll timeout to 30s

  afterAll(async () => {
    try {
      if (db && db.terminate) {
        console.log("Terminating Firestore...");
        await db.terminate();
        console.log("Firestore terminated.");
      }
    } catch (e) {
      console.error("Error terminating Firestore:", e);
    }
    jest.clearAllTimers();
    if (server && server.close) {
      console.log("Closing Express server...");
      await new Promise(resolve => server.close(resolve));
      console.log("Express server closed.");
    }
  }, 30000); // Increase afterAll timeout to 30s

  it("should upload content and create promotion schedules for all platforms", async () => {
    // Use an admin user so promotion schedules are created in the admin flow
    const testUserId = "adminUser123";
    const payload = {
      title: "Test Content",
      type: "video",
      url: "https://example.com/video.mp4",
      description: "This is a test video.",
      target_platforms: ["youtube", "tiktok", "instagram", "facebook", "twitter"],
      scheduled_promotion_time: new Date(Date.now() + 3600000).toISOString(),
      promotion_frequency: "once",
      schedule_hint: {
        when: new Date(Date.now() + 3600000).toISOString(),
        frequency: "once",
        timezone: "UTC",
      },
      auto_promote: { youtube: { enabled: true }, twitter: { enabled: true } },
      meta: { trimStart: 0, trimEnd: 10, template: "youtube" },
      quality_score: 95,
      quality_feedback: [],
      quality_enhanced: true,
    };

    console.log("Starting POST /api/content/upload integration test...");
    const normalize = require("../../test/utils/normalizeApiResponse");
    let res;
    let status, apiBody;
    try {
      res = await agent
        .post("/api/content/upload")
        .set("Authorization", `Bearer test-token-for-${testUserId}`)
        // Avoid E2E bypass that returns minimal response when host is localhost
        .set("Host", "example.com")
        .send(payload);
      ({ status, body: apiBody } = normalize(res.body, res.statusCode));
      console.log("POST /api/content/upload response:", status, apiBody);
    } catch (err) {
      console.error("Error during POST /api/content/upload:", err);
      throw err;
    }

    expect(status).toBe(201);
    expect(apiBody.content).toBeDefined();
    expect(apiBody.promotion_schedule).toBeDefined();
    expect(apiBody.content.target_platforms.length).toBeGreaterThanOrEqual(5);
    expect(apiBody.promotion_schedule.status).toBe("scheduled_background");
    // As an admin user this upload is auto-approved in the admin flow
    expect(apiBody.content.status).toBe("approved");
    // Background processing means these fields appear later in DB, not in immediate response
    // expect(res.body.growth_guarantee_badge).toBeDefined();
    // expect(res.body.auto_promotion).toBeDefined();
    // Add more assertions for notifications, tracking, etc. as needed
  }, 30000); // Set timeout to 30 seconds

  it("should ignore bounty when target platforms are TikTok-only", async () => {
    const testUserId = "adminUserBounty";
    const payload = {
      title: "Bounty Test",
      type: "video",
      url: "https://example.com/video.mp4",
      description: "Bounty should be ignored for TikTok-only",
      target_platforms: ["tiktok"],
      bounty: { amount: 100, niche: "music", paymentMethodId: "tok_bypass" },
    };

    const res = await agent
      .post("/api/content/upload")
      .set("Authorization", `Bearer test-token-for-${testUserId}`)
      .set("Host", "example.com")
      .send(payload);

    expect(res.statusCode).toBe(201);
    expect(res.body.content).toBeDefined();
    expect(res.body.content.has_bounty).toBeFalsy();
    expect(res.body.content.viral_bounty_id).toBeFalsy();
  }, 30000);
});

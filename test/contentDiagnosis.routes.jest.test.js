const request = require("supertest");
const app = require("../src/server");
const { db } = require("../src/firebaseAdmin");

jest.setTimeout(20000);

describe("content diagnosis and remediation routes", () => {
  const contentId = "diag-content-001";
  let previousAutomationConfig = null;
  let previousBillingData = null;

  beforeAll(async () => {
    const globalConfigRef = db.collection("system_config").doc("global");
    const configSnap = await globalConfigRef.get();
    previousAutomationConfig = configSnap.exists
      ? (configSnap.data() || {}).recoveryAutomation || null
      : null;

    const billingRef = db.collection("user_billing").doc("testUser123");
    const billingSnap = await billingRef.get();
    previousBillingData = billingSnap.exists ? billingSnap.data() || null : null;

    await globalConfigRef.set(
      {
        recoveryAutomation: {
          enabled: true,
          rolloutPercent: 100,
          canaryUserIds: [],
          killSwitch: false,
          updatedAt: new Date().toISOString(),
          updatedBy: "test-suite",
        },
      },
      { merge: true }
    );

    await db
      .collection("content")
      .doc(contentId)
      .set(
        {
          user_id: "testUser123",
          userId: "testUser123",
          title: "Short",
          description: "Low-performing test content",
          target_platforms: ["twitter", "instagram"],
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );

    await db
      .collection("user_billing")
      .doc("testUser123")
      .set(
        {
          tier: "pro",
          status: "active",
        },
        { merge: true }
      );
  });

  afterAll(async () => {
    try {
      await db.collection("content").doc(contentId).delete();
    } catch (_) {}
    try {
      await db.collection("content_diagnosis").doc(contentId).delete();
    } catch (_) {}
    try {
      await db
        .collection("user_billing")
        .doc("testUser123")
        .set(previousBillingData || {}, { merge: false });
      if (!previousBillingData) {
        await db.collection("user_billing").doc("testUser123").delete();
      }
    } catch (_) {}
    try {
      await db
        .collection("system_config")
        .doc("global")
        .set(
          {
            recoveryAutomation: previousAutomationConfig || {
              enabled: true,
              rolloutPercent: 100,
              canaryUserIds: [],
              killSwitch: false,
            },
          },
          { merge: true }
        );
    } catch (_) {}
  });

  test("GET /api/content/:id/diagnosis computes and persists diagnosis for owner", async () => {
    const res = await request(app)
      .get(`/api/content/${contentId}/diagnosis`)
      .set("Authorization", "Bearer test-token-for-testUser123");

    expect(res.statusCode).toBe(200);
    expect(res.body.diagnosis).toBeDefined();
    expect(res.body.diagnosis).toHaveProperty("status");
    expect(res.body.diagnosis).toHaveProperty("recommendations");

    const persisted = await db.collection("content_diagnosis").doc(contentId).get();
    expect(persisted.exists).toBe(true);
  });

  test("POST /api/content/:id/diagnosis/remediate returns remediation actions", async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/diagnosis/remediate`)
      .set("Authorization", "Bearer test-token-for-testUser123")
      .send({ dryRun: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.remediation).toBeDefined();
    expect(Array.isArray(res.body.remediation.actions)).toBe(true);
  });

  test("GET /api/admin/analytics/content/:id/diagnosis works for admin", async () => {
    const res = await request(app)
      .get(`/api/admin/analytics/content/${contentId}/diagnosis`)
      .set("Authorization", "Bearer test-token-for-adminUser");

    expect(res.statusCode).toBe(200);
    expect(res.body.diagnosis).toBeDefined();
    expect(res.body.diagnosis).toHaveProperty("healthScore");
  });

  test("POST /api/admin/analytics/content/:id/diagnosis/remediate works for admin", async () => {
    const res = await request(app)
      .post(`/api/admin/analytics/content/${contentId}/diagnosis/remediate`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ dryRun: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.remediation).toBeDefined();
    expect(Array.isArray(res.body.remediation.actions)).toBe(true);
  });

  test("GET /api/content/:id/diagnosis/history returns list", async () => {
    const res = await request(app)
      .get(`/api/content/${contentId}/diagnosis/history?limit=5`)
      .set("Authorization", "Bearer test-token-for-testUser123");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  test("GET and PUT /api/content/:id/diagnosis/policy work for owner", async () => {
    const putRes = await request(app)
      .put(`/api/content/${contentId}/diagnosis/policy`)
      .set("Authorization", "Bearer test-token-for-testUser123")
      .send({ enabled: true, cadenceHours: 12, maxDailyRuns: 1, dryRunOnly: true });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.body.policy).toBeDefined();

    const getRes = await request(app)
      .get(`/api/content/${contentId}/diagnosis/policy`)
      .set("Authorization", "Bearer test-token-for-testUser123");
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.policy).toBeDefined();
    expect(getRes.body.policy.policy).toBeDefined();
    expect(getRes.body.policy.policy.enabled).toBe(true);
  });

  test("POST /api/content/:id/diagnosis/run-auto returns result", async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/diagnosis/run-auto`)
      .set("Authorization", "Bearer test-token-for-testUser123")
      .send({ dryRun: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.autoRun).toBeDefined();
  });

  test("Admin diagnosis history and policy routes work", async () => {
    const historyRes = await request(app)
      .get(`/api/admin/analytics/content/${contentId}/diagnosis/history?limit=5`)
      .set("Authorization", "Bearer test-token-for-adminUser");
    expect(historyRes.statusCode).toBe(200);
    expect(Array.isArray(historyRes.body.history)).toBe(true);

    const policyPutRes = await request(app)
      .put(`/api/admin/analytics/content/${contentId}/diagnosis/policy`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ enabled: false, cadenceHours: 24 });
    expect(policyPutRes.statusCode).toBe(200);
    expect(policyPutRes.body.policy).toBeDefined();

    const runDueRes = await request(app)
      .post(`/api/admin/analytics/diagnosis/run-due`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ dryRun: true, limit: 999 });
    expect(runDueRes.statusCode).toBe(200);
    expect(runDueRes.body).toHaveProperty("processedCount");
    expect(runDueRes.body).toHaveProperty("maxPerRun");
    expect(runDueRes.body).toHaveProperty("effectiveLimit");
    expect(runDueRes.body.effectiveLimit).toBeLessThanOrEqual(runDueRes.body.maxPerRun);
    expect(runDueRes.body.capApplied).toBe(true);
  });

  test("Admin safety dashboard returns 24h reliability stats", async () => {
    const res = await request(app)
      .get(`/api/admin/analytics/diagnosis/safety-dashboard?hours=24&limit=200`)
      .set("Authorization", "Bearer test-token-for-adminUser");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("dashboard");
    expect(res.body.dashboard).toHaveProperty("windowHours");
    expect(res.body.dashboard).toHaveProperty("rates");
    expect(res.body.dashboard.rates).toHaveProperty("lockContentionRatePct");
    expect(res.body.dashboard.rates).toHaveProperty("itemErrorRatePct");
  });

  test("Admin automation status endpoints can update rollout config", async () => {
    const getRes = await request(app)
      .get(`/api/admin/analytics/diagnosis/automation/status`)
      .set("Authorization", "Bearer test-token-for-adminUser");
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body).toHaveProperty("automation");

    const putRes = await request(app)
      .put(`/api/admin/analytics/diagnosis/automation/status`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ enabled: true, rolloutPercent: 25, canaryUserIds: ["testUser123"] });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.body.automation.rolloutPercent).toBe(25);
    expect(Array.isArray(putRes.body.automation.canaryUserIds)).toBe(true);
  });

  test("Admin emergency disable blocks due-policy execution", async () => {
    const disableRes = await request(app)
      .post(`/api/admin/analytics/diagnosis/automation/disable`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ reason: "test_rollback" });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.body.automation.killSwitch).toBe(true);

    const runDueRes = await request(app)
      .post(`/api/admin/analytics/diagnosis/run-due`)
      .set("Authorization", "Bearer test-token-for-adminUser")
      .send({ dryRun: true, limit: 5 });

    expect(runDueRes.statusCode).toBe(200);
    expect(runDueRes.body.blocked).toBe(true);
    expect(runDueRes.body.blockReason).toBe("kill_switch");
  });
});

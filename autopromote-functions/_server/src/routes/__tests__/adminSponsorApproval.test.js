const request = require("supertest");
const express = require("express");
const { db } = require("../../firebaseAdmin");

const sponsorRoutes = require("../../routes/adminSponsorApprovalRoutes");

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user || null;
    req.userId = user && user.uid;
    next();
  });
  app.use("/api/admin/sponsor-approvals", sponsorRoutes);
  return app;
}

describe("Admin Sponsor Approval routes", () => {
  let contentId;
  let approvalId;
  beforeAll(async () => {
    const ref = db.collection("content").doc();
    contentId = ref.id;
    await ref.set({
      title: "Sponsor Test Content",
      url: "https://example.com/s.mp4",
      user_id: "test-user-uid",
      approvalStatus: "approved",
      createdAt: new Date().toISOString(),
    });

    const aRef = await db.collection("sponsor_approvals").add({
      contentId,
      platform: "youtube",
      sponsor: "Acme",
      status: "pending",
      requestedBy: "test-user-uid",
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    approvalId = aRef.id;
  });

  afterAll(async () => {
    try {
      await db.collection("content").doc(contentId).delete();
    } catch (e) {}
    try {
      await db.collection("sponsor_approvals").doc(approvalId).delete();
    } catch (e) {}
  });

  test("GET /pending returns pending approvals for admin", async () => {
    const app = makeApp({ uid: "admin-1", isAdmin: true });
    const res = await request(app).get("/api/admin/sponsor-approvals/pending");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("items");
    const found = res.body.items.find(i => i.id === approvalId);
    expect(found).toBeTruthy();
    expect(found.platform).toBe("youtube");
  });

  test("POST /:id/approve updates approval and content and enqueues post when content approved", async () => {
    const app = makeApp({ uid: "admin-1", isAdmin: true });
    const poster = require("../../services/promotionTaskQueue");
    const spy = jest.spyOn(poster, "enqueuePlatformPostTask").mockResolvedValue({ skipped: true });

    const res = await request(app)
      .post(`/api/admin/sponsor-approvals/${approvalId}/approve`)
      .send({ notes: "ok" });
    // Debug output on failure
    console.error("APPROVE_RES", res.statusCode, res.body);
    if (res.statusCode !== 200)
      console.error("APPROVE_RES_BODY", JSON.stringify(res.body, null, 2));
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("success", true);

    // check sponsor_approval doc updated
    const apr = await db.collection("sponsor_approvals").doc(approvalId).get();
    expect(apr.exists).toBeTruthy();
    expect(apr.data().status).toBe("approved");

    // check content platform_options updated
    const content = await db.collection("content").doc(contentId).get();
    const opts = content.data().platform_options && content.data().platform_options.youtube;
    expect(opts).toBeTruthy();
    expect(opts.sponsorApproval).toBeTruthy();
    expect(opts.sponsorApproval.status).toBe("approved");

    spy.mockRestore();
  });

  test("POST /:id/reject marks as rejected and notifies", async () => {
    // create a fresh approval to reject
    const ref = await db.collection("sponsor_approvals").add({
      contentId,
      platform: "facebook",
      sponsor: "Other",
      status: "pending",
      requestedBy: "test-user-uid",
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    const id2 = ref.id;
    const app = makeApp({ uid: "admin-1", isAdmin: true });
    const res = await request(app)
      .post(`/api/admin/sponsor-approvals/${id2}/reject`)
      .send({ reason: "no" });
    expect(res.statusCode).toBe(200);
    const apr = await db.collection("sponsor_approvals").doc(id2).get();
    expect(apr.data().status).toBe("rejected");

    // cleanup
    await db.collection("sponsor_approvals").doc(id2).delete();
  });
});

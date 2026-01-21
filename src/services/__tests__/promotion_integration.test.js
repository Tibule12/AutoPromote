const { db } = require("../../firebaseAdmin");
const { enqueuePlatformPostTask, processNextPlatformTask } = require("../promotionTaskQueue");

jest.setTimeout(30000);

describe("Promotion integration (mocked platforms)", () => {
  let contentId;
  let uid = "test-user-uid";

  beforeAll(async () => {
    // create a content doc
    const ref = db.collection("content").doc();
    contentId = ref.id;
    await ref.set({
      title: "Integration Test Content",
      description: "Test description",
      url: "https://example.com/content.mp4",
      processedUrl: "https://example.com/content.mp4",
      userId: uid,
      approvalStatus: "approved",
      createdAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    // cleanup content and any tasks/posts created
    await db
      .collection("content")
      .doc(contentId)
      .delete()
      .catch(() => {});
    // remove promotion tasks and platform_posts linked to content
    const tasks = await db.collection("promotion_tasks").where("contentId", "==", contentId).get();
    const batch = db.batch();
    tasks.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(() => {});
    const posts = await db.collection("platform_posts").where("contentId", "==", contentId).get();
    const b2 = db.batch();
    posts.forEach(d => b2.delete(d.ref));
    await b2.commit().catch(() => {});
  });

  test("enqueue -> process success (mock dispatch)", async () => {
    const platform = "twitter";

    // enqueue
    const res = await enqueuePlatformPostTask({
      contentId,
      uid,
      platform,
      reason: "approved",
      payload: { message: "Hello World" },
    });
    expect(res).toHaveProperty("id");

    // stub verifySignature to pass
    const signer = require("../../utils/docSigner");
    jest.spyOn(signer, "verifySignature").mockReturnValue(true);

    // stub platform dispatch
    const poster = require("../platformPoster");
    const spyDispatch = jest
      .spyOn(poster, "dispatchPlatformPost")
      .mockResolvedValue({ success: true, externalId: "ext123" });

    // run processor
    const out = await processNextPlatformTask();
    expect(out).toBeTruthy();
    expect(out).toHaveProperty("taskId");

    // check task doc updated to completed
    const taskDoc = await db.collection("promotion_tasks").doc(out.taskId).get();
    expect(taskDoc.exists).toBe(true);
    const data = taskDoc.data();
    expect(data.status).toBe("completed");

    // check platform post recorded
    const postsSnap = await db
      .collection("platform_posts")
      .where("contentId", "==", contentId)
      .get();
    expect(postsSnap.size).toBeGreaterThan(0);

    spyDispatch.mockRestore();
    signer.verifySignature.mockRestore();
  });

  test("duplicate pending prevented", async () => {
    const platform = "twitter";
    // First enqueue
    const r1 = await enqueuePlatformPostTask({
      contentId,
      uid,
      platform,
      reason: "approved",
      payload: {},
    });
    expect(r1).toHaveProperty("id");
    // Second enqueue should detect duplicate pending and return skipped
    const r2 = await enqueuePlatformPostTask({
      contentId,
      uid,
      platform,
      reason: "approved",
      payload: {},
    });
    expect(r2).toHaveProperty("skipped");
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe("duplicate_pending");
  });

  test("transient errors cause retry", async () => {
    const platform = "twitter";
    const res = await enqueuePlatformPostTask({
      contentId,
      uid,
      platform,
      reason: "approved",
      payload: {},
    });
    const signer = require("../../utils/docSigner");
    jest.spyOn(signer, "verifySignature").mockReturnValue(true);
    const poster = require("../platformPoster");
    const spyDispatch = jest
      .spyOn(poster, "dispatchPlatformPost")
      .mockRejectedValue(new Error("Rate limit 429"));

    const out = await processNextPlatformTask();
    expect(out).toHaveProperty("error");
    expect(out.retrying).toBe(true);

    // ensure task attempts incremented and status returned to 'queued'
    const taskDoc = await db.collection("promotion_tasks").doc(out.taskId).get();
    const d = taskDoc.data();
    expect(d.attempts).toBeGreaterThanOrEqual(1);
    expect(["queued", "failed"]).toContain(d.status);

    spyDispatch.mockRestore();
    signer.verifySignature.mockRestore();
  });

  test("auth errors mark failed", async () => {
    const platform = "twitter";
    const res = await enqueuePlatformPostTask({
      contentId,
      uid,
      platform,
      reason: "approved",
      payload: {},
    });
    const signer = require("../../utils/docSigner");
    jest.spyOn(signer, "verifySignature").mockReturnValue(true);
    const poster = require("../platformPoster");
    const spyDispatch = jest
      .spyOn(poster, "dispatchPlatformPost")
      .mockRejectedValue(new Error("401 unauthorized"));

    const out = await processNextPlatformTask();
    expect(out).toHaveProperty("error");
    expect(out.retrying).toBe(false);

    const taskDoc = await db.collection("promotion_tasks").doc(out.taskId).get();
    const d = taskDoc.data();
    expect(d.status).toBe("failed");

    spyDispatch.mockRestore();
    signer.verifySignature.mockRestore();
  });
});

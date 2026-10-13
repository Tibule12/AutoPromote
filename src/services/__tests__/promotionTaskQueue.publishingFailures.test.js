jest.mock("../../firebaseAdmin", () => ({
  db: { collection: jest.fn() },
  admin: { firestore: { FieldValue: { serverTimestamp: () => new Date() } } },
}));
jest.mock("../aggregationService", () => ({
  recordTaskCompletion: jest.fn(),
  recordRateLimitEvent: jest.fn(),
}));
jest.mock("../rateLimitTracker", () => ({
  getCooldown: jest.fn().mockResolvedValue(null),
  noteRateLimit: jest.fn(),
}));
jest.mock("../notificationEngine", () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../billingService", () => ({}));
jest.mock("../platformPoster", () => ({ dispatchPlatformPost: jest.fn() }));
jest.mock("../platformPostsService", () => ({
  recordPlatformPost: jest.fn(),
  tryCreatePlatformPostLock: jest.fn().mockResolvedValue({ created: true, id: "post-lock" }),
  finalizePlatformPostById: jest.fn().mockResolvedValue({}),
}));

const { db } = require("../../firebaseAdmin");
const { dispatchPlatformPost } = require("../platformPoster");
const { finalizePlatformPostById, tryCreatePlatformPostLock } = require("../platformPostsService");
const { sendNotification } = require("../notificationEngine");
const { processNextPlatformTask } = require("../promotionTaskQueue");
const { publishingError } = require("../publishingTaskErrors");

let task, taskRef, deadLetter;
beforeEach(() => {
  jest.clearAllMocks();
  task = {
    _testStub: true,
    type: "platform_post",
    platform: "linkedin",
    uid: "owner",
    contentId: "content",
    postHash: "hash",
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
    payload: { text: "hello" },
  };
  taskRef = {
    set: jest.fn(async data => {
      task = data;
    }),
    update: jest.fn(async data => {
      task = { ...task, ...data };
    }),
  };
  deadLetter = { set: jest.fn().mockResolvedValue(undefined) };
  db.collection.mockImplementation(name => {
    if (name === "promotion_tasks") {
      const query = {
        where: jest.fn(() => query),
        orderBy: jest.fn(() => query),
        limit: jest.fn(() => query),
        get: async () => ({
          empty: !["queued", "processing"].includes(task.status),
          docs: [{ id: "task-1", ref: taskRef, data: () => task }],
        }),
      };
      return query;
    }
    if (name === "dead_letter_tasks") return { doc: () => deadLetter };
    const query = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      get: async () => ({ empty: true, size: 0, forEach: () => {} }),
      doc: () => ({ get: async () => ({ exists: false }) }),
    };
    return query;
  });
});

test("expired LinkedIn token fails once and finalizes the real lock", async () => {
  dispatchPlatformPost.mockRejectedValueOnce(
    new Error('Failed to get LinkedIn profile: {"status":401,"code":"EXPIRED_ACCESS_TOKEN"}')
  );
  const result = await processNextPlatformTask();
  expect(result).toMatchObject({ classification: "auth", retrying: false });
  expect(task).toMatchObject({
    status: "failed",
    attempts: 1,
    errorClass: "auth",
    nextAttemptAt: null,
  });
  expect(deadLetter.set).toHaveBeenCalledTimes(1);
  expect(finalizePlatformPostById).toHaveBeenCalledWith(
    "post-lock",
    expect.objectContaining({ success: false, publicationPending: false })
  );
  expect(await processNextPlatformTask()).toBeNull();
  expect(dispatchPlatformPost).toHaveBeenCalledTimes(1);
});

test("Reddit acknowledgement is retained and a retry only verifies publication", async () => {
  task.platform = "reddit";
  const receipt = {
    submittedAt: new Date().toISOString(),
    title: "hello",
    subreddit: "test",
    kind: "video",
  };
  dispatchPlatformPost.mockImplementationOnce(async args => {
    await args.onSubmissionAccepted(receipt);
    return {
      success: false,
      error: "Awaiting Reddit confirmation",
      errorClass: "publication_pending",
    };
  });
  const first = await processNextPlatformTask();
  expect(first).toMatchObject({ classification: "publication_pending", retrying: true });
  expect(task).toMatchObject({
    status: "queued",
    publicationPending: true,
    publicationReceipt: receipt,
  });
  expect(sendNotification).not.toHaveBeenCalled();
  expect(finalizePlatformPostById).toHaveBeenCalledWith(
    "post-lock",
    expect.objectContaining({ success: null, publicationPending: true })
  );
  task.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
  dispatchPlatformPost.mockResolvedValueOnce({
    success: true,
    postId: "abc123",
    url: "https://www.reddit.com/r/test/comments/abc123/",
  });
  await processNextPlatformTask();
  expect(dispatchPlatformPost.mock.calls[1][0].submissionReceipt).toEqual(receipt);
  expect(task).toMatchObject({ status: "completed", publicationPending: false });
  expect(sendNotification).toHaveBeenCalledTimes(1);
});

test("another task cannot take over an acknowledged Reddit submission", async () => {
  task.platform = "reddit";
  tryCreatePlatformPostLock.mockResolvedValueOnce({
    created: false,
    id: "post-lock",
    existing: { taskId: "original", success: null, publicationPending: true },
  });
  const result = await processNextPlatformTask();
  expect(result).toMatchObject({ skipped: true, reason: "duplicate_pending" });
  expect(dispatchPlatformPost).not.toHaveBeenCalled();
});

test("an ambiguous accepted result is terminal and retains its receipt", async () => {
  task.platform = "reddit";
  dispatchPlatformPost.mockImplementationOnce(async args => {
    await args.onSubmissionAccepted({ submittedAt: new Date().toISOString() });
    throw publishingError("Provider acknowledgement is incomplete", "publication_unconfirmed");
  });
  const result = await processNextPlatformTask();
  expect(result).toMatchObject({ retrying: false, classification: "publication_unconfirmed" });
  expect(task.publicationReceipt).toBeDefined();
});

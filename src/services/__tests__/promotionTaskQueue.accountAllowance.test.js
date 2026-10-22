jest.mock("../../firebaseAdmin", () => ({ db: { collection: jest.fn(), runTransaction: jest.fn() }, admin: {} }));
jest.mock("../aggregationService", () => ({
  recordTaskCompletion: jest.fn(), recordRateLimitEvent: jest.fn(),
  recordPlatformPostDuplicate: jest.fn(), recordTaskEnqueued: jest.fn(),
}));
jest.mock("../rateLimitTracker", () => ({ getCooldown: jest.fn(), noteRateLimit: jest.fn() }));
jest.mock("../notificationEngine", () => ({ sendNotification: jest.fn().mockResolvedValue() }));
jest.mock("../../utils/docSigner", () => ({ attachSignature: value => value }));
jest.mock("../billingService", () => ({
  ...jest.requireActual("../billingService"), getEffectiveTierSnapshot: jest.fn(),
}));

const { db } = require("../../firebaseAdmin");
const billing = require("../billingService");
const { enqueuePlatformPostTask } = require("../promotionTaskQueue");
const environmentKeys = ["CI_ROUTE_IMPORTS", "FIREBASE_ADMIN_BYPASS", "NODE_ENV", "JEST_WORKER_ID"];
let savedEnvironment, used, taskWrite, contentWrite, contentState;

beforeEach(() => {
  jest.clearAllMocks();
  savedEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  // Exercise the real quota path with an isolated database, not the CI shortcut.
  for (const key of environmentKeys) delete process.env[key];
  process.env.NODE_ENV = "development";
  used = 150;
  taskWrite = jest.fn().mockResolvedValue();
  contentWrite = jest.fn().mockResolvedValue();
  contentState = { uid: "allowance-owner" };
  db.runTransaction.mockImplementation(async callback => callback({
    get: ref => ref.get(),
    set: (ref, ...args) => ref.set(...args),
  }));
  billing.getEffectiveTierSnapshot.mockImplementation(async uid => ({
    tierId: "premium", testerAccess: null,
    billingData: uid === "allowance-owner" ? { publishingAllowance: { monthlyLimit: 1000 } } : {},
  }));
  db.collection.mockImplementation(name => {
    const filters = [];
    const query = {
      where: (field, op, value) => { filters.push({ field, op, value }); return query; },
      orderBy: () => query, select: () => query, limit: () => query,
      get: async () => {
        const quotaQuery = name === "promotion_tasks" && filters.some(f => f.field === "createdAt");
        const docs = quotaQuery ? Array.from({ length: used }, () => ({ data: () => ({ status: "completed" }) })) : [];
        return { docs, empty: docs.length === 0, size: docs.length, forEach: visit => docs.forEach(visit) };
      },
      add: jest.fn().mockResolvedValue({ id: "audit-event" }),
      doc: id => ({
        id: id || "new-task",
        get: async () => name === "content"
          ? { exists: true, data: () => contentState }
          : { exists: false },
        set: name === "promotion_tasks" ? taskWrite : contentWrite,
      }),
    };
    return query;
  });
});

afterEach(() => {
  for (const key of environmentKeys) {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  }
});

test("the account allowance permits its next scheduled post after the default 150 slots", async () => {
  const result = await enqueuePlatformPostTask({
    uid: "allowance-owner", contentId: "owned-film", platform: "instagram", reason: "scheduled_event",
  });
  expect(result).toMatchObject({ id: "new-task", status: "queued", uid: "allowance-owner" });
  expect(result._testStub).toBeUndefined();
  expect(taskWrite).toHaveBeenCalledTimes(1);
  expect(db.runTransaction).toHaveBeenCalledTimes(1);
  expect(contentWrite).toHaveBeenCalledWith(
    { lastMediaDependencyAt: expect.any(String) }, { merge: true }
  );
});

test("the allowance does not bypass expired published-media protection", async () => {
  contentState.storageRetentionStatus = "deleted_after_publication";
  await expect(enqueuePlatformPostTask({
    uid: "allowance-owner", contentId: "owned-film", platform: "instagram", reason: "scheduled_event",
  })).rejects.toMatchObject({ code: "PUBLISHED_MEDIA_EXPIRED", status: 409 });
  expect(taskWrite).not.toHaveBeenCalled();
});

test("another account on the same plan is still blocked at 150", async () => {
  const result = await enqueuePlatformPostTask({
    uid: "normal-owner", contentId: "owned-film", platform: "instagram", reason: "scheduled_event",
  });
  expect(result).toMatchObject({ skipped: true, reason: "quota_exceeded", quota: 150 });
  expect(taskWrite).not.toHaveBeenCalled();
});

test("the raised account allowance still blocks at its own 1000-slot boundary", async () => {
  used = 1000;
  const result = await enqueuePlatformPostTask({
    uid: "allowance-owner", contentId: "owned-film", platform: "instagram", reason: "scheduled_event",
  });
  expect(result).toMatchObject({ skipped: true, reason: "quota_exceeded", quota: 1000 });
  expect(taskWrite).not.toHaveBeenCalled();
});

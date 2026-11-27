const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
const { createProcessingService } = require("../../src/services/processingTokens/service");
const { DAY, OPERATIONS } = require("../../src/services/processingTokens/policy");
const db = createSandboxDatabase();
let clock = Date.parse("2026-11-26T08:00:00Z");
const tiers = new Map();
const service = createProcessingService({
  db,
  now: () => clock,
  entitlement: (_, uid) => tiers.get(uid) || "free",
});
const uid = () => "free-" + crypto.randomUUID();
const reservation = (operation = "clips.analyze", requestId = crypto.randomUUID()) => ({
  operation,
  requestId,
  fingerprint: "bound-to-server-source",
  approvedTokens: service.quote(operation).tokens,
});
before(async () => {
  await service.configure({ enabled: true });
});
after(async () => {
  await db.terminate();
});
test("Free and Plus share every creative feature and six destinations; legacy agreements remain resolvable", () => {
  const {
    SUBSCRIPTION_PLANS,
    getPlanCapabilities,
    resolvePlan,
  } = require("../../src/config/subscriptionPlans");
  assert.deepEqual(Object.keys(SUBSCRIPTION_PLANS), ["free", "plus"]);
  for (const tier of ["free", "plus", "premium", "pro", "enterprise"]) {
    assert.equal(require("../../src/config/subscriptionPlans").getPlatformLimitForPlan(tier), 6);
    assert.ok(Object.values(getPlanCapabilities(tier).editing.features).every(f => f.enabled));
  }
  assert.equal(resolvePlan("pro").features.monthlyCredits, 500);
  const offers = require("../../frontend/src/config/subscriptionOffers.json");
  assert.deepEqual(
    offers.map(p => p.processing),
    Object.values(SUBSCRIPTION_PLANS).map(p => p.processing)
  );
});
test("exact six-day reset persists its anchor; status does not repeatedly refill", async () => {
  const user = uid(),
    initial = await service.status(user);
  const r = reservation();
  await service.reserve(user, r);
  await service.start(user, r.requestId);
  await service.settle(user, r.requestId, {
    eventId: "result",
    success: true,
    stopped: true,
    actualMicros: 15000,
  });
  assert.equal((await service.status(user)).remaining, 85);
  clock += 6 * DAY - 1;
  assert.equal((await service.status(user)).remaining, 85);
  clock++;
  assert.equal((await service.status(user)).remaining, 100);
  assert.equal(
    Date.parse(initial.nextResetAt) + 6 * DAY,
    Date.parse((await service.status(user)).nextResetAt)
  );
});
test('repeated status reads do not rewrite the financial account; the exact renewal still persists once',async()=>{
 const user=uid();await service.status(user);
 const ref=(await db.collection('processing_accounts').where('userId','==',user).get()).docs[0].ref;
 const before=await ref.get();
 for(let n=0;n<30;n++)await service.status(user);
 const after=await ref.get();assert.equal(after.updateTime.toMillis(),before.updateTime.toMillis());
 const priorClock=clock;clock=after.data().resetAt;
 const renewed=await service.status(user);assert.equal(renewed.remaining,100);
 const reset=await ref.get();assert.notEqual(reset.updateTime.toMillis(),after.updateTime.toMillis());
 await service.status(user);assert.equal((await ref.get()).updateTime.toMillis(),reset.updateTime.toMillis());
 clock=priorClock;
});
test("Plus receives 500 with a 24-hour reset and 2000 rolling ceiling", async () => {
  const user = uid();
  tiers.set(user, "plus");
  const s = await service.status(user);
  assert.equal(s.allowance, 500);
  assert.equal(s.rolling30DayLimit, 2000);
  assert.equal(Date.parse(s.nextResetAt) - clock, DAY);
});
test("concurrent duplicate reservation has one winner, one debit and one dispatch", async () => {
  const user = uid(),
    r = reservation();
  const results = await Promise.all(Array.from({ length: 8 }, () => service.reserve(user, r)));
  assert.equal(results.filter(x => !x.duplicate).length, 1);
  assert.equal((await service.status(user)).remaining, 80);
  const starts = await Promise.allSettled([
    service.start(user, r.requestId),
    service.start(user, r.requestId),
  ]);
  assert.equal(starts.filter(x => x.status === "fulfilled").length, 1);
  await service.settle(user, r.requestId, {
    eventId: "done",
    success: true,
    actualMicros: 20000,
    stopped: true,
  });
});
test("request key cannot be reused for changed input or another operation", async () => {
  const user = uid(),
    r = reservation();
  await service.reserve(user, r);
  await assert.rejects(service.reserve(user, { ...r, fingerprint: "changed" }), {
    code: "IDEMPOTENCY_CONFLICT",
  });
  await service.settle(user, r.requestId, {
    eventId: "cancel",
    success: false,
    actualMicros: 0,
    stopped: true,
  });
});
test("parallel unique jobs cannot exceed per-user concurrency", async () => {
  const user = uid(),
    a = reservation(),
    b = reservation();
  await service.reserve(user, a);
  await assert.rejects(service.reserve(user, b), { code: "CONCURRENT_JOB_LIMIT" });
  await service.settle(user, a.requestId, {
    eventId: "cancel",
    success: false,
    actualMicros: 0,
    stopped: true,
  });
});
test("a failed job refunds allowance while retaining real expenditure; settlement replay is idempotent", async () => {
  const user = uid(),
    r = reservation();
  await service.reserve(user, r);
  await service.start(user, r.requestId);
  const e = { eventId: "failed", success: false, actualMicros: 9000, stopped: true };
  await service.settle(user, r.requestId, e);
  await service.settle(user, r.requestId, e);
  const s = await service.status(user);
  assert.equal(s.remaining, 100);
  assert.equal(s.rollingSpentTokens, 9);
  await assert.rejects(service.settle(user, r.requestId, { ...e, actualMicros: 0 }), {
    code: "SETTLEMENT_CONFLICT",
  });
});
test("reset does not erase active reservations and old-cycle refunds cannot inflate a new allowance", async () => {
  const user = uid(),
    r = reservation();
  await service.reserve(user, r);
  await service.start(user, r.requestId);
  clock += 6 * DAY;
  const s = await service.status(user);
  assert.equal(s.reservedTokens, 20);
  assert.equal(s.activeJobs, 1);
  await service.settle(user, r.requestId, {
    eventId: "failed-after-reset",
    success: false,
    actualMicros: 10000,
    stopped: true,
  });
  assert.equal((await service.status(user)).remaining, 100);
});
test("rolling 30-day spend blocks repeated resets and releases at the exact rolling boundary", async () => {
  const user = uid();
  // Use a private explicit estimate for stress-testing the rolling ledger.
  const custom = createProcessingService({
    db,
    now: () => clock,
    entitlement: () => "free",
    limits: { freeDailyMicros: 10000000, dailyMicros: 10000000 },
    operations: { test: { maxMicros: 100000, maxSeconds: 1, resource: "cpu" } },
  });
  let first;
  for (let i = 0; i < 5; i++) {
    const r = {
      operation: "test",
      requestId: crypto.randomUUID(),
      fingerprint: "owned",
      approvedTokens: 100,
    };
    await custom.reserve(user, r);
    await custom.start(user, r.requestId);
    await custom.settle(user, r.requestId, {
      eventId: "done",
      success: true,
      actualMicros: 100000,
      stopped: true,
    });
    first ??= clock;
    clock += 6 * DAY;
  }
  // At exactly 30 days the first incurred expense expires, not earlier.
  clock = first + 30 * DAY - 1;
  assert.equal((await custom.status(user)).remaining, 0);
  clock++;
  assert.equal((await custom.status(user)).remaining, 100);
});
test("unpriced and unaffordable uncalibrated GPU work cannot enter admission", () => {
  assert.throws(() => service.quote("unknown"), { code: "UNPRICED_OPERATION" });
  assert.throws(() => service.quote("blender.render"), { code: "COST_VALIDATION_REQUIRED" });
});
test("client approval cannot lower the server price", async () => {
  await assert.rejects(service.reserve(uid(), { ...reservation(), approvedTokens: 1 }), {
    code: "PROCESSING_ESTIMATE_REQUIRED",
  });
});
test("unconfirmed worker stop cannot release a reservation", async () => {
  const user = uid(),
    r = reservation();
  await service.reserve(user, r);
  await service.start(user, r.requestId);
  await assert.rejects(
    service.settle(user, r.requestId, { eventId: "timeout", success: false, actualMicros: 0 }),
    { code: "WORKER_STOP_CONFIRMATION_REQUIRED" }
  );
  assert.equal((await service.status(user)).activeJobs, 1);
  await service.settle(user, r.requestId, {
    eventId: "confirmed-stop",
    success: false,
    actualMicros: 10000,
    stopped: true,
  });
});
test("global daily/monthly budgets and emergency switch reject before dispatch", async () => {
  const tiny = createProcessingService({
    db,
    now: () => clock,
    entitlement: () => "free",
    limits: { dailyMicros: 1, monthlyMicros: 1 },
  });
  await assert.rejects(tiny.reserve(uid(), reservation()), { code: "GLOBAL_PROCESSING_BUDGET" });
  await service.configure({ enabled: false });
  await assert.rejects(service.reserve(uid(), reservation()), { code: "CLOUD_PROCESSING_PAUSED" });
  assert.equal((await service.status(uid())).localEditingAvailable, true);
  await service.configure({ enabled: true });
});
test("actual overspend is recorded, suspends further processing, and never adds user overage fees", async () => {
  const user = uid(),
    r = reservation();
  await service.reserve(user, r);
  await service.start(user, r.requestId);
  const e = await service.settle(user, r.requestId, {
    eventId: "overrun",
    success: true,
    actualMicros: 25000,
    stopped: true,
  });
  assert.equal(e.consumedTokens, 20);
  assert.equal((await service.status(user)).rollingSpentTokens, 25);
  await assert.rejects(service.reserve(uid(), reservation()), { code: "CLOUD_PROCESSING_PAUSED" });
  await service.configure({ enabled: true });
});
test("legacy purchased, promotional and administrative wallet documents are byte-for-byte unchanged", async () => {
  const user = uid(),
    ref = db.collection("users").doc(user);
  const original = {
    credits: 732,
    testerAccess: { bonusCredits: 100, creditsUsed: 12 },
    grant: { amount: 55 },
  };
  await ref.set(original);
  const r = reservation();
  await service.reserve(user, r);
  await service.settle(user, r.requestId, {
    eventId: "cancel",
    success: false,
    actualMicros: 0,
    stopped: true,
  });
  assert.deepEqual((await ref.get()).data(), original);
});
test("Plus reset interval can be configured by server policy without changing feature access", async () => {
  const { processingPlan } = require("../../src/services/processingTokens/policy");
  const custom = createProcessingService({
    db,
    now: () => clock,
    entitlement: () => "plus",
    plans: tier => ({ ...processingPlan(tier), resetHours: 48 }),
  });
  const s = await custom.status(uid());
  assert.equal(Date.parse(s.nextResetAt) - clock, 2 * DAY);
});
test("storage reservations enforce bytes atomically, survive reset, and cannot be released while uploads remain possible", async () => {
  const user = uid();
  await service.status(user);
  const r = {
    requestId: "storage",
    storagePath: `uploads/videos/${user}/clip.mp4`,
    bytes: 1073741824,
  };
  await assert.rejects(service.reserveStorage(user, r), { code: "STORAGE_INVENTORY_REQUIRED" });
  await service.recordStorageInventory(user, 0);
  const lease = await service.reserveStorage(user, r);
  await assert.rejects(service.reserveStorage(user, { ...r, requestId: "storage-2" }), {
    code: "STORAGE_CAPACITY_REACHED",
  });
  await assert.rejects(
    service.reconcileStorage(user, lease.leaseId, { exists: false, measuredBytes: 0 }),
    { code: "STORAGE_UPLOAD_STILL_POSSIBLE" }
  );
  await service.reconcileStorage(user, lease.leaseId, {
    exists: true,
    measuredBytes: r.bytes,
    generation: "1",
  });
  clock += 6 * DAY;
  assert.equal((await service.status(user)).storage.usedBytes, r.bytes);
});
test('emergency pause is rechecked atomically at the actual dispatch claim', async () => {
  const user=uid(),r=reservation();await service.reserve(user,r);await service.start(user,r.requestId);
  await service.configure({enabled:false});
  await assert.rejects(service.authorizeDispatch(user,r.requestId),{code:'CLOUD_PROCESSING_PAUSED'});
  await service.configure({enabled:true});await service.authorizeDispatch(user,r.requestId);
  await assert.rejects(service.authorizeDispatch(user,r.requestId),{code:'JOB_ALREADY_DISPATCHED'});
  await service.settle(user,r.requestId,{eventId:'confirmed-no-work',success:false,actualMicros:0,stopped:true});
});

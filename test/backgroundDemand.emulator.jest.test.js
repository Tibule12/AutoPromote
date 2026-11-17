const { createBackgroundWork } = require("../src/services/backgroundWorkService");
const { createBackgroundActivity, TTL_MS } = require("../src/services/backgroundActivityService");
const host = process.env.FIRESTORE_EMULATOR_HOST;
const integration = host ? describe : describe.skip;
const waitFor = async predicate => {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Work listener did not observe the change");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

integration("real local Firestore demand lifecycle", () => {
  let db, otherDb, work, worker, api, reads, starts, time;
  beforeAll(() => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
      throw new Error("Loopback Firestore emulator required");
    const { Firestore } = require("@google-cloud/firestore");
    const projectId = `demo-background-demand-${process.pid}`;
    db = new Firestore({ projectId });
    otherDb = new Firestore({ projectId });
    reads = 0;
    starts = 0;
    time = Date.now();
    const wrap = query => ({
      where: (...args) => wrap(query.where(...args)),
      orderBy: (...args) => wrap(query.orderBy(...args)),
      limit: (...args) => wrap(query.limit(...args)),
      get: () => {
        reads++;
        return query.get();
      },
      onSnapshot: (...args) => {
        starts++;
        return query.onSnapshot(...args);
      },
    });
    work = createBackgroundWork({
      db: { collection: name => wrap(db.collection(name)) },
      now: () => time,
    });
    api = createBackgroundActivity({
      db,
      now: () => time,
      enabled: () => true,
      mode: () => "demand",
    });
    worker = createBackgroundActivity({
      db: otherDb,
      now: () => time,
      enabled: () => true,
      mode: () => "demand",
    });
  });
  afterAll(async () => {
    work?.cache.close();
    api?.close();
    worker?.close();
    if (db) await db.terminate();
    if (otherDb) await otherDb.terminate();
  });

  test("idle uses no polling reads; new queued work wakes; future schedules and pauses remain exact", async () => {
    expect(await work.hasTasks("platform_post")).toBe(false);
    expect(await work.hasSchedules()).toBe(false);
    const initialStarts = starts;
    for (let tick = 0; tick < 1440; tick++) {
      expect(await work.hasTasks("platform_post")).toBe(false);
      expect(await work.hasSchedules()).toBe(false);
    }
    expect(starts).toBe(initialStarts);
    expect(reads).toBe(0);
    const task = otherDb.collection("promotion_tasks").doc("requested-post");
    await task.set({
      type: "platform_post",
      status: "queued",
      createdAt: new Date(time).toISOString(),
      nextAttemptAt: new Date(time).toISOString(),
    });
    await waitFor(() => work.hasTasks("platform_post"));
    await task.update({ status: "completed" });
    await waitFor(async () => !(await work.hasTasks("platform_post")));

    const schedule = otherDb.collection("promotion_schedules").doc("future-post");
    await schedule.set({
      isActive: true,
      status: "pending",
      startTime: new Date(time + 60000).toISOString(),
    });
    // Snapshot delivery is asynchronous. A separate read confirms the document,
    // then advancing only the programme clock must wake the existing listener.
    await schedule.get();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(await work.hasSchedules()).toBe(false);
    time += 60000;
    await waitFor(() => work.hasSchedules());
    await schedule.update({ isActive: false });
    await waitFor(async () => !(await work.hasSchedules()));
    expect(reads).toBe(0);
    expect(starts).toBe(initialStarts);
  }, 20000);

  test("authenticated API activity wakes the separate worker and expires without any marker deletion", async () => {
    const awakened = jest.fn();
    worker.start();
    worker.onActive("analytics", awakened);
    await api.mark("analytics");
    await waitFor(() => worker.active("analytics"));
    await waitFor(() => awakened.mock.calls.length === 1);
    time += TTL_MS + 1;
    expect(worker.active("analytics")).toBe(false);
    const record = await db.collection("system_runtime").doc("background_activity").get();
    expect(record.exists).toBe(true); // expiry is in memory; no idle writes/deletes
  }, 20000);
});

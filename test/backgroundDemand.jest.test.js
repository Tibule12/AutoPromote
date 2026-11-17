const { EventEmitter } = require("events");
const { WorkWatchCache, createBackgroundWork } = require("../src/services/backgroundWorkService");
const { createBackgroundActivity, TTL_MS } = require("../src/services/backgroundActivityService");

const snapshot = rows => ({ docs: rows.map(data => ({ data: () => data })), empty: !rows.length });
function fakeDatabase() {
  const queries = [];
  return {
    queries,
    collection: jest.fn(name => {
      const query = {
        name,
        filters: [],
        rows: [],
        reads: 0,
        starts: 0,
        where(field, operator, value) {
          this.filters.push([field, operator, value]);
          return this;
        },
        orderBy() {
          return this;
        },
        limit() {
          return this;
        },
        get() {
          this.reads++;
          return Promise.resolve(snapshot(this.rows));
        },
        onSnapshot(onData, onError) {
          this.starts++;
          this.onData = onData;
          this.onError = onError;
          queueMicrotask(() => onData(snapshot(this.rows)));
          this.stop = jest.fn();
          return this.stop;
        },
        emit(rows) {
          this.rows = rows;
          this.onData(snapshot(rows));
        },
      };
      queries.push(query);
      return query;
    }),
  };
}

test("empty queues stay asleep across 1,440 timer ticks, then wake on a new task", async () => {
  const db = fakeDatabase();
  const work = createBackgroundWork({ db });
  for (let tick = 0; tick < 1440; tick++) expect(await work.hasTasks("platform_post")).toBe(false);
  expect(db.queries).toHaveLength(1);
  expect(db.queries[0].starts).toBe(1);
  expect(db.queries[0].reads).toBe(0);
  db.queries[0].emit([{ status: "queued", nextAttemptAt: new Date(0).toISOString() }]);
  expect(await work.hasTasks("platform_post")).toBe(true);
  db.queries[0].emit([]);
  expect(await work.hasTasks("platform_post")).toBe(false);
  work.cache.close();
  expect(db.queries[0].stop).toHaveBeenCalledTimes(1);
});

test("future schedules wake at their due time without another database read; pauses stay paused", async () => {
  let time = 1000000;
  const db = fakeDatabase();
  const work = createBackgroundWork({ db, now: () => time });
  expect(await work.hasSchedules()).toBe(false);
  const pending = db.queries.find(q => q.filters.some(f => f[2] === "pending"));
  pending.emit([
    { isActive: true, status: "pending", startTime: new Date(time + 600000).toISOString() },
  ]);
  expect(await work.hasSchedules()).toBe(false);
  time += 600000;
  expect(await work.hasSchedules()).toBe(true);
  pending.emit([{ isActive: false, status: "pending", startTime: new Date(0).toISOString() }]);
  expect(await work.hasSchedules()).toBe(false);
  expect(db.queries.every(q => q.reads === 0 && q.starts === 1)).toBe(true);
  work.cache.close();
});

test("retry cooldowns and stale processing recovery still use real time while the UI is closed", async () => {
  let time = 10000000;
  const db = fakeDatabase();
  const work = createBackgroundWork({ db, now: () => time });
  await work.hasTasks("youtube_upload");
  const query = db.queries[0];
  query.emit([{ status: "queued", nextAttemptAt: new Date(time + 10000).toISOString() }]);
  expect(await work.hasTasks("youtube_upload")).toBe(false);
  time += 10000;
  expect(await work.hasTasks("youtube_upload")).toBe(true);
  query.emit([{ status: "processing", processingStartedAt: new Date(time).toISOString() }]);
  expect(await work.hasTasks("youtube_upload")).toBe(false);
  time += 45 * 60000;
  expect(await work.hasTasks("youtube_upload")).toBe(true);
  work.cache.close();
});

test("listener failure discards old queue state and allows a fresh connection", async () => {
  const cache = new WorkWatchCache();
  const db = fakeDatabase();
  const make = () => db.collection("queue");
  expect(await cache.has("q", make, () => true)).toBe(false);
  db.queries[0].onError(new Error("connection ended"));
  expect(db.queries[0].stop).toHaveBeenCalledTimes(1);
  expect(await cache.has("q", make, () => true)).toBe(false);
  expect(db.queries).toHaveLength(2);
  cache.close();
});

test("idle community checks do not query again and a newly requested priority campaign wakes them", async () => {
  const db = fakeDatabase();
  const work = createBackgroundWork({ db });
  for (let i = 0; i < 100; i++) expect(await work.hasCampaigns()).toBe(false);
  expect(db.queries).toHaveLength(2);
  db.queries[0].emit([{ status: "active", isPriority: true }]);
  expect(await work.hasCampaigns()).toBe(true);
  work.cache.close();
});

function activityFixture() {
  let time = 1000000,
    listener;
  const ref = {
    set: jest.fn().mockResolvedValue(),
    onSnapshot: jest.fn(callback => {
      listener = callback;
      return jest.fn();
    }),
  };
  const db = { collection: jest.fn(() => ({ doc: jest.fn(() => ref) })) };
  const activity = createBackgroundActivity({
    db,
    now: () => time,
    enabled: () => true,
    mode: () => "demand",
  });
  return {
    activity,
    ref,
    advance: ms => {
      time += ms;
    },
    remote: data => listener({ exists: true, data: () => data }),
  };
}
const finish = (activity, url, user, statusCode = 200) => {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  const next = jest.fn();
  activity.middleware({ originalUrl: url, user }, res, next);
  res.emit("finish");
  expect(next).toHaveBeenCalledTimes(1);
};

test("health checks, status polls, anonymous and refused requests cannot wake background scans", () => {
  const { activity, ref } = activityFixture();
  for (const path of [
    "/api/health",
    "/api/platform/status",
    "/api/notifications",
    "/api/credits/balance",
  ])
    finish(activity, path, { uid: "owner" });
  finish(activity, "/api/analytics", null);
  finish(activity, "/api/analytics", { uid: "owner" }, 403);
  expect(ref.set).not.toHaveBeenCalled();
  expect(activity.active("analytics")).toBe(false);
});

test("authenticated feature use renews bounded demand; repeated requests coalesce and then expire", async () => {
  const { activity, ref, advance } = activityFixture();
  for (let i = 0; i < 100; i++) finish(activity, "/api/analytics/performance", { uid: "owner" });
  await Promise.resolve();
  expect(ref.set).toHaveBeenCalledTimes(2); // one tiny write for each category
  expect(activity.active("analytics")).toBe(true);
  advance(TTL_MS + 1);
  expect(activity.active("analytics")).toBe(false);
  expect(activity.active("general")).toBe(false);
});

test("API activity reaches a separate worker through one small document subscription", () => {
  const { activity, remote, advance, ref } = activityFixture();
  activity.start();
  activity.start();
  expect(ref.onSnapshot).toHaveBeenCalledTimes(1);
  remote({ analytics: 1000000 + TTL_MS });
  expect(activity.active("analytics")).toBe(true);
  advance(TTL_MS + 1);
  expect(activity.active("analytics")).toBe(false);
  activity.close();
});

test("a feature wakes analytics immediately once per active window, including on another host", async () => {
  const { activity, ref, advance, remote } = activityFixture();
  const run = jest.fn();
  activity.start();
  activity.onActive("analytics", run);
  finish(activity, "/api/analytics", { uid: "owner" });
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1);
  finish(activity, "/api/analytics", { uid: "owner" });
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1);
  advance(TTL_MS + 1);
  remote({ analytics: 1000000 + 2 * TTL_MS + 1 });
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(2);
  activity.close();
});

test("latency history does no work without new samples and prunes IDs without downloading history", async () => {
  const { createLatencySnapshotWriter } = require("../src/services/latencySnapshotService");
  const rows = Array.from({ length: 21 }, (_, i) => ({ ref: { id: `expired-${i}` } }));
  const collection = {
    add: jest.fn().mockResolvedValue(),
    count: jest.fn(() => ({ get: async () => ({ data: () => ({ count: 221 }) }) })),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: rows }),
  };
  const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue() };
  const db = { collection: jest.fn(() => collection), batch: () => batch };
  const persist = createLatencySnapshotWriter({ db, now: () => 123 });
  expect(await persist(0, { count: 0 })).toBe(false);
  expect(db.collection).not.toHaveBeenCalled();
  expect(await persist(500, { count: 500 })).toBe(true);
  for (let i = 0; i < 100; i++) expect(await persist(500, { count: 500 })).toBe(false);
  expect(collection.add).toHaveBeenCalledTimes(1);
  expect(collection.select).toHaveBeenCalledWith();
  expect(collection.limit).toHaveBeenCalledWith(21);
  expect(batch.delete).toHaveBeenCalledTimes(21);
  expect(await persist(501, { count: 500 })).toBe(true); // ring size stays 500, new samples still count
});

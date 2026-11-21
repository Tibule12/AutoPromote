const { createMediaTransferBudget } = require("../mediaTransferBudget");

test("rejects excess concurrent work without a waiting body queue and releases once", () => {
  const budget = createMediaTransferBudget({
    maxActive: 2,
    rssLimitBytes: 100,
    reserveBytes: 10,
    memoryUsage: () => ({ rss: 20 }),
  });
  const first = budget.acquire(),
    second = budget.acquire();
  expect(() => budget.acquire()).toThrow("busy");
  first();
  first();
  expect(budget.snapshot().active).toBe(1);
  const third = budget.acquire();
  second();
  third();
  expect(budget.snapshot().active).toBe(0);
});

test("holds off new media work when resident memory has insufficient headroom", () => {
  let rss = 95;
  const budget = createMediaTransferBudget({
    rssLimitBytes: 100,
    reserveBytes: 10,
    memoryUsage: () => ({ rss }),
  });
  expect(() => budget.acquire()).toThrow("busy");
  rss = 50;
  budget.acquire()();
  expect(budget.snapshot().active).toBe(0);
});

test("reserves headroom for admitted work before its memory has grown", () => {
  const budget = createMediaTransferBudget({
    maxActive: 10,
    rssLimitBytes: 100,
    memoryUsage: () => ({ rss: 20 }),
  });
  const release = budget.acquire(50);
  expect(() => budget.acquire(40)).toThrow("busy");
  expect(budget.snapshot().reservedBytes).toBe(50);
  release();
  budget.acquire(40)();
  expect(budget.snapshot().reservedBytes).toBe(0);
});

test("HTTP overload returns Retry-After before accepting another media handler", async () => {
  const express = require("express"),
    request = require("supertest");
  const { admitMediaTransfer, transfers } = require("../mediaTransferBudget");
  const app = express(),
    responses = [];
  app.post("/media", admitMediaTransfer, (_req, res) => {
    responses.push(res);
  });
  const pending = [
    request(app)
      .post("/media")
      .send("first")
      .then(res => res),
    request(app)
      .post("/media")
      .send("second")
      .then(res => res),
  ];
  try {
    for (let i = 0; i < 100 && responses.length < 2; i++)
      await new Promise(resolve => setTimeout(resolve, 5));
    expect(responses).toHaveLength(2);
    const rejected = await request(app).post("/media").send("third").expect(503);
    expect(rejected.headers["retry-after"]).toBe("15");
    expect(responses).toHaveLength(2);
  } finally {
    responses.forEach(res => res.status(200).end());
    await Promise.all(pending);
  }
  expect(transfers.snapshot().active).toBe(0);
});

test("compressed JSON reserves for the expanded parser cap, not the small wire length", async () => {
  const express = require("express"), request = require("supertest");
  const { admitLargeStructuredBody, transfers } = require("../mediaTransferBudget");
  const app = express(); let reserved;
  app.post("/body", admitLargeStructuredBody, (_req, res) => {
    reserved = transfers.snapshot().reservedBytes;
    res.status(204).end();
  });
  await request(app).post("/body").set("Content-Type", "application/json")
    .set("Content-Encoding", "gzip").send("small compressed input").expect(204);
  expect(reserved).toBe(200 * 1024 ** 2);
  expect(transfers.snapshot().active).toBe(0);
});

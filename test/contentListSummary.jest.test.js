const express = require("express");
const request = require("supertest");

jest.mock("../src/authMiddleware", () => (req, res, next) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { uid: "owner", email: "private@example.test", role: "user" };
  req.userId = "owner";
  req.workspaceId = req.headers["x-test-workspace"] || null;
  req.actorUserId = "owner";
  next();
});
jest.mock("../src/services/variantStatsService", () => ({ getVariantStats: jest.fn() }));
jest.mock("../src/utils/publisherAssetMetadata", () => ({
  enrichPublisherAssets: jest.fn(async rows => rows),
}));

const { db, admin } = require("../src/firebaseAdmin");
const { CONTENT_LIST_FIELDS } = require("../src/utils/contentListSummary");
const route = require("../src/contentRoutes");
const auth = require("../src/authMiddleware");
const enrich = require("../src/utils/publisherAssetMetadata").enrichPublisherAssets;
const variants = require("../src/services/variantStatsService").getVariantStats;
const sample = {
  user_id: "owner",
  title: "Saved release",
  created_at: "2026-11-01",
  url: "https://media.test/original.mp4?Signature=access",
  description: "Reviewed copy",
  platform_options: {
    discord: { message: "Exact destination copy", media_url: "https://media.test/discord.mp4" },
  },
  meta: {
    source: "studio",
    duration: 6,
    sourceContentId: "parent",
    studioDocument: { text: "huge" },
  },
  editor_timeline: { private: "x".repeat(300000) },
  transcript: "private transcript",
  options: { viralData: { private: "x".repeat(200000) } },
};
let query, records, app, collectionSpy;

beforeEach(() => {
  admin.storage = () => ({ bucket: () => ({ name: "local-test-bucket" }) });
  records = [{ id: "mine", data: () => sample }];
  query = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    get: jest.fn(async () => ({ docs: records })),
  };
  const original = db.collection.bind(db);
  collectionSpy = jest
    .spyOn(db, "collection")
    .mockImplementation(name => (name === "content" ? query : original(name)));
  app = express();
  app.use(
    "/api/content",
    auth,
    (req, res, next) =>
      req.headers["x-deny-terms"] ? res.status(403).json({ error: "terms_not_accepted" }) : next(),
    route
  );
  enrich.mockClear();
  variants.mockClear();
});
afterEach(() => collectionSpy.mockRestore());

test("login access probe reads no content and still requires authentication/terms", async () => {
  await request(app).get("/api/content/my-content?accessCheck=1").expect(401);
  await request(app)
    .get("/api/content/my-content?accessCheck=1")
    .set("Authorization", "test")
    .set("x-deny-terms", "1")
    .expect(403);
  const response = await request(app)
    .get("/api/content/my-content?accessCheck=1")
    .set("Authorization", "test")
    .expect(200);
  expect(response.body).toEqual({ ok: true, meta: { accessChecked: true } });
  expect(collectionSpy).not.toHaveBeenCalled();
});

test("summary projects safe UI fields, preserves Queue media/copy and omits large graphs", async () => {
  const response = await request(app)
    .get("/api/content/my-content?summary=1")
    .set("Authorization", "test")
    .expect(200);
  expect(query.where).toHaveBeenCalledWith("user_id", "==", "owner");
  expect(query.select).toHaveBeenCalledWith(...CONTENT_LIST_FIELDS);
  expect(response.body.content[0]).toMatchObject({
    id: "mine",
    url: sample.url,
    platform_options: sample.platform_options,
    meta: { source: "studio", duration: 6 },
  });
  expect(response.body.content[0]).not.toHaveProperty("editor_timeline");
  expect(response.body.content[0]).not.toHaveProperty("options");
  expect(response.body.content[0].meta).not.toHaveProperty("studioDocument");
  expect(response.body.content[0]).not.toHaveProperty("user_id");
  expect(response.text.length).toBeLessThan(1000);
  expect(variants).not.toHaveBeenCalled();
});

test("Publisher and legacy callers retain their full payload even with a summary parameter", async () => {
  for (const suffix of ["includeStats=0", "summary=1&publisherAssets=1&includeStats=0"]) {
    const response = await request(app)
      .get("/api/content/my-content?" + suffix)
      .set("Authorization", "test")
      .expect(200);
    expect(response.body.content[0].options).toEqual(sample.options);
    expect(query.select).not.toHaveBeenCalled();
  }
  expect(enrich).toHaveBeenCalledTimes(1);
});

test("team scope cannot leak personal or other-team rows from projected results", async () => {
  records = [null, "team-a", "team-b"].map((workspace_id, i) => ({
    id: String(i),
    data: () => ({ ...sample, workspace_id }),
  }));
  const response = await request(app)
    .get("/api/content/my-content?summary=1")
    .set("Authorization", "test")
    .set("x-test-workspace", "team-a")
    .expect(200);
  expect(response.body.content.map(x => x.id)).toEqual(["1"]);
});

test("DEBUG_CONTENT cannot print the caller's identity even when enabled", async () => {
  process.env.DEBUG_CONTENT = "true";
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  try {
    await request(app)
      .get("/api/content/my-content?summary=1")
      .set("Authorization", "test")
      .expect(200);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private@example|req\.user|role/);
  } finally {
    log.mockRestore();
    delete process.env.DEBUG_CONTENT;
  }
});

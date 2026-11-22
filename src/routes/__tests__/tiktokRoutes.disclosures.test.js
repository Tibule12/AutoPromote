const express = require("express");
const request = require("supertest");

jest.mock("../../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "test-user" };
  next();
});
jest.mock("../../middlewares/workspaceScope", () =>
  Object.assign((_req, _res, next) => next(), {
    resourceUserId: req => req.user.uid,
  })
);
jest.mock("../../middlewares/globalRateLimiter", () => ({
  rateLimiter: () => (_req, _res, next) => next(),
}));
jest.mock("../../middlewares/simpleRateLimit", () => () => (_req, _res, next) => next());
jest.mock("../../middlewares/codeqlRateLimit", () => ({ writes: (_req, _res, next) => next() }));
jest.mock("../../firebaseAdmin", () => ({
  db: { collection: jest.fn() },
  admin: {
    firestore: { FieldValue: { serverTimestamp: () => new Date() } },
  },
}));
jest.mock("../../utils/ssrfGuard", () => ({ safeFetch: jest.fn() }));
jest.mock("../../utils/cleanupSource", () => ({ cleanupSourceFile: jest.fn() }));
jest.mock("node:fs", () => ({
  ...jest.requireActual("node:fs"),
  createReadStream: () => require("node:stream").Readable.from(["test-video"]),
}));
jest.mock("../../utils/stagedMedia", () => ({
  withStagedMedia: (_options, callback) =>
    callback({ filePath: "mock-video.mp4", bytes: 2048, signal: new AbortController().signal }),
}));
jest.mock("../../services/connectionTokenUtils", () => ({ tokensFromDoc: doc => doc.tokens }));

const { db } = require("../../firebaseAdmin");
const { safeFetch } = require("../../utils/ssrfGuard");
const app = express();
app.use(express.json());
app.use("/tiktok", require("../tiktokRoutes"));

beforeEach(() => {
  delete process.env.TIKTOK_DEMO_MODE;
  const connection = {
    open_id: "test-open-id",
    tokens: { access_token: "test-token" },
    scopes: ["video.upload", "video.publish"],
    creator_info: {
      privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
    },
  };
  const ref = {
    doc: () => ref,
    collection: () => ref,
    where: () => ref,
    get: async () => ({ exists: true, size: 0, data: () => connection }),
    add: async () => ({ id: "test-audit" }),
  };
  db.collection.mockImplementation(() => ref);
  safeFetch.mockReset().mockImplementation(async (url, _fetch, options) => {
    if (url.includes("/creator/info/")) return { ok: false };
    if (url.includes("/post/publish/video/init/"))
      return {
        ok: true,
        json: async () => ({
          data: {
            publish_id: "test-publish",
            upload_url: "https://open.tiktokapis.com/test-upload",
          },
        }),
      };
    if (url.endsWith("/test-upload")) {
      options.fetchOptions.body.resume();
      return { ok: true };
    }
    throw new Error(`Unexpected transport: ${url}`);
  });
});

const upload = options =>
  request(app)
    .post("/tiktok/upload")
    .send({
      url: "https://example.com/source.mp4",
      title: "Real camera footage",
      platform_options: { tiktok: { privacy: "PUBLIC_TO_EVERYONE", consent: true, ...options } },
    });

test("disabled commercial settings are accepted and all provider flags are false", async () => {
  const response = await upload({
    commercial: { isCommercial: false, yourBrand: false, brandedContent: false },
  });
  expect(response.status).toBe(200);
  const call = safeFetch.mock.calls.find(([url]) => url.includes("/post/publish/video/init/"));
  expect(JSON.parse(call[2].fetchOptions.body).post_info).toMatchObject({
    brand_organic_toggle: false,
    brand_content_toggle: false,
    is_aigc: false,
  });
});

test("explicit off choices override stale brand and AI aliases", async () => {
  const response = await upload({
    commercialContent: false,
    yourBrand: true,
    brandedContent: true,
    aiGenerated: false,
    is_aigc: true,
  });
  expect(response.status).toBe(200);
  const call = safeFetch.mock.calls.find(([url]) => url.includes("/post/publish/video/init/"));
  expect(JSON.parse(call[2].fetchOptions.body).post_info).toMatchObject({
    brand_organic_toggle: false,
    brand_content_toggle: false,
    is_aigc: false,
  });
});

test("selected brand and AI disclosures reach TikTok independently", async () => {
  const response = await upload({
    commercialContent: true,
    yourBrand: true,
    aiGenerated: true,
    disclosure: true,
  });
  expect(response.status).toBe(200);
  const call = safeFetch.mock.calls.find(([url]) => url.includes("/post/publish/video/init/"));
  expect(JSON.parse(call[2].fetchOptions.body).post_info).toMatchObject({
    brand_organic_toggle: true,
    brand_content_toggle: false,
    is_aigc: true,
  });
});

test.each([
  [{ aiGenerated: true }, "tiktok_aigc_missing_disclosure"],
  [{ commercialContent: true }, "tiktok_commercial_content_missing_selection"],
  [{ commercialContent: true, yourBrand: true }, "tiktok_commercial_missing_disclosure"],
  [{ aiGenerated: "false" }, "tiktok_disclosure_invalid"],
])("keeps disclosure validation before any upload: %j", async (options, error) => {
  const response = await upload(options);
  expect(response.status).toBe(400);
  expect(response.body.error).toBe(error);
  expect(safeFetch.mock.calls.some(([url]) => url.includes("/post/publish/video/init/"))).toBe(
    false
  );
});

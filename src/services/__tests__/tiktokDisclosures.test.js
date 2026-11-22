const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  resolveTikTokDisclosures,
  tikTokDisclosurePostInfo,
} = require("../../utils/tiktokDisclosures");

jest.mock("../../firebaseAdmin", () => ({ db: { collection: jest.fn() }, admin: {} }));
jest.mock("../../utils/ssrfGuard", () => ({ safeFetch: jest.fn() }));
jest.mock("../connectionTokenUtils", () => ({ tokensFromDoc: doc => doc.tokens }));
jest.mock("../metricsRecorder", () => ({ incrCounter: jest.fn() }));

const off = { brand_organic_toggle: false, brand_content_toggle: false, is_aigc: false };
const postInfo = payload => tikTokDisclosurePostInfo(resolveTikTokDisclosures(payload));

describe("TikTok disclosure selections", () => {
  test.each([
    {},
    { commercial: {} },
    { platform_options: { tiktok: { commercial: {} } } },
    {
      source: "studio",
      aiAssisted: true,
      title: "AI colour grading",
      commercial: { isCommercial: false, yourBrand: false, brandedContent: false },
    },
    { platformOptions: { commercialContent: false, commercial: { isCommercial: false } } },
  ])("does not infer labels from empty settings or an editing workflow: %j", payload => {
    expect(resolveTikTokDisclosures(payload).isCommercial).toBe(false);
    expect(postInfo(payload)).toEqual(off);
  });

  test("an explicit off choice overrides stale nested flags and aliases", () => {
    expect(
      postInfo({
        commercialContent: false,
        yourBrand: true,
        brandedContent: true,
        aiGenerated: false,
        is_aigc: true,
        commercial: { isCommercial: true },
      })
    ).toEqual(off);
  });

  test.each(["platform_options", "platformOptions"])("preserves independent choices in %s", key => {
    expect(
      postInfo({
        [key]: { tiktok: { commercialContent: true, yourBrand: true, aiGenerated: false } },
      })
    ).toEqual({ ...off, brand_organic_toggle: true });
    expect(
      postInfo({ [key]: { tiktok: { commercialContent: false, aiGenerated: true } } })
    ).toEqual({ ...off, is_aigc: true });
  });

  test("supports flattened queue options and legacy API selections", () => {
    expect(
      postInfo({ platformOptions: { commercial: { isCommercial: true, brandedContent: true } } })
    ).toEqual({ ...off, brand_content_toggle: true });
    expect(postInfo({ brand_organic_toggle: true, is_aigc: true })).toEqual({
      ...off,
      brand_organic_toggle: true,
      is_aigc: true,
    });
  });

  test.each(["false", "true", 1, {}])(
    "rejects non-boolean flags instead of enabling labels: %j",
    value => {
      expect(() => postInfo({ aiGenerated: value })).toThrow("must be booleans");
      expect(() => postInfo({ commercialContent: value })).toThrow("must be booleans");
    }
  );
});

describe("production TikTok upload request bodies (mocked transport)", () => {
  const { safeFetch } = require("../../utils/ssrfGuard");
  const { db } = require("../../firebaseAdmin");
  const envKeys = [
    "NODE_ENV",
    "CI_ROUTE_IMPORTS",
    "FIREBASE_ADMIN_BYPASS",
    "JEST_WORKER_ID",
    "TIKTOK_FORCE_FILE_UPLOAD",
    "TIKTOK_CAPTURE_DIR",
  ];
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-tiktok-test-"));
  process.env.TIKTOK_CAPTURE_DIR = captureDir;
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  global.fetch = mockFetch;
  const { uploadTikTokVideo } = require("../tiktokService");
  let connection;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    for (const key of [
      "CI_ROUTE_IMPORTS",
      "FIREBASE_ADMIN_BYPASS",
      "JEST_WORKER_ID",
      "TIKTOK_FORCE_FILE_UPLOAD",
    ])
      delete process.env[key];
    connection = { tokens: { access_token: "test-token" } };
    const ref = {
      doc: () => ref,
      collection: () => ref,
      get: async () => ({ exists: true, data: () => connection }),
      set: async () => {},
    };
    db.collection.mockImplementation(name =>
      name === "users"
        ? ref
        : {
            doc: () => ({ get: async () => ({ exists: false }), set: async () => {} }),
          }
    );
    mockFetch.mockReset().mockImplementation(async url => {
      let data;
      if (url.includes("/post/publish/video/init/"))
        data = {
          publish_id: "test-publish",
          upload_url: "https://open.tiktokapis.com/test-upload",
        };
      else if (url.includes("/post/publish/status/fetch/"))
        data = { status: "PUBLISH_COMPLETE", publicaly_available_post_id: "test-post" };
      else if (url.endsWith("/test-upload")) data = {};
      else throw new Error(`Unexpected transport: ${url}`);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null, forEach: () => {} },
        json: async () => ({ data, error: { code: "ok" } }),
        text: async () => "",
      };
    });
    safeFetch
      .mockReset()
      .mockImplementation((url, _fetch, options) => mockFetch(url, options.fetchOptions));
    jest.spyOn(global, "setTimeout").mockImplementation(callback => {
      callback();
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });
  afterAll(() => {
    global.fetch = originalFetch;
    fs.rmSync(captureDir, { recursive: true, force: true });
  });

  test.each(["pull", "file"])(
    "%s upload sends no labels for disabled commercial settings and preserves privacy",
    async mode => {
      if (mode === "file") process.env.TIKTOK_FORCE_FILE_UPLOAD = "1";
      const result = await uploadTikTokVideo({
        uid: "test-user",
        contentId: "test-content",
        payload: {
          videoUrl: "https://example.com/source.mp4",
          videoBuffer: Buffer.alloc(2048),
          privacy: "SELF_ONLY",
          platform_options: {
            tiktok: {
              commercial: { isCommercial: false, yourBrand: false, brandedContent: false },
            },
          },
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.simulated).toBeUndefined();
      const call = safeFetch.mock.calls.find(([url]) => url.includes("/post/publish/video/init/"));
      expect(JSON.parse(call[2].fetchOptions.body).post_info).toMatchObject({
        ...off,
        privacy_level: "SELF_ONLY",
      });
    }
  );

  test.each(["pull", "file"])(
    "%s upload preserves selected commercial and AI labels",
    async mode => {
      if (mode === "file") process.env.TIKTOK_FORCE_FILE_UPLOAD = "1";
      connection.open_id = "test-open-id"; // Small labelled files must bypass the legacy endpoint.
      const result = await uploadTikTokVideo({
        uid: "test-user",
        contentId: "test-content",
        payload: {
          videoUrl: "https://example.com/source.mp4",
          videoBuffer: Buffer.alloc(2048),
          privacy: "PUBLIC_TO_EVERYONE",
          platformOptions: {
            commercialContent: true,
            yourBrand: true,
            brandedContent: true,
            aiGenerated: true,
          },
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      const call = safeFetch.mock.calls.find(([url]) => url.includes("/post/publish/video/init/"));
      expect(JSON.parse(call[2].fetchOptions.body).post_info).toMatchObject({
        brand_organic_toggle: true,
        brand_content_toggle: true,
        is_aigc: true,
      });
      expect(safeFetch.mock.calls.some(([url]) => url.includes("/v2/video/upload/"))).toBe(false);
    }
  );

  test("rejects a commercial selection without a brand choice before uploading", async () => {
    const result = await uploadTikTokVideo({
      uid: "test-user",
      payload: { commercialContent: true },
    });
    expect(result.error).toBe("tiktok_commercial_content_missing_selection");
    expect(safeFetch).not.toHaveBeenCalled();
  });

  test("URL-pull failure carries the same independent choices into file-upload fallback", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      text: async () => "pull_not_available",
    }));
    const result = await uploadTikTokVideo({
      uid: "test-user",
      contentId: "test-content",
      payload: {
        videoUrl: "https://example.com/source.mp4",
        videoBuffer: Buffer.alloc(2048),
        privacy: "SELF_ONLY",
        platformOptions: { commercialContent: false, aiGenerated: true },
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const requests = safeFetch.mock.calls
      .filter(([url]) => url.includes("/post/publish/video/init/"))
      .map(call => JSON.parse(call[2].fetchOptions.body));
    expect(requests.map(body => body.source_info.source)).toEqual(["PULL_FROM_URL", "FILE_UPLOAD"]);
    requests.forEach(body =>
      expect(body.post_info).toMatchObject({ ...off, is_aigc: true, privacy_level: "SELF_ONLY" })
    );
  });
});

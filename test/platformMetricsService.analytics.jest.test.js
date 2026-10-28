const mockFetch = jest.fn();
const mockVideos = jest.fn();
const mockFacebook = jest.fn();
const mockConnection = jest.fn();
jest.mock(
  "node-fetch",
  () =>
    (...args) =>
      mockFetch(...args)
);
jest.mock("../src/services/facebookService", () => ({
  getPostStats: (...args) => mockFacebook(...args),
  getUserFacebookConnection: (...args) => mockConnection(...args),
}));
jest.mock("../src/services/tiktokService", () => ({
  getVideoMetrics: (...args) => mockVideos(...args),
}));
jest.mock("../src/services/youtubeService", () => ({ fetchVideoStats: jest.fn() }));
jest.mock("../src/services/linkedinService", () => ({ getPostStats: jest.fn() }));
jest.mock("../src/services/redditService", () => ({ getPostInfo: jest.fn() }));
jest.mock("../src/services/spotifyService", () => ({ getTracksBatch: jest.fn() }));
const metrics = require("../src/services/platformMetricsService");
const response = (ok, body) => ({ ok, text: async () => JSON.stringify(body) });
beforeEach(() => jest.clearAllMocks());

test("TikTok resolves an accepted upload instead of silently skipping a missing public ID", async () => {
  mockVideos.mockResolvedValue([
    { id: "7701756990720052501", view_count: 15, like_count: 1, comment_count: 0, share_count: 0 },
  ]);
  const result = await metrics.fetchTikTokMetrics("owner", null, {
    publishId: "v_pub_file~original",
  });
  expect(mockVideos).toHaveBeenCalledWith("owner", [], { publishId: "v_pub_file~original" });
  expect(result).toMatchObject({
    view_count: 15,
    like_count: 1,
    comment_count: 0,
    publicVideoId: "7701756990720052501",
  });
});

test("TikTok keeps a resolved ID and actionable provider failure without fabricating counters", async () => {
  mockVideos.mockRejectedValue(
    Object.assign(new Error("video.list is required"), {
      code: "scope_not_authorized",
      publicVideoId: "7701756990720052501",
    })
  );
  const result = await metrics.fetchTikTokMetrics("owner", null, {
    publishId: "v_pub_file~original",
  });
  expect(result).toMatchObject({
    publicVideoId: "7701756990720052501",
    collectionError: { code: "scope_not_authorized" },
  });
  expect(result.view_count).toBeUndefined();
});

test("TikTok batches remain within the provider's twenty-ID query limit", async () => {
  mockVideos.mockResolvedValue([]);
  await metrics.fetchBatchMetrics(
    "tiktok",
    Array.from({ length: 51 }, (_, i) => ({ uid: "owner", id: String(10000000000 + i) }))
  );
  expect(mockVideos.mock.calls.map(call => call[1].length)).toEqual([20, 20, 11]);
});

test("Instagram fetches insights while preserving real likes/comments on a permission refusal", async () => {
  mockConnection.mockResolvedValue({ tokens: { access_token: "fixture" } });
  mockFetch
    .mockResolvedValueOnce(response(true, { like_count: 3, comments_count: 1 }))
    .mockResolvedValueOnce(
      response(false, { error: { code: 10, message: "Application does not have permission" } })
    );
  const result = await metrics.fetchInstagramMediaMetrics("owner", "media");
  expect(mockFetch.mock.calls[1][0]).toContain("/media/insights?metric=views,reach");
  expect(result).toMatchObject({
    like_count: 3,
    comment_count: 1,
    issues: [{ metric: "views", code: "PERMISSION_DENIED" }],
  });
  expect(result.view_count).toBeUndefined();
});

test("Instagram records permitted view/reach insights separately", async () => {
  mockConnection.mockResolvedValue({ tokens: { access_token: "fixture" } });
  mockFetch
    .mockResolvedValueOnce(response(true, { like_count: 0, comments_count: 0 }))
    .mockResolvedValueOnce(
      response(true, {
        data: [
          { name: "views", values: [{ value: 85 }] },
          { name: "reach", total_value: { value: 52 } },
        ],
      })
    );
  expect(await metrics.fetchInstagramMediaMetrics("owner", "media")).toMatchObject({
    view_count: 85,
    reach: 52,
    like_count: 0,
  });
});

test("An Instagram insights timeout preserves available engagement", async () => {
  mockConnection.mockResolvedValue({ tokens: { access_token: "fixture" } });
  mockFetch
    .mockResolvedValueOnce(response(true, { like_count: 2, comments_count: 0 }))
    .mockRejectedValueOnce(Error("timeout"));
  expect(await metrics.fetchInstagramMediaMetrics("owner", "media")).toMatchObject({
    like_count: 2,
    issues: [{ code: "PROVIDER_REQUEST_FAILED" }],
  });
});

test("Facebook partial statistics retain the exact permission diagnostic", async () => {
  mockFacebook.mockResolvedValue({
    likes: 0,
    comments: 0,
    issues: [{ metric: "views", code: "PERMISSION_DENIED", message: "read_insights required" }],
  });
  expect(await metrics.fetchFacebookPostMetrics("owner", "video", "page")).toMatchObject({
    likes: 0,
    issues: [{ code: "PERMISSION_DENIED" }],
  });
});

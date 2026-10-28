const test = require("node:test");
const assert = require("node:assert/strict");
const { collectFacebookMetrics } = require("../src/services/facebookMetrics");

test("Video IDs use video_insights and retain measured engagement when read_insights is missing", async () => {
  const urls = [];
  const result = await collectFacebookMetrics({
    postId: "1019195177871539",
    request: async url => {
      urls.push(url);
      return url.startsWith("/video_insights")
        ? {
            ok: false,
            status: 403,
            body: { error: { code: 200, message: "read_insights permission missing" } },
          }
        : {
            ok: true,
            body: {
              likes: { summary: { total_count: 0 } },
              comments: { summary: { total_count: 3 } },
            },
          };
    },
  });
  assert.ok(urls.some(url => url.startsWith("/video_insights")));
  assert.ok(urls.every(url => !url.includes("attachments") && !url.startsWith("/insights")));
  assert.equal(result.views, null);
  assert.equal(result.impressions, null);
  assert.equal(result.likes, 0);
  assert.equal(result.comments, 3);
  assert.equal(result.issues[0].code, "PERMISSION_DENIED");
});

test("Page-post impressions stay distinct from video views and missing shares", async () => {
  const result = await collectFacebookMetrics({
    postId: "123_456",
    request: async url =>
      url.startsWith("/insights")
        ? { ok: true, body: { data: [{ name: "post_impressions", values: [{ value: 17 }] }] } }
        : { ok: true, body: { reactions: { summary: { total_count: 4 } } } },
  });
  assert.equal(result.impressions, 17);
  assert.equal(result.views, null);
  assert.equal(result.likes, 4);
  assert.equal(result.shares, null);
});

test("Unsupported grouped fields fall back without losing real counts", async () => {
  const result = await collectFacebookMetrics({
    postId: "123_456",
    request: async url => {
      if (url.includes("reactions"))
        return { ok: false, status: 400, body: { error: { code: 100 } } };
      if (url.startsWith("/insights")) return { ok: true, body: { data: [] } };
      return { ok: true, body: { likes: { summary: { total_count: 9 } } } };
    },
  });
  assert.equal(result.likes, 9);
  assert.equal(result.issues[0].code, "UNSUPPORTED_METRIC");
});

test("Network failures remain unknown and report a collection issue", async () => {
  const result = await collectFacebookMetrics({
    postId: "123",
    request: async () => {
      throw Error("network");
    },
  });
  assert.equal(result.views, null);
  assert.equal(result.likes, null);
  assert.equal(result.issues.length, 2);
});

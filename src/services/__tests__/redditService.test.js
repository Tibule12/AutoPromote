jest.mock("../../utils/ssrfGuard", () => ({
  safeFetch: jest.fn((url, fetchFn, opts) => {
    if (url.includes("/api/submit")) {
      global.__last_reddit_post = opts.fetchOptions.body.toString();
      return Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({ json: { data: { id: "t3_123", permalink: "/r/test/abc" } } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "{}" });
  }),
}));

jest.mock("../../firebaseAdmin", () => ({
  db: {
    collection: name => {
      function userConnDoc() {
        return {
          get: async () => ({
            exists: true,
            data: () => ({
              tokens: { access_token: "rd_token", expires_in: 999999 },
              updatedAt: { _seconds: Math.floor(Date.now() / 1000) },
            }),
          }),
        };
      }
      if (name === "users") {
        return { doc: uid => ({ collection: () => ({ doc: () => userConnDoc() }) }) };
      }
      if (name === "content") {
        return {
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({}) }),
            set: async () => ({}),
          }),
        };
      }
      return { doc: () => ({ get: async () => ({ exists: false }) }) };
    },
  },
  admin: { firestore: { FieldValue: { serverTimestamp: () => ({}) } } },
}));

const { postToReddit } = require("../redditService");

describe("Reddit posting with hashtags", () => {
  test("includes hashtagString in text for self posts", async () => {
    global.__last_reddit_post = null;
    const res = await postToReddit({
      uid: "user1",
      subreddit: "test",
      title: "Hello",
      text: "Thread body",
      kind: "self",
      hashtags: ["#a", "#b"],
      hashtagString: "a, b",
      contentId: "abc",
    });
    expect(res.success).toBe(true);
    expect(global.__last_reddit_post).toBeTruthy();
    // The payload is form-urlencoded string; it should contain the hashtag string appended
    const params = new URLSearchParams(global.__last_reddit_post);
    const texts = params.getAll("text");
    // There should be two text fields: main body and appended hashtags
    expect(texts.length).toBeGreaterThanOrEqual(2);
    // The appended tag string should include the comma-separated tag list
    expect(texts.join("\n")).toContain("a, b");
  });
});

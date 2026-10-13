jest.mock("../../utils/ssrfGuard", () => ({
  safeFetch: jest.fn((url, fetchFn, opts) => {
    if (url.includes("/api/submit")) {
      global.__last_reddit_post = opts.fetchOptions.body.toString();
      return Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({
            json: { errors: [], data: { id: "t3_123", permalink: "/r/test/comments/123/hello/" } },
          }),
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
        return { doc: _uid => ({ collection: () => ({ doc: () => userConnDoc() }) }) };
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

const { postToReddit, getOwnProfile } = require("../redditService");
const { safeFetch } = require("../../utils/ssrfGuard");
jest.mock("../../utils/cleanupSource", () => ({
  cleanupSourceFile: jest.fn().mockResolvedValue(undefined),
}));
const { cleanupSourceFile } = require("../../utils/cleanupSource");

describe("Reddit publication confirmation", () => {
  test("an identified Reddit video remains pending when the attachment is missing", async () => {
    cleanupSourceFile.mockClear();
    safeFetch.mockClear();
    safeFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { children: [{ data: { id: "abc123", is_video: true, media: null } }] },
      }),
    });
    const submissionReceipt = {
      submittedAt: new Date().toISOString(),
      subreddit: "test",
      title: "Hello",
      kind: "video",
      postId: "abc123",
      url: "https://www.reddit.com/r/test/comments/abc123/",
    };
    const result = await postToReddit({
      uid: "user1",
      subreddit: "test",
      title: "Hello",
      kind: "video",
      videoUrl: "https://firebasestorage.googleapis.com/video.mp4",
      submissionReceipt,
    });
    expect(result).toMatchObject({
      success: false,
      pending: true,
      errorClass: "publication_pending",
    });
    expect(cleanupSourceFile).not.toHaveBeenCalled();
    expect(
      safeFetch.mock.calls.every(
        ([url]) => !url.includes("/api/submit") && !url.includes("/api/media/")
      )
    ).toBe(true);
  });
  test("persists an acknowledgement and returns pending until an owned post exists", async () => {
    safeFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          json: {
            errors: [],
            data: {
              user_submitted_page: "https://www.reddit.com/user/test/submitted/",
              websocket_url: null,
            },
          },
        }),
    });
    safeFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "test" }) });
    safeFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { children: [] } }) });
    const onSubmissionAccepted = jest.fn();
    const result = await postToReddit({
      uid: "user1",
      subreddit: "test",
      title: "Hello",
      text: "body",
      onSubmissionAccepted,
    });
    expect(onSubmissionAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ subreddit: "test", title: "Hello", kind: "self" })
    );
    expect(result).toMatchObject({
      success: false,
      pending: true,
      errorClass: "publication_pending",
    });
    expect(cleanupSourceFile).not.toHaveBeenCalled();
  });
  test("a receipt retry verifies the original post and never submits again", async () => {
    const submittedAt = new Date().toISOString();
    safeFetch.mockClear();
    safeFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "test" }) });
    safeFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          children: [
            {
              data: {
                author: "test",
                subreddit: "test",
                title: "Hello",
                selftext: "body",
                created_utc: Date.parse(submittedAt) / 1000,
                permalink: "/r/test/comments/abc123/hello/",
              },
            },
          ],
        },
      }),
    });
    const result = await postToReddit({
      uid: "user1",
      subreddit: "test",
      title: "Hello",
      text: "body",
      submissionReceipt: {
        submittedAt,
        subreddit: "test",
        title: "Hello",
        kind: "self",
        text: "body",
      },
    });
    expect(result).toMatchObject({
      success: true,
      postId: "abc123",
      url: "https://www.reddit.com/r/test/comments/abc123/hello/",
    });
    expect(
      safeFetch.mock.calls.every(
        ([url]) => !url.includes("/api/submit") && !url.includes("/api/media/")
      )
    ).toBe(true);
  });
  test("malformed acknowledgement cannot become published or trigger a resubmit", async () => {
    safeFetch.mockResolvedValueOnce({ ok: true, text: async () => "{}" });
    const onSubmissionAccepted = jest.fn();
    await expect(
      postToReddit({
        uid: "user1",
        subreddit: "test",
        title: "Hello",
        text: "body",
        onSubmissionAccepted,
      })
    ).rejects.toMatchObject({ errorClass: "publication_unconfirmed" });
    expect(onSubmissionAccepted).toHaveBeenCalled();
  });
  test("provider validation errors stop retries", async () => {
    safeFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          json: { errors: [["SUBREDDIT_NOTALLOWED", "Videos are not allowed", "sr"]] },
        }),
    });
    await expect(
      postToReddit({ uid: "user1", subreddit: "test", title: "Hello", text: "body" })
    ).rejects.toMatchObject({ errorClass: "validation" });
  });
});

describe("Reddit owned profile lookup", () => {
  test("returns only the provider-verified identity", async () => {
    safeFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: "AutoPromoteTest", access_token: "private", id: "private" }),
    });
    await expect(getOwnProfile({ uid: "user1" })).resolves.toEqual({
      connected: true,
      name: "AutoPromoteTest",
    });
    const [url, , options] = safeFetch.mock.calls.at(-1);
    expect(url).toBe("https://oauth.reddit.com/api/v1/me");
    expect(options.allowHosts).toEqual(["oauth.reddit.com"]);
    expect(options.fetchOptions.headers.Authorization).toBe("Bearer rd_token");
  });
  test("rejects unavailable and malformed account identities", async () => {
    safeFetch.mockResolvedValueOnce({ ok: false });
    await expect(getOwnProfile({ uid: "user1" })).rejects.toThrow("reconnect");
    safeFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "r/untrusted" }) });
    await expect(getOwnProfile({ uid: "user1" })).rejects.toThrow("invalid profile");
    await expect(getOwnProfile({})).rejects.toThrow("uid required");
  });
});

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

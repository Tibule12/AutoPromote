jest.mock("../../utils/ssrfGuard", () => ({
  safeFetch: jest.fn((url, fetchFn, opts) => {
    // Respond to profile and post endpoints differently
    if (url.includes("/v2/me")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "person_1" }),
        text: async () => JSON.stringify({ id: "person_1" }),
      });
    }
    if (url.includes("/v2/ugcPosts")) {
      // Capture body for assertion by tests via a shared variable
      const last = { opts };
      global.__last_linkedin_post = last;
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ id: "share_1" }) });
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
            data: () =>
              global.__linkedin_connection || {
                tokens: { access_token: "li_token", expires_in: 999999 },
                updatedAt: { _seconds: Math.floor(Date.now() / 1000) },
              },
          }),
          set: jest.fn(async data => {
            global.__linkedin_connection_update = data;
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

const { postToLinkedIn, getValidAccessToken } = require("../linkedinService");
const { safeFetch } = require("../../utils/ssrfGuard");

afterEach(() => {
  delete global.__linkedin_connection;
  delete global.__linkedin_connection_update;
});

describe("LinkedIn expired credentials", () => {
  test("stops an expired ISO timestamp credential and asks for reconnect", async () => {
    global.__linkedin_connection = {
      tokens: { access_token: "expired", expires_in: 3600 },
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const calls = safeFetch.mock.calls.length;
    await expect(getValidAccessToken("user1")).rejects.toMatchObject({
      errorClass: "auth",
      status: 401,
    });
    expect(safeFetch.mock.calls).toHaveLength(calls);
    expect(global.__linkedin_connection_update).toMatchObject({
      connected: false,
      reauthRequired: true,
    });
  });
  test("recognizes a provider-revoked legacy token without retrying publication", async () => {
    safeFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(postToLinkedIn({ uid: "user1", text: "Hello" })).rejects.toMatchObject({
      errorClass: "auth",
    });
  });
  test("uses a supplied refresh token and persists the replacement", async () => {
    const previousId = process.env.LINKEDIN_CLIENT_ID,
      previousSecret = process.env.LINKEDIN_CLIENT_SECRET;
    process.env.LINKEDIN_CLIENT_ID = "test-client";
    process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
    global.__linkedin_connection = {
      tokens: { access_token: "expired", refresh_token: "refresh", expires_in: 3600 },
      updatedAt: "2026-01-01T00:00:00Z",
    };
    safeFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "replacement", expires_in: 3600 }),
    });
    try {
      await expect(getValidAccessToken("user1")).resolves.toBe("replacement");
      expect(global.__linkedin_connection_update).toMatchObject({
        connected: true,
        reauthRequired: false,
      });
      const [url, , opts] = safeFetch.mock.calls.at(-1);
      expect(url).toBe("https://www.linkedin.com/oauth/v2/accessToken");
      expect(opts.fetchOptions.body.get("grant_type")).toBe("refresh_token");
    } finally {
      if (previousId === undefined) delete process.env.LINKEDIN_CLIENT_ID;
      else process.env.LINKEDIN_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.LINKEDIN_CLIENT_SECRET;
      else process.env.LINKEDIN_CLIENT_SECRET = previousSecret;
    }
  });
});

describe("LinkedIn posting with hashtags", () => {
  test("appends hashtagString to shareCommentary.text", async () => {
    global.__last_linkedin_post = null;

    const result = await postToLinkedIn({
      uid: "user1",
      text: "Hello",
      hashtagString: "#a #b",
      hashtags: ["#a", "#b"],
      contentId: "abc",
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    // Inspect the last posted body's shareCommentary
    const last = global.__last_linkedin_post;
    expect(last).toBeTruthy();
    const body = JSON.parse(last.opts.fetchOptions.body);
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toContain(
      "#a"
    );
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toContain(
      "#b"
    );
  });
});

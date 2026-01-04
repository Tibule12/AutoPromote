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
            data: () => ({
              tokens: { access_token: "li_token", expires_in: 999999 },
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

const { postToLinkedIn } = require("../linkedinService");

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

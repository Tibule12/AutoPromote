const { dispatchPlatformPost } = require("../platformPoster");

jest.mock("../hashtagEngine", () => ({
  generateCustomHashtags: jest.fn(async ({ content, platform }) => ({
    hashtags: ["#auto1", "#auto2"],
    hashtagString: platform === "reddit" ? "auto1, auto2" : "#auto1 #auto2",
  })),
}));

jest.mock("../../firebaseAdmin", () => ({
  db: {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({ title: "My Title", description: "Desc", category: "tech" }),
        }),
      }),
    }),
  },
}));

jest.mock("../redditService", () => ({ postToReddit: jest.fn(async args => ({ ok: true })) }));
jest.mock("../linkedinService", () => ({ postToLinkedIn: jest.fn(async args => ({ ok: true })) }));
jest.mock("../discordService", () => ({ postToDiscord: jest.fn(async args => ({ ok: true })) }));

const mockReddit = require("../redditService");
const mockLinkedIn = require("../linkedinService");
const mockDiscord = require("../discordService");
describe("platformPoster hashtag injection", () => {
  beforeEach(() => {
    mockReddit.postToReddit.mockClear();
    mockLinkedIn.postToLinkedIn.mockClear();
    mockDiscord.postToDiscord.mockClear();
  });

  test("dispatchPlatformPost injects hashtags and calls reddit handler", async () => {
    const res = await dispatchPlatformPost({
      platform: "reddit",
      contentId: "abc",
      payload: { message: "Hello" },
      reason: "test",
    });
    expect(mockReddit.postToReddit).toHaveBeenCalled();
    const callArg = mockReddit.postToReddit.mock.calls[0][0];
    expect(callArg).toHaveProperty("hashtags");
    expect(callArg.hashtagString).toContain("auto1");
  });

  test("dispatchPlatformPost injects hashtags and calls linkedin handler with hashtagString", async () => {
    const res = await dispatchPlatformPost({
      platform: "linkedin",
      contentId: "abc",
      payload: { message: "Hello" },
      reason: "test",
    });
    expect(mockLinkedIn.postToLinkedIn).toHaveBeenCalled();
    const callArg = mockLinkedIn.postToLinkedIn.mock.calls[0][0];
    expect(callArg.hashtagString || callArg.hashtags).toBeTruthy();
  });

  test("dispatchPlatformPost injects hashtags and calls discord handler with hashtag string", async () => {
    const res = await dispatchPlatformPost({
      platform: "discord",
      contentId: "abc",
      payload: { message: "Hello" },
      reason: "test",
      uid: "user1",
    });
    expect(mockDiscord.postToDiscord).toHaveBeenCalled();
    const callArg = mockDiscord.postToDiscord.mock.calls[0][0];
    expect(callArg.hashtagString || callArg.hashtags).toBeTruthy();
  });
});

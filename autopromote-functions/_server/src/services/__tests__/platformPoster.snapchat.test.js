const { dispatchPlatformPost } = require("../platformPoster");

jest.mock("../../firebaseAdmin", () => ({
  db: {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ title: "My Title" }) }) }),
    }),
  },
}));
jest.mock("../snapchatService", () => ({ postToSnapchat: jest.fn(async args => ({ ok: true })) }));
const { postToSnapchat } = require("../snapchatService");

describe("platformPoster snapchat handler", () => {
  beforeEach(() => {
    postToSnapchat.mockClear();
  });
  test("dispatchPlatformPost merges platformOptions to top-level for snapchat", async () => {
    const res = await dispatchPlatformPost({
      platform: "snapchat",
      contentId: "abc",
      payload: { message: "Hello", platformOptions: { snapchat: { campaignId: "camp123" } } },
      reason: "test",
      uid: "user1",
    });
    expect(postToSnapchat).toHaveBeenCalled();
    const arg = postToSnapchat.mock.calls[0][0];
    expect(
      arg.campaignId || arg.campaign_id || arg.payload?.platformOptions?.snapchat?.campaignId
    ).toBeTruthy();
    expect(arg.payload.platformOptions.snapchat.campaignId).toEqual("camp123");
  });
});

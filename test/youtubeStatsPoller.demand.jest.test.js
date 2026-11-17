const mockQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  get: jest.fn(),
};
const mockUpdate = jest.fn(function () {
  if (!this.fetchVideoStats) throw new Error("Service receiver lost");
  return Promise.resolve({ views: 123 });
});
jest.mock("../src/firebaseAdmin", () => ({ db: { collection: () => mockQuery } }));
jest.mock("../src/services/youtubeService", () => ({
  updateContentVideoStats: mockUpdate,
  fetchVideoStats: jest.fn(),
}));
const { pollYouTubeStatsBatch } = require("../src/services/youtubeStatsPoller");
const rows = data => ({
  forEach: visit => data.forEach((value, i) => visit({ id: `video-${i}`, data: () => value })),
});
beforeEach(() => jest.clearAllMocks());

test("requested refresh uses the content owner and retains the service receiver", async () => {
  mockQuery.get.mockResolvedValue(rows([{ user_id: "owner", youtube: { videoId: "one" } }]));
  expect((await pollYouTubeStatsBatch({})).processed).toBe(1);
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ uid: "owner" }));
  expect(mockQuery.select).toHaveBeenCalledWith("youtube", "userId", "user_id", "uid", "owner");
});

test("manual owner refresh cannot update another owner or repeatedly refresh recent ISO timestamps", async () => {
  mockQuery.get.mockResolvedValue(
    rows([
      { user_id: "another", youtube: { videoId: "other" } },
      { userId: "owner", youtube: { videoId: "recent", lastStatsCheck: new Date().toISOString() } },
      { user_id: "owner", youtube: { videoId: "stale" } },
    ])
  );
  const result = await pollYouTubeStatsBatch({ uid: "owner" });
  expect(result.processed).toBe(1);
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      uid: "owner",
      contentDoc: expect.objectContaining({ youtube: { videoId: "stale" } }),
    })
  );
});

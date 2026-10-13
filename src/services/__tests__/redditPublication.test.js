jest.mock("../../utils/ssrfGuard", () => ({
  safeFetch: jest.fn(),
  validateUrl: jest.fn().mockResolvedValue({ ok: true }),
}));
const { safeFetch } = require("../../utils/ssrfGuard");
const { verifyRedditVideoPublication } = require("../redditPublication");

beforeEach(() => safeFetch.mockReset());

test("a post flagged is_video with null media is not a published video", async () => {
  safeFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: {
        children: [
          {
            data: {
              id: "1x50ksn",
              is_video: true,
              media: null,
              secure_media: null,
              url: "https://v.redd.it/r0263enac9vh1",
            },
          },
        ],
      },
    }),
  });
  await expect(
    verifyRedditVideoPublication({
      identity: { postId: "1x50ksn" },
      accessToken: "token",
      fetchFn: jest.fn(),
    })
  ).resolves.toBeNull();
  expect(safeFetch).toHaveBeenCalledTimes(1);
});

test("completed media metadata still needs accessible MP4 bytes", async () => {
  const metadata = {
    data: {
      children: [
        {
          data: {
            id: "abc123",
            is_video: true,
            secure_media: {
              reddit_video: {
                transcoding_status: "completed",
                duration: 20,
                fallback_url: "https://v.redd.it/asset/DASH_720.mp4",
                has_audio: true,
              },
            },
          },
        },
      ],
    },
  };
  const args = { identity: { postId: "abc123" }, accessToken: "token", fetchFn: jest.fn() };
  safeFetch.mockResolvedValueOnce({ ok: true, json: async () => metadata });
  safeFetch.mockResolvedValueOnce({ ok: false, status: 403 });
  await expect(verifyRedditVideoPublication(args)).resolves.toBeNull();
  safeFetch.mockResolvedValueOnce({ ok: true, json: async () => metadata });
  safeFetch.mockResolvedValueOnce({
    ok: true,
    buffer: async () => Buffer.from("<html>not video</html>"),
  });
  await expect(verifyRedditVideoPublication(args)).resolves.toBeNull();
  safeFetch.mockResolvedValueOnce({ ok: true, json: async () => metadata });
  safeFetch.mockResolvedValueOnce({
    ok: true,
    buffer: async () => Buffer.from("0000ftypisom0000000000000000000000"),
  });
  await expect(verifyRedditVideoPublication(args)).resolves.toMatchObject({
    publicationConfirmed: true,
    videoVerified: true,
    videoDuration: 20,
    hasAudio: true,
  });
});

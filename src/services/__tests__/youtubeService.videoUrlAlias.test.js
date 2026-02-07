const { uploadVideo } = require("../youtubeService");

test("uploadVideo accepts videoUrl alias for fileUrl", async () => {
  // Passing videoUrl (legacy callers) should be accepted and proceed to connection check
  // Must provide contentId now as it is strictly required
  await expect(
    uploadVideo({
      uid: "test-uid",
      title: "Test Title",
      videoUrl: "https://example.com/video.mp4",
      contentId: "test-content-id",
    })
  ).rejects.toThrow("YouTube not connected");
});

const { uploadTikTokVideo } = require("../tiktokService");

describe("tiktokService", () => {
  test("uploadTikTokVideo returns simulated id", async () => {
    const res = await uploadTikTokVideo({
      contentId: "c123",
      payload: { videoUrl: "http://example.com/video.mp4" },
    });
    expect(res).toHaveProperty("videoId");
    expect(res.simulated).toBeTruthy();
  });

  test("uploadTikTokVideo uses caption when provided and otherwise combines title with description", async () => {
    const combinedRes = await uploadTikTokVideo({
      contentId: "c124",
      payload: {
        videoUrl: "http://example.com/video.mp4",
        title: "Hook title",
        description: "Longer viewer description",
      },
    });
    expect(combinedRes.title).toContain("Hook title");
    expect(combinedRes.title).toContain("Longer viewer description");

    const captionRes = await uploadTikTokVideo({
      contentId: "c125",
      payload: {
        videoUrl: "http://example.com/video.mp4",
        title: "Ignored title",
        description: "Ignored description",
        caption: "Manual caption #viral",
      },
    });
    expect(captionRes.title).toBe("Manual caption #viral");
  });
});

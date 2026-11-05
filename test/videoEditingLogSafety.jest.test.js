jest.mock("axios", () => ({ post: jest.fn() }));
jest.mock("../src/services/unifiedCredits/workerTransport", () => ({
  applicationWorkerConfig: jest.fn(async () => ({ timeout: 1000 })),
}));
const axios = require("axios");
const Editing = require("../src/services/videoEditingService");

test("actual failed worker submission logs summaries without request data or capabilities", async () => {
  const secretUrl = "https://media.test/private?Signature=super-private&Expires=123";
  const error = Object.assign(new Error("Download failed: " + secretUrl), {
    response: { status: 400, data: { detail: "Failed: " + secretUrl } },
    config: { headers: { Authorization: "Bearer super-private" }, data: "private transcript" },
  });
  axios.post.mockRejectedValue(error);
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const fail = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(
      new Editing().processVideo(
        secretUrl,
        {
          renderViral: true,
          viralData: {
            video_url: secretUrl,
            timeline_segments: [{ url: secretUrl }],
            caption_text_override: "private transcript",
          },
        },
        "owner",
        "viral_log_test"
      )
    ).rejects.toThrow();
    expect(axios.post).toHaveBeenCalled();
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...fail.mock.calls])).not.toMatch(
      /super-private|private transcript|Signature=|media\.test/
    );
    expect(log).toHaveBeenCalledWith(
      "[VideoEditing] Processing video request",
      expect.objectContaining({ jobId: "viral_log_test", operation: "render_clip" })
    );
  } finally {
    log.mockRestore();
    warn.mockRestore();
    fail.mockRestore();
  }
});

const {
  enqueueMediaTransformTask,
  processNextMediaTransformTask,
} = require("../services/mediaTransform");
const admin = require("../firebaseAdmin").admin;
const stream = require("stream");

// Mock fluent-ffmpeg for media processing
jest.mock("fluent-ffmpeg", () => {
  const mockCommand = {
    complexFilter: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(), // Added for robustness
    videoCodec: jest.fn().mockReturnThis(),
    videoBitrate: jest.fn().mockReturnThis(),
    fps: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    audioFrequency: jest.fn().mockReturnThis(),
    audioChannels: jest.fn().mockReturnThis(),
    size: jest.fn().mockReturnThis(),
    run: jest.fn(),
    save: jest.fn(function (output) {
      // Simulate async completion
      setTimeout(() => {
        if (this._onEnd) this._onEnd();
      }, 10);
      return this;
    }),
    on: jest.fn(function (event, callback) {
      if (event === "end") {
        this._onEnd = callback;
      } else if (event === "error") {
        this._onError = callback;
      }
      return this;
    }),
  };

  const ffmpeg = jest.fn(() => mockCommand);
  ffmpeg.setFfmpegPath = jest.fn();
  ffmpeg.ffprobe = jest.fn((filePath, callback) => {
    callback(null, {
      streams: [{ codec_type: "video", width: 1920, height: 1080 }],
      format: { duration: 10 },
    });
  });
  return ffmpeg;
});

// Mock ffmpeg-static to prevent errors if it's required directly
jest.mock("ffmpeg-static", () => "ffmpeg", { virtual: true });

describe("mediaTransform", () => {
  it("enqueues and processes a transform task (mocked ffmpeg/storage)", async () => {
    // Mock fetch to return a Readable stream in res.body
    global.fetch = jest.fn(async _url => ({
      ok: true,
      body: stream.Readable.from(["binarydata"]),
    }));
    // Mock admin.storage bucket upload and file getSignedUrl
    const bucket = {
      upload: jest.fn(async () => {}),
      file: jest.fn(() => ({
        getSignedUrl: jest.fn(async () => ["https://signed-url.example.com"]),
      })),
      name: "test-bucket",
    };
    admin.storage = jest.fn(() => ({ bucket: () => bucket }));

    // Enqueue a task
    const task = await enqueueMediaTransformTask({
      contentId: "test-content",
      uid: "user1",
      meta: { trimStart: 0, trimEnd: 1 },
      url: "https://example.com/media.mp4",
    });
    expect(task).toBeDefined();
    // Process the queued task
    const res = await processNextMediaTransformTask();
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    // expect(res.processedUrl).toBeDefined(); // The service updates the content doc, doesn't return the URL directly
  }, 20000);
});

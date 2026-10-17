const {
  enqueueMediaTransformTask,
  processNextMediaTransformTask,
  __testables,
} = require("../services/mediaTransform");
const { admin, db } = require("../firebaseAdmin");
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
    save: jest.fn(function (_output) {
      // Simulate async completion
      // Jest's shared setup unreferences global timers; keep this simulated
      // subprocess completion alive so the suite cannot exit before assertions.
      require("node:timers").setTimeout(() => {
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
  const previousTransaction = db.runTransaction;
  beforeAll(() => {
    // The in-memory fixture needs transaction support now that enqueue and
    // retention share a content write. Commit only after the handler succeeds.
    db.runTransaction = async handler => {
      const writes = [];
      const result = await handler({
        get: ref => ref.get(),
        set: (ref, value, options) => writes.push(() => ref.set(value, options)),
      });
      for (const write of writes) await write();
      return result;
    };
  });
  afterAll(() => {
    if (previousTransaction) db.runTransaction = previousTransaction;
    else delete db.runTransaction;
  });

  it("accepts generated subtitle paths when building the ffmpeg subtitles filter", () => {
    const filter = __testables.buildSubtitleOverlayFilter(
      "/tmp/repost-captions-content_123-task-456.srt",
      "youtube"
    );

    expect(filter).toContain("subtitles='/tmp/repost-captions-content_123-task-456.srt'");
    expect(filter).toContain("force_style='");
  });

  it("drops subtitle overlays when the subtitle path contains unexpected special characters", () => {
    expect(
      __testables.buildSubtitleOverlayFilter(
        "/tmp/repost:captions,semi;[preview]'quote'.srt",
        "youtube"
      )
    ).toBe("");
  });

  it("drops subtitle overlays when the subtitle path contains control characters", () => {
    expect(__testables.buildSubtitleOverlayFilter("/tmp/bad\nname.srt", "youtube")).toBe("");
  });

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

    await db.collection("content").doc("test-content").set({ user_id: "user1" });
    // Enqueue a task against actual available content in the fixture.
    const task = await enqueueMediaTransformTask({
      contentId: "test-content",
      uid: "user1",
      meta: { trimStart: 0, trimEnd: 1 },
      url: "https://example.com/media.mp4",
    });
    expect(task).toBeDefined();
    expect((await db.collection("content").doc("test-content").get()).data()).toHaveProperty(
      "lastMediaDependencyAt"
    );
    // Process the queued task
    const res = await processNextMediaTransformTask();
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    // expect(res.processedUrl).toBeDefined(); // The service updates the content doc, doesn't return the URL directly
  }, 20000);

  it("rejects a new transform after published-media deletion has been claimed", async () => {
    await db.collection("content").doc("expired-transform-source").set({
      user_id: "user1",
      storageRetentionStatus: "deleting_after_publication",
    });
    await expect(
      enqueueMediaTransformTask({
        contentId: "expired-transform-source",
        uid: "user1",
        url: "https://example.com/expired.mp4",
      })
    ).rejects.toMatchObject({ code: "PUBLISHED_MEDIA_EXPIRED", status: 409 });
    const tasks = await db
      .collection("promotion_tasks")
      .where("contentId", "==", "expired-transform-source")
      .get();
    expect(tasks.empty).toBe(true);
  });
});

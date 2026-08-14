const mockJobs = new Map();

const makeJobRef = id => ({
  id,
  set: jest.fn(async data => mockJobs.set(id, data)),
});

const mockDb = {
  collection: jest.fn(name => {
    if (name !== "video_edits") throw new Error(`Unexpected collection ${name}`);
    return { doc: jest.fn(id => makeJobRef(id)) };
  }),
  runTransaction: jest.fn(async callback => {
    const transaction = {
      get: jest.fn(async ref => ({
        exists: mockJobs.has(ref.id),
        data: () => mockJobs.get(ref.id),
      })),
      set: jest.fn((ref, data) => mockJobs.set(ref.id, data)),
    };
    return callback(transaction);
  }),
};

jest.mock(
  "firebase-admin",
  () => ({
    firestore: jest.fn(() => mockDb),
    storage: jest.fn(() => ({ bucket: jest.fn() })),
  }),
  { virtual: true }
);
jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn() }), { virtual: true });
jest.mock("uuid", () => ({ v4: jest.fn(() => "random-job-id") }), { virtual: true });

jest.mock("../mediaWorkerTaskQueue", () => ({ queueAudioExtractionTask: jest.fn() }));
jest.mock("../../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
}));

const VideoEditingService = require("../videoEditingService");

describe("VideoEditingService render idempotency", () => {
  beforeEach(() => {
    mockJobs.clear();
    jest.clearAllMocks();
  });

  test("reuses one durable job and dispatches background processing once", async () => {
    const service = new VideoEditingService();
    jest.spyOn(service, "processJobBackground").mockResolvedValue();

    const first = await service.startProcessingJob(
      "https://example.com/source.mp4",
      { renderViral: true },
      "user-1",
      { renderRequestId: "request-123" }
    );
    const retry = await service.startProcessingJob(
      "https://example.com/source.mp4",
      { renderViral: true },
      "user-1",
      { renderRequestId: "request-123" }
    );

    expect(retry.jobId).toBe(first.jobId);
    expect(first.deduplicated).toBe(false);
    expect(retry.deduplicated).toBe(true);
    expect(mockJobs.size).toBe(1);
    expect(service.processJobBackground).toHaveBeenCalledTimes(1);
  });
});

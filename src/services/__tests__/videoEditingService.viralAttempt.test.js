const mockDocs = new Map();

const mockDocRef = id => ({
  id,
  create: jest.fn(async data => {
    if (mockDocs.has(id)) throw new Error("ALREADY_EXISTS");
    mockDocs.set(id, { ...data });
  }),
  set: jest.fn(async data => { mockDocs.set(id, { ...data }); }),
  get: jest.fn(async () => ({ exists: mockDocs.has(id), data: () => mockDocs.get(id) })),
  update: jest.fn(async data => { mockDocs.set(id, { ...mockDocs.get(id), ...data }); }),
});

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({ collection: jest.fn(() => ({ doc: jest.fn(id => mockDocRef(id)) })) })),
}));
jest.mock("../../creditSystem", () => ({ deductCredits: jest.fn(), refundCredits: jest.fn() }));
jest.mock("../mediaWorkerTaskQueue", () => ({ queueAudioExtractionTask: jest.fn() }));
jest.mock("../cloudRunJobService", () => ({
  executeMulticamRenderJob: jest.fn(),
  isDurableMulticamRenderEnabled: jest.fn(() => false),
}));
jest.mock("../multicamCapacityService", () => ({
  releaseMulticamRenderCapacity: jest.fn(),
  reserveMulticamRenderCapacity: jest.fn(),
}));

const VideoEditingService = require("../videoEditingService");
const { refundCredits } = require("../../creditSystem");

const attempt = {
  jobId: "viral_deterministic_job",
  renderRequestId: "browser-attempt-123",
  creditReceipt: { success: true, deducted: 5, fromMonthly: 5, monthKey: "2026-09" },
};

describe("video editing viral render attempt claim", () => {
  beforeEach(() => {
    mockDocs.clear();
    jest.clearAllMocks();
    refundCredits.mockResolvedValue({ success: true, refunded: 5 });
  });

  it("atomically creates one job and dispatches once across concurrent calls", async () => {
    const service = new VideoEditingService();
    service.processJobBackground = jest.fn().mockResolvedValue(null);
    const options = { renderViral: true };

    const [first, second] = await Promise.all([
      service.startProcessingJob("https://example.com/source.mp4", options, "owner-1", attempt),
      service.startProcessingJob("https://example.com/source.mp4", options, "owner-1", attempt),
    ]);

    expect(first.jobId).toBe(attempt.jobId);
    expect(second.jobId).toBe(attempt.jobId);
    expect([first.reused, second.reused].sort()).toEqual([false, true]);
    expect(service.processJobBackground).toHaveBeenCalledTimes(1);
    expect(mockDocs.get(attempt.jobId)).toMatchObject({
      userId: "owner-1",
      renderRequestId: attempt.renderRequestId,
      creditReceipt: attempt.creditReceipt,
      status: "queued",
    });
  });

  it("does not reuse an existing job owned by another user", async () => {
    const service = new VideoEditingService();
    service.processJobBackground = jest.fn().mockResolvedValue(null);
    await service.startProcessingJob("https://example.com/source.mp4", { renderViral: true }, "owner-1", attempt);

    await expect(
      service.startProcessingJob("https://example.com/source.mp4", { renderViral: true }, "owner-2", attempt)
    ).rejects.toThrow("Failed to queue video processing job");
    expect(service.processJobBackground).toHaveBeenCalledTimes(1);
  });

  it("refunds a charged viral job when the background worker fails", async () => {
    const service = new VideoEditingService();
    service.processJobBackground = jest.fn().mockResolvedValue(null);
    await service.startProcessingJob("https://example.com/source.mp4", { renderViral: true }, "owner-1", attempt);
    service.processVideo = jest.fn().mockRejectedValue(new Error("worker unavailable"));

    await VideoEditingService.prototype.processJobBackground.call(
      service, attempt.jobId, "https://example.com/source.mp4", { renderViral: true }, "owner-1"
    );

    expect(refundCredits).toHaveBeenCalledWith(
      "owner-1", attempt.creditReceipt, "viral-render-process-refund",
      expect.objectContaining({ idempotencyKey: `viral-render-refund:${attempt.jobId}` })
    );
    expect(mockDocs.get(attempt.jobId)).toMatchObject({
      status: "failed",
      error: "worker unavailable",
      creditsRefunded: true,
    });
  });
});

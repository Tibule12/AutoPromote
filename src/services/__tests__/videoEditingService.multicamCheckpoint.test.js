const mockSet = jest.fn();
const mockExecuteMulticamRenderJob = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ set: mockSet })),
    })),
  })),
}));

jest.mock("../cloudRunJobService", () => ({
  executeMulticamRenderJob: mockExecuteMulticamRenderJob,
  isDurableMulticamRenderEnabled: jest.fn(() => true),
}));

jest.mock("../multicamCapacityService", () => ({
  releaseMulticamRenderCapacity: jest.fn(),
  reserveMulticamRenderCapacity: jest.fn(),
}));

jest.mock("../../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
}));

const VideoEditingService = require("../videoEditingService");

describe("VideoEditingService multicam checkpoint contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockExecuteMulticamRenderJob.mockResolvedValue({ executionName: "executions/episode-2" });
  });

  it("persists the v2 checkpoint contract in the job and canonical worker payload", async () => {
    const service = new VideoEditingService();
    const result = await service.startMulticamRenderJob(
      {
        sources: [
          { id: "cam-1", url: "https://cdn.example.com/cam-1.mp4" },
          { id: "cam-2", url: "https://cdn.example.com/cam-2.mp4" },
        ],
        overlapDuration: 44 * 60,
        checkpointSeconds: 300,
        creditReceipt: { success: true, amount: 450 },
      },
      "user-1",
      { jobId: "episode-2-job", capacityReserved: true }
    );

    const initialJob = mockSet.mock.calls[0][0];
    expect(initialJob).toEqual(
      expect.objectContaining({
        renderSpecVersion: 2,
        totalDurationSeconds: 44 * 60,
        checkpointSeconds: 300,
        checkpointedRender: true,
        expectedCheckpointCount: 9,
        renderCheckpoint: {
          stage: "queued",
          currentIndex: null,
          completedCount: 0,
          expectedCount: 9,
          completedDurationSeconds: 0,
          totalDurationSeconds: 44 * 60,
        },
      })
    );
    expect(initialJob.multicamRequest).toEqual(
      expect.objectContaining({
        render_spec_version: 2,
        renderSpecVersion: 2,
        total_duration_seconds: 44 * 60,
        totalDurationSeconds: 44 * 60,
        checkpoint_seconds: 300,
        checkpointSeconds: 300,
        checkpointed_render: true,
        checkpointedRender: true,
        expected_checkpoint_count: 9,
        expectedCheckpointCount: 9,
        output_aspect_ratio: "16:9",
        outputAspectRatio: "16:9",
        reaction_overlays: false,
        reactionOverlays: false,
      })
    );
    expect(mockExecuteMulticamRenderJob).toHaveBeenCalledWith({
      jobId: "episode-2-job",
      dispatchToken: expect.any(String),
    });
    expect(result).toEqual(
      expect.objectContaining({
        jobId: "episode-2-job",
        renderSpecVersion: 2,
        totalDurationSeconds: 44 * 60,
        checkpointSeconds: 300,
        checkpointedRender: true,
        expectedCheckpointCount: 9,
      })
    );
  });

  it("allows full-length original preflight more than two minutes to finish", async () => {
    const service = new VideoEditingService();
    const postWorker = jest
      .spyOn(service, "postCamCombinerWorker")
      .mockResolvedValue({ data: { status: "good", cameras: {} } });

    await expect(
      service.preflightMulticamSync({
        sources: [{ id: "cam-1", url: "https://cdn.example.com/cam-1.mov" }],
        external_audio_url: "https://cdn.example.com/clean-audio.wav",
        overlap_duration: 44 * 60,
      })
    ).resolves.toEqual({ status: "good", cameras: {} });

    expect(postWorker).toHaveBeenCalledWith(
      "/multicam/preflight-sync",
      expect.any(Object),
      300000
    );
  });
});

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockPost = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ update: mockUpdate })) })),
  })),
}));
jest.mock("axios", () => ({ post: mockPost }));
jest.mock("../services/mediaWorkerTaskQueue", () => ({ queueAudioExtractionTask: jest.fn() }));
jest.mock("../creditSystem", () => ({ deductCredits: jest.fn(), refundCredits: jest.fn() }));
jest.mock("../utils/cloudRunAuth", () => ({ buildWorkerRequestConfig: jest.fn() }));
jest.mock("../services/cloudRunJobService", () => ({
  executeMulticamRenderJob: jest.fn(),
  isDurableMulticamRenderEnabled: jest.fn(),
}));
jest.mock("../services/multicamCapacityService", () => ({
  releaseMulticamRenderCapacity: jest.fn(),
  reserveMulticamRenderCapacity: jest.fn(),
}));

const VideoEditingService = require("../services/videoEditingService");

describe("Studio caption job results", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockUpdate.mockClear();
  });

  test("rejects an empty hallucination-filtered result instead of reporting caption success", async () => {
    mockPost.mockResolvedValue({
      data: {
        segments: [],
        transcription_quality: {
          status: "rejected",
          accepted_segments: 0,
          rejected_segments: 9,
        },
      },
    });

    await new VideoEditingService().processTranscriptionBackground(
      "caption-job",
      "https://signed.example/WhatsApp%20Video.mp4",
      { translateToEnglish: false }
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/transcribe$/),
      {
        video_url: "https://signed.example/WhatsApp%20Video.mp4",
        translate_to_english: "false",
      },
      expect.objectContaining({ timeout: 3600000 })
    );
    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        transcriptionQuality: expect.objectContaining({ rejected_segments: 9 }),
        error: expect.stringContaining("No reliable spoken words"),
      })
    );
  });

  test("stores usable caption segments as a completed job", async () => {
    mockPost.mockResolvedValue({
      data: {
        segments: [{ start: 0, end: 2, text: "Hello there" }],
        transcription_quality: { status: "review_required", accepted_segments: 1 },
      },
    });

    await new VideoEditingService().processTranscriptionBackground(
      "caption-job",
      "https://signed.example/video.mp4",
      { translateToEnglish: true }
    );

    expect(mockPost.mock.calls[0][1]).toEqual({
      video_url: "https://signed.example/video.mp4",
      translate_to_english: "true",
    });
    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "completed",
        result: expect.objectContaining({
          segments: [{ start: 0, end: 2, text: "Hello there" }],
        }),
      })
    );
  });
});

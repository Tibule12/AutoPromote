const mockPost = jest.fn();

jest.mock("axios", () => ({ post: mockPost }));
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({})),
}));
jest.mock("../mediaWorkerTaskQueue", () => ({
  queueAudioExtractionTask: jest.fn(),
}));
jest.mock("../../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
}));
jest.mock("../../utils/cloudRunAuth", () => ({
  buildWorkerRequestConfig: jest.fn(() => Promise.resolve({})),
}));
jest.mock("../cloudRunJobService", () => ({
  executeMulticamRenderJob: jest.fn(),
  isDurableMulticamRenderEnabled: jest.fn(() => false),
}));
jest.mock("../multicamCapacityService", () => ({
  releaseMulticamRenderCapacity: jest.fn(),
  reserveMulticamRenderCapacity: jest.fn(),
}));

const VideoEditingService = require("../videoEditingService");

describe("VideoEditingService Viral Clip payload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({
      data: {
        status: "completed",
        output_url: "https://storage.example.com/final.mp4",
      },
    });
  });

  it("forwards Studio caption and speed settings to the Cloud Run worker", async () => {
    const service = new VideoEditingService();
    await service.processVideo(
      "https://storage.example.com/source.mp4",
      {
        renderViral: true,
        viralData: {
          start_time: 0,
          end_time: 12,
          auto_captions: true,
          caption_style: "glow",
          caption_position: "center",
          caption_scale: 1.2,
          caption_text_override: "Say this exactly",
          preview_speed: 1.5,
          speed_segments: [
            {
              start_time: 0,
              end_time: 12,
              rate: 1.5,
              pitch_preserved: true,
            },
          ],
          pacing_level: "energetic",
          creative_intent: "proof",
          caption_segments: [
            {
              id: "caption-1",
              start_time: 0.4,
              end_time: 2.8,
              text: "Molo, welcome ekhaya",
              languages: ["xh", "en"],
              text_reviewed: true,
            },
          ],
          translate_captions_to_english: false,
          studio_plan: { version: 1, timeline: [] },
          professional_cleanup: true,
          creative_plan: { version: 1, enabled: true, effects: [] },
          finish_plan: {
            version: 1,
            enabled: true,
            color: { preset: "podcast_pro", contrast: 1.2 },
            keyframes: [{ time: 0, values: { contrast: 1.2 } }],
          },
          sound_effects: [{ id: "impact-1", start_time: 1.5, duration: 0.6 }],
          export_destination: "tiktok",
        },
      },
      "test-user"
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/render-viral-clip$/),
      expect.objectContaining({
        caption_style: "glow",
        caption_position: "center",
        caption_scale: 1.2,
        caption_text_override: "Say this exactly",
        preview_speed: 1.5,
        speed_segments: [
          expect.objectContaining({
            start_time: 0,
            end_time: 12,
            rate: 1.5,
            pitch_preserved: true,
          }),
        ],
        pacing_level: "energetic",
        creative_intent: "proof",
        caption_segments: [
          expect.objectContaining({
            id: "caption-1",
            text: "Molo, welcome ekhaya",
            languages: ["xh", "en"],
          }),
        ],
        translate_captions_to_english: false,
        studio_plan: { version: 1, timeline: [] },
        professional_cleanup: true,
        creative_plan: expect.objectContaining({ enabled: true }),
        finish_plan: expect.objectContaining({
          enabled: true,
          color: expect.objectContaining({ preset: "podcast_pro" }),
        }),
        sound_effects: [expect.objectContaining({ id: "impact-1" })],
        export_destination: "tiktok",
      }),
      expect.any(Object)
    );
  });
});

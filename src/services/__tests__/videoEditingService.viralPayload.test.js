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
          brand_watermark: false,
          brandWatermark: false,
          creative_plan: { version: 1, enabled: true, effects: [] },
          finish_plan: {
            version: 1,
            enabled: true,
            color: { preset: "podcast_pro", contrast: 1.2 },
            keyframes: [{ time: 0, values: { contrast: 1.2 } }],
          },
          audio_restoration: { enabled: true, preset: "podcast", denoise: 30 },
          audio_automation: { voiceover: [{ property: "volume", time: 3, value: 50 }] },
          audio_track_states: { voiceover: { muted: false, solo: true } },
          motionGraphics: { version: 1, scenes: [{ id: "title-1", preset: "title", startTime: 1.5, duration: 2 }] },
          sound_effects: [{ id: "impact-1", start_time: 1.5, duration: 0.6 },
            { id: "voice-1", kind: "voiceover", startTime: 3, trimStart: 1, duration: 45, volume: 0.5, url: "https://storage.example.com/take.webm" }],
          audio_remix: {
            version: 1,
            enabled: true,
            preset: "slowed_reverb",
            speed: 0.82,
            pitch_semitones: -3,
            reverb_mix: 0.68,
          },
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
        brand_watermark: false,
        brandWatermark: false,
        creative_plan: expect.objectContaining({ enabled: true }),
        finish_plan: expect.objectContaining({
          enabled: true,
          color: expect.objectContaining({ preset: "podcast_pro" }),
        }),
        audio_restoration: expect.objectContaining({ preset: "podcast", denoise: 30 }),
        audio_automation: { voiceover: [expect.objectContaining({ time: 3, value: 50 })] },
        audio_track_states: { voiceover: { muted: false, solo: true } },
        motionGraphics: { version: 1, scenes: [expect.objectContaining({ id: "title-1" })] },
        sound_effects: [expect.objectContaining({ id: "impact-1" }),
          expect.objectContaining({ id: "voice-1", kind: "voiceover", duration: 45, trimStart: 1, volume: 0.5 })],
        audio_remix: {
          version: 1,
          enabled: true,
          preset: "slowed_reverb",
          speed: 0.82,
          pitch_semitones: -3,
          reverb_mix: 0.68,
        },
        export_destination: "tiktok",
      }),
      expect.objectContaining({ timeout: 62 * 60 * 1000 })
    );
  });
});

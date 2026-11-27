import { recommendDirectorCaptionTemplate } from "../studioDirectorCaptions";
import captionStyles from "../studioCaptionRenderStyles.json";

describe("studioDirectorCaptions video-aware template selector", () => {
  test("every recommended template is a valid studio caption render style with Safe Safe placement", () => {
    const scenarios = [
      {
        name: "Podcast multi-speaker widescreen",
        inputs: {
          reframeAspect: "16:9",
          smartCropMode: "speaker_stack",
          speakerStackCameraCount: 2,
          captionSegments: [
            { text: "Welcome back to the studio.", start: 0, end: 2.2, speaker: "Host" },
            { text: "Glad to be here today.", start: 2.3, end: 4.5, speaker: "Guest" },
          ],
          telemetry: [{ avgLumaIre: 48, tonalEntropy: 2.8, peakChroma: 26, maxFrameDifference: 14, focalCentroid: [50, 46] }],
        },
        expectedStyles: ["editorial_duo"],
        expectedPlacement: "side_by_side",
      },
      {
        name: "Neon cyber low-key music scene",
        inputs: {
          reframeAspect: "9:16",
          lookId: "neon_cyber",
          brief: "Nighttime cyberpunk performance with deep purple neon rim light",
          telemetry: [{ avgLumaIre: 22, tonalEntropy: 3.0, peakChroma: 48, maxFrameDifference: 26, focalCentroid: [52, 48] }],
        },
        expectedStyles: ["neon_bloom"],
        expectedPlacement: "smart_safe",
      },
      {
        name: "Bright textured outdoor street clip",
        inputs: {
          reframeAspect: "1:1",
          brief: "Street interview under direct midday sun",
          telemetry: [{ avgLumaIre: 72, tonalEntropy: 3.6, peakChroma: 52, maxFrameDifference: 28, focalCentroid: [48, 52] }],
        },
        expectedStyles: ["boxed", "glass"],
        expectedPlacement: "smart_safe",
      },
      {
        name: "Calm studio wall with off-center subject and generous headroom",
        inputs: {
          reframeAspect: "9:16",
          telemetry: [{ avgLumaIre: 44, tonalEntropy: 2.1, peakChroma: 18, maxFrameDifference: 10, focalCentroid: [64, 58] }],
          captionSegments: [{ text: "Keep your focus sharp.", start: 0, end: 2.4 }],
        },
        expectedStyles: ["wall_type"],
        expectedPlacement: "creative",
      },
      {
        name: "High-tempo energetic sports hook",
        inputs: {
          reframeAspect: "4:5",
          pacingLevel: "fast",
          brief: "High energy gym challenge viral hook",
          telemetry: [{ avgLumaIre: 45, tonalEntropy: 2.9, peakChroma: 30, maxFrameDifference: 42, focalCentroid: [50, 48] }],
          captionSegments: [{ text: "Zero excuses push harder every single rep right now", start: 0, end: 2.0 }],
        },
        expectedStyles: ["spring_slam", "word_pill"],
        expectedPlacement: "smart_safe",
      },
      {
        name: "Monochrome luxury cinema portrait",
        inputs: {
          reframeAspect: "4:5",
          lookId: "noir_silver",
          archetypeId: "noir_color_splash",
          brief: "Editorial luxury perfume campaign with cinema framing",
          telemetry: [{ avgLumaIre: 38, tonalEntropy: 2.6, peakChroma: 14, maxFrameDifference: 12, focalCentroid: [50, 45] }],
        },
        expectedStyles: ["luxury"],
        expectedPlacement: "smart_safe",
      },
    ];

    for (const sc of scenarios) {
      const rec = recommendDirectorCaptionTemplate(sc.inputs);
      expect(captionStyles[rec.captionStyle]).toBeDefined();
      expect(sc.expectedStyles).toContain(rec.captionStyle);
      expect(rec.captionPosition).toBe(sc.expectedPlacement);
      expect(rec.captionAvoidSubjects).toBe(true);
      expect(rec.captionAccent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(rec.reason.length).toBeGreaterThan(20);
      expect(Array.isArray(rec.alternatives)).toBe(true);
      expect(rec.alternatives.length).toBeGreaterThanOrEqual(2);
    }
  });
});

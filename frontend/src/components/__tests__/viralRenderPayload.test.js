import {
  applySilenceKeepSegmentsToTimeline,
  buildViralRenderData,
  mapCaptionSegmentsToTimeline,
  normalizeSpeedSegmentsForRender,
} from "../viralRenderPayload";

describe("viralRenderPayload", () => {
  test("turns reviewed silence keep ranges into real export cuts", () => {
    const timeline = applySilenceKeepSegmentsToTimeline({
      timelineSegments: [
        {
          id: "podcast-main",
          source_clip_id: "podcast",
          url: "https://example.com/podcast.mp4",
          start_time: 10,
          end_time: 22,
          duration: 12,
          transition_in: "fade",
          transition_out: "dip",
        },
        {
          id: "reaction",
          source_clip_id: "reaction",
          start_time: 0,
          end_time: 3,
          duration: 3,
        },
      ],
      keepSegments: [
        { start: 0, end: 12 },
        { start: 13.5, end: 18 },
        { start: 19, end: 30 },
      ],
      sourceClipId: "podcast",
    });

    expect(timeline).toEqual([
      expect.objectContaining({
        id: "podcast-main-keep-1",
        start_time: 10,
        end_time: 12,
        duration: 2,
        transition_in: "fade",
        transition_out: null,
      }),
      expect.objectContaining({
        id: "podcast-main-keep-2",
        start_time: 13.5,
        end_time: 18,
        duration: 4.5,
        transition_in: null,
        transition_out: null,
      }),
      expect.objectContaining({
        id: "podcast-main-keep-3",
        start_time: 19,
        end_time: 22,
        duration: 3,
        transition_in: null,
        transition_out: "dip",
      }),
      expect.objectContaining({ id: "reaction", duration: 3 }),
    ]);
  });

  test("maps reviewed source captions through trims and reordered timeline cuts", () => {
    const mapped = mapCaptionSegmentsToTimeline({
      captionSegments: [
        {
          id: "caption-1",
          sourceClipId: "podcast",
          start: 11,
          end: 15,
          text: "Sawubona Mzansi",
        },
      ],
      timelineSegments: [
        { source_clip_id: "podcast", start_time: 14, end_time: 16, duration: 2 },
        { source_clip_id: "podcast", start_time: 10, end_time: 12, duration: 2 },
      ],
    });

    expect(mapped).toEqual([
      {
        id: "caption-1-timeline-1",
        start_time: 0,
        end_time: 1,
        text: "Sawubona Mzansi",
      },
      {
        id: "caption-1-timeline-2",
        start_time: 3,
        end_time: 4,
        text: "Sawubona Mzansi",
      },
    ]);
  });

  test("builds a safe default timeline payload", () => {
    const payload = buildViralRenderData({
      finalVideoUrl: "https://example.com/source.mp4",
      selectedClip: { start: 12, end: 27 },
      overlays: [{ id: "overlay-1" }],
      extraOptions: { autoCaptions: true },
    });

    expect(payload).toEqual({
      video_url: "https://example.com/source.mp4",
      start_time: 0,
      end_time: 15,
      overlays: [{ id: "overlay-1" }],
      auto_captions: true,
      professional_cleanup: true,
      timeline_segments: [
        {
          id: "main",
          url: "https://example.com/source.mp4",
          start_time: 12,
          end_time: 27,
          duration: 15,
        },
      ],
      background_audio: null,
      hook_focus_point: null,
      cover_frame: null,
      thumbnail_frame: null,
    });
  });

  test("preserves Studio caption, speed, pacing, hook, sound and export settings", () => {
    const payload = buildViralRenderData({
      finalVideoUrl: "https://example.com/source.mp4",
      selectedClip: { start: 0, end: 40 },
      overlays: [{ id: "broll-1", audioMode: "mix" }],
      extraOptions: {
        autoCaptions: true,
        captionStyle: "karaoke",
        captionPosition: "middle",
        captionScale: 1.2,
        captionTextOverride: "Say this exactly",
        captionSegments: [
          {
            id: "caption-1",
            startTime: 1,
            endTime: 3,
            text: "Sawubona hello",
            speaker: "guest",
            speakerLabel: "Guest",
            language: "mixed",
            languageLabel: "Mixed / code-switched",
            languages: ["zu", "en"],
            languageConfidence: 0.93,
            textReviewRequired: true,
            textReviewed: true,
            captionPlacement: "middle_left",
            captionIcon: "payoff",
            reviewRequired: false,
          },
        ],
        translateCaptionsToEnglish: false,
        previewSpeed: 1.25,
        speedSegments: [
          { startTime: 0, endTime: 12, rate: 1.25, pitchPreserved: true },
          { start_time: 12, end_time: 18, playbackRate: 0.85, pitch_preserved: false },
        ],
        pacingLevel: "energetic",
        creativeIntent: "increase_energy",
        creativePlan: {
          version: 1,
          enabled: true,
          intensity: "bold",
          fallback: "clean",
          effects: [
            {
              id: "signature-effect",
              preset: "motion_sculpture",
              intensity: "bold",
              start_time: 0,
              end_time: 40,
            },
          ],
        },
        finishPlan: {
          version: 1,
          enabled: true,
          color: { preset: "podcast_pro", brightness: 1.05, contrast: 1.2 },
          texture: { film_grain: 0.12 },
          visualizer: { enabled: true, mode: "wave", source: "original_speech" },
          keyframes: [
            {
              id: "finish-keyframe-1",
              time: 2.25,
              values: { brightness: 1.05, contrast: 1.2, saturation: 1.08 },
              interpolation: "linear",
            },
          ],
          magnetic_beats: { enabled: true, markers: [2.25, 4.5] },
        },
        smartCrop: true,
        smartCropMode: "face",
        enhanceQuality: false,
        silenceRemoval: true,
        silenceThreshold: -32,
        minSilenceDuration: 0.6,
        removeWatermark: false,
        watermarkMode: "adaptive",
        manualWatermarkRegions: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
        addHook: true,
        hookText: "Stop scrolling",
        hookIntroSeconds: 2.5,
        hookTemplate: "zoom_focus",
        hookStartTime: 0,
        hookEndTime: 2.5,
        hookSourceStartTime: 4,
        hookSourceEndTime: 6.5,
        hookBlurBackground: false,
        hookDarkOverlay: true,
        hookFreezeFrame: false,
        hookZoomScale: 1.12,
        hookTextAnimation: "slide_up",
        hookFocusPoint: { x: 0.42, y: 0.35 },
        addMusic: true,
        musicUrl: "https://example.com/music.mp3",
        musicName: "Background test",
        musicSelection: "custom",
        isSearch: true,
        safeSearch: true,
        musicVolume: 0.18,
        musicDucking: true,
        musicDuckingStrength: 0.4,
        musicDuckingMode: "speech",
        musicFadeIn: 0.5,
        musicFadeOut: 0.75,
        musicLoop: true,
        soundEffects: [
          {
            id: "sfx-1",
            name: "Impact",
            builtIn: true,
            tone: "impact",
            startTime: 4.5,
            duration: 0.65,
            trimStart: 0,
            volume: 0.8,
            fadeIn: 0.02,
            fadeOut: 0.12,
            enabled: true,
          },
        ],
        muteAudio: false,
        exportDestination: "shorts",
        timelineSegments: [{ id: "clip-1", duration: 40 }],
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        caption_style: "karaoke",
        caption_position: "middle",
        caption_scale: 1.2,
        caption_text_override: "Say this exactly",
        caption_segments: [
          {
            id: "caption-1",
            start_time: 1,
            end_time: 3,
            text: "Sawubona hello",
            speaker: "guest",
            speaker_label: "Guest",
            language: "mixed",
            language_label: "Mixed / code-switched",
            languages: ["zu", "en"],
            language_confidence: 0.93,
            text_review_required: true,
            text_reviewed: true,
            caption_placement: "middle_left",
            caption_icon: "payoff",
            review_required: false,
          },
        ],
        translate_captions_to_english: false,
        preview_speed: 1.25,
        speed_segments: [
          {
            id: "speed-1",
            start_time: 0,
            end_time: 12,
            rate: 1.25,
            pitch_preserved: true,
          },
          {
            id: "speed-2",
            start_time: 12,
            end_time: 18,
            rate: 0.85,
            pitch_preserved: false,
          },
        ],
        pacing_level: "energetic",
        creative_intent: "increase_energy",
        creative_plan: expect.objectContaining({
          enabled: true,
          intensity: "bold",
          fallback: "clean",
        }),
        finish_plan: expect.objectContaining({
          enabled: true,
          color: expect.objectContaining({ preset: "podcast_pro", contrast: 1.2 }),
          visualizer: expect.objectContaining({ enabled: true, mode: "wave" }),
          keyframes: [
            expect.objectContaining({
              id: "finish-keyframe-1",
              time: 2.25,
              interpolation: "linear",
            }),
          ],
          magnetic_beats: { enabled: true, markers: [2.25, 4.5] },
        }),
        smart_crop: true,
        smart_crop_mode: "face",
        visual_enhance: false,
        silence_removal: true,
        silence_threshold_db: -32,
        min_silence_duration: 0.6,
        remove_watermark: false,
        watermark_mode: "adaptive",
        add_hook: true,
        hook_text: "Stop scrolling",
        hook_intro_seconds: 2.5,
        hook_template: "zoom_focus",
        hook_freeze_frame: false,
        hook_zoom_scale: 1.12,
        add_music: true,
        music_url: "https://example.com/music.mp3",
        music_volume: 0.18,
        music_ducking: true,
        music_loop: true,
        sound_effects: [
          expect.objectContaining({
            id: "sfx-1",
            tone: "impact",
            startTime: 4.5,
            duration: 0.65,
          }),
        ],
        mute_audio: false,
        export_destination: "shorts",
      })
    );
    expect(payload.hook_focus_point).toEqual({ x: 0.42, y: 0.35 });
    expect(payload.end_time).toBe(40);
  });

  test("drops malformed speed ranges before they reach the render contract", () => {
    expect(
      normalizeSpeedSegmentsForRender([
        { startTime: 2, endTime: 2, rate: 1.5 },
        { startTime: -1, endTime: 2, rate: 1.5 },
        { startTime: 2, endTime: 4, rate: 0 },
        { startTime: 2, endTime: 4, rate: 1.5 },
      ])
    ).toEqual([
      {
        id: "speed-4",
        start_time: 2,
        end_time: 4,
        rate: 1.5,
        pitch_preserved: true,
      },
    ]);
  });
});

const isDefined = value => value !== undefined;

const toFiniteNumber = value => {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const addDefined = (target, key, value, transform = item => item) => {
  if (!isDefined(value)) return;
  target[key] = transform(value);
};

export const normalizeSpeedSegmentsForRender = speedSegments => {
  if (!Array.isArray(speedSegments)) return [];

  return speedSegments.reduce((segments, segment, index) => {
    const startTime = toFiniteNumber(segment?.start_time ?? segment?.startTime);
    const endTime = toFiniteNumber(segment?.end_time ?? segment?.endTime);
    const rate = toFiniteNumber(segment?.rate ?? segment?.playbackRate);

    if (
      startTime === null ||
      endTime === null ||
      rate === null ||
      startTime < 0 ||
      endTime <= startTime ||
      rate <= 0
    ) {
      return segments;
    }

    segments.push({
      id: segment?.id || `speed-${index + 1}`,
      start_time: startTime,
      end_time: endTime,
      rate,
      pitch_preserved:
        segment?.pitch_preserved !== undefined
          ? !!segment.pitch_preserved
          : segment?.pitchPreserved !== false,
    });
    return segments;
  }, []);
};

export const buildViralRenderData = ({
  finalVideoUrl,
  selectedClip,
  overlays = [],
  extraOptions = {},
}) => {
  const selectedStart = toFiniteNumber(selectedClip?.start) ?? 0;
  const selectedEnd = toFiniteNumber(selectedClip?.end) ?? selectedStart;
  const timelineSegments =
    Array.isArray(extraOptions.timelineSegments) && extraOptions.timelineSegments.length > 0
      ? extraOptions.timelineSegments
      : [
          {
            id: "main",
            url: finalVideoUrl,
            start_time: selectedStart,
            end_time: selectedEnd,
            duration: Math.max(0, selectedEnd - selectedStart),
          },
        ];
  const totalDuration = timelineSegments.reduce(
    (sum, segment) => sum + Math.max(0, Number(segment?.duration || 0)),
    0
  );

  const payload = {
    video_url: finalVideoUrl,
    start_time: 0,
    end_time: totalDuration || Math.max(0, selectedEnd - selectedStart),
    overlays,
    auto_captions: !!extraOptions.autoCaptions,
    timeline_segments: timelineSegments,
    background_audio: extraOptions.backgroundAudio || null,
    hook_focus_point: extraOptions.hookFocusPoint || null,
    cover_frame: extraOptions.coverFrame || null,
    thumbnail_frame: extraOptions.thumbnailFrame || extraOptions.coverFrame || null,
  };

  addDefined(payload, "caption_style", extraOptions.captionStyle);
  addDefined(payload, "caption_position", extraOptions.captionPosition);
  addDefined(payload, "caption_scale", extraOptions.captionScale, Number);
  addDefined(payload, "caption_text_override", extraOptions.captionTextOverride);
  addDefined(payload, "preview_speed", extraOptions.previewSpeed, Number);
  addDefined(payload, "pacing_level", extraOptions.pacingLevel);
  addDefined(payload, "creative_intent", extraOptions.creativeIntent);
  addDefined(payload, "creative_plan", extraOptions.creativePlan);

  if (isDefined(extraOptions.speedSegments)) {
    payload.speed_segments = normalizeSpeedSegmentsForRender(extraOptions.speedSegments);
  }

  addDefined(payload, "smart_crop", extraOptions.smartCrop, Boolean);
  addDefined(payload, "smart_crop_mode", extraOptions.smartCropMode);
  addDefined(payload, "visual_enhance", extraOptions.enhanceQuality, Boolean);
  addDefined(payload, "silence_removal", extraOptions.silenceRemoval, Boolean);
  addDefined(payload, "silence_threshold_db", extraOptions.silenceThreshold, Number);
  addDefined(payload, "min_silence_duration", extraOptions.minSilenceDuration, Number);
  addDefined(payload, "remove_watermark", extraOptions.removeWatermark, Boolean);
  addDefined(payload, "watermark_mode", extraOptions.watermarkMode);
  addDefined(payload, "watermark_regions", extraOptions.manualWatermarkRegions);

  addDefined(payload, "add_hook", extraOptions.addHook, Boolean);
  addDefined(payload, "hook_text", extraOptions.hookText);
  addDefined(payload, "hook_intro_seconds", extraOptions.hookIntroSeconds, Number);
  addDefined(payload, "hook_template", extraOptions.hookTemplate);
  addDefined(payload, "hook_start_time", extraOptions.hookStartTime, Number);
  addDefined(payload, "hook_end_time", extraOptions.hookEndTime, Number);
  addDefined(payload, "hook_source_start_time", extraOptions.hookSourceStartTime, Number);
  addDefined(payload, "hook_source_end_time", extraOptions.hookSourceEndTime, Number);
  addDefined(payload, "hook_blur_background", extraOptions.hookBlurBackground, Boolean);
  addDefined(payload, "hook_dark_overlay", extraOptions.hookDarkOverlay, Boolean);
  addDefined(payload, "hook_freeze_frame", extraOptions.hookFreezeFrame, Boolean);
  addDefined(payload, "hook_zoom_scale", extraOptions.hookZoomScale, Number);
  addDefined(payload, "hook_text_animation", extraOptions.hookTextAnimation);

  addDefined(payload, "add_music", extraOptions.addMusic, Boolean);
  addDefined(payload, "music_url", extraOptions.musicUrl);
  addDefined(payload, "music_name", extraOptions.musicName);
  addDefined(payload, "music_selection", extraOptions.musicSelection);
  addDefined(payload, "is_search", extraOptions.isSearch, Boolean);
  addDefined(payload, "safe_search", extraOptions.safeSearch, Boolean);
  addDefined(payload, "music_volume", extraOptions.musicVolume, Number);
  addDefined(payload, "music_ducking", extraOptions.musicDucking, Boolean);
  addDefined(payload, "music_ducking_strength", extraOptions.musicDuckingStrength, Number);
  addDefined(payload, "music_ducking_mode", extraOptions.musicDuckingMode);
  addDefined(payload, "music_fade_in", extraOptions.musicFadeIn, Number);
  addDefined(payload, "music_fade_out", extraOptions.musicFadeOut, Number);
  addDefined(payload, "music_loop", extraOptions.musicLoop, Boolean);
  addDefined(payload, "sound_effects", extraOptions.soundEffects);
  addDefined(payload, "mute_audio", extraOptions.muteAudio, Boolean);
  addDefined(payload, "export_destination", extraOptions.exportDestination);

  return payload;
};

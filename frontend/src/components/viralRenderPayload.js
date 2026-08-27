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

export const normalizeCaptionSegmentsForRender = captionSegments => {
  if (!Array.isArray(captionSegments)) return [];
  return captionSegments.reduce((segments, segment, index) => {
    const startTime = toFiniteNumber(segment?.start_time ?? segment?.startTime ?? segment?.start);
    const endTime = toFiniteNumber(segment?.end_time ?? segment?.endTime ?? segment?.end);
    const text = String(segment?.text || "").trim();
    if (startTime === null || endTime === null || startTime < 0 || endTime <= startTime || !text) {
      return segments;
    }
    const normalized = {
      id: segment?.id || `caption-${index + 1}`,
      start_time: startTime,
      end_time: endTime,
      text,
    };
    const speaker = String(segment?.speaker ?? segment?.speaker_id ?? "").trim();
    const speakerLabel = String(segment?.speakerLabel ?? segment?.speaker_label ?? "").trim();
    const language = String(
      segment?.language ?? segment?.language_code ?? segment?.languageCode ?? ""
    ).trim();
    const languageLabel = String(
      segment?.languageLabel ?? segment?.language_label ?? ""
    ).trim();
    const languages = Array.isArray(segment?.languages)
      ? Array.from(new Set(segment.languages.map(item => String(item || "").trim()).filter(Boolean)))
      : [];
    if (speaker) normalized.speaker = speaker;
    if (speakerLabel) normalized.speaker_label = speakerLabel;
    if (language) normalized.language = language;
    if (languageLabel) normalized.language_label = languageLabel;
    if (languages.length) normalized.languages = languages;
    if (segment?.languageConfidence !== undefined || segment?.language_confidence !== undefined) {
      normalized.language_confidence = Math.max(
        0,
        Math.min(
          1,
          Number(segment?.languageConfidence ?? segment?.language_confidence) || 0
        )
      );
    }
    if (segment?.reviewRequired !== undefined || segment?.review_required !== undefined) {
      normalized.review_required = Boolean(
        segment?.reviewRequired ?? segment?.review_required
      );
    }
    if (segment?.textReviewRequired !== undefined || segment?.text_review_required !== undefined) {
      normalized.text_review_required = Boolean(
        segment?.textReviewRequired ?? segment?.text_review_required
      );
    }
    if (segment?.textReviewed !== undefined || segment?.text_reviewed !== undefined) {
      normalized.text_reviewed = Boolean(segment?.textReviewed ?? segment?.text_reviewed);
    }
    const captionPlacement = String(
      segment?.captionPlacement ?? segment?.caption_placement ?? segment?.placement ?? ""
    ).trim();
    const captionIcon = String(
      segment?.captionIcon ?? segment?.caption_icon ?? segment?.icon ?? ""
    ).trim();
    if (captionPlacement) normalized.caption_placement = captionPlacement;
    if (captionIcon) normalized.caption_icon = captionIcon;
    segments.push(normalized);
    return segments;
  }, []);
};

export const mapCaptionSegmentsToTimeline = ({
  captionSegments,
  timelineSegments,
  fallbackSourceClipId = null,
}) => {
  const captions = (Array.isArray(captionSegments) ? captionSegments : []).flatMap(
    (sourceSegment, index) => {
      const normalized = normalizeCaptionSegmentsForRender([sourceSegment])[0];
      if (!normalized) return [];
      return [
        {
          ...normalized,
          id: sourceSegment?.id || `caption-${index + 1}`,
          source_clip_id:
            sourceSegment?.source_clip_id ?? sourceSegment?.sourceClipId ?? fallbackSourceClipId,
        },
      ];
    }
  );
  const timeline = Array.isArray(timelineSegments) ? timelineSegments : [];
  if (!timeline.length) {
    return captions.map(caption => {
      const segment = { ...caption };
      delete segment.source_clip_id;
      return segment;
    });
  }

  let outputOffset = 0;
  const mapped = [];
  timeline.forEach((clip, clipIndex) => {
    const clipStart = toFiniteNumber(clip?.start_time ?? clip?.startTime ?? clip?.start);
    const clipEnd = toFiniteNumber(clip?.end_time ?? clip?.endTime ?? clip?.end);
    const clipDuration =
      toFiniteNumber(clip?.duration) ??
      (clipStart !== null && clipEnd !== null ? Math.max(0, clipEnd - clipStart) : 0);
    const clipSourceId = clip?.source_clip_id ?? clip?.sourceClipId ?? clip?.id ?? null;

    if (clipStart !== null && clipEnd !== null && clipEnd > clipStart) {
      captions.forEach(caption => {
        if (
          caption.source_clip_id !== null &&
          clipSourceId !== null &&
          String(caption.source_clip_id) !== String(clipSourceId)
        ) {
          return;
        }
        const visibleStart = Math.max(caption.start_time, clipStart);
        const visibleEnd = Math.min(caption.end_time, clipEnd);
        if (visibleEnd <= visibleStart) return;
        const captionMetadata = { ...caption };
        delete captionMetadata.source_clip_id;
        delete captionMetadata.start_time;
        delete captionMetadata.end_time;
        delete captionMetadata.id;
        delete captionMetadata.text;
        mapped.push({
          ...captionMetadata,
          id: `${caption.id}-timeline-${clipIndex + 1}`,
          start_time: outputOffset + visibleStart - clipStart,
          end_time: outputOffset + visibleEnd - clipStart,
          text: caption.text,
        });
      });
    }
    outputOffset += Math.max(0, clipDuration || 0);
  });

  return mapped.sort((left, right) => left.start_time - right.start_time);
};

export const applySilenceKeepSegmentsToTimeline = ({
  timelineSegments,
  keepSegments,
  sourceClipId,
}) => {
  const timeline = Array.isArray(timelineSegments) ? timelineSegments : [];
  const normalizedKeepSegments = (Array.isArray(keepSegments) ? keepSegments : [])
    .map(segment => ({
      start: toFiniteNumber(segment?.start ?? segment?.start_time),
      end: toFiniteNumber(segment?.end ?? segment?.end_time),
    }))
    .filter(segment => segment.start !== null && segment.end !== null && segment.end > segment.start)
    .sort((left, right) => left.start - right.start);

  if (!timeline.length || !normalizedKeepSegments.length || sourceClipId === null) {
    return timeline;
  }

  return timeline.flatMap((segment, timelineIndex) => {
    const segmentSourceId = segment?.source_clip_id ?? segment?.sourceClipId ?? segment?.id ?? null;
    if (String(segmentSourceId) !== String(sourceClipId)) return [segment];

    const segmentStart = toFiniteNumber(segment?.start_time ?? segment?.startTime ?? segment?.start);
    const segmentEnd = toFiniteNumber(segment?.end_time ?? segment?.endTime ?? segment?.end);
    if (segmentStart === null || segmentEnd === null || segmentEnd <= segmentStart) return [];

    const intersections = normalizedKeepSegments
      .map(keep => ({
        start: Math.max(segmentStart, keep.start),
        end: Math.min(segmentEnd, keep.end),
      }))
      .filter(keep => keep.end - keep.start > 0.01);

    return intersections.map((keep, keepIndex) => ({
      ...segment,
      id: `${segment.id || `timeline-${timelineIndex + 1}`}-keep-${keepIndex + 1}`,
      start_time: keep.start,
      end_time: keep.end,
      duration: keep.end - keep.start,
      transition_in: keepIndex === 0 ? segment.transition_in || null : null,
      transition_out:
        keepIndex === intersections.length - 1 ? segment.transition_out || null : null,
    }));
  });
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
  addDefined(
    payload,
    "caption_segments",
    extraOptions.captionSegments,
    normalizeCaptionSegmentsForRender
  );
  addDefined(
    payload,
    "translate_captions_to_english",
    extraOptions.translateCaptionsToEnglish,
    Boolean
  );
  addDefined(payload, "preview_speed", extraOptions.previewSpeed, Number);
  addDefined(payload, "pacing_level", extraOptions.pacingLevel);
  addDefined(payload, "creative_intent", extraOptions.creativeIntent);
  addDefined(payload, "studio_plan", extraOptions.studioPlan);
  payload.professional_cleanup = extraOptions.professionalCleanup !== false;
  addDefined(payload, "creative_plan", extraOptions.creativePlan);
  addDefined(payload, "finish_plan", extraOptions.finishPlan);

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

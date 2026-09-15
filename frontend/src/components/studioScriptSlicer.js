/**
 * studioScriptSlicer.js
 * Descript-Style Text-Based Video Editing & Script Slicer Engine.
 * Allows creators to cut video and audio by slicing words, sentences, or filler words
 * directly from the transcription, with automatic downstream timeline ripple.
 */

export const COMMON_FILLER_WORDS = [
  "um",
  "uh",
  "uhh",
  "umm",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "literally",
  "actually",
];

const FILLER_REGEX = new RegExp(
  `\\b(${COMMON_FILLER_WORDS.map(w => w.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "gi"
);

/**
 * Detects filler words across all transcript caption segments.
 * @param {Array} captionSegments - Array of caption segments with { id, start, end, text }
 * @returns {Array} List of detected filler word ranges [{ segmentId, text, match, start, end, duration }]
 */
export function detectFillerWords(captionSegments = []) {
  if (!Array.isArray(captionSegments) || !captionSegments.length) return [];

  const detected = [];
  captionSegments.forEach((segment, segIdx) => {
    const text = String(segment.text || "");
    const matches = Array.from(text.matchAll(FILLER_REGEX));
    if (!matches.length) return;

    const segStart = Number(segment.start || 0);
    const segEnd = Number(segment.end || segStart + 2);
    const segDur = Math.max(0.1, segEnd - segStart);
    const textLen = Math.max(1, text.length);

    matches.forEach(match => {
      const matchWord = match[0];
      const matchIndex = match.index;
      // Proportional estimate of word timestamp within the subtitle segment
      const wordStartRatio = matchIndex / textLen;
      const wordEndRatio = (matchIndex + matchWord.length) / textLen;
      const wordStart = Math.round((segStart + wordStartRatio * segDur) * 100) / 100;
      const wordEnd = Math.round((segStart + wordEndRatio * segDur) * 100) / 100;

      detected.push({
        id: `filler-${segment.id || segIdx}-${matchIndex}`,
        segmentId: segment.id,
        segIndex: segIdx,
        matchWord: matchWord.toLowerCase(),
        fullText: text,
        start: wordStart,
        end: Math.max(wordStart + 0.15, wordEnd),
        duration: Math.max(0.15, wordEnd - wordStart),
      });
    });
  });

  return detected;
}

/**
 * Slices a single time range out of the video timeline sequence.
 * Physically trims/splits the clips in the timeline and ripples downstream clips earlier.
 * @param {Array} timeline - Sequence of video clips
 * @param {number} cutStart - Timeline start time to cut out
 * @param {number} cutEnd - Timeline end time to cut out
 * @returns {Object} { updatedTimeline, removedDuration }
 */
export function sliceTimelineTimeRange(timeline = [], cutStart = 0, cutEnd = 0) {
  if (!timeline || !timeline.length || cutEnd <= cutStart) {
    return { updatedTimeline: timeline || [], removedDuration: 0 };
  }

  const safeCutStart = Math.max(0, Number(cutStart || 0));
  const safeCutEnd = Math.max(safeCutStart + 0.05, Number(cutEnd || 0));
  const removedDuration = safeCutEnd - safeCutStart;

  let currentTimelineTime = 0;
  const newTimeline = [];

  timeline.forEach((clip, index) => {
    const rawStart = Number(clip.startRequest ?? clip.start_time ?? clip.start ?? 0);
    const rawEnd = Number(clip.endRequest ?? clip.end_time ?? clip.end);
    const clipDuration = Math.max(
      0.04,
      Number.isFinite(rawEnd) && rawEnd > rawStart ? rawEnd - rawStart : Number(clip.duration) || 0.04
    );

    const clipTimelineStart = currentTimelineTime;
    const clipTimelineEnd = currentTimelineTime + clipDuration;
    currentTimelineTime += clipDuration;

    // Case 1: Cut range is completely outside this clip
    if (safeCutEnd <= clipTimelineStart || safeCutStart >= clipTimelineEnd) {
      newTimeline.push(clip);
      return;
    }

    // Case 2: Cut range completely swallows this clip
    if (safeCutStart <= clipTimelineStart && safeCutEnd >= clipTimelineEnd) {
      // Entire clip is removed
      return;
    }

    // Case 3: Cut range starts before clip and ends inside clip (trim clip start)
    if (safeCutStart <= clipTimelineStart && safeCutEnd < clipTimelineEnd) {
      const trimFromClipStart = safeCutEnd - clipTimelineStart;
      const newSourceStart = rawStart + trimFromClipStart;
      const newDuration = clipDuration - trimFromClipStart;
      newTimeline.push({
        ...clip,
        id: `${clip.id || `clip-${index}`}-sliced-start`,
        startRequest: newSourceStart,
        start_time: newSourceStart,
        start: newSourceStart,
        duration: newDuration,
      });
      return;
    }

    // Case 4: Cut range starts inside clip and ends after clip (trim clip end)
    if (safeCutStart > clipTimelineStart && safeCutEnd >= clipTimelineEnd) {
      const newDuration = safeCutStart - clipTimelineStart;
      const newSourceEnd = rawStart + newDuration;
      newTimeline.push({
        ...clip,
        id: `${clip.id || `clip-${index}`}-sliced-end`,
        endRequest: newSourceEnd,
        end_time: newSourceEnd,
        end: newSourceEnd,
        duration: newDuration,
      });
      return;
    }

    // Case 5: Cut range is strictly inside the middle of this clip (split into two takes)
    if (safeCutStart > clipTimelineStart && safeCutEnd < clipTimelineEnd) {
      const durationBefore = safeCutStart - clipTimelineStart;
      const cutOffsetInClip = safeCutEnd - clipTimelineStart;

      const firstPartEnd = rawStart + durationBefore;
      const secondPartStart = rawStart + cutOffsetInClip;
      const durationAfter = clipTimelineEnd - safeCutEnd;

      const firstPart = {
        ...clip,
        id: `${clip.id || `clip-${index}`}-before-cut`,
        endRequest: firstPartEnd,
        end_time: firstPartEnd,
        end: firstPartEnd,
        duration: durationBefore,
        transitionOut: "dissolve",
        transitionDuration: 0.06,
      };

      const secondPart = {
        ...clip,
        id: `${clip.id || `clip-${index}`}-after-cut`,
        startRequest: secondPartStart,
        start_time: secondPartStart,
        start: secondPartStart,
        duration: durationAfter,
        transitionIn: "dissolve",
        transitionDuration: 0.06,
      };

      newTimeline.push(firstPart, secondPart);
    }
  });

  return {
    updatedTimeline: newTimeline.length ? newTimeline : timeline,
    removedDuration: newTimeline.length ? removedDuration : 0,
  };
}

/**
 * Retimes caption segments after a timeline time range is sliced out.
 * Removes captions inside the cut range, and shifts all subsequent captions earlier by removed duration.
 * @param {Array} captionSegments - Caption segments
 * @param {number} cutStart - Cut start timestamp
 * @param {number} cutEnd - Cut end timestamp
 * @returns {Array} Retimed caption segments
 */
export function retimeCaptionsAfterCut(captionSegments = [], cutStart = 0, cutEnd = 0) {
  if (!Array.isArray(captionSegments) || !captionSegments.length || cutEnd <= cutStart) {
    return captionSegments || [];
  }

  const delta = cutEnd - cutStart;
  const updated = [];

  captionSegments.forEach(segment => {
    const s = Number(segment.start || 0);
    const e = Number(segment.end || s + 2);

    // Completely before cut: unchanged
    if (e <= cutStart) {
      updated.push(segment);
      return;
    }

    // Completely inside cut: dropped
    if (s >= cutStart && e <= cutEnd) {
      return;
    }

    // Completely after cut: shift start and end earlier by delta
    if (s >= cutEnd) {
      updated.push({
        ...segment,
        start: Math.max(0, s - delta),
        end: Math.max(0.1, e - delta),
      });
      return;
    }

    // Overlaps cut range: clamp boundaries
    if (s < cutStart && e > cutStart && e <= cutEnd) {
      // Cut clips the end of this caption
      updated.push({
        ...segment,
        end: cutStart,
      });
    } else if (s >= cutStart && s < cutEnd && e > cutEnd) {
      // Cut clips the beginning of this caption
      updated.push({
        ...segment,
        start: cutStart,
        end: Math.max(cutStart + 0.1, e - delta),
      });
    }
  });

  return updated;
}

/**
 * Batch slices multiple time ranges (e.g. all filler words) in reverse-chronological order.
 * @param {Array} timeline - Timeline segments
 * @param {Array} ranges - Array of [{ start, end }]
 * @param {Array} captionSegments - Optional caption segments to retime
 * @returns {Object} { updatedTimeline, updatedCaptionSegments, totalRemovedDuration, slicesApplied }
 */
export function sliceMultipleTimeRanges(timeline = [], ranges = [], captionSegments = []) {
  if (!ranges || !ranges.length) {
    return {
      updatedTimeline: timeline,
      updatedCaptionSegments: captionSegments,
      totalRemovedDuration: 0,
      slicesApplied: 0,
    };
  }

  // Sort descending by start time so earlier cuts do not shift timestamps of later cuts!
  const sortedRanges = [...ranges]
    .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => b.start - a.start);

  let currentTimeline = [...timeline];
  let currentCaptions = [...captionSegments];
  let totalRemovedDuration = 0;
  let slicesApplied = 0;

  for (const range of sortedRanges) {
    const sliceRes = sliceTimelineTimeRange(currentTimeline, range.start, range.end);
    if (sliceRes.removedDuration > 0) {
      currentTimeline = sliceRes.updatedTimeline;
      currentCaptions = retimeCaptionsAfterCut(currentCaptions, range.start, range.end);
      totalRemovedDuration += sliceRes.removedDuration;
      slicesApplied += 1;
    }
  }

  return {
    updatedTimeline: currentTimeline,
    updatedCaptionSegments: currentCaptions,
    totalRemovedDuration: Math.round(totalRemovedDuration * 1000) / 1000,
    slicesApplied,
  };
}


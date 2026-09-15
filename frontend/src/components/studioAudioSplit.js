/**
 * studioAudioSplit.js
 * Professional J-Cut & L-Cut Split Audio Transition Engine for AutoPromote Viral Clip Studio.
 * 
 * J-Cut (Dialogue Pre-lap): The incoming clip's audio begins before its video appears.
 * L-Cut (Dialogue Trail): The outgoing clip's audio continues after its video cuts away.
 */

export const SPLIT_AUDIO_PRESETS = [
  { id: "straight", label: "Straight Cut", jCut: 0.0, lCut: 0.0, description: "Synchronous audio & video cut" },
  { id: "snappy_j", label: "Snappy J-Cut (0.5s)", jCut: 0.5, lCut: 0.0, description: "Fast dialogue hook pre-lap" },
  { id: "cinematic_j", label: "Story J-Cut (0.8s)", jCut: 0.8, lCut: 0.0, description: "Broadcast standard dialogue lead" },
  { id: "deep_j", label: "Dramatic J-Cut (1.2s)", jCut: 1.2, lCut: 0.0, description: "Extended pre-lap for dramatic anticipation" },
  { id: "reaction_l", label: "Reaction L-Cut (0.8s)", jCut: 0.0, lCut: 0.8, description: "Speech continues over incoming cutaway" },
  { id: "trailing_l", label: "Long Trail L-Cut (1.5s)", jCut: 0.0, lCut: 1.5, description: "Lingering laugh or dialogue trail" },
  { id: "flow_jl", label: "Seamless Flow (J+L)", jCut: 0.6, lCut: 0.6, description: "Dual-wing broadcast conversational rhythm" },
];

/**
 * Normalizes split audio offsets for a given timeline clip.
 * @param {Object} clip - Timeline clip segment
 * @param {number} clipIndex - Zero-based index of clip in sequence
 * @param {number} outputStart - Timeline start time in seconds
 * @returns {Object} Normalized clip with audio start/duration and wing descriptors
 */
export function normalizeSplitAudioClip(clip, clipIndex = 0, outputStart = 0) {
  const start = Number(clip?.startRequest ?? clip?.start_time ?? clip?.start ?? 0);
  const end = Number(clip?.endRequest ?? clip?.end_time ?? clip?.end);
  const videoDuration = Math.max(
    0.04,
    Number.isFinite(end) && end > start ? end - start : Number(clip?.duration) || 0.04
  );

  // audioTrimOffsetStart is negative for J-cut (audio starts earlier than video)
  const rawStartOffset = Number(clip?.audioTrimOffsetStart || 0);
  // audioTrimOffsetEnd is positive for L-cut (audio continues past video end)
  const rawEndOffset = Number(clip?.audioTrimOffsetEnd || 0);

  // Clamp start offset: cannot start earlier than timeline 0, and max pre-lap 3.0s
  const maxPreLap = Math.min(3.0, outputStart);
  const aStartOffset = Math.max(-maxPreLap, Math.min(1.0, rawStartOffset));

  // Clamp end offset: max trail 3.0s
  const aEndOffset = Math.max(-1.0, Math.min(3.0, rawEndOffset));

  const audioTimelineStart = Math.max(0, outputStart + aStartOffset);
  const audioTimelineDuration = Math.max(0.05, videoDuration - aStartOffset + aEndOffset);

  const hasJCut = aStartOffset < -0.04;
  const hasLCut = aEndOffset > 0.04;

  return {
    ...clip,
    index: clipIndex,
    outputStart,
    videoDuration,
    audioTrimOffsetStart: aStartOffset,
    audioTrimOffsetEnd: aEndOffset,
    audioTimelineStart,
    audioTimelineDuration,
    hasJCut,
    hasLCut,
    jCutDuration: hasJCut ? Math.abs(aStartOffset) : 0,
    lCutDuration: hasLCut ? aEndOffset : 0,
  };
}

/**
 * Builds the complete split audio track sequence across all timeline segments.
 * @param {Array} timelineSegments - Raw timeline clips
 * @returns {Array} Array of normalized split audio clips
 */
export function buildAudioSplitSequence(timelineSegments = []) {
  let runningTime = 0;
  return timelineSegments.map((clip, index) => {
    const normalized = normalizeSplitAudioClip(clip, index, runningTime);
    runningTime += normalized.videoDuration;
    return normalized;
  });
}

/**
 * Applies a J-Cut or L-Cut preset to a specific clip in the timeline.
 * @param {Array} timeline - Timeline clips
 * @param {number} clipIndex - Target clip index
 * @param {string} presetId - Preset identifier ('straight', 'snappy_j', 'cinematic_j', 'reaction_l', etc.)
 * @param {Object} options - Optional custom durations { customJCut, customLCut }
 * @returns {Array} New updated timeline array
 */
export function applySplitAudioPreset(timeline = [], clipIndex = 0, presetId = "straight", options = {}) {
  const preset = SPLIT_AUDIO_PRESETS.find(p => p.id === presetId) || SPLIT_AUDIO_PRESETS[0];
  const jCutDur = options.customJCut !== undefined ? Number(options.customJCut) : preset.jCut;
  const lCutDur = options.customLCut !== undefined ? Number(options.customLCut) : preset.lCut;

  return timeline.map((clip, idx) => {
    if (idx !== clipIndex) return clip;
    return {
      ...clip,
      audioTrimOffsetStart: jCutDur > 0 ? -Math.abs(jCutDur) : 0,
      audioTrimOffsetEnd: lCutDur > 0 ? Math.abs(lCutDur) : 0,
    };
  });
}

/**
 * Automatically calculates and applies conversational J-Cuts across all cuts.
 * In documentary and viral interviews, pre-lapping dialogue by 0.6s creates seamless conversational flow.
 * @param {Array} timeline - Timeline clips
 * @param {number} preLapDuration - Default pre-lap duration in seconds (default: 0.6s)
 * @returns {Array} Updated timeline with J-cuts on all incoming cuts (clips index > 0)
 */
export function autoApplyDialoguePreLaps(timeline = [], preLapDuration = 0.6) {
  if (!timeline || timeline.length <= 1) return timeline || [];

  return timeline.map((clip, idx) => {
    if (idx === 0) return clip; // First clip cannot J-cut before time 0
    return {
      ...clip,
      audioTrimOffsetStart: -Math.abs(preLapDuration),
    };
  });
}

/**
 * Calculates which non-active timeline clips should be playing audio at the given global playback time.
 * Used for sample-accurate browser preview audio playback when scrubbing or playing J/L cuts.
 * @param {number} globalTime - Current timeline playhead position in seconds
 * @param {Array} splitClips - Result of buildAudioSplitSequence
 * @param {number} activeVideoIndex - Index of clip currently being displayed on video canvas
 * @returns {Array} Array of active proxy audio clips { id, clipIndex, url, sourceSeekTime, volume, type }
 */
export function calculateAudioProxyState(globalTime, splitClips = [], activeVideoIndex = 0) {
  const activeProxies = [];

  splitClips.forEach(clip => {
    // If it's the active video clip, the main video element already plays its audio,
    // UNLESS the clip has an offset that puts it outside normal boundaries.
    const isInsideAudioWindow =
      globalTime >= clip.audioTimelineStart &&
      globalTime < clip.audioTimelineStart + clip.audioTimelineDuration;

    if (!isInsideAudioWindow) return;

    // J-Cut pre-lap phase: incoming clip's audio plays before its video starts
    const isJCutPreLap = clip.index > activeVideoIndex && globalTime < clip.outputStart;
    // L-Cut trail phase: outgoing clip's audio continues after its video ended
    const isLCutTrail = clip.index < activeVideoIndex && globalTime >= clip.outputStart + clip.videoDuration;

    if (isJCutPreLap || isLCutTrail) {
      const sourceStart = Number(clip.startRequest ?? clip.start_time ?? clip.start ?? 0);
      const elapsedInAudio = globalTime - clip.audioTimelineStart;
      const sourceSeekTime = Math.max(0, sourceStart + clip.audioTrimOffsetStart + elapsedInAudio);

      activeProxies.push({
        id: clip.id || `audio-proxy-${clip.index}`,
        clipIndex: clip.index,
        url: clip.url,
        sourceSeekTime,
        type: isJCutPreLap ? "j-cut" : "l-cut",
        volume: 1.0,
      });
    }
  });

  return activeProxies;
}


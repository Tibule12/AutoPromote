import {
  clampNumber,
  getAudioActivityScoreForSourceTime,
  getSourceTimelineTimeAtPlayhead,
  isSourceAvailableAtTime,
  normalizeSwitches,
} from "./multicamUtils";

export const FLOW_EDIT_STYLE_PRESETS = [
  {
    id: "smooth",
    label: "Smooth",
    summary: "Longer holds, softer ramps, and graceful movement for choir, interviews, and calm story moments.",
    intervalRange: [2.2, 4.8],
    speedRange: [0.58, 1.04],
    continuityBias: 0.24,
    motionBias: 0.2,
  },
  {
    id: "hype",
    label: "Hype",
    summary: "Fast switching, bold attention spikes, and tight beat-locking for Shorts, Reels, and TikTok pacing.",
    intervalRange: [0.85, 2.35],
    speedRange: [0.82, 1.2],
    continuityBias: 0.08,
    motionBias: 0.42,
  },
  {
    id: "cinematic",
    label: "Cinematic",
    summary: "Balanced emotional timing with contrast between breathy slowdowns and dramatic surges.",
    intervalRange: [1.45, 3.4],
    speedRange: [0.62, 1.12],
    continuityBias: 0.18,
    motionBias: 0.28,
  },
];

const ENERGY_ZONE_PRIORITY = {
  low: 0,
  build: 1,
  mid: 2,
  high: 3,
  peak: 4,
  release: 1,
};

const getStylePreset = styleId =>
  FLOW_EDIT_STYLE_PRESETS.find(style => style.id === styleId) || FLOW_EDIT_STYLE_PRESETS[1];

const average = values =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clampNumber(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1, 0);
  return sorted[index];
};

const movingAverage = (values, radius = 2) =>
  values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    let total = 0;
    let count = 0;
    for (let cursor = start; cursor <= end; cursor += 1) {
      total += values[cursor];
      count += 1;
    }
    return count ? total / count : 0;
  });

const getAverageSourceActivity = (sources, sourceActivityByCameraId = {}) =>
  average(
    (Array.isArray(sources) ? sources : []).map(source => {
      const entries = Array.isArray(sourceActivityByCameraId?.[source.id])
        ? sourceActivityByCameraId[source.id]
        : [];
      return average(
        entries
          .map(entry => clampNumber(Number(entry?.score), 0, 1, 0))
          .filter(score => Number.isFinite(score))
      );
    })
  );

const getAverageSourceQuality = (sources, frameQualityByCameraId = {}) =>
  average(
    (Array.isArray(sources) ? sources : []).map(source =>
      clampNumber(frameQualityByCameraId?.[source.id]?.score, 0, 1, 0.58)
    )
  );

const buildRescueProfile = ({
  sources,
  audioClassification,
  beatAnalysis,
  sourceActivityByCameraId,
  frameQualityByCameraId,
}) => {
  const safeSources = Array.isArray(sources) ? sources : [];
  const averageActivity = getAverageSourceActivity(safeSources, sourceActivityByCameraId);
  const averageQuality = getAverageSourceQuality(safeSources, frameQualityByCameraId);
  const sourceCount = safeSources.length;
  const beatPressure =
    clampNumber(beatAnalysis?.beatStrength, 0, 1, 0) *
    clampNumber(beatAnalysis?.beatRegularity, 0, 1, 0);

  let pressure = 0;
  if (audioClassification?.type === "music" && averageActivity < 0.42) pressure += 0.32;
  if (audioClassification?.type === "music" && averageQuality < 0.58) pressure += 0.18;
  if (audioClassification?.type === "choir" && averageActivity < 0.38) pressure += 0.22;
  if (audioClassification?.type === "ambient" && averageActivity < 0.36) pressure += 0.26;
  if (averageQuality < 0.52) pressure += 0.16;
  if (beatPressure >= 0.34 && averageActivity < 0.36) pressure += 0.18;
  if (sourceCount <= 2) pressure += 0.08;
  if ((audioClassification?.confidence || 0) < 0.48) pressure += 0.1;

  const score = clampNumber(pressure, 0, 1, 0);
  const active = score >= 0.4;
  const strategy =
    audioClassification?.type === "choir"
      ? "emotion-led rescue"
      : audioClassification?.type === "music"
        ? "contrast-led rescue"
        : "continuity-led rescue";

  const summary = active
    ? audioClassification?.type === "music"
      ? "Mismatch rescue is active. The soundtrack hits harder than the visuals, so Flow Edit is stretching continuity, shaping contrast, and making the pairing feel intentional."
      : audioClassification?.type === "choir"
        ? "Performance rescue is active. Flow Edit is leaning into swells, breath, and graceful emphasis so the visuals feel emotionally synchronized."
        : "Rescue mode is active. Flow Edit is smoothing an awkward pairing with continuity-first pacing, selective punch-ins, and designed mood contrast."
    : "";

  return {
    active,
    score,
    strategy,
    summary,
    averageActivity,
    averageQuality,
  };
};

const applyRescueToStyle = (style, rescueProfile, audioType) => {
  if (!rescueProfile?.active) return style;
  const base = style || FLOW_EDIT_STYLE_PRESETS[1];
  const intervalStretch = 1 + rescueProfile.score * 0.28;
  const minimumStretch = 1 + rescueProfile.score * 0.12;
  const continuityBoost = rescueProfile.score * 0.22;
  const motionTrim = rescueProfile.score * 0.12;
  const maxSpeedTrim =
    audioType === "music" ? rescueProfile.score * 0.06 : rescueProfile.score * 0.1;

  return {
    ...base,
    intervalRange: [
      Number((base.intervalRange[0] * minimumStretch).toFixed(3)),
      Number((base.intervalRange[1] * intervalStretch).toFixed(3)),
    ],
    speedRange: [
      clampNumber(base.speedRange[0] - rescueProfile.score * 0.04, 0.5, 1.1, base.speedRange[0]),
      clampNumber(base.speedRange[1] - maxSpeedTrim, 0.94, 1.2, base.speedRange[1]),
    ],
    continuityBias: base.continuityBias + continuityBoost,
    motionBias: clampNumber(base.motionBias - motionTrim, 0.14, 0.5, base.motionBias),
  };
};

const classifyEnergyZone = (energy, delta) => {
  if (energy >= 0.86) return "peak";
  if (energy >= 0.68 && delta >= 0.045) return "high";
  if (energy >= 0.68 && delta < -0.05) return "release";
  if (energy >= 0.56) return "high";
  if (energy >= 0.42 && delta >= 0.03) return "build";
  if (energy >= 0.36 && delta < -0.035) return "release";
  if (energy >= 0.28) return "mid";
  return "low";
};

export const detectAudioBeats = analysis => {
  const envelope = Array.isArray(analysis?.envelope) ? analysis.envelope : [];
  const secondsPerBin = clampNumber(analysis?.secondsPerBin, 0.01, 1, 0.05);
  if (!envelope.length) {
    return {
      beats: [],
      beatStrength: 0,
      beatRegularity: 0,
    };
  }

  const smoothed = movingAverage(envelope, 2);
  const p75 = percentile(smoothed, 0.75);
  const p90 = percentile(smoothed, 0.9);
  const minGapBins = Math.max(2, Math.round(0.24 / secondsPerBin));
  const threshold = clampNumber((p75 + p90) / 2, 0.18, 0.96, 0.35);
  const beats = [];

  for (let index = 1; index < smoothed.length - 1; index += 1) {
    const value = smoothed[index];
    if (value < threshold) continue;
    if (value < smoothed[index - 1] || value < smoothed[index + 1]) continue;
    const last = beats[beats.length - 1];
    if (last && index - last.index < minGapBins) {
      if (value > last.strength) {
        beats[beats.length - 1] = {
          index,
          time: Number((index * secondsPerBin).toFixed(3)),
          strength: value,
        };
      }
      continue;
    }
    beats.push({
      index,
      time: Number((index * secondsPerBin).toFixed(3)),
      strength: value,
    });
  }

  const intervals = [];
  for (let index = 1; index < beats.length; index += 1) {
    intervals.push(beats[index].time - beats[index - 1].time);
  }
  const intervalAverage = average(intervals);
  const variance = average(
    intervals.map(interval => Math.pow(interval - intervalAverage, 2))
  );
  const regularity =
    intervalAverage > 0 ? clampNumber(1 - Math.sqrt(variance) / intervalAverage, 0, 1, 0) : 0;

  return {
    beats,
    beatStrength: clampNumber(average(beats.map(beat => beat.strength)), 0, 1, 0),
    beatRegularity: regularity,
  };
};

export const classifyFlowAudio = analysis => {
  const envelope = Array.isArray(analysis?.envelope) ? analysis.envelope : [];
  if (!envelope.length) {
    return {
      type: "ambient",
      confidence: 0.3,
      explanation: "Audio analysis is limited, so Flow Edit will lean on smart timing instead of strong rhythm.",
    };
  }

  const p15 = percentile(envelope, 0.15);
  const p85 = percentile(envelope, 0.85);
  const dynamicRange = p85 - p15;
  const sustainedRatio = envelope.filter(value => value >= 0.58).length / envelope.length;
  const lowMotionRatio = envelope.filter(value => value <= 0.22).length / envelope.length;
  const { beats, beatStrength, beatRegularity } = detectAudioBeats(analysis);
  const duration = Math.max(1, Number(analysis?.duration) || envelope.length * 0.05);
  const beatDensity = beats.length / duration;

  if (beatRegularity >= 0.58 && beatStrength >= 0.42 && beatDensity >= 0.45) {
    return {
      type: "music",
      confidence: clampNumber(0.58 + beatRegularity * 0.32 + beatStrength * 0.1, 0.55, 0.96, 0.74),
      explanation: "Strong rhythmic structure detected, so Flow Edit can lock cuts and motion to musical momentum.",
    };
  }

  if (dynamicRange >= 0.24 && sustainedRatio >= 0.28 && beatDensity <= 0.5) {
    return {
      type: "choir",
      confidence: clampNumber(0.52 + sustainedRatio * 0.28 + dynamicRange * 0.3, 0.5, 0.92, 0.7),
      explanation: "This sounds like a performance bed with emotional swells, so cuts will follow crescendos and vocal peaks more than strict beats.",
    };
  }

  if (dynamicRange >= 0.14 && lowMotionRatio <= 0.52 && beatDensity <= 0.42) {
    return {
      type: "speech",
      confidence: clampNumber(0.46 + dynamicRange * 0.25 + (1 - beatDensity) * 0.2, 0.44, 0.86, 0.62),
      explanation: "Speech-like pacing detected, so Flow Edit will use attention timing and energy shifts instead of over-cutting to nonexistent beats.",
    };
  }

  return {
    type: "ambient",
    confidence: clampNumber(0.38 + (1 - dynamicRange) * 0.2 + lowMotionRatio * 0.18, 0.35, 0.8, 0.52),
    explanation: "No strong rhythmic spine was found, so Flow Edit will switch with smooth timing and visual continuity.",
  };
};

export const buildEnergyZones = (analysis, timelineDuration = null) => {
  const envelope = Array.isArray(analysis?.envelope) ? analysis.envelope : [];
  const secondsPerBin = clampNumber(analysis?.secondsPerBin, 0.01, 1, 0.05);
  const duration = Math.max(
    0,
    Number.isFinite(Number(timelineDuration)) ? Number(timelineDuration) : Number(analysis?.duration) || 0
  );
  if (!envelope.length || !duration) return [];

  const smoothed = movingAverage(envelope, 4);
  const zoneWindowSeconds = Math.max(0.8, Math.min(2.2, duration / 10 || 1.4));
  const zoneWindowBins = Math.max(2, Math.round(zoneWindowSeconds / secondsPerBin));
  const zones = [];
  let cursor = 0;
  let previousEnergy = smoothed[0] || 0;

  while (cursor < smoothed.length) {
    const slice = smoothed.slice(cursor, cursor + zoneWindowBins);
    if (!slice.length) break;
    const energy = average(slice);
    const delta = energy - previousEnergy;
    const startTime = Number((cursor * secondsPerBin).toFixed(3));
    const endTime = Number(
      Math.min(duration, (cursor + slice.length) * secondsPerBin).toFixed(3)
    );
    const zone = classifyEnergyZone(energy, delta);
    const lastZone = zones[zones.length - 1];

    if (lastZone && lastZone.zone === zone && startTime - lastZone.endTime <= zoneWindowSeconds * 0.6) {
      lastZone.endTime = endTime;
      lastZone.energy = Number(((lastZone.energy + energy) / 2).toFixed(4));
      lastZone.delta = Number(((lastZone.delta + delta) / 2).toFixed(4));
    } else {
      zones.push({
        id: `zone-${zones.length + 1}`,
        zone,
        energy: Number(energy.toFixed(4)),
        delta: Number(delta.toFixed(4)),
        startTime,
        endTime,
      });
    }

    previousEnergy = energy;
    cursor += zoneWindowBins;
  }

  return zones.filter(zone => zone.endTime - zone.startTime > 0.08);
};

const synthesizeMoodZones = (duration, audioType = "ambient") => {
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (!safeDuration) return [];

  const patterns =
    audioType === "choir"
      ? [
          { zone: "low", energy: 0.22, ratio: 0.22 },
          { zone: "build", energy: 0.42, ratio: 0.18 },
          { zone: "high", energy: 0.68, ratio: 0.18 },
          { zone: "release", energy: 0.3, ratio: 0.14 },
          { zone: "mid", energy: 0.38, ratio: 0.14 },
          { zone: "peak", energy: 0.78, ratio: 0.14 },
        ]
      : [
          { zone: "low", energy: 0.18, ratio: 0.18 },
          { zone: "build", energy: 0.36, ratio: 0.16 },
          { zone: "mid", energy: 0.5, ratio: 0.18 },
          { zone: "high", energy: 0.68, ratio: 0.14 },
          { zone: "release", energy: 0.28, ratio: 0.16 },
          { zone: "mid", energy: 0.42, ratio: 0.18 },
        ];

  const zones = [];
  let cursor = 0;
  let index = 0;
  while (cursor < safeDuration - 0.05) {
    const pattern = patterns[index % patterns.length];
    const sliceDuration = Math.min(
      Math.max(0.9, safeDuration * pattern.ratio),
      safeDuration - cursor
    );
    const endTime = Number(Math.min(safeDuration, cursor + sliceDuration).toFixed(3));
    zones.push({
      id: `synthetic-zone-${zones.length + 1}`,
      zone: pattern.zone,
      energy: pattern.energy,
      delta: 0,
      startTime: Number(cursor.toFixed(3)),
      endTime,
    });
    cursor = endTime;
    index += 1;
  }
  return zones;
};

export const buildAdaptiveEnergyZones = (
  analysis,
  timelineDuration = null,
  { audioType = "ambient", forceDesignedContrast = false } = {}
) => {
  const naturalZones = buildEnergyZones(analysis, timelineDuration);
  const safeDuration = Math.max(
    0,
    Number.isFinite(Number(timelineDuration))
      ? Number(timelineDuration)
      : Number(analysis?.duration) || 0
  );
  if (!safeDuration) return [];

  const shouldDesignContrast =
    forceDesignedContrast ||
    naturalZones.length < 2 ||
    (naturalZones.length <= 3 &&
      average(naturalZones.map(zone => Math.abs(Number(zone.delta) || 0))) < 0.035);

  if (!shouldDesignContrast) {
    return naturalZones;
  }

  const synthetic = synthesizeMoodZones(safeDuration, audioType);
  return synthetic.length ? synthetic : naturalZones;
};

export const getEnergyZoneAtTime = (zones, targetTime) =>
  (Array.isArray(zones) ? zones : []).find(
    zone => targetTime >= Number(zone.startTime) && targetTime < Number(zone.endTime)
  ) || zones?.[zones.length - 1] || null;

const getIntervalForZone = (style, zoneName, audioType, beatRegularity) => {
  const [minimum, maximum] = style.intervalRange;
  const regularityBonus = beatRegularity >= 0.56 ? 0.18 : 0;

  if (zoneName === "peak") return Math.max(minimum, minimum * (0.9 - regularityBonus * 0.15));
  if (zoneName === "high") return minimum + (maximum - minimum) * 0.1;
  if (zoneName === "build") return minimum + (maximum - minimum) * 0.32;
  if (zoneName === "release") return minimum + (maximum - minimum) * 0.54;
  if (zoneName === "mid") return minimum + (maximum - minimum) * 0.46;

  if (audioType === "choir") return maximum * 0.92;
  return maximum;
};

const getPlaybackRateForZone = (style, zoneName, audioType) => {
  const [minimum, maximum] = style.speedRange;
  if (audioType === "choir") {
    if (zoneName === "peak") return clampNumber(maximum * 0.96, minimum, maximum, 1);
    if (zoneName === "high") return clampNumber(maximum * 0.9, minimum, maximum, 1);
    if (zoneName === "build") return clampNumber((minimum + maximum) * 0.66, minimum, maximum, 1);
    if (zoneName === "release") return clampNumber(minimum * 1.14, minimum, maximum, minimum);
    if (zoneName === "mid") return clampNumber((minimum + maximum) * 0.56, minimum, maximum, 0.88);
    return clampNumber(minimum, 0.5, maximum, minimum);
  }

  if (zoneName === "peak") return maximum;
  if (zoneName === "high") return clampNumber(maximum * 0.96, minimum, maximum, maximum);
  if (zoneName === "build") return clampNumber((minimum + maximum) / 2, minimum, maximum, 1);
  if (zoneName === "release") return clampNumber(minimum * 1.1, minimum, maximum, minimum);
  if (zoneName === "mid") return clampNumber(minimum + (maximum - minimum) * 0.44, minimum, maximum, 0.94);
  return minimum;
};

const getNextAlignedCutTime = ({
  currentTime,
  duration,
  style,
  zone,
  audioType,
  beats,
  beatRegularity,
}) => {
  const idealStep = getIntervalForZone(style, zone?.zone || "mid", audioType, beatRegularity);
  let target = currentTime + idealStep;

  if (Array.isArray(beats) && beats.length && beatRegularity >= 0.35) {
    const nearestBeat = beats.find(beat => beat.time >= target - idealStep * 0.35);
    if (nearestBeat && nearestBeat.time > currentTime + 0.45 && nearestBeat.time < target + idealStep * 0.4) {
      target = nearestBeat.time;
    }
  }

  const safeTarget = clampNumber(target, currentTime + 0.55, duration, duration);
  return Number(safeTarget.toFixed(3));
};

const rankSourcesForFlowMoment = ({
  sources,
  currentTime,
  timelineStart,
  previousCameraId,
  sourceActivityByCameraId,
  frameQualityByCameraId,
  recentCameraIds,
  zone,
  style,
}) => {
  return sources
    .map(source => {
      const sourceTime = getSourceTimelineTimeAtPlayhead(source, currentTime, timelineStart);
      if (!isSourceAvailableAtTime(source, sourceTime)) return null;
      const sourceActivity = getAudioActivityScoreForSourceTime(
        sourceActivityByCameraId?.[source.id],
        sourceTime,
        0.45
      );
      const qualityScore = clampNumber(frameQualityByCameraId?.[source.id]?.score, 0, 1, 0.62);
      const freshnessPenalty = recentCameraIds.includes(source.id)
        ? recentCameraIds.lastIndexOf(source.id) === recentCameraIds.length - 1
          ? 0.32
          : 0.16
        : 0;
      const continuityBonus = source.id === previousCameraId ? style.continuityBias : 0;
      const energyBias = (ENERGY_ZONE_PRIORITY[zone?.zone] || 0) * style.motionBias * 0.08;
      const resolutionBias =
        Number(source.videoWidth || 0) >= 1080 || Number(source.videoHeight || 0) >= 1080 ? 0.08 : 0;

      return {
        source,
        sourceTime,
        totalScore:
          qualityScore * 0.45 +
          sourceActivity * 0.3 +
          resolutionBias +
          continuityBonus +
          energyBias -
          freshnessPenalty,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.totalScore - left.totalScore);
};

const buildSourceTimeMapForSegment = (sources, segmentStartTime, playbackRate, timelineStart) => {
  const map = {};
  sources.forEach(source => {
    const sourceStart = getSourceTimelineTimeAtPlayhead(source, segmentStartTime, timelineStart);
    map[source.id] = {
      sourceStart: Number(sourceStart.toFixed(3)),
      playbackRate,
    };
  });
  return map;
};

export const getFlowSegmentAtTime = (segments, targetTime) =>
  (Array.isArray(segments) ? segments : []).find(
    segment => targetTime >= Number(segment.startTime) && targetTime < Number(segment.endTime)
  ) || segments?.[segments.length - 1] || null;

export const getFlowSourceTimeAtPlayhead = (source, segment, playhead, timelineStart = 0) => {
  if (!source || !segment) return null;
  const elapsed = Math.max(0, Number(playhead) - Number(segment.startTime || 0));
  const sourceMapEntry = segment.sourceTimeByCameraId?.[source.id];
  const playbackRate = clampNumber(
    sourceMapEntry?.playbackRate ?? segment.playbackRate,
    0.5,
    1.25,
    1
  );
  const segmentSourceStart = Number.isFinite(Number(sourceMapEntry?.sourceStart))
    ? Number(sourceMapEntry.sourceStart)
    : getSourceTimelineTimeAtPlayhead(source, segment.startTime, timelineStart);
  return Number((segmentSourceStart + elapsed * playbackRate).toFixed(3));
};

export const buildFlowEditPlan = ({
  sources,
  timelineDuration,
  timelineStart = 0,
  audioAnalysis,
  sourceActivityByCameraId = {},
  styleId = "hype",
  frameQualityByCameraId = {},
}) => {
  const validSources = (Array.isArray(sources) ? sources : []).filter(
    source =>
      source?.id &&
      (source.url || source.previewUrl || source.uploadedUrl) &&
      Number(source.duration) > 0.05
  );
  const safeDuration = Math.max(
    0,
    Math.min(Number(timelineDuration) || 0, Number(audioAnalysis?.duration) || Number(timelineDuration) || 0)
  );
  if (!validSources.length || safeDuration <= 0.4) {
    return {
      duration: safeDuration,
      switches: [],
      segments: [],
      beatMarkers: [],
      energyZones: [],
      audioType: "ambient",
      warning: "Flow Edit needs synced video and enough timeline duration before it can generate an edit.",
      usedSmartTimingFallback: true,
    };
  }

  const baseStyle = getStylePreset(styleId);
  const beatAnalysis = detectAudioBeats(audioAnalysis);
  const audioClassification = classifyFlowAudio(audioAnalysis);
  const rescueProfile = buildRescueProfile({
    sources: validSources,
    audioClassification,
    beatAnalysis,
    sourceActivityByCameraId,
    frameQualityByCameraId,
  });
  const style = applyRescueToStyle(baseStyle, rescueProfile, audioClassification.type);
  const energyZones = buildAdaptiveEnergyZones(audioAnalysis, safeDuration, {
    audioType: audioClassification.type,
    forceDesignedContrast: rescueProfile.active || audioClassification.type === "ambient",
  });
  const beatMarkers = beatAnalysis.beats
    .filter(beat => beat.time <= safeDuration + 0.01)
    .map((beat, index) => ({
      id: `beat-${index + 1}`,
      time: beat.time,
      strength: beat.strength,
    }));
  const usedSmartTimingFallback =
    !beatMarkers.length || beatAnalysis.beatRegularity < 0.32 || audioClassification.type === "speech";

  const segments = [];
  const recentCameraIds = [];
  let currentTime = 0;
  let previousCameraId = null;

  while (currentTime < safeDuration - 0.12) {
    const zone = getEnergyZoneAtTime(energyZones, currentTime) || {
      zone: "mid",
      energy: 0.42,
      startTime: currentTime,
      endTime: safeDuration,
    };
    const nextCutTime = getNextAlignedCutTime({
      currentTime,
      duration: safeDuration,
      style,
      zone,
      audioType: audioClassification.type,
      beats: usedSmartTimingFallback ? [] : beatMarkers,
      beatRegularity: beatAnalysis.beatRegularity,
    });
    const playbackRate = Number(
      getPlaybackRateForZone(style, zone.zone, audioClassification.type).toFixed(3)
    );
    const rankedSources = rankSourcesForFlowMoment({
      sources: validSources,
      currentTime,
      timelineStart,
      previousCameraId,
      sourceActivityByCameraId,
      frameQualityByCameraId,
      recentCameraIds,
      zone,
      style,
    });
    const selected = rankedSources[0] || {
      source: validSources[segments.length % validSources.length],
      sourceTime: getSourceTimelineTimeAtPlayhead(
        validSources[segments.length % validSources.length],
        currentTime,
        timelineStart
      ),
      totalScore: 0.45,
    };
    const remainingSourceDuration = Math.max(
      0.18,
      (Number(selected.source.duration) || safeDuration) - Number(selected.sourceTime || 0)
    );
    const maxSegmentDuration = remainingSourceDuration / Math.max(playbackRate, 0.5);
    const endTime = Number(
      Math.min(safeDuration, currentTime + Math.max(0.5, Math.min(nextCutTime - currentTime, maxSegmentDuration))).toFixed(3)
    );
    const actualDuration = Math.max(0.35, endTime - currentTime);
    const sourceTimeByCameraId = buildSourceTimeMapForSegment(
      validSources,
      currentTime,
      playbackRate,
      timelineStart
    );

    segments.push({
      id: `flow-segment-${segments.length + 1}`,
      cameraId: selected.source.id,
      startTime: Number(currentTime.toFixed(3)),
      endTime: Number((currentTime + actualDuration).toFixed(3)),
      duration: Number(actualDuration.toFixed(3)),
      playbackRate,
      energyZone: zone.zone,
      energyScore: zone.energy,
      reason:
        rescueProfile.active
          ? zone.zone === "peak" || zone.zone === "high"
            ? "Rescue mode is tightening the visuals around the strongest usable moment."
            : zone.zone === "release"
              ? "Rescue mode is holding longer to make this pairing feel deliberate instead of chaotic."
              : "Rescue mode is smoothing the audio-video mismatch with continuity and controlled contrast."
          : audioClassification.type === "choir"
          ? zone.zone === "peak" || zone.zone === "high"
            ? "Locked to a vocal swell or ensemble crest."
            : "Held longer to preserve emotional lift and choral continuity."
          : usedSmartTimingFallback
            ? "No strong beat detected, so smart timing is carrying the pacing."
            : zone.zone === "peak" || zone.zone === "high"
              ? "Cutting on a high-energy moment to keep attention up."
              : zone.zone === "build"
                ? "Pacing tightens as the audio starts building."
                : zone.zone === "release"
                  ? "Breathing space after a peak to preserve contrast."
                  : "Balanced hold to let the rhythm reset before the next move.",
      sourceTimeByCameraId,
    });

    previousCameraId = selected.source.id;
    recentCameraIds.push(selected.source.id);
    if (recentCameraIds.length > 4) {
      recentCameraIds.shift();
    }
    currentTime += actualDuration;
  }

  if (segments.length) {
    const lastSegment = segments[segments.length - 1];
    lastSegment.endTime = safeDuration;
    lastSegment.duration = Number((safeDuration - lastSegment.startTime).toFixed(3));
  }

  const switches = normalizeSwitches(
    segments.map(segment => ({
      id: segment.id,
      cameraId: segment.cameraId,
      startTime: segment.startTime,
    })),
    validSources,
    safeDuration
  );

  return {
    duration: safeDuration,
    switches,
    segments,
    beatMarkers,
    energyZones,
    audioType: audioClassification.type,
    audioConfidence: audioClassification.confidence,
    audioExplanation: audioClassification.explanation,
    rescueMode: rescueProfile.active,
    rescueScore: rescueProfile.score,
    rescueStrategy: rescueProfile.strategy,
    rescueSummary: rescueProfile.summary,
    usedSmartTimingFallback,
    warning: rescueProfile.active
      ? rescueProfile.summary
      : usedSmartTimingFallback
        ? "No strong beat detected. Bring your boring audio anyway. We are shaping a smart mood curve and timing contrast for you."
        : "",
  };
};

export const buildFlowTimelineDisplaySegments = (segments, sources, timelineDuration) => {
  const safeDuration = Math.max(0.01, Number(timelineDuration) || 0.01);
  return (Array.isArray(segments) ? segments : []).map(segment => ({
    ...segment,
    label: sources.find(source => source.id === segment.cameraId)?.label || segment.cameraId,
    startPercent: (Number(segment.startTime) / safeDuration) * 100,
    widthPercent: (Number(segment.duration) / safeDuration) * 100,
  }));
};

const getSingleLensZoomForZone = (zoneName, audioType) => {
  if (audioType === "choir") {
    if (zoneName === "peak") return 1.28;
    if (zoneName === "high") return 1.22;
    if (zoneName === "build") return 1.14;
    return 1.04;
  }
  if (audioType === "speech") {
    if (zoneName === "peak") return 1.34;
    if (zoneName === "high") return 1.26;
    if (zoneName === "build") return 1.18;
    if (zoneName === "mid") return 1.1;
    return 1.02;
  }
  if (zoneName === "peak") return 1.42;
  if (zoneName === "high") return 1.32;
  if (zoneName === "build") return 1.22;
  if (zoneName === "mid") return 1.12;
  return 1.03;
};

export const buildSingleLensAutoPlan = ({
  source,
  audioAnalysis,
  timelineDuration,
}) => {
  const duration = Math.max(
    0,
    Math.min(
      Number(timelineDuration) || 0,
      Number(source?.duration) || Number(timelineDuration) || 0
    )
  );
  if (!source?.id || duration <= 0.4) {
    return {
      segments: [],
      framingMap: {},
      audioType: "ambient",
      summary: "Auto Shape needs one usable source and enough duration to work with.",
    };
  }

  const audioClassification = classifyFlowAudio(audioAnalysis);
  const zones = buildAdaptiveEnergyZones(audioAnalysis, duration, {
    audioType: audioClassification.type,
    forceDesignedContrast: audioClassification.type === "ambient",
  });
  const segments = [];
  const framingMap = {};
  const anchorSequence =
    audioClassification.type === "choir"
      ? ["center", "left", "center", "right"]
      : ["center", "left", "right", "center"];

  zones.forEach((zone, index) => {
    const segmentDuration = Number((zone.endTime - zone.startTime).toFixed(3));
    if (segmentDuration <= 0.25) return;
    const id = `segment-${index + 1}`;
    segments.push({
      id,
      cameraId: source.id,
      sourceStart: Number(zone.startTime.toFixed(3)),
      sourceEnd: Number(zone.endTime.toFixed(3)),
      timelineStart: Number(zone.startTime.toFixed(3)),
      timelineEnd: Number(zone.endTime.toFixed(3)),
    });
    const zoomAnchor = anchorSequence[index % anchorSequence.length];
    framingMap[id] = {
      zoom: getSingleLensZoomForZone(zone.zone, audioClassification.type),
      zoomAnchor,
      targetX: zoomAnchor === "left" ? 0.38 : zoomAnchor === "right" ? 0.62 : 0.5,
      targetY: audioClassification.type === "choir" ? 0.46 : 0.48,
    };
  });

  const summary =
    audioClassification.type === "ambient"
      ? "Bring your boring audio. Auto Shape is designing contrast, punch-ins, and breathing room from a flat soundtrack."
      : audioClassification.type === "choir"
        ? "Auto Shape is following crescendos and emotional swells to build a performance-led single-lens cut."
        : `Auto Shape built a ${audioClassification.type}-aware single-lens cut with pacing, punch-ins, and mood control.`;

  return {
    segments,
    framingMap,
    audioType: audioClassification.type,
    summary,
  };
};

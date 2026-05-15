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

export const IMAGE_STORY_TEMPLATE_PRESETS = [
  {
    id: "pulse-cards",
    label: "Pulse Cards",
    summary: "Fast punch-ins, confident side swings, and energetic story-card pressure.",
    motionBoost: 0.12,
    paceMultiplier: 0.9,
    anchorSequence: ["left", "center", "right", "center", "left", "right"],
    tiltSequence: [-2.8, 0.8, 2.4, -1.2, 1.8, -0.6],
    driftSequence: [
      { x: -0.028, y: -0.008 },
      { x: 0.012, y: 0.006 },
      { x: 0.03, y: -0.004 },
      { x: -0.02, y: 0.008 },
    ],
    brightnessBoost: 0.02,
    contrastBoost: 0.08,
    saturationBoost: 0.12,
    glowBoost: 0.18,
    frameStyle: "glow",
    targetY: {
      default: 0.48,
      choir: 0.46,
      peak: 0.44,
    },
  },
  {
    id: "magazine",
    label: "Magazine",
    summary: "Cleaner editorial motion with smoother holds and more polished framing.",
    motionBoost: 0.04,
    paceMultiplier: 1.06,
    anchorSequence: ["center", "left", "center", "right", "center"],
    tiltSequence: [-0.8, 0, 0.6, 0, -0.4],
    driftSequence: [
      { x: -0.012, y: -0.006 },
      { x: 0.008, y: 0.004 },
      { x: 0.014, y: -0.003 },
    ],
    brightnessBoost: 0.04,
    contrastBoost: 0.04,
    saturationBoost: 0.06,
    glowBoost: 0.08,
    frameStyle: "soft",
    targetY: {
      default: 0.47,
      choir: 0.45,
      peak: 0.45,
    },
  },
  {
    id: "poster-pop",
    label: "Poster Pop",
    summary: "Bolder zoom contrast with stronger visual jumps for social-first image stories.",
    motionBoost: 0.18,
    paceMultiplier: 0.82,
    anchorSequence: ["left", "right", "center", "left", "right", "center"],
    tiltSequence: [-4.2, 3.1, 0.9, -2.8, 4.4, -1.1],
    driftSequence: [
      { x: -0.04, y: -0.012 },
      { x: 0.038, y: -0.01 },
      { x: 0.016, y: 0.012 },
      { x: -0.026, y: 0.008 },
    ],
    brightnessBoost: 0.03,
    contrastBoost: 0.12,
    saturationBoost: 0.2,
    glowBoost: 0.22,
    frameStyle: "poster",
    targetY: {
      default: 0.49,
      choir: 0.47,
      peak: 0.43,
    },
  },
  {
    id: "halo-bloom",
    label: "Halo Bloom",
    summary: "Dreamier blooms, elegant drift, and premium spotlight motion for emotional edits.",
    motionBoost: 0.09,
    paceMultiplier: 0.98,
    anchorSequence: ["center", "left", "center", "right", "center", "left"],
    tiltSequence: [-1.2, 0.4, 1.3, -0.3, 0.8, -0.5],
    driftSequence: [
      { x: -0.01, y: -0.016 },
      { x: 0.012, y: -0.01 },
      { x: 0.008, y: 0.004 },
      { x: -0.014, y: 0.008 },
    ],
    brightnessBoost: 0.08,
    contrastBoost: 0.03,
    saturationBoost: 0.08,
    glowBoost: 0.3,
    frameStyle: "glow",
    targetY: {
      default: 0.46,
      choir: 0.44,
      peak: 0.42,
    },
  },
  {
    id: "cathedral-rise",
    label: "Cathedral Rise",
    summary: "Grand vertical lift, reverent pacing, and dramatic crescendo framing for singers and choirs.",
    motionBoost: 0.11,
    paceMultiplier: 1.02,
    anchorSequence: ["center", "center", "left", "center", "right", "center"],
    tiltSequence: [-0.6, 0, 0.6, 0, -0.3, 0.2],
    driftSequence: [
      { x: 0, y: -0.02 },
      { x: -0.01, y: -0.014 },
      { x: 0.012, y: -0.008 },
      { x: 0, y: 0.006 },
    ],
    brightnessBoost: 0.06,
    contrastBoost: 0.07,
    saturationBoost: 0.05,
    glowBoost: 0.16,
    frameStyle: "cinematic",
    targetY: {
      default: 0.45,
      choir: 0.4,
      peak: 0.39,
    },
  },
  {
    id: "snap-luxe",
    label: "Snap Luxe",
    summary: "Premium Snapchat-style photo motion with tasteful flashes, parallax drift, and beat-aware reveal energy.",
    motionBoost: 0.15,
    paceMultiplier: 0.86,
    anchorSequence: ["center", "left", "right", "center", "right", "left"],
    tiltSequence: [-2.2, 1.6, 2.8, -0.8, 1.2, -1.8],
    driftSequence: [
      { x: -0.018, y: -0.014 },
      { x: 0.024, y: -0.006 },
      { x: 0.032, y: 0.004 },
      { x: -0.02, y: 0.01 },
    ],
    brightnessBoost: 0.07,
    contrastBoost: 0.09,
    saturationBoost: 0.16,
    glowBoost: 0.24,
    frameStyle: "poster",
    targetY: {
      default: 0.46,
      choir: 0.44,
      peak: 0.41,
    },
  },
];

export const FLOW_AURA_TEMPLATE_PRESETS = [
  {
    id: "midnight-pulse",
    label: "Midnight Pulse",
    summary: "Electric social pressure with hotter flashes, sharper sweeps, and bolder glow timing.",
    defaultStyleId: "hype",
    defaultImageStoryTemplateId: "poster-pop",
    defaultIntensityMode: "harder",
    accentTone: "rose",
    glowBoost: 0.08,
    contrastBoost: 0.07,
    saturationBoost: 0.12,
    zoomBoost: 0.04,
    driftMultiplier: 1.18,
    tiltBoost: 0.3,
    transitionBias: "flash",
    frameStyleBias: "poster",
  },
  {
    id: "glass-authority",
    label: "Glass Authority",
    summary: "Clean premium authority with restrained motion, icy contrast, and confident editorial polish.",
    defaultStyleId: "smooth",
    defaultImageStoryTemplateId: "magazine",
    defaultIntensityMode: "standard",
    accentTone: "cool",
    glowBoost: 0.02,
    contrastBoost: 0.05,
    saturationBoost: -0.02,
    zoomBoost: -0.01,
    driftMultiplier: 0.82,
    tiltBoost: -0.12,
    transitionBias: "lift",
    frameStyleBias: "soft",
  },
  {
    id: "velvet-story",
    label: "Velvet Story",
    summary: "Dreamier emotional shaping with graceful blooms, warmer rolloff, and softer premium motion.",
    defaultStyleId: "cinematic",
    defaultImageStoryTemplateId: "halo-bloom",
    defaultIntensityMode: "standard",
    accentTone: "gold",
    glowBoost: 0.1,
    contrastBoost: 0.03,
    saturationBoost: 0.05,
    zoomBoost: 0.02,
    driftMultiplier: 0.94,
    tiltBoost: 0.1,
    transitionBias: "bloom",
    frameStyleBias: "cinematic",
  },
  {
    id: "choir-fire",
    label: "Choir Fire",
    summary: "Grand, reverent, emotionally rising motion built for singers, choirs, worship, and live performance.",
    defaultStyleId: "smooth",
    defaultImageStoryTemplateId: "cathedral-rise",
    defaultIntensityMode: "standard",
    accentTone: "choir",
    glowBoost: 0.12,
    contrastBoost: 0.05,
    saturationBoost: 0.03,
    zoomBoost: 0.03,
    driftMultiplier: 1.04,
    tiltBoost: 0.08,
    transitionBias: "bloom",
    frameStyleBias: "cinematic",
  },
  {
    id: "podcast-prestige",
    label: "Podcast Prestige",
    summary: "Luxury conversation pacing with cleaner holds, listener-friendly transitions, and high-trust framing.",
    defaultStyleId: "smooth",
    defaultImageStoryTemplateId: "magazine",
    defaultIntensityMode: "standard",
    accentTone: "cool",
    glowBoost: 0.01,
    contrastBoost: 0.04,
    saturationBoost: 0,
    zoomBoost: 0.01,
    driftMultiplier: 0.76,
    tiltBoost: -0.18,
    transitionBias: "drift",
    frameStyleBias: "soft",
  },
  {
    id: "product-spark",
    label: "Product Spark",
    summary: "Demo-friendly motion that turns ordinary product footage into punchy reveal, proof, and payoff moments.",
    defaultStyleId: "hype",
    defaultImageStoryTemplateId: "snap-luxe",
    defaultIntensityMode: "harder",
    accentTone: "rose",
    glowBoost: 0.07,
    contrastBoost: 0.09,
    saturationBoost: 0.1,
    zoomBoost: 0.035,
    driftMultiplier: 1.08,
    tiltBoost: 0.22,
    transitionBias: "flash",
    frameStyleBias: "poster",
  },
  {
    id: "docu-magnet",
    label: "Docu Magnet",
    summary: "Story-led pacing for podcasts, testimonies, church moments, explainers, and documentary-style trust building.",
    defaultStyleId: "cinematic",
    defaultImageStoryTemplateId: "halo-bloom",
    defaultIntensityMode: "standard",
    accentTone: "gold",
    glowBoost: 0.06,
    contrastBoost: 0.035,
    saturationBoost: 0.02,
    zoomBoost: 0.015,
    driftMultiplier: 0.88,
    tiltBoost: -0.06,
    transitionBias: "bloom",
    frameStyleBias: "cinematic",
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

const getImageStoryTemplatePreset = templateId =>
  IMAGE_STORY_TEMPLATE_PRESETS.find(template => template.id === templateId) ||
  IMAGE_STORY_TEMPLATE_PRESETS[0];

export const getFlowAuraPreset = auraTemplateId =>
  FLOW_AURA_TEMPLATE_PRESETS.find(template => template.id === auraTemplateId) ||
  FLOW_AURA_TEMPLATE_PRESETS[0];

const applyAuraToTransitionProfile = (transitionProfile, aura, zone) => {
  if (!aura) return transitionProfile;
  const hotZone = zone === "peak" || zone === "high" || zone === "build";
  return {
    ...transitionProfile,
    transitionStyle: hotZone && aura.transitionBias ? aura.transitionBias : transitionProfile.transitionStyle,
    transitionStrength: Number(
      clampNumber(
        Number(transitionProfile.transitionStrength || 0) + (hotZone ? 0.12 : 0.06),
        0,
        1,
        transitionProfile.transitionStrength || 0
      ).toFixed(3)
    ),
    accentTone: aura.accentTone || transitionProfile.accentTone,
  };
};

const applyAuraToFraming = (framing, aura, zone, audioType) => {
  if (!aura) return framing;
  const tiltDirection =
    Math.sign(Number(framing?.tilt) || 0) || (zone === "peak" || zone === "high" ? 1 : -1);
  const driftMultiplier =
    audioType === "choir" ? aura.driftMultiplier * 1.04 : aura.driftMultiplier;
  return {
    ...framing,
    zoom: Number(
      clampNumber(
        Number(framing.zoom || 1) + aura.zoomBoost + (zone === "peak" ? aura.zoomBoost * 0.35 : 0),
        0.92,
        1.42,
        framing.zoom || 1
      ).toFixed(3)
    ),
    tilt: Number((Number(framing.tilt || 0) + tiltDirection * aura.tiltBoost).toFixed(3)),
    translateX: Number((Number(framing.translateX || 0) * aura.driftMultiplier).toFixed(4)),
    translateY: Number((Number(framing.translateY || 0) * driftMultiplier).toFixed(4)),
    contrast: Number(
      clampNumber(
        Number(framing.contrast || 1) + aura.contrastBoost,
        0.88,
        1.5,
        framing.contrast || 1
      ).toFixed(3)
    ),
    saturation: Number(
      clampNumber(
        Number(framing.saturation || 1) + aura.saturationBoost,
        0.74,
        1.48,
        framing.saturation || 1
      ).toFixed(3)
    ),
    glow: Number(
      clampNumber(Number(framing.glow || 0) + aura.glowBoost, 0, 0.7, framing.glow || 0).toFixed(3)
    ),
    frameStyle: aura.frameStyleBias || framing.frameStyle,
    accentTone: aura.accentTone || framing.accentTone,
  };
};

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
  const finishMode =
    averageQuality < 0.48
      ? "premium rescue"
      : averageActivity < 0.34
        ? "momentum rescue"
        : strategy;

  const summary = active
    ? audioClassification?.type === "music"
      ? "Mismatch rescue is active. The soundtrack hits harder than the visuals, so Flow Edit is stretching continuity, shaping contrast, and making the pairing feel intentional."
      : audioClassification?.type === "choir"
        ? "Performance rescue is active. Flow Edit is leaning into swells, breath, and graceful emphasis so the visuals feel emotionally synchronized."
        : "Rescue mode is active. Flow Edit is smoothing an awkward pairing with continuity-first pacing, selective punch-ins, and designed mood contrast."
    : "";
  const polishSummary = active
    ? averageQuality < 0.48
      ? "Premium rescue is polishing softer footage with steadier framing, richer finish, and less frantic motion."
      : averageActivity < 0.34
        ? "Momentum rescue is shaping extra contrast so ordinary footage still feels intentional and alive."
        : "Rescue polish is helping the edit feel more premium instead of accidental."
    : "";

  return {
    active,
    score,
    strategy,
    finishMode,
    summary,
    polishSummary,
    averageActivity,
    averageQuality,
  };
};

const applyRescuePolishToFramingMap = (framingMap, rescueProfile, audioType) => {
  if (!rescueProfile?.active || !framingMap || typeof framingMap !== "object") {
    return framingMap;
  }

  const qualitySensitive = rescueProfile.averageQuality < 0.48;
  const calmLift = rescueProfile.averageActivity < 0.34;

  return Object.fromEntries(
    Object.entries(framingMap).map(([segmentId, framing]) => {
      if (!framing) return [segmentId, framing];
      const safeZoom = Number(framing.zoom || 1);
      const tilt = Number(framing.tilt || 0);
      const translateX = Number(framing.translateX || 0);
      const translateY = Number(framing.translateY || 0);
      const contrast = Number(framing.contrast || 1);
      const saturation = Number(framing.saturation || 1);
      const glow = Number(framing.glow || 0);
      const transitionStrength = Number(framing.transitionStrength || 0);

      return [
        segmentId,
        {
          ...framing,
          zoom: Number(
            clampNumber(
              safeZoom + (qualitySensitive ? -0.03 : calmLift ? -0.015 : 0),
              0.94,
              1.34,
              safeZoom
            ).toFixed(3)
          ),
          tilt: Number((tilt * (qualitySensitive ? 0.42 : 0.7)).toFixed(3)),
          translateX: Number((translateX * (qualitySensitive ? 0.55 : 0.78)).toFixed(4)),
          translateY: Number((translateY * (qualitySensitive ? 0.6 : 0.82)).toFixed(4)),
          targetY:
            audioType === "choir"
              ? framing.targetY
              : Number(clampNumber(Number(framing.targetY || 0.5), 0.45, 0.54, 0.5).toFixed(4)),
          contrast: Number(
            clampNumber(contrast + (qualitySensitive ? 0.06 : 0.03), 0.9, 1.48, contrast).toFixed(3)
          ),
          saturation: Number(
            clampNumber(saturation + (qualitySensitive ? 0.03 : 0.02), 0.78, 1.44, saturation).toFixed(3)
          ),
          glow: Number(clampNumber(glow + (qualitySensitive ? 0.08 : 0.04), 0, 0.64, glow).toFixed(3)),
          frameStyle:
            qualitySensitive && framing.frameStyle !== "cinematic"
              ? "soft"
              : calmLift && framing.frameStyle === "glow"
                ? "cinematic"
                : framing.frameStyle,
          transitionStrength: Number(
            clampNumber(
              transitionStrength * (qualitySensitive ? 0.78 : 0.88),
              0.08,
              0.92,
              transitionStrength
            ).toFixed(3)
          ),
        },
      ];
    })
  );
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
  rescueProfile,
}) => {
  const premiumRescue = rescueProfile?.active && rescueProfile?.finishMode === "premium rescue";
  const continuityLift = rescueProfile?.active ? 0.04 + rescueProfile.score * 0.06 : 0;
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
      const continuityBonus =
        source.id === previousCameraId ? style.continuityBias + continuityLift : 0;
      const energyBias = (ENERGY_ZONE_PRIORITY[zone?.zone] || 0) * style.motionBias * 0.08;
      const resolutionBias =
        Number(source.videoWidth || 0) >= 1080 || Number(source.videoHeight || 0) >= 1080 ? 0.08 : 0;

      return {
        source,
        sourceTime,
        totalScore:
          qualityScore * (premiumRescue ? 0.58 : 0.45) +
          sourceActivity * (premiumRescue ? 0.22 : 0.3) +
          resolutionBias +
          continuityBonus +
          energyBias -
          freshnessPenalty * (premiumRescue ? 0.72 : 1),
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

const buildSingleSourceHighlightCandidates = ({
  source,
  sourceActivityEntries = [],
  frameQualityByCameraId = {},
  timelineDuration,
  targetCount,
}) => {
  const sourceDuration = Math.max(
    0.8,
    Number(source?.duration) || Number(timelineDuration) || 0.8
  );
  const qualityScore = clampNumber(frameQualityByCameraId?.[source?.id]?.score, 0, 1, 0.62);
  const step = sourceDuration <= 18 ? 0.65 : sourceDuration <= 90 ? 1.1 : 1.6;
  const windowSize = sourceDuration <= 18 ? 1.5 : sourceDuration <= 90 ? 2.2 : 2.8;
  const candidates = [];

  for (let cursor = 0; cursor < sourceDuration - 0.3; cursor += step) {
    const midpoint = Math.min(sourceDuration, cursor + windowSize * 0.5);
    const activityScore = getAudioActivityScoreForSourceTime(
      sourceActivityEntries,
      midpoint,
      0.42
    );
    const normalizedPosition = sourceDuration > 0 ? midpoint / sourceDuration : 0.5;
    const earlyPenalty = normalizedPosition < 0.04 ? 0.08 : 0;
    const latePenalty = normalizedPosition > 0.97 ? 0.06 : 0;
    const centerBonus = 1 - Math.abs(normalizedPosition - 0.55);
    const score =
      activityScore * 0.66 +
      qualityScore * 0.24 +
      centerBonus * 0.14 -
      earlyPenalty -
      latePenalty;

    candidates.push({
      startTime: Number(Math.max(0, cursor).toFixed(3)),
      midpoint: Number(midpoint.toFixed(3)),
      score: Number(score.toFixed(4)),
      activityScore: Number(activityScore.toFixed(4)),
      qualityScore: Number(qualityScore.toFixed(4)),
    });
  }

  const ranked = candidates.sort((left, right) => right.score - left.score);
  const selected = [];
  const minimumGap = Math.max(1.2, windowSize * 0.68);

  ranked.forEach(candidate => {
    if (
      selected.every(
        existing => Math.abs(existing.startTime - candidate.startTime) >= minimumGap
      )
    ) {
      selected.push(candidate);
    }
  });

  if (!selected.length) {
    selected.push({
      startTime: 0,
      midpoint: Number((windowSize * 0.5).toFixed(3)),
      score: 0.42,
      activityScore: 0.42,
      qualityScore: qualityScore,
    });
  }

  return selected
    .slice(0, Math.max(3, targetCount))
    .sort((left, right) => left.startTime - right.startTime)
    .map((candidate, index, ordered) => {
      const topScore = ordered[ordered.length - 1]?.score || candidate.score || 0;
      const heroMoment =
        candidate.score >= topScore - 0.04 &&
        candidate.activityScore >= 0.44 &&
        candidate.qualityScore >= 0.5;
      return {
        ...candidate,
        heroMoment,
        heroLabel: heroMoment
          ? candidate.qualityScore >= 0.66
            ? "premium hero"
            : "hero lift"
          : "support beat",
      };
    });
};

const getSingleSourceHighlightReason = (zoneName, audioType, usedSmartTimingFallback) => {
  if (zoneName === "peak" || zoneName === "high") {
    return "Pulling one of the strongest moments from the long take to hit the soundtrack harder.";
  }
  if (zoneName === "build") {
    return "Sliding into a stronger section as the soundtrack starts building.";
  }
  if (zoneName === "release") {
    return "Giving the edit breathing space with a calmer pulled highlight before the next lift.";
  }
  if (audioType === "choir") {
    return "Choosing a more expressive part of the take so the visual rise matches the musical swell.";
  }
  if (usedSmartTimingFallback) {
    return "Mining a cleaner section from the long take while smart timing shapes the soundtrack match.";
  }
  return "Rotating through the best parts of the long take instead of staying stuck in one continuous section.";
};

const buildSingleSourceHighlightSegments = ({
  source,
  duration,
  energyZones,
  beatMarkers,
  audioType,
  style,
  beatRegularity,
  sourceActivityEntries,
  frameQualityByCameraId,
  usedSmartTimingFallback,
}) => {
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (!source?.id || safeDuration <= 0.4) return [];

  const targetSegments = Math.max(
    4,
    Math.ceil(safeDuration / average(style.intervalRange))
  );
  const highlightCandidates = buildSingleSourceHighlightCandidates({
    source,
    sourceActivityEntries,
    frameQualityByCameraId,
    timelineDuration: safeDuration,
    targetCount: targetSegments + 2,
  });

  const segments = [];
  let currentTime = 0;
  let highlightCursor = 0;
  let previousHighlightStart = null;

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
      audioType,
      beats: usedSmartTimingFallback ? [] : beatMarkers,
      beatRegularity,
    });
    const playbackRate = Number(
      getPlaybackRateForZone(style, zone.zone, audioType).toFixed(3)
    );
    const actualDuration = Number(
      Math.max(0.35, Math.min(safeDuration - currentTime, nextCutTime - currentTime)).toFixed(3)
    );
    const nextCandidate =
      highlightCandidates[highlightCursor % highlightCandidates.length] || highlightCandidates[0];
    highlightCursor += 1;

    const sourceMaxStart = Math.max(
      0,
      (Number(source.duration) || safeDuration) - actualDuration * Math.max(playbackRate, 0.6) - 0.05
    );
    let selectedSourceStart = clampNumber(
      nextCandidate?.startTime,
      0,
      sourceMaxStart,
      0
    );
    if (
      previousHighlightStart !== null &&
      Math.abs(selectedSourceStart - previousHighlightStart) < Math.max(0.8, actualDuration * 0.45)
    ) {
      const previousStart = previousHighlightStart;
      const fallbackCandidate =
        highlightCandidates.find(
          candidate =>
            Math.abs(candidate.startTime - previousStart) >=
            Math.max(0.8, actualDuration * 0.45)
        ) || nextCandidate;
      selectedSourceStart = clampNumber(
        fallbackCandidate?.startTime,
        0,
        sourceMaxStart,
        selectedSourceStart
      );
    }
    previousHighlightStart = selectedSourceStart;

    segments.push({
      id: `flow-segment-${segments.length + 1}`,
      cameraId: source.id,
      startTime: Number(currentTime.toFixed(3)),
      endTime: Number((currentTime + actualDuration).toFixed(3)),
      duration: actualDuration,
      playbackRate,
      energyZone: zone.zone,
      energyScore: zone.energy,
      sourceTimeByCameraId: {
        [source.id]: {
          sourceStart: Number(selectedSourceStart.toFixed(3)),
          playbackRate,
        },
      },
      heroMoment: Boolean(nextCandidate?.heroMoment),
      heroLabel: nextCandidate?.heroLabel || null,
      reason: getSingleSourceHighlightReason(zone.zone, audioType, usedSmartTimingFallback),
    });

    currentTime += actualDuration;
  }

  if (segments.length) {
    const lastSegment = segments[segments.length - 1];
    lastSegment.endTime = Number(safeDuration.toFixed(3));
    lastSegment.duration = Number((safeDuration - lastSegment.startTime).toFixed(3));
  }

  return segments.filter(segment => segment.duration > 0.1);
};

const getImageStorySourceForSegment = (sources, segmentIndex, previousCameraId) => {
  const safeSources = Array.isArray(sources) ? sources : [];
  if (!safeSources.length) return null;

  const baseIndex = segmentIndex % safeSources.length;
  let selected = safeSources[baseIndex];

  if (selected?.id === previousCameraId && safeSources.length > 1) {
    selected = safeSources[(baseIndex + 1) % safeSources.length];
  }

  return selected || safeSources[0];
};

const getImageStoryIntervalPreset = (styleId, audioType) => {
  if (styleId === "smooth") {
    if (audioType === "choir") return { min: 1.8, max: 3.4, average: 2.5 };
    if (audioType === "speech") return { min: 1.55, max: 2.85, average: 2.15 };
    return { min: 1.35, max: 2.55, average: 1.95 };
  }
  if (styleId === "cinematic") {
    if (audioType === "choir") return { min: 1.3, max: 2.6, average: 1.95 };
    if (audioType === "speech") return { min: 1.1, max: 2.15, average: 1.6 };
    return { min: 0.95, max: 1.95, average: 1.35 };
  }
  if (audioType === "choir") return { min: 0.72, max: 1.75, average: 1.1 };
  if (audioType === "speech") return { min: 0.82, max: 1.65, average: 1.18 };
  return { min: 0.5, max: 1.35, average: 0.92 };
};

const IMAGE_STORY_ZONE_STEP_FACTORS = {
  peak: 0.72,
  high: 0.82,
  build: 0.92,
  mid: 1,
  release: 1.18,
  low: 1.24,
};

const getImageStoryReason = zoneName => {
  if (zoneName === "peak" || zoneName === "high") {
    return "Punching to a fresh story card right on the soundtrack's strongest moment.";
  }
  if (zoneName === "build") {
    return "Tightening the image pace as the soundtrack starts building.";
  }
  if (zoneName === "release") {
    return "Letting this image breathe for a beat so the next change lands harder.";
  }
  if (zoneName === "low") {
    return "Holding longer here so the soundtrack can reset before the next visual lift.";
  }
  return "Keeping the story cards moving in time with the soundtrack.";
};

const VIDEO_FLOW_ANCHOR_SEQUENCES = {
  smooth: ["center", "left", "center", "right", "center"],
  hype: ["left", "center", "right", "center", "left", "right"],
  cinematic: ["center", "right", "center", "left", "center"],
};

const getTransitionProfileForSegment = (
  zone,
  audioType,
  styleId = "hype",
  previousZone = null,
  nextZone = null
) => {
  if (nextZone === "peak" && (zone === "build" || zone === "high")) {
    return audioType === "choir"
      ? { transitionStyle: "bloom", transitionStrength: 0.82, accentTone: "choir" }
      : styleId === "hype"
        ? { transitionStyle: "flash", transitionStrength: 0.94, accentTone: "warm" }
        : { transitionStyle: "lift", transitionStrength: 0.74, accentTone: "gold" };
  }
  if (previousZone === "peak" && (zone === "release" || zone === "low")) {
    return audioType === "choir"
      ? { transitionStyle: "drift", transitionStrength: 0.48, accentTone: "choir" }
      : styleId === "cinematic"
        ? { transitionStyle: "drift", transitionStrength: 0.42, accentTone: "gold" }
        : { transitionStyle: "bloom", transitionStrength: 0.4, accentTone: "cool" };
  }
  if (audioType === "choir") {
    if (zone === "peak" || zone === "high") {
      return { transitionStyle: "bloom", transitionStrength: 0.78, accentTone: "choir" };
    }
    if (zone === "build") {
      return { transitionStyle: "lift", transitionStrength: 0.56, accentTone: "gold" };
    }
    return { transitionStyle: "drift", transitionStrength: 0.3, accentTone: "choir" };
  }

  if (styleId === "hype") {
    if (zone === "peak") return { transitionStyle: "flash", transitionStrength: 0.88, accentTone: "warm" };
    if (zone === "high") return { transitionStyle: "sweep", transitionStrength: 0.62, accentTone: "rose" };
    if (zone === "build") return { transitionStyle: "lift", transitionStrength: 0.48, accentTone: "warm" };
    return { transitionStyle: "cut", transitionStrength: 0.18, accentTone: "cool" };
  }

  if (styleId === "cinematic") {
    if (zone === "peak") return { transitionStyle: "bloom", transitionStrength: 0.7, accentTone: "gold" };
    if (zone === "high" || zone === "build") {
      return { transitionStyle: "lift", transitionStrength: 0.52, accentTone: "gold" };
    }
    if (zone === "release") return { transitionStyle: "drift", transitionStrength: 0.3, accentTone: "cool" };
    return { transitionStyle: "cut", transitionStrength: 0.12, accentTone: "cool" };
  }

  if (zone === "peak") return { transitionStyle: "bloom", transitionStrength: 0.5, accentTone: "cool" };
  if (zone === "build") return { transitionStyle: "lift", transitionStrength: 0.34, accentTone: "cool" };
  return { transitionStyle: "drift", transitionStrength: 0.2, accentTone: "cool" };
};

export const buildVideoFlowFramingMap = (
  segments,
  audioType,
  styleId = "hype",
  intensityMode = "standard",
  auraTemplateId = FLOW_AURA_TEMPLATE_PRESETS[0].id
) => {
  const anchors = VIDEO_FLOW_ANCHOR_SEQUENCES[styleId] || VIDEO_FLOW_ANCHOR_SEQUENCES.hype;
  const intensityBoost = intensityMode === "harder" ? 0.08 : 0;
  const aura = getFlowAuraPreset(auraTemplateId);

  return (Array.isArray(segments) ? segments : []).reduce((accumulator, segment, index) => {
    const zone = segment?.energyZone || "mid";
    const previousZone = segments[index - 1]?.energyZone || null;
    const nextZone = segments[index + 1]?.energyZone || null;
    const heroMoment = Boolean(segment?.heroMoment);
    const anchor = anchors[index % anchors.length];
    const isPeak = zone === "peak" || zone === "high";
    const isRelease = zone === "release" || zone === "low";
    const baseZoom =
      audioType === "choir"
        ? isPeak
          ? 1.12
          : zone === "build"
            ? 1.08
            : 1.03
        : styleId === "smooth"
          ? isPeak
            ? 1.12
            : zone === "build"
              ? 1.08
              : 1.04
          : styleId === "cinematic"
            ? isPeak
              ? 1.18
              : zone === "build"
                ? 1.11
                : 1.05
            : isPeak
              ? 1.24
              : zone === "build"
                ? 1.14
                : 1.06;
    const driftX =
      anchor === "left"
        ? -0.02 - intensityBoost * 0.4
        : anchor === "right"
          ? 0.02 + intensityBoost * 0.4
          : 0;
    const driftY =
      audioType === "choir"
        ? -0.012
        : isPeak
          ? -0.008
          : isRelease
            ? 0.008
            : 0;

    const transitionProfile = applyAuraToTransitionProfile(
      getTransitionProfileForSegment(zone, audioType, styleId, previousZone, nextZone),
      aura,
      zone
    );
    const baseFraming = {
      zoom: Number((baseZoom + intensityBoost + (heroMoment ? 0.035 : 0)).toFixed(3)),
      zoomAnchor: anchor,
      targetX: anchor === "left" ? 0.4 : anchor === "right" ? 0.6 : 0.5,
      targetY: audioType === "choir" ? 0.45 : heroMoment || isPeak ? 0.46 : 0.5,
      tilt:
        styleId === "hype"
          ? Number(((index % 2 === 0 ? -1.2 : 1.2) * (1 + intensityBoost * 2)).toFixed(3))
          : styleId === "cinematic"
            ? Number(((index % 3 === 0 ? 0.8 : -0.5) * (1 + intensityBoost)).toFixed(3))
            : 0,
      translateX: Number(driftX.toFixed(4)),
      translateY: Number(driftY.toFixed(4)),
      brightness: Number((1 + (isPeak || heroMoment ? 0.03 : 0)).toFixed(3)),
      contrast: Number((1 + (styleId === "hype" ? 0.08 : 0.04) + (isPeak || heroMoment ? 0.04 : 0)).toFixed(3)),
      saturation: Number((1 + (styleId === "hype" ? 0.1 : 0.04) + (isPeak || heroMoment ? 0.04 : 0)).toFixed(3)),
      glow: Number(((styleId === "cinematic" ? 0.1 : styleId === "hype" ? 0.16 : 0.06) + (isPeak || heroMoment ? 0.06 : 0)).toFixed(3)),
      frameStyle: heroMoment ? "cinematic" : styleId === "cinematic" ? "cinematic" : styleId === "hype" ? "glow" : "soft",
    };
    accumulator[segment.id] = {
      ...applyAuraToFraming(baseFraming, aura, zone, audioType),
      ...transitionProfile,
      transitionStrength: Number(
        clampNumber(
          Number(transitionProfile.transitionStrength || 0) + (heroMoment ? 0.08 : 0),
          0,
          1,
          transitionProfile.transitionStrength || 0
        ).toFixed(3)
      ),
    };
    return accumulator;
  }, {});
};

const buildImageStorySegments = ({
  sources,
  duration,
  energyZones,
  beatMarkers,
  audioType,
  styleId,
  templateId = "pulse-cards",
}) => {
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (!safeSources.length || safeDuration <= 0.4) return [];

  const template = getImageStoryTemplatePreset(templateId);
  const intervalPresetBase = getImageStoryIntervalPreset(styleId, audioType);
  const intervalPreset = {
    min: Number((intervalPresetBase.min * template.paceMultiplier).toFixed(3)),
    max: Number((intervalPresetBase.max * template.paceMultiplier).toFixed(3)),
    average: Number((intervalPresetBase.average * template.paceMultiplier).toFixed(3)),
  };
  const targetSegmentCount = Math.max(
    safeSources.length,
    Math.ceil(safeDuration / intervalPreset.average)
  );
  const maxSegmentDuration = Math.min(
    intervalPreset.max,
    Math.max(intervalPreset.min, safeDuration / Math.max(targetSegmentCount - 1, 1) * 1.18)
  );
  const minSegmentDuration = Math.min(intervalPreset.min, maxSegmentDuration * 0.82);
  const segments = [];
  let currentTime = 0;
  let previousCameraId = null;

  while (currentTime < safeDuration - 0.08) {
    const zone = getEnergyZoneAtTime(energyZones, currentTime) || {
      zone: "mid",
      energy: 0.45,
      startTime: currentTime,
      endTime: safeDuration,
    };
    const stepFactor = IMAGE_STORY_ZONE_STEP_FACTORS[zone.zone] || 1;
    let idealStep = clampNumber(
      intervalPreset.average * stepFactor,
      minSegmentDuration,
      maxSegmentDuration,
      intervalPreset.average
    );

    if (Array.isArray(beatMarkers) && beatMarkers.length) {
      const beatSearchStart = currentTime + minSegmentDuration * 0.65;
      const beatSearchEnd = currentTime + maxSegmentDuration * 1.08;
      const targetBeat = beatMarkers.find(
        beat => beat.time >= beatSearchStart && beat.time <= beatSearchEnd
      );
      if (targetBeat) {
        idealStep = clampNumber(
          targetBeat.time - currentTime,
          minSegmentDuration,
          maxSegmentDuration,
          idealStep
        );
      }
    }

    const remainingDuration = safeDuration - currentTime;
    const remainingSegmentsNeeded = Math.max(0, safeSources.length - segments.length);
    const reserveForCoverage =
      remainingSegmentsNeeded > 1
        ? minSegmentDuration * (remainingSegmentsNeeded - 1)
        : 0;
    const actualDuration = Math.max(
      minSegmentDuration,
      Math.min(idealStep, remainingDuration - reserveForCoverage)
    );
    const selectedSource = getImageStorySourceForSegment(
      safeSources,
      segments.length,
      previousCameraId
    );
    const endTime = Number(Math.min(safeDuration, currentTime + actualDuration).toFixed(3));

    segments.push({
      id: `flow-segment-${segments.length + 1}`,
      cameraId: selectedSource?.id || safeSources[segments.length % safeSources.length]?.id,
      startTime: Number(currentTime.toFixed(3)),
      endTime,
      duration: Number((endTime - currentTime).toFixed(3)),
      playbackRate: Number(
        getPlaybackRateForZone(getStylePreset(styleId), zone.zone, audioType).toFixed(3)
      ),
      energyZone: zone.zone,
      energyScore: zone.energy,
      reason: getImageStoryReason(zone.zone),
      sourceTimeByCameraId: buildSourceTimeMapForSegment(safeSources, currentTime, 1, 0),
    });

    previousCameraId = selectedSource?.id || null;
    currentTime = endTime;
  }

  if (!segments.length) return [];

  while (segments.length < safeSources.length) {
    const widestIndex = segments.reduce((bestIndex, segment, index, array) =>
      segment.duration > array[bestIndex].duration ? index : bestIndex, 0
    );
    const target = segments[widestIndex];
    if (!target || target.duration < minSegmentDuration * 1.9) break;

    const midpoint = Number((target.startTime + target.duration / 2).toFixed(3));
    const nextSource = getImageStorySourceForSegment(
      safeSources,
      widestIndex + 1,
      target.cameraId
    );

    const leftSegment = {
      ...target,
      endTime: midpoint,
      duration: Number((midpoint - target.startTime).toFixed(3)),
    };
    const rightSegment = {
      ...target,
      id: `flow-segment-${segments.length + 1}`,
      cameraId: nextSource?.id || target.cameraId,
      startTime: midpoint,
      endTime: target.endTime,
      duration: Number((target.endTime - midpoint).toFixed(3)),
      reason: "Adding another visual change so the story keeps moving with the soundtrack.",
    };
    segments.splice(widestIndex, 1, leftSegment, rightSegment);
  }

  segments.forEach((segment, index) => {
    segment.id = `flow-segment-${index + 1}`;
    segment.startTime = Number(segment.startTime.toFixed(3));
    segment.endTime = Number(segment.endTime.toFixed(3));
    segment.duration = Number((segment.endTime - segment.startTime).toFixed(3));
  });
  segments[segments.length - 1].endTime = Number(safeDuration.toFixed(3));
  segments[segments.length - 1].duration = Number(
    (safeDuration - segments[segments.length - 1].startTime).toFixed(3)
  );

  return segments.filter(segment => segment.duration > 0.1);
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
  imageStoryTemplateId = "pulse-cards",
  intensityMode = "standard",
  auraTemplateId = FLOW_AURA_TEMPLATE_PRESETS[0].id,
}) => {
  const validSources = (Array.isArray(sources) ? sources : []).filter(
    source =>
      source?.id &&
      (source.url || source.previewUrl || source.uploadedUrl) &&
      Number(source.duration) > 0.05
  );
  const audioDuration = Math.max(0, Number(audioAnalysis?.duration) || 0);
  const safeDuration = Math.max(0, Number(timelineDuration) || audioDuration || 0);
  const imageStoryMode =
    validSources.length >= 2 &&
    validSources.every(source => String(source?.mediaKind || "").toLowerCase() === "image");
  const singleSourceHighlightMode =
    validSources.length === 1 &&
    String(validSources[0]?.mediaKind || "").toLowerCase() !== "image";
  if (!validSources.length || safeDuration <= 0.4) {
    return {
      duration: safeDuration,
      switches: [],
      segments: [],
      beatMarkers: [],
      energyZones: [],
      audioType: "ambient",
      visualMode: imageStoryMode ? "image_story" : "video_flow",
      audioDuration,
      loopsAudio: false,
      intensityMode,
      auraTemplateId,
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
  const effectiveStyle =
    intensityMode === "harder"
      ? {
          ...style,
          intervalRange: [
            Number((style.intervalRange[0] * 0.82).toFixed(3)),
            Number((style.intervalRange[1] * 0.86).toFixed(3)),
          ],
          speedRange: [
            style.speedRange[0],
            clampNumber(style.speedRange[1] + 0.08, 0.9, 1.25, style.speedRange[1]),
          ],
          continuityBias: Math.max(0.04, style.continuityBias - 0.06),
          motionBias: clampNumber(style.motionBias + 0.1, 0.18, 0.62, style.motionBias),
        }
      : style;
  const effectiveAnalysisDuration = audioDuration > 0.2 ? Math.min(audioDuration, safeDuration) : safeDuration;
  const shouldLoopAudio = audioDuration > 0.2 && audioDuration < safeDuration - 0.2;
  const baseEnergyZones = buildAdaptiveEnergyZones(audioAnalysis, effectiveAnalysisDuration, {
    audioType: audioClassification.type,
    forceDesignedContrast: rescueProfile.active || audioClassification.type === "ambient",
  });
  const energyZones = shouldLoopAudio
    ? Array.from({ length: Math.max(1, Math.ceil(safeDuration / audioDuration)) }).flatMap((_, loopIndex) =>
        baseEnergyZones
          .map(zone => ({
            ...zone,
            id: `zone-loop-${loopIndex + 1}-${zone.id}`,
            startTime: Number((zone.startTime + audioDuration * loopIndex).toFixed(3)),
            endTime: Number((zone.endTime + audioDuration * loopIndex).toFixed(3)),
          }))
          .filter(zone => zone.startTime < safeDuration)
          .map(zone => ({
            ...zone,
            endTime: Number(Math.min(safeDuration, zone.endTime).toFixed(3)),
          }))
          .filter(zone => zone.endTime - zone.startTime > 0.08)
      )
    : baseEnergyZones;
  const baseBeatMarkers = beatAnalysis.beats
    .filter(beat => beat.time <= effectiveAnalysisDuration + 0.01)
    .map(beat => ({
      time: beat.time,
      strength: beat.strength,
    }));
  const beatMarkers = shouldLoopAudio
    ? Array.from({ length: Math.max(1, Math.ceil(safeDuration / audioDuration)) }).flatMap((_, loopIndex) =>
        baseBeatMarkers
          .map((beat, beatIndex) => ({
            id: `beat-loop-${loopIndex + 1}-${beatIndex + 1}`,
            time: Number((beat.time + audioDuration * loopIndex).toFixed(3)),
            strength: beat.strength,
          }))
          .filter(beat => beat.time <= safeDuration + 0.01)
      )
    : baseBeatMarkers.map((beat, index) => ({
        id: `beat-${index + 1}`,
        time: beat.time,
        strength: beat.strength,
      }));
  const usedSmartTimingFallback =
    !beatMarkers.length || beatAnalysis.beatRegularity < 0.32 || audioClassification.type === "speech";

  if (imageStoryMode) {
    const segments = buildImageStorySegments({
      sources: validSources,
      duration: safeDuration,
      energyZones,
      beatMarkers: usedSmartTimingFallback ? [] : beatMarkers,
      audioType: audioClassification.type,
      styleId,
      templateId: imageStoryTemplateId,
    });
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
      framingMap: applyRescuePolishToFramingMap(
        buildImageStoryFramingMap(
          segments,
          audioClassification.type,
          imageStoryTemplateId,
          auraTemplateId
        ),
        rescueProfile,
        audioClassification.type
      ),
      beatMarkers,
      energyZones,
      audioType: audioClassification.type,
      visualMode: "image_story",
      imageStoryTemplateId,
      auraTemplateId,
      audioDuration,
      loopsAudio: shouldLoopAudio,
      intensityMode,
      audioConfidence: audioClassification.confidence,
      audioExplanation: audioClassification.explanation,
      rescueMode: rescueProfile.active,
      rescueScore: rescueProfile.score,
      rescueStrategy: rescueProfile.strategy,
      rescueFinishMode: rescueProfile.finishMode,
      rescueSummary: rescueProfile.summary,
      rescuePolishSummary: rescueProfile.polishSummary,
      usedSmartTimingFallback,
      warning: usedSmartTimingFallback
        ? "No strong beat detected. We are still shaping a designed image-story pace from the soundtrack."
        : "",
    };
  }

  if (singleSourceHighlightMode) {
    const singleSource = validSources[0];
    const segments = buildSingleSourceHighlightSegments({
      source: singleSource,
      duration: safeDuration,
      energyZones,
      beatMarkers,
      audioType: audioClassification.type,
      style: effectiveStyle,
      beatRegularity: beatAnalysis.beatRegularity,
      sourceActivityEntries: sourceActivityByCameraId?.[singleSource.id],
      frameQualityByCameraId,
      usedSmartTimingFallback,
    });
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
      framingMap: applyRescuePolishToFramingMap(
        buildVideoFlowFramingMap(
          segments,
          audioClassification.type,
          styleId,
          intensityMode,
          auraTemplateId
        ),
        rescueProfile,
        audioClassification.type
      ),
      beatMarkers,
      energyZones,
      audioType: audioClassification.type,
      visualMode: "single_highlight_flow",
      imageStoryTemplateId,
      auraTemplateId,
      audioDuration,
      loopsAudio: shouldLoopAudio,
      intensityMode,
      audioConfidence: audioClassification.confidence,
      audioExplanation: audioClassification.explanation,
      rescueMode: rescueProfile.active,
      rescueScore: rescueProfile.score,
      rescueStrategy: rescueProfile.strategy,
      rescueFinishMode: rescueProfile.finishMode,
      rescueSummary: rescueProfile.summary,
      rescuePolishSummary: rescueProfile.polishSummary,
      usedSmartTimingFallback,
      warning: rescueProfile.active
        ? rescueProfile.summary
        : usedSmartTimingFallback
          ? "No strong beat detected. We are still pulling the best moments from the long take and shaping them to smart timing."
          : "",
      highlightPullMode: true,
      highlightSummary:
        audioClassification.type === "choir"
          ? "Highlight Pull is live. Flow Edit is mining the strongest performance moments from the long take and matching them to the soundtrack swells."
          : "Highlight Pull is live. Flow Edit is selecting the strongest parts of the long video and matching them to the soundtrack instead of staying on one continuous section.",
    };
  }

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
      style: effectiveStyle,
      zone,
      audioType: audioClassification.type,
      beats: usedSmartTimingFallback ? [] : beatMarkers,
      beatRegularity: beatAnalysis.beatRegularity,
    });
    const playbackRate = Number(
      getPlaybackRateForZone(effectiveStyle, zone.zone, audioClassification.type).toFixed(3)
    );
    const rankedSources = imageStoryMode
      ? []
      : rankSourcesForFlowMoment({
          sources: validSources,
          currentTime,
          timelineStart,
          previousCameraId,
          sourceActivityByCameraId,
          frameQualityByCameraId,
          recentCameraIds,
          zone,
          style: effectiveStyle,
          rescueProfile,
        });
    const selected = imageStoryMode
      ? {
          source: getImageStorySourceForSegment(validSources, segments.length, previousCameraId),
          sourceTime: 0,
          totalScore: 1,
        }
      : rankedSources[0] || {
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
        imageStoryMode
          ? zone.zone === "peak" || zone.zone === "high"
            ? "Driving a bold story-card change on the soundtrack's strongest push."
            : zone.zone === "build"
              ? "Rotating into the next story card as the soundtrack builds momentum."
              : zone.zone === "release"
                ? "Holding this story card a little longer so the pacing can breathe."
                : "Sequencing the image story smoothly against the soundtrack."
          :
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
    framingMap: applyRescuePolishToFramingMap(
      buildVideoFlowFramingMap(
        segments,
        audioClassification.type,
        styleId,
        intensityMode,
        auraTemplateId
      ),
      rescueProfile,
      audioClassification.type
    ),
    beatMarkers,
    energyZones,
    audioType: audioClassification.type,
    visualMode: imageStoryMode ? "image_story" : "video_flow",
    imageStoryTemplateId,
    auraTemplateId,
    audioDuration,
    loopsAudio: shouldLoopAudio,
    intensityMode,
    audioConfidence: audioClassification.confidence,
    audioExplanation: audioClassification.explanation,
    rescueMode: rescueProfile.active,
    rescueScore: rescueProfile.score,
    rescueStrategy: rescueProfile.strategy,
    rescueFinishMode: rescueProfile.finishMode,
    rescueSummary: rescueProfile.summary,
    rescuePolishSummary: rescueProfile.polishSummary,
    usedSmartTimingFallback,
    warning: rescueProfile.active
      ? rescueProfile.summary
      : imageStoryMode
        ? ""
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

const getSingleLensNarrativeRole = ({ zoneName, index, total, audioType }) => {
  const progress = total > 1 ? index / Math.max(1, total - 1) : 0;
  if (audioType === "choir") {
    if (zoneName === "peak" || zoneName === "high") return "crescendo";
    if (zoneName === "build") return "lift";
    if (progress < 0.22) return "invitation";
    if (progress > 0.78) return "afterglow";
    return "devotion";
  }
  if (audioType === "speech") {
    if (zoneName === "peak") return "payoff";
    if (zoneName === "high") return "claim";
    if (zoneName === "build") return "setup";
    if (progress < 0.2) return "hook";
    if (progress > 0.76) return "close";
    return "explain";
  }
  if (zoneName === "peak") return "payoff";
  if (zoneName === "high") return "impact";
  if (zoneName === "build") return "lift";
  if (progress < 0.18) return "hook";
  if (progress > 0.8) return "release";
  return "cruise";
};

const getSingleLensRoleReason = (role, audioType) => {
  switch (role) {
    case "hook":
      return "Opening tighter so the edit grabs attention early instead of waiting to wake up.";
    case "setup":
      return "Giving the thought a clean runway before the stronger beat lands.";
    case "claim":
      return "Punching into the part of the take that sounds most confident and worth believing.";
    case "payoff":
      return "Holding the strongest payoff beat so the edit feels earned, not rushed.";
    case "close":
      return "Landing the final thought with a calmer finish instead of cutting out cold.";
    case "crescendo":
      return "Riding the emotional rise so the lens feels pulled upward with the performance.";
    case "devotion":
      return "Staying reverent and close enough for the performance to breathe.";
    case "afterglow":
      return "Letting the emotional release linger after the crest instead of interrupting it.";
    case "lift":
      return audioType === "choir"
        ? "Building visual lift under the swelling part of the performance."
        : "Tightening the framing as the energy starts to climb.";
    case "impact":
      return "Leaning into the strongest beat of the take with more pressure and presence.";
    default:
      return "Shaping this one lens into a directed sequence instead of leaving it visually flat.";
  }
};

const getSingleLensNarrativeFraming = ({ role, zoneName, audioType, anchor, index }) => {
  const roleZoomMap = {
    hook: 1.24,
    setup: 1.08,
    explain: 1.12,
    claim: 1.28,
    payoff: 1.34,
    close: 1.1,
    devotion: 1.14,
    crescendo: 1.3,
    afterglow: 1.08,
    lift: 1.2,
    impact: 1.3,
    cruise: 1.12,
    release: 1.06,
    invitation: 1.1,
  };
  const roleFrameStyleMap = {
    hook: "glow",
    claim: "poster",
    payoff: "glow",
    crescendo: "cinematic",
    impact: "poster",
    afterglow: "soft",
    close: "soft",
  };
  const transitionRoleMap = {
    hook: "flash",
    claim: "sweep",
    payoff: "bloom",
    close: "drift",
    devotion: "drift",
    crescendo: "bloom",
    impact: "flash",
    lift: "lift",
  };
  const accentTone =
    audioType === "choir"
      ? "choir"
      : role === "claim" || role === "impact"
        ? "warm"
        : role === "payoff"
          ? "gold"
          : "cool";
  const baseZoom = roleZoomMap[role] || getSingleLensZoomForZone(zoneName, audioType);
  const driftX = anchor === "left" ? -0.014 : anchor === "right" ? 0.014 : 0;
  const driftY = role === "crescendo" ? -0.018 : role === "afterglow" ? 0.01 : 0;

  return {
    zoom: baseZoom,
    zoomAnchor: anchor,
    targetX: anchor === "left" ? 0.4 : anchor === "right" ? 0.6 : 0.5,
    targetY: audioType === "choir" ? (role === "crescendo" ? 0.41 : 0.45) : role === "payoff" ? 0.46 : 0.49,
    tilt: role === "impact" ? (index % 2 === 0 ? -1.2 : 1.1) : role === "hook" ? -0.6 : 0,
    translateX: driftX,
    translateY: driftY,
    brightness: role === "payoff" || role === "crescendo" ? 1.04 : 1,
    contrast: role === "claim" || role === "impact" ? 1.1 : role === "crescendo" ? 1.06 : 1.02,
    saturation: audioType === "choir" ? 1.04 : role === "impact" ? 1.12 : role === "hook" ? 1.06 : 1,
    glow: role === "payoff" ? 0.18 : role === "crescendo" ? 0.22 : role === "hook" ? 0.12 : 0.06,
    frameStyle: roleFrameStyleMap[role] || (audioType === "choir" ? "cinematic" : "soft"),
    transitionStyle: transitionRoleMap[role] || "cut",
    transitionStrength: role === "hook" || role === "impact" ? 0.72 : role === "payoff" || role === "crescendo" ? 0.66 : 0.28,
    accentTone,
  };
};

export const buildImageStoryFramingMap = (
  segments,
  audioType,
  templateId = "pulse-cards",
  auraTemplateId = FLOW_AURA_TEMPLATE_PRESETS[0].id
) => {
  const template = getImageStoryTemplatePreset(templateId);
  const aura = getFlowAuraPreset(auraTemplateId);
  const anchorSequence =
    audioType === "choir" && template.id === "magazine"
      ? ["center", "left", "center", "right", "center"]
      : template.anchorSequence;

  return (Array.isArray(segments) ? segments : []).reduce((accumulator, segment, index) => {
    const anchor = anchorSequence[index % anchorSequence.length];
    const zone = segment?.energyZone || "mid";
    const previousZone = segments[index - 1]?.energyZone || null;
    const nextZone = segments[index + 1]?.energyZone || null;
    const tilt = template.tiltSequence[index % template.tiltSequence.length] || 0;
    const drift = template.driftSequence[index % template.driftSequence.length] || { x: 0, y: 0 };
    const zoneZoomBoost =
      zone === "peak" ? 0.06 : zone === "high" ? 0.04 : zone === "release" ? -0.02 : 0;
    const transitionProfile = applyAuraToTransitionProfile(
      getTransitionProfileForSegment(
        zone,
        audioType,
        audioType === "choir" ? "cinematic" : "hype",
        previousZone,
        nextZone
      ),
      aura,
      zone
    );
    const baseFraming = {
      zoom: Number(
        (getSingleLensZoomForZone(zone, audioType) + template.motionBoost + zoneZoomBoost).toFixed(3)
      ),
      zoomAnchor: anchor,
      targetX:
        Number(
          (
            (anchor === "left" ? 0.38 : anchor === "right" ? 0.62 : 0.5) +
            drift.x
          ).toFixed(4)
        ),
      targetY:
        audioType === "choir"
          ? template.targetY.choir
          : zone === "peak"
            ? template.targetY.peak
            : template.targetY.default,
      tilt: Number(tilt.toFixed(3)),
      translateX: Number(drift.x.toFixed(4)),
      translateY: Number(drift.y.toFixed(4)),
      brightness: Number((1 + template.brightnessBoost + (zone === "peak" ? 0.03 : 0)).toFixed(3)),
      contrast: Number((1 + template.contrastBoost + (zone === "peak" ? 0.04 : 0)).toFixed(3)),
      saturation: Number(
        (
          1 +
          template.saturationBoost +
          (zone === "high" || zone === "peak" ? 0.04 : zone === "release" ? -0.02 : 0)
        ).toFixed(3)
      ),
      glow: Number((template.glowBoost + (zone === "peak" ? 0.1 : zone === "high" ? 0.05 : 0)).toFixed(3)),
      frameStyle: template.frameStyle,
    };
    accumulator[segment.id] = {
      ...applyAuraToFraming(baseFraming, aura, zone, audioType),
      ...transitionProfile,
    };
    return accumulator;
  }, {});
};

export const buildSingleLensAutoPlan = ({
  source,
  audioAnalysis,
  timelineDuration,
  auraTemplateId = FLOW_AURA_TEMPLATE_PRESETS[0].id,
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
  const sourcePixels =
    Math.max(1, Number(source?.videoWidth || 0)) * Math.max(1, Number(source?.videoHeight || 0));
  const sourceQualityEstimate = clampNumber(
    sourcePixels ? sourcePixels / (1920 * 1080) : 0.42,
    0.24,
    1,
    0.54
  );
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
  const aura = getFlowAuraPreset(auraTemplateId);
  const healingMode =
    sourceQualityEstimate < 0.38
      ? "phone_rescue"
      : sourceQualityEstimate < 0.54
        ? "gentle_heal"
      : audioClassification.type === "ambient"
        ? "story_heal"
        : audioClassification.type === "choir"
          ? "performance_lift"
          : "narrative_shape";
  const validZones = zones.filter(zone => Number(zone.endTime) - Number(zone.startTime) > 0.25);

  validZones.forEach((zone, index) => {
    const segmentDuration = Number((zone.endTime - zone.startTime).toFixed(3));
    if (segmentDuration <= 0.25) return;
    const id = `segment-${index + 1}`;
    const role = getSingleLensNarrativeRole({
      zoneName: zone.zone,
      index,
      total: validZones.length,
      audioType: audioClassification.type,
    });
    segments.push({
      id,
      cameraId: source.id,
      sourceStart: Number(zone.startTime.toFixed(3)),
      sourceEnd: Number(zone.endTime.toFixed(3)),
      timelineStart: Number(zone.startTime.toFixed(3)),
      timelineEnd: Number(zone.endTime.toFixed(3)),
      role,
      reason: getSingleLensRoleReason(role, audioClassification.type),
    });
    const zoomAnchor = anchorSequence[index % anchorSequence.length];
    const healedFraming = applyAuraToFraming(
      getSingleLensNarrativeFraming({
        role,
        zoneName: zone.zone,
        audioType: audioClassification.type,
        anchor: zoomAnchor,
        index,
      }),
      aura,
      zone.zone,
      audioClassification.type
    );
    framingMap[id] =
      healingMode === "phone_rescue"
        ? {
            ...healedFraming,
            zoom: Number(clampNumber((healedFraming.zoom || 1) - 0.045, 0.94, 1.24, healedFraming.zoom).toFixed(3)),
            tilt: Number((Number(healedFraming.tilt || 0) * 0.32).toFixed(3)),
            translateX: Number((Number(healedFraming.translateX || 0) * 0.42).toFixed(4)),
            translateY: Number((Number(healedFraming.translateY || 0) * 0.46).toFixed(4)),
            brightness: Number(clampNumber((healedFraming.brightness || 1) + 0.04, 0.96, 1.18, healedFraming.brightness).toFixed(3)),
            contrast: Number(clampNumber((healedFraming.contrast || 1) + 0.07, 0.96, 1.38, healedFraming.contrast).toFixed(3)),
            saturation: Number(clampNumber((healedFraming.saturation || 1) + 0.035, 0.86, 1.28, healedFraming.saturation).toFixed(3)),
            glow: Number(clampNumber((healedFraming.glow || 0) + 0.12, 0, 0.54, healedFraming.glow).toFixed(3)),
            frameStyle: "soft",
            transitionStrength: Number(
              clampNumber((healedFraming.transitionStrength || 0.2) * 0.72, 0.1, 0.72, healedFraming.transitionStrength).toFixed(3)
            ),
          }
        : healingMode === "performance_lift"
          ? {
              ...healedFraming,
              zoom: Number(clampNumber((healedFraming.zoom || 1) + 0.025, 1, 1.36, healedFraming.zoom).toFixed(3)),
              targetY: Number(clampNumber((healedFraming.targetY || 0.45) - 0.02, 0.36, 0.48, healedFraming.targetY).toFixed(4)),
              brightness: Number(clampNumber((healedFraming.brightness || 1) + 0.03, 0.98, 1.2, healedFraming.brightness).toFixed(3)),
              contrast: Number(clampNumber((healedFraming.contrast || 1) + 0.04, 0.96, 1.42, healedFraming.contrast).toFixed(3)),
              saturation: Number(clampNumber((healedFraming.saturation || 1) + 0.03, 0.9, 1.34, healedFraming.saturation).toFixed(3)),
              glow: Number(clampNumber((healedFraming.glow || 0) + 0.1, 0, 0.66, healedFraming.glow).toFixed(3)),
              frameStyle: "cinematic",
              transitionStrength: Number(
                clampNumber((healedFraming.transitionStrength || 0.3) + 0.06, 0.14, 0.9, healedFraming.transitionStrength).toFixed(3)
              ),
            }
        : healingMode === "gentle_heal"
        ? {
            ...healedFraming,
            zoom: Number(clampNumber((healedFraming.zoom || 1) - 0.025, 0.96, 1.3, healedFraming.zoom).toFixed(3)),
            tilt: Number((Number(healedFraming.tilt || 0) * 0.45).toFixed(3)),
            translateX: Number((Number(healedFraming.translateX || 0) * 0.58).toFixed(4)),
            translateY: Number((Number(healedFraming.translateY || 0) * 0.62).toFixed(4)),
            contrast: Number(clampNumber((healedFraming.contrast || 1) + 0.05, 0.94, 1.42, healedFraming.contrast).toFixed(3)),
            saturation: Number(clampNumber((healedFraming.saturation || 1) + 0.02, 0.84, 1.34, healedFraming.saturation).toFixed(3)),
            glow: Number(clampNumber((healedFraming.glow || 0) + 0.08, 0, 0.58, healedFraming.glow).toFixed(3)),
            frameStyle: healedFraming.frameStyle === "glow" ? "soft" : healedFraming.frameStyle,
            transitionStrength: Number(
              clampNumber((healedFraming.transitionStrength || 0.2) * 0.8, 0.12, 0.8, healedFraming.transitionStrength).toFixed(3)
            ),
          }
        : healedFraming;
  });

  const summary =
    healingMode === "phone_rescue"
      ? "Auto Shape is in phone rescue mode. It is smoothing harsh handheld energy, cleaning the frame, and giving rough mobile footage a more premium social finish."
      : healingMode === "performance_lift"
        ? "Auto Shape is in performance lift mode. It is giving the take more rise, glow, and reverence so the big emotional moments feel elevated."
      : healingMode === "gentle_heal"
      ? "Auto Shape is in healing mode. It is calming rough motion, polishing softer footage, and turning one camera into a cleaner premium-looking edit."
      : audioClassification.type === "ambient"
        ? "Bring your boring audio. Auto Shape is designing contrast, punch-ins, and breathing room from a flat soundtrack."
        : audioClassification.type === "choir"
          ? "Auto Shape is following crescendos, devotion beats, and afterglow moments to build a performance-led single-lens cut."
          : `Auto Shape built a ${audioClassification.type}-aware single-lens cut with hook, claim, payoff, and close beats instead of generic zooms.`;

  return {
    segments,
    framingMap,
    audioType: audioClassification.type,
    healingMode,
    summary,
  };
};

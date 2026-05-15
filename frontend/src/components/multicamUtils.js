export const MULTICAM_MAX_SOURCES = 6;
export const MULTICAM_MIN_SOURCES = 2;
export const DEFAULT_SWITCH_INTERVAL = 3;
export const DEFAULT_IMAGE_SEGMENT_DURATION = 4.5;
export const MULTICAM_CAMERA_COLORS = [
  "#f97316",
  "#38bdf8",
  "#34d399",
  "#a78bfa",
  "#fb7185",
  "#facc15",
];

export const clampNumber = (value, minimum, maximum, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
};

const averageValues = values =>
  Array.isArray(values) && values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export const DEFAULT_SEGMENT_FRAMING = Object.freeze({
  zoom: 1,
  zoomAnchor: "center",
  targetX: null,
  targetY: null,
  tilt: 0,
  translateX: 0,
  translateY: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  glow: 0,
  frameStyle: "none",
  transitionStyle: "cut",
  transitionStrength: 0,
  accentTone: "cool",
});

export const formatDurationLabel = seconds => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds - hours * 3600 - minutes * 60;

  if (hours > 0) {
    const wholeSeconds = Math.floor(remainder);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
};

export const normalizeSourceLabel = (label, index) => {
  const text = String(label || "").trim();
  return text || `Camera ${index + 1}`;
};

const getAnchorTargetX = zoomAnchor => {
  if (zoomAnchor === "left") return 0.32;
  if (zoomAnchor === "right") return 0.68;
  return 0.5;
};

const resolveOptionalUnitPoint = (value, minimum, maximum, fallback) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return clampNumber(value, minimum, maximum, fallback);
};

export const getSegmentFocusPoint = framing => {
  const safeFraming = framing || DEFAULT_SEGMENT_FRAMING;
  const x = resolveOptionalUnitPoint(
    safeFraming.targetX,
    0.05,
    0.95,
    getAnchorTargetX(safeFraming.zoomAnchor || "center")
  );
  const y = resolveOptionalUnitPoint(safeFraming.targetY, 0.08, 0.92, 0.5);

  return { x, y };
};

export const normalizeSegmentFraming = framing => {
  const safeFraming = { ...DEFAULT_SEGMENT_FRAMING, ...(framing || {}) };
  const zoomAnchor = ["left", "center", "right"].includes(safeFraming.zoomAnchor)
    ? safeFraming.zoomAnchor
    : "center";
  const { x, y } = getSegmentFocusPoint({
    ...safeFraming,
    zoomAnchor,
  });

  return {
    zoom: clampNumber(safeFraming.zoom, 1, 2.4, 1),
    zoomAnchor,
    targetX: Number(x.toFixed(4)),
    targetY: Number(y.toFixed(4)),
    tilt: Number(clampNumber(safeFraming.tilt, -8, 8, 0).toFixed(3)),
    translateX: Number(clampNumber(safeFraming.translateX, -0.18, 0.18, 0).toFixed(4)),
    translateY: Number(clampNumber(safeFraming.translateY, -0.18, 0.18, 0).toFixed(4)),
    brightness: Number(clampNumber(safeFraming.brightness, 0.82, 1.28, 1).toFixed(3)),
    contrast: Number(clampNumber(safeFraming.contrast, 0.82, 1.34, 1).toFixed(3)),
    saturation: Number(clampNumber(safeFraming.saturation, 0.78, 1.45, 1).toFixed(3)),
    glow: Number(clampNumber(safeFraming.glow, 0, 1, 0).toFixed(3)),
    frameStyle: ["none", "soft", "glow", "poster", "cinematic"].includes(safeFraming.frameStyle)
      ? safeFraming.frameStyle
      : "none",
    transitionStyle: ["cut", "flash", "bloom", "sweep", "lift", "drift"].includes(
      safeFraming.transitionStyle
    )
      ? safeFraming.transitionStyle
      : "cut",
    transitionStrength: Number(clampNumber(safeFraming.transitionStrength, 0, 1, 0).toFixed(3)),
    accentTone: ["cool", "warm", "rose", "gold", "choir"].includes(safeFraming.accentTone)
      ? safeFraming.accentTone
      : "cool",
  };
};

export const getSegmentTransformOrigin = framing => {
  const focusPoint = getSegmentFocusPoint(framing);
  return `${(focusPoint.x * 100).toFixed(2)}% ${(focusPoint.y * 100).toFixed(2)}%`;
};

export const getCameraColor = (cameraId, sources) => {
  const sourceIndex = sources.findIndex(source => source.id === cameraId);
  return MULTICAM_CAMERA_COLORS[sourceIndex >= 0 ? sourceIndex % MULTICAM_CAMERA_COLORS.length : 0];
};

export const buildInitialSources = primaryFile => [
  {
    id: "cam-1",
    label: "Camera 1",
    file: primaryFile || null,
    mediaKind: String(primaryFile?.type || "").startsWith("image/") ? "image" : "video",
    url: primaryFile?.url || "",
    previewUrl:
      !primaryFile?.isRemote && typeof URL !== "undefined" && primaryFile instanceof Blob
        ? URL.createObjectURL(primaryFile)
        : "",
    offsetSeconds: 0,
    duration: String(primaryFile?.type || "").startsWith("image/") ? DEFAULT_IMAGE_SEGMENT_DURATION : 0,
    uploadedUrl: primaryFile?.isRemote ? primaryFile.url : "",
  },
  {
    id: "cam-2",
    label: "Camera 2",
    file: null,
    mediaKind: "video",
    url: "",
    previewUrl: "",
    offsetSeconds: 0,
    duration: 0,
    uploadedUrl: "",
  },
];

export const getSourceDurationBounds = sources => {
  const validSources = sources.filter(
    source => Number.isFinite(Number(source?.duration)) && Number(source.duration) > 0
  );
  if (validSources.length < 2) {
    return {
      overlapStart: 0,
      overlapEnd: 0,
      overlapDuration: 0,
      canRender: false,
    };
  }

  const overlapStart = Math.max(...validSources.map(source => Number(source.offsetSeconds) || 0));
  const overlapEnd = Math.min(
    ...validSources.map(
      source => (Number(source.offsetSeconds) || 0) + Number(source.duration || 0)
    )
  );
  const overlapDuration = Math.max(0, overlapEnd - overlapStart);

  return {
    overlapStart,
    overlapEnd,
    overlapDuration,
    canRender: overlapDuration > 0.25,
  };
};

export const getMasterTimelineBounds = sources => {
  const validSources = sources.filter(
    source => Number.isFinite(Number(source?.duration)) && Number(source.duration) > 0
  );

  if (!validSources.length) {
    return {
      timelineStart: 0,
      timelineEnd: 0,
      timelineDuration: 0,
      canPreview: false,
    };
  }

  const timelineStart = Math.min(
    0,
    ...validSources.map(source => Number(source.offsetSeconds) || 0)
  );
  const timelineEnd = Math.max(
    ...validSources.map(
      source => (Number(source.offsetSeconds) || 0) + Number(source.duration || 0)
    )
  );
  const timelineDuration = Math.max(0, timelineEnd - timelineStart);

  return {
    timelineStart,
    timelineEnd,
    timelineDuration,
    canPreview: timelineDuration > 0.25,
  };
};

const getSourceById = (sources, cameraId) => sources.find(source => source.id === cameraId) || null;

const getSegmentCoverageDuration = segment => {
  const sourceDuration = Number(segment?.sourceEnd) - Number(segment?.sourceStart);
  const timelineDuration = Number(segment?.timelineEnd) - Number(segment?.timelineStart);
  const fallback = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : 0;
  return clampNumber(timelineDuration, 0.05, 60 * 60 * 4, fallback || 0.05);
};

const buildSafeSegment = (segment, source, index, timelineCursor) => {
  const sourceDuration = Number(source?.duration) || 0;
  const safeDuration = clampNumber(
    getSegmentCoverageDuration(segment),
    0.05,
    sourceDuration || 60 * 60 * 4,
    0.05
  );
  const requestedSourceStart = Number(segment?.sourceStart);
  const maxSourceStart = Math.max(0, sourceDuration - safeDuration);
  const sourceStart = clampNumber(
    Number.isFinite(requestedSourceStart) ? requestedSourceStart : 0,
    0,
    maxSourceStart,
    0
  );
  const sourceEnd = Number((sourceStart + safeDuration).toFixed(3));
  const timelineStart = Number(timelineCursor.toFixed(3));
  const timelineEnd = Number((timelineCursor + safeDuration).toFixed(3));

  return {
    id: segment?.id || `segment-${index + 1}`,
    cameraId: source?.id || "cam-1",
    sourceStart: Number(sourceStart.toFixed(3)),
    sourceEnd,
    timelineStart,
    timelineEnd,
  };
};

export const normalizeSegments = (segments, sources, timelineDuration = null) => {
  const validSources = sources.filter(
    source => Number.isFinite(Number(source?.duration)) && Number(source.duration) > 0
  );
  if (!validSources.length) return [];

  const sourceMap = new Map(validSources.map(source => [source.id, source]));
  const fallbackSource = validSources[0];
  const orderedSegments = (Array.isArray(segments) ? segments : [])
    .map((segment, index) => ({
      ...segment,
      __order: Number.isFinite(Number(segment?.timelineStart))
        ? Number(segment.timelineStart)
        : index,
    }))
    .sort((left, right) => left.__order - right.__order);

  let timelineCursor = 0;
  const normalized = orderedSegments
    .map((segment, index) => {
      const source = sourceMap.get(segment?.cameraId) || fallbackSource;
      if (!source) return null;
      const nextSegment = buildSafeSegment(segment, source, index, timelineCursor);
      timelineCursor = nextSegment.timelineEnd;
      return nextSegment;
    })
    .filter(Boolean);

  if (!normalized.length) {
    if (Number.isFinite(Number(timelineDuration)) && Number(timelineDuration) > 0) {
      const duration = Number(timelineDuration.toFixed(3));
      return [
        {
          id: "segment-1",
          cameraId: fallbackSource.id,
          sourceStart: 0,
          sourceEnd: Math.min(Number((fallbackSource.duration || duration).toFixed(3)), duration),
          timelineStart: 0,
          timelineEnd: duration,
          isLockedStart: true,
        },
      ];
    }
    return [];
  }

  if (
    Number.isFinite(Number(timelineDuration)) &&
    Number(timelineDuration) > 0 &&
    normalized.length &&
    normalized[normalized.length - 1].timelineEnd > Number(timelineDuration)
  ) {
    const safeDuration = Number(timelineDuration);
    return normalizeSegments(
      normalized
        .map(segment => ({ ...segment }))
        .reduce((result, segment) => {
          if (result.length && result[result.length - 1].timelineEnd >= safeDuration) {
            return result;
          }
          const remaining = safeDuration - segment.timelineStart;
          if (remaining <= 0.05) {
            return result;
          }
          const duration = Math.min(segment.timelineEnd - segment.timelineStart, remaining);
          result.push({
            ...segment,
            sourceEnd: Number((segment.sourceStart + duration).toFixed(3)),
            timelineEnd: Number((segment.timelineStart + duration).toFixed(3)),
          });
          return result;
        }, []),
      validSources,
      null
    );
  }

  return normalized;
};

export const buildDefaultSegments = (sources, timelineDuration = null) => {
  const validSources = sources.filter(
    source => Number.isFinite(Number(source?.duration)) && Number(source.duration) > 0
  );
  if (!validSources.length) return [];

  const masterDuration =
    Number.isFinite(Number(timelineDuration)) && Number(timelineDuration) > 0
      ? Number(timelineDuration)
      : getMasterTimelineBounds(validSources).timelineDuration;

  const fallbackSource = validSources[0];
  const fallbackDuration = Math.max(
    0.05,
    Math.min(masterDuration || fallbackSource.duration, fallbackSource.duration)
  );

  return normalizeSegments(
    [
      {
        id: "segment-1",
        cameraId: fallbackSource.id,
        sourceStart: 0,
        sourceEnd: fallbackDuration,
        timelineStart: 0,
        timelineEnd: fallbackDuration,
      },
    ],
    validSources,
    masterDuration
  );
};

export const buildSegmentsFromSwitches = (
  switches,
  sources,
  overlapStart,
  overlapDuration,
  timelineStart = 0
) => {
  const normalizedSwitches = normalizeSwitches(switches, sources, overlapDuration);
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const segments = [];

  for (let index = 0; index < normalizedSwitches.length; index += 1) {
    const current = normalizedSwitches[index];
    const next = normalizedSwitches[index + 1];
    const segmentStart = current.startTime;
    const segmentEnd = next ? next.startTime : overlapDuration;
    const source = sourceMap.get(current.cameraId);
    if (!source || segmentEnd <= segmentStart + 0.02) continue;

    const sourceOffset = Number(source.offsetSeconds) || 0;
    const sourceStart = overlapStart + segmentStart - sourceOffset;
    const sourceEnd = overlapStart + segmentEnd - sourceOffset;

    segments.push({
      id: `segment-${index + 1}`,
      cameraId: current.cameraId,
      sourceStart: Number(sourceStart.toFixed(3)),
      sourceEnd: Number(sourceEnd.toFixed(3)),
      timelineStart: Number((timelineStart + segmentStart).toFixed(3)),
      timelineEnd: Number((timelineStart + segmentEnd).toFixed(3)),
    });
  }

  return normalizeSegments(segments, sources, timelineStart + overlapDuration);
};

export const buildSwitchesFromSegments = segments =>
  normalizeSegments(
    segments,
    segments.map(segment => ({ id: segment.cameraId, duration: 99999 }))
  ).map(segment => ({
    id: segment.id,
    cameraId: segment.cameraId,
    startTime: Number(segment.timelineStart.toFixed(3)),
  }));

export const mapTimelineTimeToSourceTime = (segment, timelineTime) => {
  if (!segment) return null;
  const safeTimelineTime = Number(timelineTime) || 0;
  if (
    safeTimelineTime < Number(segment.timelineStart) ||
    safeTimelineTime > Number(segment.timelineEnd)
  ) {
    return null;
  }
  return Number(
    (Number(segment.sourceStart) + (safeTimelineTime - Number(segment.timelineStart))).toFixed(3)
  );
};

export const getActiveSegmentAtTime = (segments, timelineTime) => {
  const normalized = Array.isArray(segments) ? segments : [];
  const safeTime = Number(timelineTime) || 0;
  const current = normalized.find(
    segment => safeTime >= Number(segment.timelineStart) && safeTime < Number(segment.timelineEnd)
  );
  return current || normalized[normalized.length - 1] || null;
};

export const buildSegmentDisplaySegments = (segments, sources, timelineDuration) => {
  const safeDuration = Math.max(0.01, Number(timelineDuration) || 0.01);
  return normalizeSegments(segments, sources, timelineDuration).map((segment, index) => ({
    ...segment,
    label: getSourceById(sources, segment.cameraId)?.label || segment.cameraId,
    color: getCameraColor(segment.cameraId, sources),
    duration: Number((segment.timelineEnd - segment.timelineStart).toFixed(3)),
    startPercent: (Number(segment.timelineStart) / safeDuration) * 100,
    widthPercent:
      ((Number(segment.timelineEnd) - Number(segment.timelineStart)) / safeDuration) * 100,
    isLockedStart: index === 0,
  }));
};

export const splitSegmentAtTimelineTime = (
  segments,
  sources,
  segmentId,
  splitTime,
  timelineDuration
) => {
  const currentSegments = normalizeSegments(segments, sources, timelineDuration);
  const target = currentSegments.find(segment => segment.id === segmentId);
  if (!target) return currentSegments;

  const safeSplit = clampNumber(
    splitTime,
    target.timelineStart + 0.05,
    target.timelineEnd - 0.05,
    target.timelineStart
  );
  if (safeSplit <= target.timelineStart + 0.04 || safeSplit >= target.timelineEnd - 0.04) {
    return currentSegments;
  }

  const splitOffset = safeSplit - target.timelineStart;
  return normalizeSegments(
    currentSegments.flatMap(segment => {
      if (segment.id !== segmentId) return [segment];
      return [
        {
          ...segment,
          id: `${segment.id}-a`,
          sourceEnd: Number((segment.sourceStart + splitOffset).toFixed(3)),
          timelineEnd: Number(safeSplit.toFixed(3)),
        },
        {
          ...segment,
          id: `${segment.id}-b`,
          sourceStart: Number((segment.sourceStart + splitOffset).toFixed(3)),
          timelineStart: Number(safeSplit.toFixed(3)),
        },
      ];
    }),
    sources,
    timelineDuration
  );
};

export const reorderSegments = (segments, sourceIndex, targetIndex, sources, timelineDuration) => {
  const normalized = normalizeSegments(segments, sources, timelineDuration);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= normalized.length ||
    targetIndex >= normalized.length
  ) {
    return normalized;
  }

  const next = [...normalized];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return normalizeSegments(next, sources, timelineDuration);
};

export const normalizeSwitches = (switches, sources, overlapDuration) => {
  const validIds = new Set(sources.map(source => source.id));
  const safeDuration = Math.max(0, Number(overlapDuration) || 0);

  const normalized = (Array.isArray(switches) ? switches : [])
    .map((item, index) => ({
      id: item?.id || `switch-${index + 1}`,
      cameraId: validIds.has(item?.cameraId) ? item.cameraId : sources[0]?.id || "cam-1",
      startTime: clampNumber(item?.startTime, 0, safeDuration, 0),
    }))
    .sort((left, right) => left.startTime - right.startTime);

  if (!normalized.length || normalized[0].startTime > 0.001) {
    normalized.unshift({
      id: normalized[0]?.id === "switch-1" ? "switch-0" : "switch-1",
      cameraId: sources[0]?.id || "cam-1",
      startTime: 0,
    });
  }

  const deduped = [];
  for (const item of normalized) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(last.startTime - item.startTime) < 0.01) {
      deduped[deduped.length - 1] = item;
      continue;
    }
    deduped.push(item);
  }

  return deduped.map((item, index) => ({
    ...item,
    id: item.id || `switch-${index + 1}`,
  }));
};

export const buildRenderSegments = (switches, sources, overlapStart, overlapDuration) => {
  return buildSegmentsFromSwitches(switches, sources, overlapStart, overlapDuration)
    .map(segment => ({
      ...segment,
      sourceLabel: getSourceById(sources, segment.cameraId)?.label || segment.cameraId,
      startTime: segment.timelineStart,
      endTime: segment.timelineEnd,
      duration: Number((segment.timelineEnd - segment.timelineStart).toFixed(3)),
      url:
        getSourceById(sources, segment.cameraId)?.uploadedUrl ||
        getSourceById(sources, segment.cameraId)?.url ||
        getSourceById(sources, segment.cameraId)?.previewUrl ||
        "",
    }))
    .filter(segment => segment.url && segment.duration > 0.02);
};

export const buildSwitchDisplaySegments = (switches, sources, overlapDuration) => {
  const normalized = normalizeSwitches(switches, sources, overlapDuration);
  const safeDuration = Math.max(0.01, Number(overlapDuration) || 0.01);

  return normalized.map((item, index) => {
    const next = normalized[index + 1];
    const endTime = next ? next.startTime : safeDuration;
    const duration = Math.max(0, endTime - item.startTime);
    return {
      id: item.id,
      cameraId: item.cameraId,
      label: sources.find(source => source.id === item.cameraId)?.label || item.cameraId,
      startTime: item.startTime,
      endTime,
      duration,
      startPercent: (item.startTime / safeDuration) * 100,
      widthPercent: (duration / safeDuration) * 100,
      color: getCameraColor(item.cameraId, sources),
      isLockedStart: index === 0,
    };
  });
};

export const getActiveCameraAtTime = (switches, sources, previewTime, overlapDuration) => {
  const displaySegments = buildSwitchDisplaySegments(switches, sources, overlapDuration);
  const current = displaySegments.find(
    segment => previewTime >= segment.startTime && previewTime < segment.endTime
  );
  return current || displaySegments[displaySegments.length - 1] || null;
};

export const getSourceTimelineTimeAtPlayhead = (source, playhead, timelineStart = 0) => {
  const offsetSeconds = Number(source?.offsetSeconds) || 0;
  return Number(
    ((Number(playhead) || 0) + (Number(timelineStart) || 0) - offsetSeconds).toFixed(3)
  );
};

export const isSourceAvailableAtTime = (source, sourceTime) => {
  const duration = Number(source?.duration) || 0;
  return Number.isFinite(sourceTime) && sourceTime >= 0 && sourceTime <= duration - 0.01;
};

export const getAutoSwitchIntervalForAggressiveness = (
  intervalSeconds,
  aggressiveness = "balanced"
) => {
  const normalized = String(aggressiveness || "balanced")
    .trim()
    .toLowerCase();
  const step = clampNumber(intervalSeconds, 1, 10, DEFAULT_SWITCH_INTERVAL);

  if (normalized === "low" || normalized === "steady") {
    return clampNumber(step * 1.35, 1, 12, step);
  }
  if (normalized === "high" || normalized === "dynamic") {
    return clampNumber(step * 0.72, 0.75, 10, step);
  }
  return step;
};

const getContinuityBonusForAggressiveness = aggressiveness => {
  const normalized = String(aggressiveness || "balanced")
    .trim()
    .toLowerCase();

  if (normalized === "low" || normalized === "steady") {
    return 0.22;
  }
  if (normalized === "high" || normalized === "dynamic") {
    return 0.05;
  }
  return 0.12;
};

const getAudioActivityScoreAtTime = (profile, targetTime, windowSeconds) => {
  if (!Array.isArray(profile) || !profile.length) {
    return 0;
  }

  const nearbyEntries = profile.filter(entry => {
    const sampleTime = Number(entry?.time);
    return Number.isFinite(sampleTime) && Math.abs(sampleTime - targetTime) <= windowSeconds;
  });

  if (nearbyEntries.length) {
    const total = nearbyEntries.reduce((sum, entry) => sum + clampNumber(entry?.score, 0, 1, 0), 0);
    return total / nearbyEntries.length;
  }

  const nearest = profile.reduce((best, entry) => {
    const sampleTime = Number(entry?.time);
    if (!Number.isFinite(sampleTime)) return best;
    if (!best) return entry;
    return Math.abs(sampleTime - targetTime) < Math.abs(Number(best.time) - targetTime)
      ? entry
      : best;
  }, null);

  return clampNumber(nearest?.score, 0, 1, 0);
};

const getEnvelopeAudioActivityScoreAtTime = (analysis, sourceTime, windowSeconds) => {
  if (!Array.isArray(analysis?.envelope) || !analysis.envelope.length) {
    return 0;
  }

  const secondsPerBin = clampNumber(analysis?.secondsPerBin, 0.01, 10, 0.05);
  const centerIndex = Math.round((Number(sourceTime) || 0) / secondsPerBin);
  const windowBins = Math.max(1, Math.round((windowSeconds || 0.4) / secondsPerBin));
  const startIndex = Math.max(0, centerIndex - windowBins);
  const endIndex = Math.min(analysis.envelope.length - 1, centerIndex + windowBins);

  let total = 0;
  let count = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    total += clampNumber(analysis.envelope[index], 0, 1, 0);
    count += 1;
  }

  return count ? total / count : 0;
};

export const getAudioActivityScoreForSourceTime = (
  analysisOrProfile,
  sourceTime,
  windowSeconds = 0.4
) => {
  if (!Number.isFinite(Number(sourceTime))) return 0;
  if (Array.isArray(analysisOrProfile)) {
    return getAudioActivityScoreAtTime(analysisOrProfile, Number(sourceTime), windowSeconds);
  }
  return getEnvelopeAudioActivityScoreAtTime(analysisOrProfile, Number(sourceTime), windowSeconds);
};

export const pickCompanionCameraAtTime = (
  sources,
  activeCameraId,
  playhead,
  timelineStart = 0,
  audioActivityBySource = {}
) => {
  const validSources = (Array.isArray(sources) ? sources : []).filter(
    source => source?.id && (source.url || source.previewUrl || source.uploadedUrl)
  );
  if (!activeCameraId || validSources.length <= 1) return null;

  const candidates = validSources
    .filter(source => source.id !== activeCameraId)
    .map(source => {
      const sourceTime = getSourceTimelineTimeAtPlayhead(source, playhead, timelineStart);
      if (!isSourceAvailableAtTime(source, sourceTime)) return null;

      return {
        cameraId: source.id,
        sourceTime,
        score: getAudioActivityScoreForSourceTime(audioActivityBySource?.[source.id], sourceTime),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return candidates[0] || null;
};

const rankAvailableSourcesAtTime = (
  sources,
  activeCameraId,
  playhead,
  timelineStart = 0,
  audioActivityBySource = {}
) => {
  const validSources = (Array.isArray(sources) ? sources : []).filter(
    source => source?.id && (source.url || source.previewUrl || source.uploadedUrl)
  );

  return validSources
    .map(source => {
      const sourceTime = getSourceTimelineTimeAtPlayhead(source, playhead, timelineStart);
      if (!isSourceAvailableAtTime(source, sourceTime)) return null;

      const score = getAudioActivityScoreForSourceTime(
        audioActivityBySource?.[source.id],
        sourceTime
      );
      const isPrimary = source.id === activeCameraId;
      return {
        cameraId: source.id,
        sourceTime,
        score,
        isPrimary,
        rankScore: score + (isPrimary ? 0.08 : 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.rankScore !== left.rankScore) return right.rankScore - left.rankScore;
      if (left.isPrimary) return -1;
      if (right.isPrimary) return 1;
      return right.score - left.score;
    });
};

export const resolveSmartMulticamLayoutAtTime = (
  sources,
  activeCameraId,
  playhead,
  timelineStart = 0,
  audioActivityBySource = {},
  preferredMode = "smart"
) => {
  const normalizedMode = String(preferredMode || "smart")
    .trim()
    .toLowerCase();
  const validSources = (Array.isArray(sources) ? sources : []).filter(
    source => source?.id && (source.url || source.previewUrl || source.uploadedUrl)
  );
  const activeSource = validSources.find(source => source.id === activeCameraId) || null;
  const rankedAvailableSources = rankAvailableSourcesAtTime(
    validSources,
    activeCameraId,
    playhead,
    timelineStart,
    audioActivityBySource
  );
  const companion =
    rankedAvailableSources.find(source => source.cameraId !== activeCameraId) || null;
  const activeSourceTime = activeSource
    ? getSourceTimelineTimeAtPlayhead(activeSource, playhead, timelineStart)
    : null;
  const activeScore = getAudioActivityScoreForSourceTime(
    audioActivityBySource?.[activeCameraId],
    activeSourceTime
  );

  const base = {
    layoutMode: "cut",
    primaryCameraId: activeCameraId || validSources[0]?.id || null,
    secondaryCameraId: null,
    visibleCameraIds: [activeCameraId || validSources[0]?.id].filter(Boolean),
    activeScore,
    secondaryScore: companion?.score || 0,
    reason: companion ? "primary_focus" : "no_companion",
  };

  if (!companion) {
    return base;
  }

  if (normalizedMode === "split" || normalizedMode === "split-vertical") {
    return {
      ...base,
      layoutMode: "split-vertical",
      secondaryCameraId: companion.cameraId,
      secondaryScore: companion.score,
      reason: "manual_split",
    };
  }

  if (normalizedMode === "pip") {
    return {
      ...base,
      layoutMode: "pip",
      secondaryCameraId: companion.cameraId,
      secondaryScore: companion.score,
      reason: "manual_pip",
    };
  }

  if (normalizedMode === "scene-grid" || normalizedMode === "grid" || normalizedMode === "matrix") {
    const visibleCameraIds = rankedAvailableSources.slice(0, 6).map(source => source.cameraId);
    if (visibleCameraIds.length >= 3) {
      return {
        ...base,
        layoutMode: "scene-grid",
        secondaryCameraId: visibleCameraIds[1] || null,
        visibleCameraIds,
        secondaryScore: rankedAvailableSources[1]?.score || 0,
        reason: "manual_ensemble",
      };
    }
  }

  if (normalizedMode === "cut") {
    return base;
  }

  const topEnsemble = rankedAvailableSources.slice(0, Math.min(6, rankedAvailableSources.length));
  const ensembleAverage = topEnsemble.length
    ? topEnsemble.reduce((sum, source) => sum + source.score, 0) / topEnsemble.length
    : 0;
  const livelySources = rankedAvailableSources.filter(source => source.score >= 0.16);

  if (
    rankedAvailableSources.length >= 3 &&
    (livelySources.length >= 3 || ensembleAverage >= 0.18)
  ) {
    const visibleCameraIds = rankedAvailableSources.slice(0, 6).map(source => source.cameraId);
    return {
      ...base,
      layoutMode: "scene-grid",
      secondaryCameraId: visibleCameraIds[1] || null,
      visibleCameraIds,
      secondaryScore: rankedAvailableSources[1]?.score || 0,
      reason: "ensemble_peak",
    };
  }

  if (activeScore >= 0.35 && companion.score >= 0.35) {
    return {
      ...base,
      layoutMode: "split-vertical",
      secondaryCameraId: companion.cameraId,
      visibleCameraIds: [base.primaryCameraId, companion.cameraId].filter(Boolean),
      secondaryScore: companion.score,
      reason: "shared_energy",
    };
  }

  if (companion.score >= 0.48) {
    return {
      ...base,
      layoutMode: "pip",
      secondaryCameraId: companion.cameraId,
      visibleCameraIds: [base.primaryCameraId, companion.cameraId].filter(Boolean),
      secondaryScore: companion.score,
      reason: "reaction_insert",
    };
  }

  return base;
};

export const buildAutoSwitchPlan = (
  sources,
  overlapDuration,
  intervalSeconds = DEFAULT_SWITCH_INTERVAL,
  aggressiveness = "balanced",
  audioActivityBySource = {}
) => {
  const validSources = sources.filter(
    source => source.url || source.previewUrl || source.uploadedUrl
  );
  const safeDuration = Math.max(0, Number(overlapDuration) || 0);
  const step = getAutoSwitchIntervalForAggressiveness(intervalSeconds, aggressiveness);
  const continuityBonus = getContinuityBonusForAggressiveness(aggressiveness);
  const audioWindow = Math.max(0.35, Math.min(1.5, step * 0.6));
  const hasAudioGuidance = validSources.some(source => {
    const profile = audioActivityBySource?.[source.id];
    return Array.isArray(profile) && profile.length;
  });

  if (!validSources.length || safeDuration <= 0) return [];

  const switches = [];
  let currentTime = 0;
  let index = 0;
  let previousCameraId = null;
  while (currentTime < safeDuration - 0.01) {
    let cameraId = validSources[index % validSources.length].id;

    if (hasAudioGuidance) {
      const scoreTime = currentTime;
      const previousId = previousCameraId;
      const bestSource = validSources.reduce((best, source) => {
        const activityScore = getAudioActivityScoreAtTime(
          audioActivityBySource?.[source.id],
          scoreTime,
          audioWindow
        );
        const continuityScore = source.id === previousId ? continuityBonus : 0;
        const totalScore = activityScore + continuityScore;

        if (!best || totalScore > best.totalScore + 0.0001) {
          return { source, totalScore, activityScore };
        }

        if (
          best &&
          Math.abs(totalScore - best.totalScore) <= 0.0001 &&
          activityScore > best.activityScore
        ) {
          return { source, totalScore, activityScore };
        }

        return best;
      }, null);

      if (bestSource?.source?.id) {
        cameraId = bestSource.source.id;
      }
    }

    switches.push({
      id: `switch-${switches.length + 1}`,
      cameraId,
      startTime: Number(currentTime.toFixed(3)),
    });
    previousCameraId = cameraId;
    currentTime += step;
    index += 1;
  }

  return normalizeSwitches(switches, validSources, safeDuration);
};

const getAutoDirectorProfile = (directorStyleId, intensityMode = "standard") => {
  let profile;
  switch (String(directorStyleId || "interview").trim().toLowerCase()) {
    case "podcast":
      profile = {
        minHold: 2.8,
        maxHold: 5.4,
        switchThreshold: 0.24,
        continuityBonus: 0.3,
        reactionBias: 0.08,
        ensembleBias: 0.04,
        confirmationSamples: 4,
        graceBonus: 0.32,
        listenerHoldBias: 0.22,
        overlapTolerance: 0.06,
        quietHoldBias: 0.26,
        handoffBias: 0.18,
        interruptionBias: 0.08,
      };
      break;
    case "reaction":
      profile = {
        minHold: 1.1,
        maxHold: 2.6,
        switchThreshold: 0.08,
        continuityBonus: 0.06,
        reactionBias: 0.24,
        ensembleBias: 0.08,
        confirmationSamples: 1,
        graceBonus: 0.04,
        listenerHoldBias: 0.04,
        overlapTolerance: 0.02,
        quietHoldBias: 0.02,
        handoffBias: 0.04,
        interruptionBias: 0.18,
      };
      break;
    case "performance":
      profile = {
        minHold: 1.8,
        maxHold: 4.2,
        switchThreshold: 0.14,
        continuityBonus: 0.14,
        reactionBias: 0.12,
        ensembleBias: 0.18,
        confirmationSamples: 2,
        graceBonus: 0.12,
        listenerHoldBias: 0.08,
        overlapTolerance: 0.08,
        quietHoldBias: 0.08,
        handoffBias: 0.08,
        interruptionBias: 0.1,
      };
      break;
    case "interview":
    default:
      profile = {
        minHold: 1.9,
        maxHold: 3.7,
        switchThreshold: 0.16,
        continuityBonus: 0.16,
        reactionBias: 0.16,
        ensembleBias: 0.06,
        confirmationSamples: 3,
        graceBonus: 0.18,
        listenerHoldBias: 0.16,
        overlapTolerance: 0.05,
        quietHoldBias: 0.16,
        handoffBias: 0.12,
        interruptionBias: 0.12,
      };
      break;
  }

  if (intensityMode !== "harder") {
    return profile;
  }

  return {
    ...profile,
    minHold: Number((profile.minHold * 0.72).toFixed(3)),
    maxHold: Number((profile.maxHold * 0.76).toFixed(3)),
    switchThreshold: Number(Math.max(0.06, profile.switchThreshold - 0.04).toFixed(3)),
    continuityBonus: Number(Math.max(0.04, profile.continuityBonus - 0.05).toFixed(3)),
    reactionBias: Number((profile.reactionBias + 0.05).toFixed(3)),
    ensembleBias: Number((profile.ensembleBias + 0.05).toFixed(3)),
    confirmationSamples: Math.max(1, profile.confirmationSamples - 1),
    graceBonus: Number(Math.max(0.03, profile.graceBonus - 0.05).toFixed(3)),
    listenerHoldBias: Number(Math.max(0.03, profile.listenerHoldBias - 0.04).toFixed(3)),
    overlapTolerance: Number(Math.max(0.01, profile.overlapTolerance - 0.02).toFixed(3)),
    quietHoldBias: Number(Math.max(0.02, profile.quietHoldBias - 0.04).toFixed(3)),
    handoffBias: Number((profile.handoffBias + 0.03).toFixed(3)),
    interruptionBias: Number((profile.interruptionBias + 0.04).toFixed(3)),
  };
};

const getSourceQualityScore = (source, qualityBySource = {}) => {
  const explicitScore = clampNumber(qualityBySource?.[source?.id]?.score, 0, 1, null);
  if (explicitScore !== null) return explicitScore;

  const resolutionPixels =
    Math.max(1, Number(source?.videoWidth || 0)) * Math.max(1, Number(source?.videoHeight || 0));
  const resolutionScore = clampNumber(resolutionPixels / (1920 * 1080), 0.18, 1, 0.58);
  const durationScore = clampNumber((Number(source?.duration) || 0) / 20, 0.2, 1, 0.7);
  return resolutionScore * 0.55 + durationScore * 0.45;
};

const getSwitchCadenceFromScene = ({
  leaderScore,
  challengerScore,
  profile,
}) => {
  const totalEnergy = clampNumber((leaderScore + challengerScore) / 2, 0, 1, 0.35);
  const tension = clampNumber(challengerScore - leaderScore + 0.5, 0, 1, 0.42);
  const energyWeight = 1 - totalEnergy;
  const tensionWeight = 1 - tension * 0.45;
  const hold = profile.minHold + (profile.maxHold - profile.minHold) * energyWeight * tensionWeight;
  return clampNumber(hold, profile.minHold, profile.maxHold, profile.maxHold);
};

const classifyAutoDirectorMoment = ({
  leader,
  challenger,
  currentCameraId,
  directorStyleId,
  holdAgeSeconds = 0,
  leadMargin = 0,
}) => {
  const leaderActivity = clampNumber(leader?.activity, 0, 1, 0);
  const challengerActivity = clampNumber(challenger?.activity, 0, 1, 0);
  const spread = leaderActivity - challengerActivity;
  const style = String(directorStyleId || "interview").trim().toLowerCase();

  if (style === "performance" && leaderActivity >= 0.68 && challengerActivity >= 0.42) {
    return {
      type: "ensemble_bloom",
      label: "Ensemble bloom",
      summary: "Several live angles surged together, so the director opened the scene up more aggressively.",
    };
  }
  if (
    style === "performance" &&
    leader?.source?.id !== currentCameraId &&
    leaderActivity >= 0.74 &&
    challengerActivity >= 0.5 &&
    leadMargin >= 0.04
  ) {
    return {
      type: "crescendo_crown",
      label: "Crescendo crown",
      summary: "The performance swelled into a true high point, so the director crowned the strongest angle instead of drifting through it.",
    };
  }
  if (
    style === "performance" &&
    leader?.source?.id === currentCameraId &&
    holdAgeSeconds >= 2.2 &&
    leaderActivity >= 0.48 &&
    challengerActivity <= 0.34
  ) {
    return {
      type: "reverent_hold",
      label: "Reverent hold",
      summary: "The room settled into a meaningful lift, so the director stayed respectful and let the moment breathe.",
    };
  }
  if (
    (style === "podcast" || style === "interview" || style === "reaction") &&
    leader?.source?.id !== currentCameraId &&
    leaderActivity >= 0.52 &&
    challengerActivity >= 0.46 &&
    leadMargin <= 0.08 &&
    holdAgeSeconds >= 1.05
  ) {
    return {
      type: "crossfire_spark",
      label: "Crossfire spark",
      summary: "Both voices lit up at once, so the director treated it like a real back-and-forth instead of waiting too long.",
    };
  }
  if (
    (style === "podcast" || style === "interview" || style === "reaction") &&
    leader?.source?.id !== currentCameraId &&
    leaderActivity >= 0.58 &&
    challengerActivity >= 0.48 &&
    leadMargin >= 0.02 &&
    leadMargin <= 0.1 &&
    holdAgeSeconds >= 0.9
  ) {
    return {
      type: "interruption_pivot",
      label: "Interruption pivot",
      summary: "A sharper interruption or counterpoint landed, so the director pivoted faster to catch the live exchange.",
    };
  }
  if (
    (style === "podcast" || style === "interview") &&
    leader?.source?.id === currentCameraId &&
    leaderActivity >= 0.56 &&
    challengerActivity <= 0.3 &&
    holdAgeSeconds >= 2.1
  ) {
    return {
      type: "answer_run",
      label: "Answer run",
      summary: "One speaker clearly owned the answer, so the director stayed disciplined and let the point land without interruption.",
    };
  }
  if (
    (style === "podcast" || style === "interview") &&
    leader?.source?.id === currentCameraId &&
    leaderActivity <= 0.34 &&
    challengerActivity <= 0.28 &&
    holdAgeSeconds >= 1.4
  ) {
    return {
      type: "quiet_bridge",
      label: "Quiet bridge",
      summary: "The room dipped into a calmer pocket, so the director held the shot instead of cutting just to stay busy.",
    };
  }
  if (
    (style === "podcast" || style === "interview") &&
    leader?.source?.id !== currentCameraId &&
    leaderActivity >= 0.44 &&
    challengerActivity >= 0.3 &&
    leadMargin >= 0.06 &&
    holdAgeSeconds >= 1.15
  ) {
    return {
      type: "question_handoff",
      label: "Question handoff",
      summary: "The conversation genuinely passed across the table, so the director treated it like a clean handoff instead of a nervous jump.",
    };
  }
  if (
    (style === "podcast" || style === "interview") &&
    leader?.source?.id !== currentCameraId &&
    leaderActivity >= 0.5 &&
    leadMargin >= 0.04
  ) {
    return {
      type: "turn_capture",
      label: "Turn capture",
      summary: "A cleaner speaker turn emerged, so the director shifted to the person who now owns the conversation.",
    };
  }
  if (
    (style === "podcast" || style === "interview") &&
    leader?.source?.id === currentCameraId &&
    holdAgeSeconds >= 1.8 &&
    leaderActivity >= 0.42 &&
    challengerActivity >= 0.32 &&
    spread <= 0.08
  ) {
    return {
      type: "listener_lock",
      label: "Listener lock",
      summary: "The exchange was still balanced, so the director resisted a twitchy cut and let the current speaker hold longer.",
    };
  }
  if (leader?.source?.id !== currentCameraId && leaderActivity >= 0.6 && spread >= 0.12) {
    return {
      type: "hero_pivot",
      label: "Hero pivot",
      summary: "A stronger lead appeared, so the director snapped toward the new hero angle.",
    };
  }
  if (challengerActivity >= 0.56 && spread <= 0.1) {
    return {
      type: "reaction_burst",
      label: "Reaction burst",
      summary: "A second live angle flared up enough to justify a sharper counter or reaction move.",
    };
  }
  if (leaderActivity >= 0.7) {
    return {
      type: "surge_lock",
      label: "Surge lock",
      summary: "The scene hit a voltage spike, so the director leaned into the strongest frame.",
    };
  }
  return null;
};

export const buildAutoDirectorPlan = (
  sources,
  timelineDuration,
  options = {}
) => {
  const validSources = (Array.isArray(sources) ? sources : []).filter(
    source => source?.id && (source.url || source.previewUrl || source.uploadedUrl)
  );
  const safeDuration = Math.max(0, Number(timelineDuration) || 0);
  const timelineStart = Number(options.timelineStart) || 0;
  const audioActivityBySource = options.audioActivityBySource || {};
  const qualityBySource = options.qualityBySource || {};
  const directorStyleId = options.directorStyleId || "interview";
  const intensityMode = options.intensityMode || "standard";
  const profile = getAutoDirectorProfile(directorStyleId, intensityMode);
  const sampleStep = clampNumber(options.sampleStep, 0.15, 1, 0.35);

  if (!validSources.length || safeDuration <= 0.01) {
    return {
      switches: [],
      summary: {
        averageHold: 0,
        switchesCount: 0,
        leadCameraId: null,
        confidence: 0,
        modeLabel: "No sources",
      },
    };
  }

  const rankSourcesAtMoment = (targetTime, previousCameraId, holdAgeSeconds) =>
    validSources
      .map(source => {
        const sourceTime = getSourceTimelineTimeAtPlayhead(source, targetTime, timelineStart);
        if (!isSourceAvailableAtTime(source, sourceTime)) return null;

        const activity = getAudioActivityScoreForSourceTime(
          audioActivityBySource?.[source.id],
          sourceTime,
          0.45
        );
        const quality = getSourceQualityScore(source, qualityBySource);
        const isConversationStyle =
          directorStyleId === "podcast" || directorStyleId === "interview";
        const continuity =
          source.id === previousCameraId
            ? profile.continuityBonus * clampNumber(1 - holdAgeSeconds / profile.maxHold, 0, 1, 0.4)
            : 0;
        const comfortBias =
          isConversationStyle && source.id === previousCameraId && quality >= 0.62
            ? 0.06 + profile.quietHoldBias * 0.18
            : 0;
        const totalScore = activity * 0.55 + quality * 0.3 + continuity + comfortBias;

        return {
          source,
          sourceTime,
          activity,
          quality,
          totalScore,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.totalScore - left.totalScore);

  const switches = [];
  let currentTime = 0;
  let currentCameraId = null;
  let currentCameraStartedAt = 0;
  let leadCameraCounts = new Map();
  let confidenceTotal = 0;
  let confidenceSamples = 0;
  const moments = [];
  let lastMomentTime = -10;
  let challengerCameraId = null;
  let challengerStreak = 0;

  while (currentTime < safeDuration - 0.01) {
    const ranked = rankSourcesAtMoment(
      currentTime,
      currentCameraId,
      currentTime - currentCameraStartedAt
    );
    if (!ranked.length) {
      currentTime += sampleStep;
      continue;
    }

    const leader = ranked[0];
    const challenger = ranked[1] || ranked[0];
    const recommendedHold = getSwitchCadenceFromScene({
      leaderScore: leader.activity,
      challengerScore: challenger.activity,
      profile,
    });
    const currentHoldAge = currentTime - currentCameraStartedAt;
    const activeCameraId = currentCameraId;
    const currentRank = ranked.find(item => item.source.id === activeCameraId) || leader;
    const leadMargin = clampNumber(leader.totalScore - challenger.totalScore, -1, 1, 0);
    const challengerWins =
      leader.source.id !== currentCameraId &&
      leadMargin >= Math.max(profile.switchThreshold * 0.55, 0.03);
    if (challengerWins) {
      if (challengerCameraId === leader.source.id) {
        challengerStreak += 1;
      } else {
        challengerCameraId = leader.source.id;
        challengerStreak = 1;
      }
    } else {
      challengerCameraId = null;
      challengerStreak = 0;
    }
    const dramaticPressure =
      leader.activity >= 0.64
        ? 0.24
        : leader.activity >= 0.5
          ? 0.12
          : 0;
    const conversationalHold =
      (directorStyleId === "podcast" || directorStyleId === "interview") &&
      currentCameraId &&
      currentRank?.source?.id === currentCameraId &&
      leadMargin <= profile.overlapTolerance &&
      currentRank.activity >= 0.28;
    const quietConversation =
      (directorStyleId === "podcast" || directorStyleId === "interview") &&
      leader.activity <= 0.34 &&
      challenger.activity <= 0.28;
    const surgeWindow =
      leader.activity >= 0.68 ||
      (challenger.activity >= 0.54 && leader.totalScore - challenger.totalScore <= profile.switchThreshold + 0.04);
    const interruptionWindow =
      (directorStyleId === "podcast" || directorStyleId === "interview" || directorStyleId === "reaction") &&
      leader.source.id !== currentCameraId &&
      leader.activity >= 0.52 &&
      challenger.activity >= 0.46 &&
      leadMargin <= profile.interruptionBias;
    const interruptionPivotWindow =
      (directorStyleId === "podcast" || directorStyleId === "interview" || directorStyleId === "reaction") &&
      leader.source.id !== currentCameraId &&
      leader.activity >= 0.58 &&
      challenger.activity >= 0.48 &&
      leadMargin >= 0.02 &&
      leadMargin <= Math.max(profile.interruptionBias, 0.1);
    const confirmedSwitch =
      challengerWins &&
      challengerStreak >= Math.max(1, profile.confirmationSamples);
    const shouldBoot =
      !currentCameraId ||
      (currentHoldAge >=
        Math.max(
          profile.minHold * 0.72,
          recommendedHold -
            dramaticPressure +
            (conversationalHold ? profile.graceBonus : 0) +
            (quietConversation ? profile.quietHoldBias : 0) +
            (currentRank?.activity >= 0.46 ? profile.listenerHoldBias * 0.4 : 0)
        )) ||
      (confirmedSwitch &&
        leader.totalScore - challenger.totalScore >= profile.switchThreshold &&
        currentHoldAge >= profile.minHold) ||
      ((directorStyleId === "podcast" || directorStyleId === "interview") &&
        confirmedSwitch &&
        leader.activity >= 0.44 &&
        challenger.activity >= 0.3 &&
        leadMargin >= Math.max(0.05, profile.switchThreshold - profile.handoffBias) &&
        currentHoldAge >= profile.minHold * 0.66) ||
      (interruptionPivotWindow &&
        currentHoldAge >= profile.minHold * 0.46) ||
      (interruptionWindow &&
        confirmedSwitch &&
        currentHoldAge >= profile.minHold * 0.56) ||
      (surgeWindow &&
        leader.source.id !== currentCameraId &&
        currentHoldAge >= profile.minHold * 0.72 &&
        leader.totalScore - challenger.totalScore >= profile.switchThreshold * 0.72);

    if (shouldBoot) {
      const detectedMoment = classifyAutoDirectorMoment({
        leader,
        challenger,
        currentCameraId,
        directorStyleId,
        holdAgeSeconds: currentHoldAge,
        leadMargin,
      });
      const nextCameraId =
        currentCameraId &&
        leader.source.id === currentCameraId &&
        ranked[1] &&
        ranked[1].totalScore >= leader.totalScore + profile.reactionBias
          ? ranked[1].source.id
          : leader.source.id;

      if (!switches.length || switches[switches.length - 1].cameraId !== nextCameraId) {
        switches.push({
          id: `switch-${switches.length + 1}`,
          cameraId: nextCameraId,
          startTime: Number(currentTime.toFixed(3)),
        });
        if (
          detectedMoment &&
          currentTime - lastMomentTime >= Math.max(1.2, profile.minHold * 0.65)
        ) {
          moments.push({
            id: `moment-${moments.length + 1}`,
            time: Number(currentTime.toFixed(3)),
            cameraId: nextCameraId,
            type: detectedMoment.type,
            label: detectedMoment.label,
            summary: detectedMoment.summary,
          });
          lastMomentTime = currentTime;
        }
        currentCameraId = nextCameraId;
        currentCameraStartedAt = currentTime;
      }
    }

    leadCameraCounts.set(
      leader.source.id,
      (leadCameraCounts.get(leader.source.id) || 0) + 1
    );
    confidenceTotal += clampNumber(leader.totalScore - (challenger?.totalScore || 0) + 0.5, 0, 1, 0.62);
    confidenceSamples += 1;
    currentTime += sampleStep;
  }

  const normalizedSwitches = normalizeSwitches(switches, validSources, safeDuration);
  const holdDurations = normalizedSwitches.map((switchItem, index) => {
    const next = normalizedSwitches[index + 1];
    return (next ? next.startTime : safeDuration) - switchItem.startTime;
  });
  const leadCameraId =
    [...leadCameraCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ||
    normalizedSwitches[0]?.cameraId ||
    validSources[0]?.id ||
    null;
  const momentCounts = moments.reduce((accumulator, moment) => {
    accumulator[moment.type] = (accumulator[moment.type] || 0) + 1;
    return accumulator;
  }, {});
  const magicSummary =
    momentCounts.ensemble_bloom
      ? `${momentCounts.ensemble_bloom} ensemble bloom${momentCounts.ensemble_bloom === 1 ? "" : "s"}`
      : momentCounts.crescendo_crown
        ? `${momentCounts.crescendo_crown} crescendo crown${momentCounts.crescendo_crown === 1 ? "" : "s"}`
        : momentCounts.reverent_hold
          ? `${momentCounts.reverent_hold} reverent hold${momentCounts.reverent_hold === 1 ? "" : "s"}`
      : momentCounts.interruption_pivot
        ? `${momentCounts.interruption_pivot} interruption pivot${momentCounts.interruption_pivot === 1 ? "" : "s"}`
      : momentCounts.crossfire_spark
        ? `${momentCounts.crossfire_spark} crossfire spark${momentCounts.crossfire_spark === 1 ? "" : "s"}`
      : momentCounts.answer_run
        ? `${momentCounts.answer_run} answer run${momentCounts.answer_run === 1 ? "" : "s"}`
      : momentCounts.question_handoff
        ? `${momentCounts.question_handoff} question handoff${momentCounts.question_handoff === 1 ? "" : "s"}`
        : momentCounts.quiet_bridge
          ? `${momentCounts.quiet_bridge} quiet bridge${momentCounts.quiet_bridge === 1 ? "" : "s"}`
      : momentCounts.turn_capture
        ? `${momentCounts.turn_capture} turn capture${momentCounts.turn_capture === 1 ? "" : "s"}`
        : momentCounts.listener_lock
          ? `${momentCounts.listener_lock} listener lock${momentCounts.listener_lock === 1 ? "" : "s"}`
      : momentCounts.reaction_burst
        ? `${momentCounts.reaction_burst} reaction burst${momentCounts.reaction_burst === 1 ? "" : "s"}`
        : momentCounts.hero_pivot
          ? `${momentCounts.hero_pivot} hero pivot${momentCounts.hero_pivot === 1 ? "" : "s"}`
          : momentCounts.surge_lock
            ? `${momentCounts.surge_lock} surge lock${momentCounts.surge_lock === 1 ? "" : "s"}`
            : "steady directional control";

  return {
    switches: normalizedSwitches,
    summary: {
      averageHold: Number(averageValues(holdDurations).toFixed(3)),
      switchesCount: normalizedSwitches.length,
      leadCameraId,
      confidence: Number(
        clampNumber(confidenceSamples ? confidenceTotal / confidenceSamples : 0.62, 0, 1, 0.62).toFixed(3)
      ),
      modeLabel:
        directorStyleId === "podcast"
          ? "Conversation-led auto switching"
          : directorStyleId === "reaction"
            ? "Fast reaction-led auto switching"
            : directorStyleId === "performance"
              ? "Performance-led auto switching"
              : "Interview-led auto switching",
      intensityMode,
      moments,
      momentCount: moments.length,
      magicSummary,
    },
  };
};

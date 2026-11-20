export const MAX_STUDIO_ANGLES = 8;

const toDuration = value => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

const toOffset = value => {
  const offset = Number(value);
  return Number.isFinite(offset) && offset >= 0 ? offset : null;
};

export const getAngleGroupSharedDuration = (group, assets) => {
  const byId = new Map((assets || []).map(asset => [String(asset.id), asset]));
  if (!Array.isArray(group?.angles) || group.angles.length < 2) return 0;
  const available = group.angles.map(angle => {
    const asset = byId.get(String(angle.assetId));
    const offset = toOffset(angle.offsetSeconds);
    return asset && offset !== null ? toDuration(asset.duration) - offset : 0;
  });
  return Math.max(0, Math.min(...available));
};

export const getStudioAngleSharedRange = (group, assets) => ({
  start: 0,
  end: getAngleGroupSharedDuration(group, assets),
});

export const createStudioAngleGroup = ({ id, name, assets }) => {
  const selected = Array.isArray(assets) ? assets : [];
  const ids = new Set(selected.map(asset => String(asset?.id || "")));
  if (
    !id ||
    selected.length < 2 ||
    selected.length > MAX_STUDIO_ANGLES ||
    ids.size !== selected.length ||
    selected.some(asset => !asset?.id || !asset?.storagePath || !asset?.url || !toDuration(asset?.duration))
  ) {
    throw new Error(`Choose 2–${MAX_STUDIO_ANGLES} saved videos with a readable duration.`);
  }
  const group = {
    id: String(id),
    name: String(name || "Camera take").trim() || "Camera take",
    angles: selected.map(asset => ({ assetId: asset.id, offsetSeconds: 0 })),
    sharedStart: 0,
    sharedEnd: 0,
  };
  return { ...group, sharedEnd: getAngleGroupSharedDuration(group, selected) };
};

export const setStudioAngleOffset = ({ group, assetId, offsetSeconds, assets }) => {
  const offset = toOffset(offsetSeconds);
  if (offset === null) throw new Error("Start offset must be zero or more seconds.");
  if (!group?.angles?.some(angle => String(angle.assetId) === String(assetId))) {
    throw new Error("This camera is not in the selected take.");
  }
  const asset = (assets || []).find(item => String(item.id) === String(assetId));
  if (!asset || offset >= toDuration(asset.duration)) {
    throw new Error("Start offset must be shorter than this camera video.");
  }
  const updated = {
    ...group,
    angles: group.angles.map(angle => String(angle.assetId) === String(assetId)
      ? { ...angle, offsetSeconds: offset }
      : angle),
  };
  const duration = getAngleGroupSharedDuration(updated, assets);
  return {
    ...updated,
    sharedStart: Math.min(Math.max(0, Number(group.sharedStart) || 0), duration),
    sharedEnd: Math.min(Math.max(0, Number(group.sharedEnd) || 0), duration),
  };
};

export const createStudioAngleShot = ({ group, asset, sharedStart, sharedEnd, clipId }) => {
  const angle = group?.angles?.find(item => String(item.assetId) === String(asset?.id));
  if (!angle || !asset?.storagePath || !asset?.url || !clipId) {
    throw new Error("Choose a saved camera video from this take.");
  }
  const offset = toOffset(angle.offsetSeconds);
  const start = Number(sharedStart);
  const end = Number(sharedEnd);
  const maxDuration = toDuration(asset.duration) - offset;
  if (
    offset === null || !Number.isFinite(start) || !Number.isFinite(end) ||
    start < 0 || end <= start || end > maxDuration + 0.001
  ) {
    throw new Error("Choose a shot range that fits this camera video.");
  }
  return {
    id: String(clipId),
    sourceClipId: asset.id,
    sourceMediaId: asset.id,
    angleGroupId: group.id,
    name: `${group.name} · ${asset.name || "Camera"}`,
    mediaType: asset.mediaType || "video",
    url: asset.url,
    storagePath: asset.storagePath,
    sourceStoragePath: asset.storagePath,
    startRequest: start + offset,
    endRequest: end + offset,
    duration: end - start,
    isLocal: false,
  };
};

const toEnvelope = (samples, bucketSize = 1) => {
  const len = samples?.length || 0;
  if (!len) return new Float32Array(0);
  if (bucketSize <= 1) {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i += 1) out[i] = Number(samples[i]) || 0;
    return out;
  }
  const bins = Math.floor(len / bucketSize);
  const out = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    let energy = 0;
    const base = i * bucketSize;
    for (let j = 0; j < bucketSize; j += 1) {
      const s = Number(samples[base + j]) || 0;
      energy += Math.abs(s);
    }
    out[i] = energy / bucketSize;
  }
  return out;
};

const normalizedCorrelationAtLag = (refArr, tgtArr, lag) => {
  const startRef = Math.max(0, -lag);
  const endRef = Math.min(refArr.length, tgtArr.length - lag);
  const count = endRef - startRef;
  if (count < 8) return 0;
  let sumR = 0;
  let sumT = 0;
  for (let i = startRef; i < endRef; i += 1) {
    sumR += refArr[i];
    sumT += tgtArr[i + lag];
  }
  const meanR = sumR / count;
  const meanT = sumT / count;
  let num = 0;
  let denR = 0;
  let denT = 0;
  for (let i = startRef; i < endRef; i += 1) {
    const dr = refArr[i] - meanR;
    const dt = tgtArr[i + lag] - meanT;
    num += dr * dt;
    denR += dr * dr;
    denT += dt * dt;
  }
  const den = Math.sqrt(denR * denT);
  return den > 1e-9 ? num / den : 0;
};

/**
 * Coarse-to-fine normalized cross-correlation waveform aligner.
 * Positive `lagSeconds` indicates `targetSamples` started earlier and the
 * matching audio transient appears `lagSeconds` later inside `targetSamples`.
 */
export const computeWaveformSyncOffsetSeconds = (
  referenceSamples,
  targetSamples,
  sampleRate = 800,
  { maxOffsetSeconds = 20 } = {}
) => {
  const rate = Math.max(10, Number(sampleRate) || 800);
  const refLen = referenceSamples?.length || 0;
  const tgtLen = targetSamples?.length || 0;
  if (refLen < 16 || tgtLen < 16) {
    return { lagSeconds: 0, offsetForTarget: 0, offsetForReference: 0, correlation: 0, confidence: 0 };
  }

  const refRaw = toEnvelope(referenceSamples, 1);
  const tgtRaw = toEnvelope(targetSamples, 1);
  // Check whether signal is already a smooth envelope (>= 0 everywhere) vs bipolar waveform
  const maxLag = Math.min(
    Math.floor(rate * Math.max(0.5, Number(maxOffsetSeconds) || 20)),
    Math.max(refRaw.length, tgtRaw.length) - 8
  );
  if (maxLag <= 0) {
    return { lagSeconds: 0, offsetForTarget: 0, offsetForReference: 0, correlation: 0, confidence: 0 };
  }

  const coarseStep = rate > 200 ? Math.max(1, Math.round(rate / 80)) : 1;
  let bestCoarseLag = 0;
  let bestCoarseCorr = -1;
  if (coarseStep > 1) {
    const refEnv = toEnvelope(refRaw, coarseStep);
    const tgtEnv = toEnvelope(tgtRaw, coarseStep);
    const coarseMaxLag = Math.max(1, Math.floor(maxLag / coarseStep));
    for (let lag = -coarseMaxLag; lag <= coarseMaxLag; lag += 1) {
      const corr = normalizedCorrelationAtLag(refEnv, tgtEnv, lag);
      if (corr > bestCoarseCorr) {
        bestCoarseCorr = corr;
        bestCoarseLag = lag;
      }
    }
    bestCoarseLag *= coarseStep;
  }

  const fineRadius = coarseStep > 1 ? Math.max(coarseStep * 3, 24) : maxLag;
  const fineLow = Math.max(-maxLag, bestCoarseLag - fineRadius);
  const fineHigh = Math.min(maxLag, bestCoarseLag + fineRadius);
  let bestLag = 0;
  let bestCorr = -Infinity;
  for (let lag = fineLow; lag <= fineHigh; lag += 1) {
    const corr = normalizedCorrelationAtLag(refRaw, tgtRaw, lag);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  const lagSeconds = Number((bestLag / rate).toFixed(4));
  const safeCorr = Number(Math.max(0, Math.min(1, bestCorr || 0)).toFixed(4));
  return {
    lagSeconds,
    offsetForTarget: lagSeconds > 0 ? lagSeconds : 0,
    offsetForReference: lagSeconds < 0 ? Number((-lagSeconds).toFixed(4)) : 0,
    correlation: safeCorr,
    confidence: Number(Math.max(0, Math.min(1, safeCorr)).toFixed(3)),
  };
};

export const alignStudioAngleGroupOffsets = ({ group, rawLagsByAssetId, assets }) => {
  if (!group?.angles?.length) throw new Error("Camera take has no angles to align.");
  const lags = group.angles.map(angle => {
    const raw = Number(rawLagsByAssetId?.[String(angle.assetId)] ?? 0);
    return Number.isFinite(raw) ? raw : 0;
  });
  const minLag = Math.min(...lags);
  let nextGroup = { ...group };
  for (let i = 0; i < group.angles.length; i += 1) {
    const angle = group.angles[i];
    const asset = (assets || []).find(item => String(item.id) === String(angle.assetId));
    const maxAllowed = Math.max(0, toDuration(asset?.duration) - 0.1);
    const offsetSeconds = Math.min(maxAllowed, Math.max(0, Number((lags[i] - minLag).toFixed(3))));
    if (asset) {
      nextGroup = setStudioAngleOffset({ group: nextGroup, assetId: angle.assetId, offsetSeconds, assets });
    }
  }
  const duration = getAngleGroupSharedDuration(nextGroup, assets);
  return {
    ...nextGroup,
    sharedStart: 0,
    sharedEnd: Number(duration.toFixed(3)),
  };
};

export const decodeMediaAudioSamples = async (url, { targetRate = 800, maxSeconds = 45 } = {}) => {
  if (!url || typeof window === "undefined") {
    throw new Error("Audio decoding requires a browser session.");
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio API is unavailable in this browser.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read audio track (${response.status}).`);
  const buffer = await response.arrayBuffer();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buffer);
    const maxInSamples = Math.min(decoded.length, Math.floor(decoded.sampleRate * maxSeconds));
    const channelData = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(decoded.sampleRate / targetRate));
    const outLen = Math.floor(maxInSamples / step);
    const downsampled = new Float32Array(outLen);
    for (let i = 0; i < outLen; i += 1) {
      let sum = 0;
      const base = i * step;
      for (let j = 0; j < step; j += 1) sum += channelData[base + j] || 0;
      downsampled[i] = sum / step;
    }
    return { samples: downsampled, sampleRate: decoded.sampleRate / step };
  } finally {
    await ctx.close?.().catch(() => {});
  }
};

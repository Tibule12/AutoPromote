import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAutoDirectorPlan,
  clampNumber,
  DEFAULT_SEGMENT_FRAMING,
  DEFAULT_IMAGE_SEGMENT_DURATION,
  buildDefaultSegments,
  buildSegmentDisplaySegments,
  buildInitialSources,
  buildSwitchDisplaySegments,
  formatDurationLabel,
  getActiveCameraAtTime,
  getAudioActivityScoreForSourceTime,
  getActiveSegmentAtTime,
  getMasterTimelineBounds,
  getSegmentFocusPoint,
  getSegmentTransformOrigin,
  getSourceTimelineTimeAtPlayhead,
  getSourceDurationBounds,
  isSourceAvailableAtTime,
  mapTimelineTimeToSourceTime,
  normalizeSourceLabel,
  normalizeSegmentFraming,
  normalizeMulticamLayoutMode,
  normalizeSegments,
  normalizeSwitches,
  splitSegmentAtTimelineTime,
  resolveSmartMulticamLayoutAtTime,
} from "./multicamUtils";
import {
  FLOW_EDIT_STYLE_PRESETS,
  FLOW_AURA_TEMPLATE_PRESETS,
  IMAGE_STORY_TEMPLATE_PRESETS,
  buildImageStoryFramingMap,
  buildFlowEditPlan,
  buildFlowTimelineDisplaySegments,
  buildVideoFlowFramingMap,
  buildSingleLensAutoPlan,
  getFlowAuraPreset,
  getFlowSegmentAtTime,
  getFlowSourceTimeAtPlayhead,
} from "./flowEditUtils";
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { API_BASE_URL } from "../config";
import { applySafeMediaSource, getSafeMediaSource } from "../utils/security";
import toast from "react-hot-toast";
import "./MultiCamCombiner.css";
import useCinematicEffects from "../hooks/useCinematicEffects";
import CinematicEffectsPanel from "./CinematicEffectsPanel";
import { useSubscription } from "../hooks/useSubscription";
import PayPalSubscriptionPanel from "./PayPalSubscriptionPanel";
import { SafeAudio, SafeVideo } from "./SafeMedia";

const MULTICAM_MAX_SOURCES = 6;

const CAMERA_COLORS = ["#f97316", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15"];

const getCameraColor = (cameraId, sources) => {
  const idx = sources.findIndex(s => s.id === cameraId);
  return CAMERA_COLORS[idx % CAMERA_COLORS.length] || CAMERA_COLORS[0];
};

const DRIFT_THRESHOLD_SECONDS = 0.18;
const EXPORT_FRAME_RATE = 30;
const SERVER_MULTICAM_MAX_DURATION_SECONDS = 20 * 60;
const LOCAL_MEDIA_WORKER_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const canUseLocalMediaWorker = () => {
  if (process.env.REACT_APP_ENABLE_LOCAL_MEDIA_WORKER === "true") return true;
  if (process.env.NODE_ENV !== "development") return false;
  const hostname = typeof window !== "undefined" ? window.location?.hostname : "";
  return LOCAL_MEDIA_WORKER_HOSTS.has(hostname);
};

const formatRenderExpiry = expiresAt => {
  const expiryMs = Date.parse(expiresAt || "");
  if (!expiryMs) return "Expires after 4 days";
  const remainingMs = expiryMs - Date.now();
  if (remainingMs <= 0) return "Expired";
  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (remainingHours < 48) return `Expires in ${remainingHours}h`;
  return `Expires in ${Math.ceil(remainingHours / 24)} days`;
};
const FRAME_STEP_SECONDS = 1 / 30;
const AUDIO_SYNC_BINS_PER_SECOND = 20;
const WAVEFORM_BAR_COUNT = 24;
const IMAGE_SOURCE_DURATION_MIN = 1;
const IMAGE_SOURCE_DURATION_MAX = 20;
const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;
const BROWSER_SYNC_MAX_SINGLE_VISUAL_BYTES = 1.25 * BYTES_PER_GB;
const BROWSER_SYNC_MAX_TOTAL_VISUAL_BYTES = 2.5 * BYTES_PER_GB;
const BROWSER_SYNC_MAX_EXTERNAL_AUDIO_BYTES = 250 * BYTES_PER_MB;
const BROWSER_SYNC_MAX_DURATION_SECONDS = 30 * 60;
const MULTICAM_RENDER_BASE_CREDITS = 15;

const MULTICAM_RENDER_TIERS = [
  {
    id: "simple",
    label: "Simple",
    eyebrow: "Clean cuts",
    description: "Fastest paid MP4 path with lighter styling.",
  },
  {
    id: "premium",
    label: "Premium",
    eyebrow: "Podcast polish",
    description: "Rounded cards, blur beds, overlays, and sync audit.",
  },
  {
    id: "studio",
    label: "Studio",
    eyebrow: "Heavy render",
    description: "Highest-cost lane for more expensive production treatment.",
  },
];

// Client-side compression before upload — turns raw 4K/ProRes into web-friendly bitrates
const UPLOAD_COMPRESSION_THRESHOLD_BYTES = 250 * BYTES_PER_MB; // Compress files > 250 MB
const UPLOAD_COMPRESSION_TARGET_BPS = 8_000_000;               // 8 Mbps video
const UPLOAD_COMPRESSION_AUDIO_BPS = 128_000;                  // 128 Kbps audio
const VIDEO_SYNC_AUDIO_BPS = 96_000;
const VIDEO_SYNC_MAX_EXTRACT_SECONDS = 15 * 60;
const SYNC_AUDIO_CACHE_DB = "autopromote_multicam_sync_audio";
const SYNC_AUDIO_CACHE_STORE = "cameraSyncAudio";
const SYNC_AUDIO_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;

const openSyncAudioCacheDb = () =>
  new Promise(resolve => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(SYNC_AUDIO_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_AUDIO_CACHE_STORE)) {
        db.createObjectStore(SYNC_AUDIO_CACHE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });

const readCachedSyncAudioFile = async cacheKey => {
  if (!cacheKey) return null;
  const db = await openSyncAudioCacheDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(SYNC_AUDIO_CACHE_STORE, "readwrite");
    const store = tx.objectStore(SYNC_AUDIO_CACHE_STORE);
    const request = store.get(cacheKey);
    request.onsuccess = () => {
      const entry = request.result;
      if (!entry?.blob) {
        resolve(null);
        return;
      }
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(cacheKey);
        resolve(null);
        return;
      }
      resolve(
        new File([entry.blob], entry.name || "camera_sync_audio.webm", {
          type: entry.type || entry.blob.type || "audio/webm",
          lastModified: entry.lastModified || Date.now(),
        })
      );
    };
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const deleteCachedSyncAudioFile = async cacheKey => {
  if (!cacheKey) return;
  const db = await openSyncAudioCacheDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(SYNC_AUDIO_CACHE_STORE, "readwrite");
    tx.objectStore(SYNC_AUDIO_CACHE_STORE).delete(cacheKey);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
};

const writeCachedSyncAudioFile = async (cacheKey, file) => {
  if (!cacheKey || !file) return;
  const db = await openSyncAudioCacheDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(SYNC_AUDIO_CACHE_STORE, "readwrite");
    tx.objectStore(SYNC_AUDIO_CACHE_STORE).put({
      key: cacheKey,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified || Date.now(),
      expiresAt: Date.now() + SYNC_AUDIO_CACHE_TTL_MS,
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
};

const getAudioFileSignalStats = async file => {
  if (!file) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const audioCtx = new AudioContextClass();
  try {
    const decoded = await audioCtx.decodeAudioData(await file.arrayBuffer());
    const channel = decoded.getChannelData(0);
    let sumSquares = 0;
    let maxAbs = 0;
    const stride = Math.max(1, Math.floor(channel.length / 120000));
    let samplesChecked = 0;
    for (let i = 0; i < channel.length; i += stride) {
      const value = Math.abs(channel[i] || 0);
      sumSquares += value * value;
      maxAbs = Math.max(maxAbs, value);
      samplesChecked += 1;
    }
    return {
      rms: Math.sqrt(sumSquares / Math.max(1, samplesChecked)),
      maxAbs,
      duration: Number(decoded.duration || 0),
    };
  } catch (_) {
    return null;
  } finally {
    audioCtx.close().catch(() => {});
  }
};

const hasUsableAudioSignal = stats =>
  !stats || (Number(stats.maxAbs || 0) >= 0.002 && Number(stats.rms || 0) >= 0.0002);

const SINGLE_CAM_FOCUS_PRESETS = [
  { id: "two-shot", label: "Two Shot", zoom: 1 },
  { id: "body", label: "Body", zoom: 1.22 },
  { id: "face", label: "Face", zoom: 1.45 },
];

const MULTICAM_LAYOUT_OPTIONS = [
  { id: "smart", label: "Pulse Director" },
  { id: "split-vertical", label: "Dual Pulse" },
  { id: "pip", label: "Orbit Echo" },
  { id: "scene-grid", label: "Scene Matrix" },
  { id: "cut", label: "Hero Angle / Single Speaker" },
];

const MULTICAM_LAYOUT_TITLES = {
  smart: "Pulse Director",
  "split-vertical": "Dual Pulse",
  pip: "Orbit Echo",
  "scene-grid": "Scene Matrix",
  cut: "Hero Angle",
};

const MULTICAM_REASON_TITLES = {
  single_source: "Solo presence",
  shared_energy: "Shared voltage",
  reaction_insert: "Reaction bloom",
  primary_focus: "Hero lock",
  manual_split: "Manual duet",
  manual_pip: "Manual orbit",
  ensemble_peak: "Ensemble bloom",
  manual_ensemble: "Manual matrix",
  manual_cut: "Manual hero",
};

const MANUAL_TIMELINE_LAYOUT_LABELS = {
  cut: "Camera cut",
  pip: "Reaction",
  "scene-grid": "Show Everyone",
  "split-vertical": "Shared Moment",
};

const DIRECTOR_STYLE_PRESETS = [
  {
    id: "podcast",
    label: "Podcast Lock",
    summary: "Fewer gimmicks, longer hero holds, and calm conversational framing.",
    guidance: "Stay disciplined. Use split only when both people are genuinely active.",
  },
  {
    id: "interview",
    label: "Interview Pulse",
    summary: "Protect the main speaker, but surface reactions when they deepen the answer.",
    guidance: "Favor hero framing with selective reaction inserts.",
  },
  {
    id: "reaction",
    label: "Reaction Engine",
    summary: "Chase emotional counters, shared laughter, and fast interplay between angles.",
    guidance: "Keep secondary emotion alive when it adds voltage.",
  },
  {
    id: "performance",
    label: "Performance Stage",
    summary: "Let the whole room breathe with ensemble layouts and bigger visual crescendos.",
    guidance: "Open the frame when several angles are alive together.",
  },
];

const FLOW_EDIT_STATUS_STEPS = [
  "Analyzing audio...",
  "Detecting rhythm...",
  "Generating flow edit...",
  "Preview ready",
];

const getDirectorStylePreset = styleId =>
  DIRECTOR_STYLE_PRESETS.find(style => style.id === styleId) || DIRECTOR_STYLE_PRESETS[0];

const applyDirectorStyleToLayout = (layout, directorStyleId, rankedSources = []) => {
  const safeLayout = layout || {};
  const primaryCameraId = safeLayout.primaryCameraId || rankedSources[0]?.id || null;
  const companionCameraId =
    safeLayout.secondaryCameraId ||
    rankedSources.find(source => source?.id && source.id !== primaryCameraId)?.id ||
    null;
  const companionPool = rankedSources
    .map(source => source?.id)
    .filter(cameraId => cameraId && cameraId !== primaryCameraId);
  const visibleCameraIds = Array.isArray(safeLayout.visibleCameraIds)
    ? safeLayout.visibleCameraIds.filter(Boolean)
    : [primaryCameraId, companionCameraId].filter(Boolean);

  if (!primaryCameraId) return safeLayout;
  if (String(safeLayout.reason || "").startsWith("manual_")) {
    return safeLayout;
  }

  switch (directorStyleId) {
    case "podcast":
      if (safeLayout.reason === "uncertain_speaker_coverage") {
        return {
          ...safeLayout,
          layoutMode: "scene-grid",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      if (safeLayout.reason === "shared_energy") {
        return {
          ...safeLayout,
          layoutMode: "split-vertical",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      if (safeLayout.reason === "reaction_insert" || safeLayout.layoutMode === "pip") {
        return {
          ...safeLayout,
          layoutMode: "pip",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      return {
        ...safeLayout,
        layoutMode: "cut",
        secondaryCameraId: null,
        visibleCameraIds: [primaryCameraId],
      };
    case "interview":
      if (safeLayout.reason === "uncertain_speaker_coverage") {
        return {
          ...safeLayout,
          layoutMode: "scene-grid",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      if (safeLayout.reason === "reaction_insert" || safeLayout.layoutMode === "pip") {
        return {
          ...safeLayout,
          layoutMode: "pip",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      if (safeLayout.reason === "shared_energy") {
        return {
          ...safeLayout,
          layoutMode: "split-vertical",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      return {
        ...safeLayout,
        layoutMode: "cut",
        secondaryCameraId: null,
        visibleCameraIds: [primaryCameraId],
      };
    case "reaction":
      if (safeLayout.reason === "shared_energy") {
        return {
          ...safeLayout,
          layoutMode: "split-vertical",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      if (companionCameraId) {
        return {
          ...safeLayout,
          layoutMode: "pip",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      return safeLayout;
    case "performance":
      if (visibleCameraIds.length >= 3 || companionPool.length >= 2) {
        return {
          ...safeLayout,
          layoutMode: "scene-grid",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, ...companionPool].slice(0, 6),
        };
      }
      if (companionCameraId) {
        return {
          ...safeLayout,
          layoutMode: "split-vertical",
          secondaryCameraId: companionCameraId,
          visibleCameraIds: [primaryCameraId, companionCameraId].filter(Boolean),
        };
      }
      return safeLayout;
    default:
      return safeLayout;
  }
};

const getSourceMediaUrl = source => source?.previewUrl || source?.url || source?.uploadedUrl || "";
const getSourceMediaKind = source =>
  source?.mediaKind === "image" || String(source?.file?.type || "").startsWith("image/")
    ? "image"
    : "video";
const isImageSource = source => getSourceMediaKind(source) === "image";
const isVideoSource = source => getSourceMediaKind(source) === "video";
const normalizeImageSourceDuration = value =>
  Number(clampNumber(value, IMAGE_SOURCE_DURATION_MIN, IMAGE_SOURCE_DURATION_MAX, DEFAULT_IMAGE_SEGMENT_DURATION).toFixed(2));
const formatMediaBytes = bytes => {
  const safeBytes = Number(bytes) || 0;
  if (safeBytes >= BYTES_PER_GB) return `${(safeBytes / BYTES_PER_GB).toFixed(2)}GB`;
  if (safeBytes >= BYTES_PER_MB) return `${(safeBytes / BYTES_PER_MB).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(safeBytes / 1024))}KB`;
};
const getSourceFileSize = source => Number(source?.file?.size || 0);
const getBrowserSyncBlockReason = (visualSources = [], externalTrack = null) => {
  const videoSources = visualSources.filter(isVideoSource);
  const oversizedVisual = videoSources.find(
    source => getSourceFileSize(source) > BROWSER_SYNC_MAX_SINGLE_VISUAL_BYTES
  );
  if (oversizedVisual) {
    return `${oversizedVisual.name || oversizedVisual.label || "One video"} is ${formatMediaBytes(
      getSourceFileSize(oversizedVisual)
    )}. Browser clean-audio sync is capped at ${formatMediaBytes(
      BROWSER_SYNC_MAX_SINGLE_VISUAL_BYTES
    )} per source.`;
  }

  const totalVisualBytes = videoSources.reduce((sum, source) => sum + getSourceFileSize(source), 0);
  if (totalVisualBytes > BROWSER_SYNC_MAX_TOTAL_VISUAL_BYTES) {
    return `Your camera files total ${formatMediaBytes(totalVisualBytes)}. Browser clean-audio sync is capped at ${formatMediaBytes(
      BROWSER_SYNC_MAX_TOTAL_VISUAL_BYTES
    )} total to avoid crashing Chrome/Firefox.`;
  }

  const externalAudioBytes = Number(externalTrack?.file?.size || 0);
  if (externalAudioBytes > BROWSER_SYNC_MAX_EXTERNAL_AUDIO_BYTES) {
    return `${externalTrack?.name || "External audio"} is ${formatMediaBytes(
      externalAudioBytes
    )}. Browser waveform analysis is capped at ${formatMediaBytes(
      BROWSER_SYNC_MAX_EXTERNAL_AUDIO_BYTES
    )}; larger clean audio needs server/proxy sync.`;
  }

  const longSource = videoSources.find(
    source => Number(source.duration || 0) > BROWSER_SYNC_MAX_DURATION_SECONDS
  );
  if (longSource) {
    return `${longSource.name || longSource.label || "One video"} is ${formatDurationLabel(
      longSource.duration
    )}. Browser waveform sync is capped at ${formatDurationLabel(
      BROWSER_SYNC_MAX_DURATION_SECONDS
    )}; longer podcast sessions need server/proxy sync.`;
  }

  return "";
};
const estimateCleanAudioSyncCredits = (visualSources = [], externalTrack = null) => {
  const videoSources = visualSources.filter(isVideoSource);
  const longestDuration = Math.max(
    0,
    ...videoSources.map(source => Number(source.duration || 0)),
    Number(externalTrack?.duration || 0)
  );
  const durationMinutes = Math.max(1, longestDuration / 60);
  const totalBytes =
    videoSources.reduce((sum, source) => sum + getSourceFileSize(source), 0) +
    Number(externalTrack?.file?.size || 0);
  return Math.max(
    18,
    Math.ceil(10 + videoSources.length * 6 + durationMinutes * 1.25 + totalBytes / BYTES_PER_GB * 4)
  );
};

const estimateMulticamRenderCredits = renderTier => {
  const tier = String(renderTier || "premium").trim().toLowerCase().replace(/-/g, "_");
  if (tier === "simple") return Math.max(8, Math.round(MULTICAM_RENDER_BASE_CREDITS * 0.67));
  if (tier === "studio") {
    return Math.max(MULTICAM_RENDER_BASE_CREDITS + 8, Math.ceil(MULTICAM_RENDER_BASE_CREDITS * 1.6));
  }
  return MULTICAM_RENDER_BASE_CREDITS;
};

const getSourceTimelineTime = (source, playhead, timelineStart) =>
  getSourceTimelineTimeAtPlayhead(source, playhead, timelineStart);

const getSourceSyncRate = source => clampNumber(source?.syncRate ?? source?.sync_rate, 0.95, 1.05, 1);

const getPreflightCameraResults = preflight =>
  Object.entries(preflight?.cameras || {})
    .map(([key, value], index) => ({ key, index, ...(value || {}) }))
    .sort((left, right) => {
      const leftIndex = Number(String(left.key).match(/\d+/)?.[0]);
      const rightIndex = Number(String(right.key).match(/\d+/)?.[0]);
      return (Number.isFinite(leftIndex) ? leftIndex : left.index) - (Number.isFinite(rightIndex) ? rightIndex : right.index);
    });

const applyPreflightSyncSuggestions = (sourcesPayload, preflight) => {
  const cameraResults = getPreflightCameraResults(preflight);
  const adjustments = [];

  cameraResults.forEach((cameraResult, index) => {
    const payload = sourcesPayload[index];
    if (!payload) return;

    const suggestedOffset = Number(cameraResult.suggested_offset_seconds);
    const suggestedSyncRate = Number(cameraResult.suggested_sync_rate);
    const fit = cameraResult.sync_fit || {};
    const maxFitError = Number(fit.max_fit_error_seconds ?? cameraResult.max_residual_offset_seconds);
    const avgCorrelation = Number(cameraResult.avg_correlation);
    const hasUsableFit =
      fit.status === "fit" &&
      Number.isFinite(suggestedOffset) &&
      Number.isFinite(suggestedSyncRate) &&
      suggestedSyncRate >= 0.95 &&
      suggestedSyncRate <= 1.05 &&
      (!Number.isFinite(maxFitError) || maxFitError <= 0.2) &&
      (!Number.isFinite(avgCorrelation) || avgCorrelation >= 0.25);

    if (!hasUsableFit) return;

    const previousOffset = Number(payload.offset_seconds || 0);
    const previousSyncRate = Number(payload.sync_rate || payload.syncRate || 1);
    const nextOffset = Number(suggestedOffset.toFixed(6));
    const nextSyncRate = Number(suggestedSyncRate.toFixed(9));
    const changed =
      Math.abs(previousOffset - nextOffset) > 0.001 ||
      Math.abs(previousSyncRate - nextSyncRate) > 0.000001;

    payload.offset_seconds = nextOffset;
    payload.sync_rate = nextSyncRate;
    payload.syncRate = nextSyncRate;

    if (changed) {
      adjustments.push({
        id: payload.id,
        label: payload.label,
        previousOffset,
        previousSyncRate,
        offsetSeconds: nextOffset,
        syncRate: nextSyncRate,
        confidence: cameraResult.confidence,
        maxFitError: Number.isFinite(maxFitError) ? Number(maxFitError.toFixed(3)) : null,
      });
    }
  });

  return adjustments;
};

const getSyncRateFromWorkerMatch = (match, fallback = 1) => {
  const points = Array.isArray(match?.drift?.points) ? match.drift.points : [];
  const debug = match?.debug || {};
  const cleanDuration = Number(debug.cleanDuration);
  if (!match?.drift?.hasDrift || points.length < 2 || !Number.isFinite(cleanDuration) || cleanDuration <= 1) {
    return clampNumber(fallback, 0.95, 1.05, 1);
  }
  const positionToFraction = { start: 0.05, middle: 0.5, end: 0.9 };
  const ordered = points
    .map(point => ({
      fraction: positionToFraction[String(point.position || "").toLowerCase()],
      offset: Number(point.offsetSeconds),
    }))
    .filter(point => Number.isFinite(point.fraction) && Number.isFinite(point.offset))
    .sort((a, b) => a.fraction - b.fraction);
  if (ordered.length < 2) return clampNumber(fallback, 0.95, 1.05, 1);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const spanSeconds = Math.max(1, (last.fraction - first.fraction) * cleanDuration);
  const driftSeconds = last.offset - first.offset;
  return clampNumber(1 + driftSeconds / spanSeconds, 0.99, 1.01, fallback || 1);
};

const loadVideoMetadata = mediaUrl =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    if (!applySafeMediaSource(video, mediaUrl)) {
      reject(new Error("Failed to read video metadata"));
      return;
    }
    video.onloadedmetadata = () => {
      resolve({
        duration: Number(video.duration) || 0,
        videoWidth: Number(video.videoWidth) || 0,
        videoHeight: Number(video.videoHeight) || 0,
      });
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => reject(new Error("Failed to read video metadata"));
  });

const loadImageMetadata = mediaUrl =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () =>
      resolve({
        duration: DEFAULT_IMAGE_SEGMENT_DURATION,
        videoWidth: Number(image.naturalWidth) || 0,
        videoHeight: Number(image.naturalHeight) || 0,
      });
    image.onerror = () => reject(new Error("Failed to read image metadata"));
    if (!applySafeMediaSource(image, mediaUrl)) {
      reject(new Error("Failed to read image metadata"));
    }
  });

const canRenderVisual = visual => {
  if (!visual) return false;
  if (typeof visual.tagName === "string" && visual.tagName.toLowerCase() === "img") {
    return Boolean(visual.complete && (visual.naturalWidth || visual.width));
  }
  return Number(visual.readyState) >= 2;
};

const getVisualDimensions = (visual, fallbackWidth, fallbackHeight) => {
  if (typeof visual?.tagName === "string" && visual.tagName.toLowerCase() === "img") {
    return {
      width: Number(visual.naturalWidth || visual.width) || fallbackWidth,
      height: Number(visual.naturalHeight || visual.height) || fallbackHeight,
    };
  }
  return {
    width: Number(visual?.videoWidth) || fallbackWidth,
    height: Number(visual?.videoHeight) || fallbackHeight,
  };
};

const buildFallbackAudioAnalysis = duration => {
  const safeDuration = clampNumber(duration, 4, 240, 30);
  const binCount = Math.max(32, Math.ceil(safeDuration * AUDIO_SYNC_BINS_PER_SECOND));
  return {
    envelope: Array.from({ length: binCount }, (_, index) => {
      const position = index / Math.max(1, binCount - 1);
      const pulse = Math.sin(position * Math.PI * 8) * 0.18;
      const build = position < 0.68 ? position * 0.45 : (1 - position) * 0.28;
      return clampNumber(0.38 + pulse + build, 0.14, 1, 0.42);
    }),
    secondsPerBin: safeDuration / binCount,
    duration: safeDuration,
    synthetic: true,
  };
};

const getMediaDuration = mediaUrl =>
  new Promise(resolve => {
    if (typeof document === "undefined") {
      resolve(30);
      return;
    }
    const media = document.createElement("video");
    media.preload = "metadata";
    media.muted = true;
    const cleanup = () => {
      media.removeAttribute("src");
      media.load?.();
    };
    media.onloadedmetadata = () => {
      const duration = Number(media.duration);
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 30);
    };
    media.onerror = () => {
      cleanup();
      resolve(30);
    };
    if (!applySafeMediaSource(media, mediaUrl)) {
      cleanup();
      resolve(30);
    }
  });

const analyzeAudioTrack = async mediaUrl => {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error("Failed to load audio for analysis.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Audio analysis is not supported in this browser.");
  }

  const audioContext = new AudioContextClass();
  try {
    let audioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      const fallbackDuration = await getMediaDuration(mediaUrl);
      return buildFallbackAudioAnalysis(fallbackDuration);
    }
    const channelCount = Math.max(1, audioBuffer.numberOfChannels || 1);
    const sampleRate = audioBuffer.sampleRate || 44100;
    const samplesPerBin = Math.max(256, Math.floor(sampleRate / AUDIO_SYNC_BINS_PER_SECOND));
    const sampleLength = audioBuffer.length;
    const envelope = [];

    for (let start = 0; start < sampleLength; start += samplesPerBin) {
      const end = Math.min(sampleLength, start + samplesPerBin);
      let total = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const channelData = audioBuffer.getChannelData(channelIndex);
        let channelTotal = 0;
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
          channelTotal += Math.abs(channelData[sampleIndex] || 0);
        }
        total += channelTotal / Math.max(1, end - start);
      }
      envelope.push(total / channelCount);
    }

    const peak = Math.max(...envelope, 0.0001);
    return {
      envelope: envelope.map(value => value / peak),
      secondsPerBin: samplesPerBin / sampleRate,
      duration: audioBuffer.duration || 0,
    };
  } finally {
    audioContext.close().catch(() => {});
  }
};

const buildWaveformBars = (envelope, barCount = WAVEFORM_BAR_COUNT) => {
  if (!Array.isArray(envelope) || !envelope.length) return [];
  const bars = [];
  for (let index = 0; index < barCount; index += 1) {
    const start = Math.floor((index / barCount) * envelope.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / barCount) * envelope.length));
    const slice = envelope.slice(start, end);
    const average = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
    bars.push(Math.max(0.12, Math.min(1, average)));
  }
  return bars;
};

const estimateAudioOffsetSeconds = (masterAnalysis, targetAnalysis, maxShiftSeconds = 120) => {
  if (!masterAnalysis?.envelope?.length || !targetAnalysis?.envelope?.length) {
    return 0;
  }

  const secondsPerBin = Math.max(
    masterAnalysis.secondsPerBin || 1 / AUDIO_SYNC_BINS_PER_SECOND,
    targetAnalysis.secondsPerBin || 1 / AUDIO_SYNC_BINS_PER_SECOND
  );
  const maxShiftBins = Math.max(1, Math.round(maxShiftSeconds / secondsPerBin));
  let bestShiftBins = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let shiftBins = -maxShiftBins; shiftBins <= maxShiftBins; shiftBins += 1) {
    let totalDifference = 0;
    let comparedBins = 0;

    for (let masterIndex = 0; masterIndex < masterAnalysis.envelope.length; masterIndex += 1) {
      const targetIndex = masterIndex - shiftBins;
      if (targetIndex < 0 || targetIndex >= targetAnalysis.envelope.length) continue;
      totalDifference += Math.abs(
        masterAnalysis.envelope[masterIndex] - targetAnalysis.envelope[targetIndex]
      );
      comparedBins += 1;
    }

    if (comparedBins < 20) continue;
    const normalizedScore = totalDifference / comparedBins;
    if (normalizedScore < bestScore) {
      bestScore = normalizedScore;
      bestShiftBins = shiftBins;
    }
  }

  return Number((bestShiftBins * secondsPerBin).toFixed(3));
};

const syncMediaElement = (element, desiredTime, shouldPlay, options = {}) => {
  if (!element) return;
  if (typeof element.play !== "function" || typeof element.pause !== "function") return;

  const {
    muted = true,
    volume = 0,
    driftThreshold = DRIFT_THRESHOLD_SECONDS,
    playbackRate = 1,
    allowRateCorrection = false,
    softDriftThreshold = Math.min(0.08, driftThreshold / 2),
    maxRateAdjustment = 0.12,
  } = options;

  element.muted = muted;
  element.volume = volume;

  const safeTime = Math.max(0, Number(desiredTime) || 0);
  const currentTime = Number(element.currentTime) || 0;
  const drift = safeTime - currentTime;

  if (Math.abs(drift) > driftThreshold) {
    try {
      element.currentTime = safeTime;
      element.playbackRate = playbackRate;
    } catch {
      return;
    }
  } else if (allowRateCorrection && shouldPlay && Math.abs(drift) > softDriftThreshold) {
    const direction = drift > 0 ? 1 : -1;
    const driftRatio = Math.min(1, Math.abs(drift) / Math.max(softDriftThreshold, 0.001));
    const adjustment = maxRateAdjustment * driftRatio * direction;
    element.playbackRate = Math.max(0.85, Math.min(1.15, playbackRate + adjustment));
  } else {
    element.playbackRate = playbackRate;
  }

  if (shouldPlay) {
    if (element.paused) {
      element.play().catch(() => {});
    }
    return;
  }

  if (!element.paused) {
    element.pause();
  }
};

const forceMediaAudible = element => {
  if (!element) return;
  element.defaultMuted = false;
  element.muted = false;
  element.volume = 1;
  element.removeAttribute?.("muted");
};

const getLoopedTrackTime = (desiredTime, trackDuration, shouldLoop) => {
  const safeDesiredTime = Math.max(0, Number(desiredTime) || 0);
  const safeDuration = Math.max(0, Number(trackDuration) || 0);
  if (!shouldLoop || safeDuration <= 0.2) return safeDesiredTime;
  const loopTime = safeDesiredTime % safeDuration;
  return Number(loopTime.toFixed(3));
};

const traceRoundedRect = (context, x, y, width, height, radius) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, safeRadius);
    return;
  }
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
};

const drawCanvasBadge = (context, text, x, y) => {
  if (!text) return;
  context.save();
  context.font = "600 20px sans-serif";
  const paddingX = 14;
  const paddingY = 10;
  const textWidth = context.measureText(text).width;
  const width = textWidth + paddingX * 2;
  const height = 36;
  context.fillStyle = "rgba(6, 10, 18, 0.72)";
  traceRoundedRect(context, x, y, width, height, 18);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.14)";
  traceRoundedRect(context, x + 0.5, y + 0.5, width - 1, height - 1, 17);
  context.stroke();
  context.fillStyle = "rgba(255, 248, 236, 0.96)";
  context.fillText(text, x + paddingX, y + height - paddingY);
  context.restore();
};

const drawPremiumCanvasCard = (context, viewport, accentColor, drawContent) => {
  const radius = Math.max(8, Math.min(16, Math.min(viewport.width, viewport.height) * 0.026));
  context.save();
  context.fillStyle = "rgba(0, 0, 0, 0.18)";
  traceRoundedRect(context, viewport.x + 8, viewport.y + 10, viewport.width, viewport.height, radius);
  context.fill();
  context.restore();

  context.save();
  traceRoundedRect(context, viewport.x, viewport.y, viewport.width, viewport.height, radius);
  context.clip();
  const gradient = context.createLinearGradient(
    viewport.x,
    viewport.y,
    viewport.x + viewport.width,
    viewport.y + viewport.height
  );
  gradient.addColorStop(0, "rgba(15, 23, 42, 0.98)");
  gradient.addColorStop(1, "rgba(3, 7, 18, 0.98)");
  context.fillStyle = gradient;
  context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
  drawContent();
  context.restore();

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.10)";
  context.lineWidth = 1;
  traceRoundedRect(
    context,
    viewport.x + context.lineWidth / 2,
    viewport.y + context.lineWidth / 2,
    viewport.width - context.lineWidth,
    viewport.height - context.lineWidth,
    radius
  );
  context.stroke();
  context.restore();
};

const paintVisualToViewport = (context, viewport, activeVisual, label, framing = {}) => {
  const safeViewport = {
    x: Number(viewport?.x) || 0,
    y: Number(viewport?.y) || 0,
    width: Math.max(1, Number(viewport?.width) || 1),
    height: Math.max(1, Number(viewport?.height) || 1),
  };

  context.save();
  context.beginPath();
  context.rect(safeViewport.x, safeViewport.y, safeViewport.width, safeViewport.height);
  context.clip();
  context.fillStyle = "#04070d";
  context.fillRect(safeViewport.x, safeViewport.y, safeViewport.width, safeViewport.height);

  if (canRenderVisual(activeVisual)) {
    const { width: sourceWidth, height: sourceHeight } = getVisualDimensions(
      activeVisual,
      safeViewport.width,
      safeViewport.height
    );
    const baseScale = Math.min(
      safeViewport.width / sourceWidth,
      safeViewport.height / sourceHeight
    );
    const normalizedFraming = normalizeSegmentFraming(framing);
    const focusPoint = getSegmentFocusPoint(normalizedFraming);
    const zoom = Math.max(1, Number(normalizedFraming.zoom) || 1);
    const scale = baseScale * zoom;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const requestedOffsetX =
      safeViewport.x + safeViewport.width * focusPoint.x - drawWidth * focusPoint.x;
    const requestedOffsetY =
      safeViewport.y + safeViewport.height * focusPoint.y - drawHeight * focusPoint.y;
    const offsetX = clampNumber(
      requestedOffsetX,
      Math.min(safeViewport.x, safeViewport.x + safeViewport.width - drawWidth),
      safeViewport.x,
      safeViewport.x + (safeViewport.width - drawWidth) / 2
    );
    const offsetY = clampNumber(
      requestedOffsetY,
      Math.min(safeViewport.y, safeViewport.y + safeViewport.height - drawHeight),
      safeViewport.y,
      safeViewport.y + (safeViewport.height - drawHeight) / 2
    );
    const translateXPx = safeViewport.width * (Number(normalizedFraming.translateX) || 0);
    const translateYPx = safeViewport.height * (Number(normalizedFraming.translateY) || 0);
    const tiltRadians = ((Number(normalizedFraming.tilt) || 0) * Math.PI) / 180;
    context.filter = `brightness(${Number(normalizedFraming.brightness || 1).toFixed(3)}) contrast(${Number(
      normalizedFraming.contrast || 1
    ).toFixed(3)}) saturate(${Number(normalizedFraming.saturation || 1).toFixed(3)})`;
    if (normalizedFraming.glow > 0) {
      context.shadowColor =
        normalizedFraming.frameStyle === "poster"
          ? "rgba(249, 115, 22, 0.55)"
          : "rgba(125, 211, 252, 0.48)";
      context.shadowBlur = 26 * Number(normalizedFraming.glow);
    }
    context.translate(
      safeViewport.x + safeViewport.width / 2 + translateXPx,
      safeViewport.y + safeViewport.height / 2 + translateYPx
    );
    if (tiltRadians) {
      context.rotate(tiltRadians);
    }
    context.drawImage(
      activeVisual,
      offsetX - (safeViewport.x + safeViewport.width / 2),
      offsetY - (safeViewport.y + safeViewport.height / 2),
      drawWidth,
      drawHeight
    );
    context.filter = "none";
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    if (normalizedFraming.frameStyle !== "none") {
      const inset = normalizedFraming.frameStyle === "poster" ? 8 : normalizedFraming.frameStyle === "cinematic" ? 14 : 10;
      context.strokeStyle =
        normalizedFraming.frameStyle === "poster"
          ? "rgba(255, 247, 237, 0.78)"
          : normalizedFraming.frameStyle === "glow"
            ? "rgba(186, 230, 253, 0.62)"
            : "rgba(255, 255, 255, 0.34)";
      context.lineWidth = normalizedFraming.frameStyle === "poster" ? 4 : 2;
      context.strokeRect(
        -safeViewport.width / 2 + inset,
        -safeViewport.height / 2 + inset,
        safeViewport.width - inset * 2,
        safeViewport.height - inset * 2
      );
    }
  } else {
    context.fillStyle = "rgba(255, 255, 255, 0.75)";
    context.font = `${Math.max(16, Math.round(safeViewport.width * 0.038))}px sans-serif`;
    context.textAlign = "center";
    context.fillText(
      label || "No active camera frame",
      safeViewport.x + safeViewport.width / 2,
      safeViewport.y + safeViewport.height / 2
    );
  }

  context.restore();
};

const getTransitionPalette = accentTone => {
  if (accentTone === "warm") {
    return {
      primary: "rgba(249, 115, 22, ALPHA)",
      secondary: "rgba(251, 191, 36, ALPHA)",
      glow: "rgba(255, 247, 237, ALPHA)",
    };
  }
  if (accentTone === "rose") {
    return {
      primary: "rgba(244, 114, 182, ALPHA)",
      secondary: "rgba(251, 146, 60, ALPHA)",
      glow: "rgba(255, 228, 230, ALPHA)",
    };
  }
  if (accentTone === "gold") {
    return {
      primary: "rgba(250, 204, 21, ALPHA)",
      secondary: "rgba(249, 115, 22, ALPHA)",
      glow: "rgba(255, 251, 235, ALPHA)",
    };
  }
  if (accentTone === "choir") {
    return {
      primary: "rgba(251, 191, 36, ALPHA)",
      secondary: "rgba(255, 255, 255, ALPHA)",
      glow: "rgba(254, 249, 195, ALPHA)",
    };
  }
  return {
    primary: "rgba(56, 189, 248, ALPHA)",
    secondary: "rgba(125, 211, 252, ALPHA)",
    glow: "rgba(239, 246, 255, ALPHA)",
  };
};

const getFlowTransitionState = (segment, playhead) => {
  if (!segment) {
    return { active: false, progress: 1, intensity: 0 };
  }
  const segmentDuration = Math.max(0.12, Number(segment.duration) || 0.12);
  const introWindow = Math.min(0.34, Math.max(0.12, segmentDuration * 0.34));
  const progress = clampNumber(
    (Number(playhead) - Number(segment.startTime || 0)) / introWindow,
    0,
    1,
    1
  );
  const active = progress < 0.98;
  return {
    active,
    progress,
    intensity: Number((1 - progress).toFixed(4)),
  };
};

const drawFlowTransitionOverlay = (context, width, height, framing = {}, transitionState = {}) => {
  const normalizedFraming = normalizeSegmentFraming(framing);
  const transitionStyle = normalizedFraming.transitionStyle || "cut";
  const baseStrength = Number(normalizedFraming.transitionStrength || 0);
  const activeStrength = baseStrength * Number(transitionState?.intensity || 0);
  if (transitionStyle === "cut" || activeStrength <= 0.01) return;

  const palette = getTransitionPalette(normalizedFraming.accentTone);
  context.save();

  if (transitionStyle === "flash") {
    context.fillStyle = palette.glow.replace("ALPHA", (0.1 + activeStrength * 0.22).toFixed(3));
    context.fillRect(0, 0, width, height);
  } else if (transitionStyle === "bloom") {
    const gradient = context.createRadialGradient(
      width * 0.5,
      height * 0.48,
      width * 0.08,
      width * 0.5,
      height * 0.48,
      width * 0.62
    );
    gradient.addColorStop(0, palette.glow.replace("ALPHA", (0.16 + activeStrength * 0.22).toFixed(3)));
    gradient.addColorStop(0.42, palette.primary.replace("ALPHA", (0.08 + activeStrength * 0.14).toFixed(3)));
    gradient.addColorStop(1, "rgba(5, 8, 16, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (transitionStyle === "sweep") {
    const sweepX = width * (0.18 + (1 - Number(transitionState?.progress || 0)) * 0.64);
    const gradient = context.createLinearGradient(sweepX - width * 0.24, 0, sweepX + width * 0.24, 0);
    gradient.addColorStop(0, "rgba(5, 8, 16, 0)");
    gradient.addColorStop(0.48, palette.primary.replace("ALPHA", (0.08 + activeStrength * 0.18).toFixed(3)));
    gradient.addColorStop(0.56, palette.secondary.replace("ALPHA", (0.14 + activeStrength * 0.22).toFixed(3)));
    gradient.addColorStop(1, "rgba(5, 8, 16, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (transitionStyle === "lift") {
    const gradient = context.createLinearGradient(0, height, 0, height * 0.22);
    gradient.addColorStop(0, palette.primary.replace("ALPHA", (0.08 + activeStrength * 0.16).toFixed(3)));
    gradient.addColorStop(0.4, palette.secondary.replace("ALPHA", (0.05 + activeStrength * 0.12).toFixed(3)));
    gradient.addColorStop(1, "rgba(5, 8, 16, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (transitionStyle === "drift") {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.secondary.replace("ALPHA", (0.05 + activeStrength * 0.09).toFixed(3)));
    gradient.addColorStop(0.52, "rgba(5, 8, 16, 0)");
    gradient.addColorStop(1, palette.primary.replace("ALPHA", (0.04 + activeStrength * 0.08).toFixed(3)));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  context.restore();
};

const getSceneGridViewports = (width, height, visibleCount) => {
  const count = Math.max(1, Math.min(6, Number(visibleCount) || 1));

  if (count <= 1) {
    return [{ x: 0, y: 0, width, height }];
  }

  if (count === 2) {
    const cardWidth = width * 0.9407;
    const cardHeight = height * 0.325;
    const x = width * 0.0296;
    const topY = height * 0.1531;
    return [
      { x, y: topY, width: cardWidth, height: cardHeight },
      { x, y: height * 0.5219, width: cardWidth, height: cardHeight },
    ];
  }

  if (count === 3) {
    const topWidth = width * 0.9407;
    const topHeight = height * 0.34;
    const bottomWidth = width * 0.4611;
    const bottomHeight = height * 0.34;
    return [
      { x: width * 0.0296, y: height * 0.0938, width: topWidth, height: topHeight },
      { x: width * 0.0296, y: height * 0.4567, width: bottomWidth, height: bottomHeight },
      { x: width * 0.5093, y: height * 0.4567, width: bottomWidth, height: bottomHeight },
    ];
  }

  const gap = Math.max(4, Math.round(Math.min(width, height) * 0.012));

  if (count === 4) {
    const cellWidth = Math.round((width - gap) / 2);
    const cellHeight = Math.round((height - gap) / 2);
    return [0, 1, 2, 3].map(index => ({
      x: (index % 2) * (cellWidth + gap),
      y: Math.floor(index / 2) * (cellHeight + gap),
      width: index % 2 === 0 ? cellWidth : width - cellWidth - gap,
      height: Math.floor(index / 2) === 0 ? cellHeight : height - cellHeight - gap,
    }));
  }

  if (count === 5) {
    const heroHeight = Math.round(height * 0.36);
    const lowerHeight = height - heroHeight - gap;
    const cellWidth = Math.round((width - gap) / 2);
    const cellHeight = Math.round((lowerHeight - gap) / 2);
    return [
      { x: 0, y: 0, width, height: heroHeight },
      { x: 0, y: heroHeight + gap, width: cellWidth, height: cellHeight },
      {
        x: cellWidth + gap,
        y: heroHeight + gap,
        width: width - cellWidth - gap,
        height: cellHeight,
      },
      {
        x: 0,
        y: heroHeight + gap + cellHeight + gap,
        width: cellWidth,
        height: height - heroHeight - cellHeight - gap * 2,
      },
      {
        x: cellWidth + gap,
        y: heroHeight + gap + cellHeight + gap,
        width: width - cellWidth - gap,
        height: height - heroHeight - cellHeight - gap * 2,
      },
    ];
  }

  const cellWidth = Math.round((width - gap) / 2);
  const cellHeight = Math.round((height - gap * 2) / 3);
  return Array.from({ length: 6 }, (_, index) => ({
    x: (index % 2) * (cellWidth + gap),
    y: Math.floor(index / 2) * (cellHeight + gap),
    width: index % 2 === 0 ? cellWidth : width - cellWidth - gap,
    height: Math.floor(index / 2) < 2 ? cellHeight : height - cellHeight * 2 - gap * 2,
  }));
};

const getSharedMomentPreviewViewports = (width, height) => {
  const sidePadding = width * 0.024;
  const cardGap = Math.max(width * 0.02, 2);
  const cardWidth = (width - sidePadding * 2 - cardGap) / 2;
  const cardHeight = height - height * 0.076;
  const cardY = height * 0.038;
  return [
    { x: sidePadding, y: cardY, width: cardWidth, height: cardHeight },
    { x: sidePadding + cardWidth + cardGap, y: cardY, width: cardWidth, height: cardHeight },
  ];
};

const getPipPreviewViewports = (width, height) => {
  const heroWidth = width * 0.9407;
  const heroHeight = height * 0.48;
  const heroX = width * 0.0296;
  const heroY = height * 0.0615;
  const pipWidth = width * 0.54;
  const pipHeight = height * 0.26;
  return [
    { x: heroX, y: heroY, width: heroWidth, height: heroHeight },
    { x: width - pipWidth - width * 0.0352, y: height * 0.4686, width: pipWidth, height: pipHeight },
  ];
};

const drawVisualToCanvas = (
  context,
  canvas,
  activeVisual,
  label,
  framing = {},
  transitionState = null
) => {
  context.fillStyle = "#04070d";
  context.fillRect(0, 0, canvas.width, canvas.height);

  paintVisualToViewport(
    context,
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    activeVisual,
    label,
    framing
  );
  drawFlowTransitionOverlay(context, canvas.width, canvas.height, framing, transitionState);
};

const drawCompositeVisualToCanvas = (
  context,
  canvas,
  {
    layoutMode = "cut",
    primaryVideo,
    secondaryVideo,
    primaryLabel,
    secondaryLabel,
    primaryFraming = {},
    transitionState = null,
    visibleFeeds = [],
  }
) => {
  if (layoutMode === "scene-grid") {
    const feeds =
      Array.isArray(visibleFeeds) && visibleFeeds.length
        ? visibleFeeds.slice(0, 6)
        : [
            { video: primaryVideo, label: primaryLabel, framing: primaryFraming },
            secondaryVideo ? { video: secondaryVideo, label: secondaryLabel, framing: {} } : null,
          ].filter(Boolean);
    const viewports = getSceneGridViewports(canvas.width, canvas.height, feeds.length);
    context.fillStyle = "#04070d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    feeds.forEach((feed, index) => {
      const viewport = viewports[index];
      if (!viewport) return;
      drawPremiumCanvasCard(
        context,
        viewport,
        index === 0 ? "rgba(249, 115, 22, 0.36)" : "rgba(255, 255, 255, 0.2)",
        () =>
          paintVisualToViewport(
            context,
            viewport,
            feed.video,
            feed.label,
            index === 0 ? feed.framing || primaryFraming : feed.framing || {}
          )
      );
      if (feed.label) {
        drawCanvasBadge(context, feed.label, viewport.x + 12, viewport.y + 12);
      }
    });
    return;
  }

  if (!secondaryVideo || layoutMode === "cut") {
    drawVisualToCanvas(context, canvas, primaryVideo, primaryLabel, primaryFraming, transitionState);
    if (primaryLabel) {
      drawCanvasBadge(context, primaryLabel, 18, 18);
    }
    return;
  }

  if (layoutMode === "split-vertical") {
    const [primaryViewport, secondaryViewport] = getSharedMomentPreviewViewports(
      canvas.width,
      canvas.height
    );
    context.fillStyle = "#04070d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawPremiumCanvasCard(
      context,
      primaryViewport,
      "rgba(249, 115, 22, 0.36)",
      () =>
        paintVisualToViewport(
          context,
          primaryViewport,
          primaryVideo,
          primaryLabel,
          primaryFraming
        )
    );
    drawPremiumCanvasCard(
      context,
      secondaryViewport,
      "rgba(56, 189, 248, 0.36)",
      () =>
        paintVisualToViewport(
          context,
          secondaryViewport,
          secondaryVideo,
          secondaryLabel,
          {}
        )
    );
    drawFlowTransitionOverlay(context, canvas.width, canvas.height, primaryFraming, transitionState);
    drawCanvasBadge(context, primaryLabel, primaryViewport.x + 14, primaryViewport.y + 14);
    drawCanvasBadge(context, secondaryLabel, secondaryViewport.x + 14, secondaryViewport.y + 14);
    return;
  }

  context.fillStyle = "#04070d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const [heroViewport, pipViewport] = getPipPreviewViewports(canvas.width, canvas.height);
  drawPremiumCanvasCard(
    context,
    heroViewport,
    "rgba(248, 250, 252, 0.28)",
    () =>
      paintVisualToViewport(
        context,
        heroViewport,
        primaryVideo,
        primaryLabel,
        primaryFraming
      )
  );
  drawPremiumCanvasCard(
    context,
    pipViewport,
    "rgba(248, 250, 252, 0.42)",
    () =>
      paintVisualToViewport(
        context,
        pipViewport,
        secondaryVideo,
        secondaryLabel,
        {}
      )
  );
  drawCanvasBadge(context, primaryLabel, heroViewport.x + 14, heroViewport.y + 14);
  drawCanvasBadge(context, secondaryLabel, pipViewport.x + 12, pipViewport.y + 12);
};

const pickExportMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) || "";
};

const buildMulticamDraftKey = sources => {
  const fingerprint = (sources || [])
    .map(source => {
      const file = source?.file;
      return [
        source?.id || "",
        file?.name || source?.name || source?.label || "",
        file?.size || source?.size || 0,
        file?.lastModified || 0,
      ].join(":");
    })
    .join("|");
  return fingerprint ? `autopromote:multicam-draft:${fingerprint}` : "";
};

function MultiCamCombiner({ primaryFile, onCancel, onComplete, onStatusChange }) {
  const { canUseFeature, credits } = useSubscription();
  const [sources, setSources] = useState(() =>
    buildInitialSources(primaryFile).map((source, index) => ({
      ...source,
      id: source.id || `cam-${index + 1}`,
      label: normalizeSourceLabel(source.label, index),
      name: source.file?.name || normalizeSourceLabel(source.label, index),
      videoWidth: 0,
      videoHeight: 0,
    }))
  );
  const currentSourcesRef = useRef(sources);
  const [switches, setSwitches] = useState([{ id: "switch-1", cameraId: "cam-1", startTime: 0 }]);
  const [masterAudioCameraId, setMasterAudioCameraId] = useState("cam-1");
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSwitchId, setSelectedSwitchId] = useState("switch-1");
  const [previewProgramOverride, setPreviewProgramOverride] = useState(null);
  const [manualRenderEditsEnabled, setManualRenderEditsEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [outputAspectRatio, setOutputAspectRatio] = useState("9:16");
  const [exportResult, setExportResult] = useState(null);
  const [recentRenders, setRecentRenders] = useState([]);
  const [recentRendersStatus, setRecentRendersStatus] = useState("");
  const [serverExportPending, setServerExportPending] = useState(false);
  const [singleCamSegments, setSingleCamSegments] = useState([]);
  const [selectedSingleCamSegmentId, setSelectedSingleCamSegmentId] = useState(null);
  const [singleCamSegmentFraming, setSingleCamSegmentFraming] = useState({});
  const [singleLensAutoSummary, setSingleLensAutoSummary] = useState("");
  const [focusPickerActive, setFocusPickerActive] = useState(false);
  const [multicamLayoutMode, setMulticamLayoutMode] = useState("cut");
  const [directorStyleId, setDirectorStyleId] = useState(DIRECTOR_STYLE_PRESETS[0].id);
  const [autoDirectorEnabled, setAutoDirectorEnabled] = useState(false);
  const [autoDirectorSummary, setAutoDirectorSummary] = useState(null);
  const [studioMode, setStudioMode] = useState("combine");
  const [flowEditStyleId, setFlowEditStyleId] = useState(FLOW_EDIT_STYLE_PRESETS[1].id);
  const [flowImageStoryTemplateId, setFlowImageStoryTemplateId] = useState(
    IMAGE_STORY_TEMPLATE_PRESETS[0].id
  );
  const [flowAuraTemplateId, setFlowAuraTemplateId] = useState(FLOW_AURA_TEMPLATE_PRESETS[0].id);
  const [flowIntensityMode, setFlowIntensityMode] = useState("standard");
  const [flowAudioTrack, setFlowAudioTrack] = useState(null);
  const [flowEditPlan, setFlowEditPlan] = useState(null);
  const [flowEditEnabled, setFlowEditEnabled] = useState(false);
  const [isGeneratingFlowEdit, setIsGeneratingFlowEdit] = useState(false);
  const [flowEditStatusStep, setFlowEditStatusStep] = useState("");
  const [selectedFlowSegmentId, setSelectedFlowSegmentId] = useState(null);
  const [flowEditVariants, setFlowEditVariants] = useState([]);
  const [flowEditInsight, setFlowEditInsight] = useState("");
  const [flowEditWarning, setFlowEditWarning] = useState("");
  const [flowSegmentFraming, setFlowSegmentFraming] = useState({});
  const [useExternalCleanAudio, setUseExternalCleanAudio] = useState(false);
  const [externalAudioTrack, setExternalAudioTrack] = useState(null);
  const [externalAudioMixMode, setExternalAudioMixMode] = useState("external_only");
  const [cleanAudioSyncJob, setCleanAudioSyncJob] = useState(null);
  const [multicamRenderTier, setMulticamRenderTier] = useState("premium");
  const [cloudRenderWindowStart, setCloudRenderWindowStart] = useState(0);
  const [billingPanelOpen, setBillingPanelOpen] = useState(false);

  const cancelExportRef = useRef(false);
  const exportPollIntervalRef = useRef(null);
  const fileInputRef = useRef(null);
  const flowAudioInputRef = useRef(null);
  const externalAudioInputRef = useRef(null);
  const nextCameraIndexRef = useRef(3);
  const objectUrlsRef = useRef(new Set());
  const animationFrameRef = useRef(null);

  const loadRecentRenders = useCallback(async () => {
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      setRecentRendersStatus("Loading saved masters...");
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/media/renders?limit=8`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load saved masters");
      }
      setRecentRenders(Array.isArray(data.renders) ? data.renders : []);
      setRecentRendersStatus("");
    } catch (error) {
      console.warn("Could not load Cam Combiner renders", error);
      setRecentRendersStatus("Saved masters could not be loaded right now.");
    }
  }, []);
  const playheadRef = useRef(0);
  const scrollContainerRef = useRef(null);
  const previewPanelRef = useRef(null);
  const previewStageRef = useRef(null);
  const autoDirectorSignatureRef = useRef("");
  const audioAnalysisCacheRef = useRef(new Map());
  const previewVideoRefs = useRef({});
  const thumbnailVideoRefs = useRef({});
  const audioVideoRefs = useRef({});
  const flowAudioRef = useRef(null);
  const externalAudioRef = useRef(null);
  const diagnosticAudioContextRef = useRef(null);
  const diagnosticMediaRef = useRef(null);
  const flowIntensityRefreshRef = useRef(false);
  const handleRecordSwitchRef = useRef(null);
  const singleCamSignatureRef = useRef("");
  const draftHydratedRef = useRef(false);
  const [audioAnalysisByCameraId, setAudioAnalysisByCameraId] = useState({});
  const [syncingCameraId, setSyncingCameraId] = useState(null);
  const [expandedCameraId, setExpandedCameraId] = useState(null);
  const [leftStudioRailCollapsed, setLeftStudioRailCollapsed] = useState(false);
  const [rightStudioRailCollapsed, setRightStudioRailCollapsed] = useState(false);

  // Cinematic Effects — CSS-based real-time preview effects
  const {
    fx,
    showPanel: showEffectsPanel,
    setShowPanel: setShowEffectsPanel,
    applyPreset,
    updateFx,
    resetFx,
    mediaStyle: effectsMediaStyle,
    edgeBlurStyle,
    vignetteStyle,
    overlayStyle,
    grainStyle,
    letterboxStyle,
    fadeStyle,
    hasEffects,
    attachVideo,
  } = useCinematicEffects();
  const readySources = useMemo(
    () => sources.filter(source => getSourceMediaUrl(source) && Number(source.duration) > 0.05),
    [sources]
  );
  const loadedVisualSources = useMemo(
    () => sources.filter(source => Boolean(getSourceMediaUrl(source))),
    [sources]
  );
  const multicamDraftKey = useMemo(() => buildMulticamDraftKey(sources), [sources]);
  const flowFrameQualityByCameraId = useMemo(
    () =>
      readySources.reduce((accumulator, source) => {
        const resolutionPixels =
          Math.max(1, Number(source.videoWidth || 0)) * Math.max(1, Number(source.videoHeight || 0));
        const normalizedResolution = clampNumber(resolutionPixels / (1920 * 1080), 0.2, 1, 0.58);
        const durationScore = clampNumber((Number(source.duration) || 0) / 12, 0.3, 1, 0.72);
        accumulator[source.id] = {
          score: Number((normalizedResolution * 0.58 + durationScore * 0.42).toFixed(3)),
        };
        return accumulator;
      }, {}),
    [readySources]
  );
  const singleCamSource = readySources[0] || null;

  const timelineBounds = useMemo(() => getMasterTimelineBounds(readySources), [readySources]);
  const overlapBounds = useMemo(() => getSourceDurationBounds(readySources), [readySources]);
  const isSingleSourceWorkflow = loadedVisualSources.length <= 1;
  const normalizedSingleCamSegments = useMemo(() => {
    if (!isSingleSourceWorkflow || !singleCamSource) return [];
    const fallbackDuration =
      Number(singleCamSource.duration) || timelineBounds.timelineDuration || 0;
    const segmentSource = [singleCamSource];
    const baseSegments = singleCamSegments.length
      ? singleCamSegments
      : buildDefaultSegments(segmentSource, fallbackDuration);
    return normalizeSegments(baseSegments, segmentSource, null);
  }, [isSingleSourceWorkflow, singleCamSource, singleCamSegments, timelineBounds.timelineDuration]);
  const singleCamTimelineDuration = useMemo(
    () => normalizedSingleCamSegments[normalizedSingleCamSegments.length - 1]?.timelineEnd || 0,
    [normalizedSingleCamSegments]
  );
  const baseTimelineDuration = isSingleSourceWorkflow
    ? singleCamTimelineDuration
    : timelineBounds.timelineDuration;
  const flowAudioSource = useMemo(() => {
    if (flowAudioTrack?.cameraId) {
      return readySources.find(source => source.id === flowAudioTrack.cameraId) || null;
    }
    return null;
  }, [flowAudioTrack, readySources]);
  const flowAudioUrl = flowAudioTrack?.previewUrl || getSourceMediaUrl(flowAudioSource);
  const externalAudioUrl = externalAudioTrack?.previewUrl || externalAudioTrack?.url || "";
  const hasExternalCleanAudio = Boolean(useExternalCleanAudio && externalAudioUrl);
  const browserCleanAudioSyncBlockReason = useMemo(
    () => getBrowserSyncBlockReason(readySources, externalAudioTrack),
    [readySources, externalAudioTrack]
  );
  const shouldUseBackendCleanAudioSync = Boolean(browserCleanAudioSyncBlockReason);
  const cleanAudioSyncCreditEstimate = useMemo(
    () => estimateCleanAudioSyncCredits(readySources, externalAudioTrack),
    [readySources, externalAudioTrack]
  );
  const multicamRenderCreditEstimate = useMemo(
    () => estimateMulticamRenderCredits(multicamRenderTier),
    [multicamRenderTier]
  );
  const externalAudioSourceProxy = useMemo(
    () =>
      externalAudioTrack
        ? {
            id: "external-clean-audio",
            offsetSeconds: Number(externalAudioTrack.offsetSeconds) || 0,
            duration: Number(externalAudioTrack.duration) || timelineBounds.timelineDuration || 0,
          }
        : null,
    [externalAudioTrack, timelineBounds.timelineDuration]
  );
  const flowAudioIsVideoSoundtrack =
    flowAudioTrack?.mode === "camera" ||
    String(flowAudioTrack?.file?.type || "").startsWith("video/") ||
    /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(String(flowAudioTrack?.name || flowAudioUrl || ""));
  const isImageStoryEligible =
    !isSingleSourceWorkflow && readySources.length >= 2 && readySources.every(isImageSource);
  const timelineDuration =
    flowEditEnabled && flowEditPlan?.duration
      ? flowEditPlan?.visualMode === "image_story" || flowEditPlan?.visualMode === "single_highlight_flow"
        ? Number(flowEditPlan.duration) || baseTimelineDuration
        : !isSingleSourceWorkflow
          ? Math.min(baseTimelineDuration, Number(flowEditPlan.duration) || baseTimelineDuration)
          : baseTimelineDuration
      : baseTimelineDuration;
  const cloudRenderWindowMaxStart = Math.max(
    0,
    (Number(timelineDuration) || 0) - SERVER_MULTICAM_MAX_DURATION_SECONDS
  );
  const cloudRenderWindowStartSafe = clampNumber(
    Number(cloudRenderWindowStart) || 0,
    0,
    cloudRenderWindowMaxStart,
    0
  );
  const cloudRenderWindowDuration = Math.min(
    SERVER_MULTICAM_MAX_DURATION_SECONDS,
    Math.max(0, (Number(timelineDuration) || 0) - cloudRenderWindowStartSafe)
  );
  const cloudRenderWindowEnd = cloudRenderWindowStartSafe + cloudRenderWindowDuration;
  const isLongCloudRenderSource = (Number(timelineDuration) || 0) > SERVER_MULTICAM_MAX_DURATION_SECONDS + 0.5;
  const shouldLoopFlowAudio =
    !!flowAudioUrl &&
    !!flowEditEnabled &&
    ((flowEditPlan?.loopsAudio &&
      Number(flowEditPlan?.audioDuration) > 0.2 &&
      Number(flowEditPlan?.audioDuration) < timelineDuration - 0.2) ||
      false);
  const canExportProject = readySources.length >= 1 && timelineDuration > 0;
  const normalizedSwitches = useMemo(
    () =>
      normalizeSwitches(
        switches,
        readySources.length ? readySources : sources,
        timelineDuration || 0
      ),
    [readySources, sources, switches, timelineDuration]
  );
  const activeFlowSegments = useMemo(
    () =>
      flowEditEnabled && Array.isArray(flowEditPlan?.segments)
        ? flowEditPlan.segments.filter(
            segment => Number(segment.endTime) > Number(segment.startTime)
          )
        : [],
    [flowEditEnabled, flowEditPlan]
  );
  const selectedManualSwitch = useMemo(() => {
    if (isSingleSourceWorkflow || flowEditEnabled) return null;
    return (
      normalizedSwitches.find(segment => segment.id === selectedSwitchId) ||
      normalizedSwitches[0] ||
      null
    );
  }, [isSingleSourceWorkflow, flowEditEnabled, normalizedSwitches, selectedSwitchId]);
  const currentFlowSegment = useMemo(
    () => getFlowSegmentAtTime(activeFlowSegments, playhead),
    [activeFlowSegments, playhead]
  );
  const displaySegments = useMemo(() => {
    if (activeFlowSegments.length) {
      return buildFlowTimelineDisplaySegments(
        activeFlowSegments,
        readySources.length ? readySources : sources,
        timelineDuration || 0.01
      );
    }

    if (isSingleSourceWorkflow) {
      return buildSegmentDisplaySegments(
        normalizedSingleCamSegments,
        singleCamSource ? [singleCamSource] : [],
        timelineDuration || 0.01
      ).map((segment, index) => ({
        ...segment,
        label: `Part ${index + 1}`,
      }));
    }

    return buildSwitchDisplaySegments(
      normalizedSwitches,
      readySources.length ? readySources : sources,
      timelineDuration || 0.01
    );
  }, [
    isSingleSourceWorkflow,
    normalizedSingleCamSegments,
    singleCamSource,
    timelineDuration,
    activeFlowSegments,
    normalizedSwitches,
    readySources,
    sources,
  ]);
  const activeSegment = useMemo(() => {
    if (previewProgramOverride?.cameraId && !flowEditEnabled && !isSingleSourceWorkflow) {
      return {
        cameraId: previewProgramOverride.cameraId,
        layoutMode: previewProgramOverride.layoutMode || "cut",
        startTime: playhead,
        previewOnly: true,
      };
    }

    if (currentFlowSegment) {
      return currentFlowSegment;
    }

    if (isSingleSourceWorkflow) {
      return getActiveSegmentAtTime(normalizedSingleCamSegments, playhead);
    }

    return getActiveCameraAtTime(
      normalizedSwitches,
      readySources.length ? readySources : sources,
      playhead,
      timelineDuration || 0.01
    );
  }, [
    isSingleSourceWorkflow,
    normalizedSingleCamSegments,
    playhead,
    currentFlowSegment,
    normalizedSwitches,
    readySources,
    sources,
    timelineDuration,
    previewProgramOverride,
    flowEditEnabled,
  ]);

  const activeCameraId = activeSegment?.cameraId || readySources[0]?.id || sources[0]?.id || null;
  const activeCamera = readySources.find(source => source.id === activeCameraId) || null;
  const masterAudioSource = readySources.find(source => source.id === masterAudioCameraId) || null;
  const activeDirectorStyle = useMemo(
    () => getDirectorStylePreset(directorStyleId),
    [directorStyleId]
  );
  const activeFlowAuraPreset = useMemo(
    () => getFlowAuraPreset(flowAuraTemplateId),
    [flowAuraTemplateId]
  );
  const isImageStoryFlow = !isSingleSourceWorkflow && flowEditEnabled && flowEditPlan?.visualMode === "image_story";
  const resolvedMulticamLayout = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return {
        layoutMode: "cut",
        primaryCameraId: activeCameraId,
        secondaryCameraId: null,
        reason: "single_source",
      };
    }

    if (isImageStoryFlow) {
      return {
        layoutMode: "cut",
        primaryCameraId: activeCameraId,
        secondaryCameraId: null,
        visibleCameraIds: [activeCameraId].filter(Boolean),
        reason: "image_story",
      };
    }

    const timelineLayoutMode = activeSegment?.layoutMode || multicamLayoutMode;
    const baseLayout = resolveSmartMulticamLayoutAtTime(
      readySources.length ? readySources : sources,
      activeCameraId,
      playhead,
      timelineBounds.timelineStart,
      audioAnalysisByCameraId,
      timelineLayoutMode
    );
    return applyDirectorStyleToLayout(
      baseLayout,
      directorStyleId,
      readySources.length ? readySources : sources
    );
  }, [
    isSingleSourceWorkflow,
    activeCameraId,
    readySources,
    sources,
    playhead,
    timelineBounds.timelineStart,
    audioAnalysisByCameraId,
    multicamLayoutMode,
    activeSegment?.layoutMode,
    directorStyleId,
    isImageStoryFlow,
  ]);
  const effectiveMulticamLayoutMode = resolvedMulticamLayout.layoutMode || "cut";
  const secondaryCameraId = resolvedMulticamLayout.secondaryCameraId || null;
  const secondaryCamera = readySources.find(source => source.id === secondaryCameraId) || null;
  const visibleLayoutCameraIds = useMemo(() => {
    const candidateIds = Array.isArray(resolvedMulticamLayout.visibleCameraIds)
      ? resolvedMulticamLayout.visibleCameraIds
      : [activeCameraId, secondaryCameraId].filter(Boolean);
    const maxVisible =
      effectiveMulticamLayoutMode === "scene-grid"
        ? 3
        : effectiveMulticamLayoutMode === "split-vertical" || effectiveMulticamLayoutMode === "pip"
          ? 2
          : 6;
    return candidateIds.filter(Boolean).slice(0, maxVisible);
  }, [
    resolvedMulticamLayout.visibleCameraIds,
    activeCameraId,
    secondaryCameraId,
    effectiveMulticamLayoutMode,
  ]);
  const visibleLayoutCameras = useMemo(
    () =>
      visibleLayoutCameraIds
        .map(cameraId => readySources.find(source => source.id === cameraId))
        .filter(Boolean),
    [visibleLayoutCameraIds, readySources]
  );
  const activeSingleCamFraming = useMemo(() => {
    if (!isSingleSourceWorkflow || !activeSegment?.id) {
      return DEFAULT_SEGMENT_FRAMING;
    }
    if (flowEditEnabled && currentFlowSegment?.id) {
      return normalizeSegmentFraming(flowSegmentFraming[currentFlowSegment.id]);
    }
    return normalizeSegmentFraming(singleCamSegmentFraming[activeSegment.id]);
  }, [
    isSingleSourceWorkflow,
    activeSegment,
    singleCamSegmentFraming,
    flowEditEnabled,
    currentFlowSegment,
    flowSegmentFraming,
  ]);
  const selectedSingleCamSegment = useMemo(
    () =>
      normalizedSingleCamSegments.find(segment => segment.id === selectedSingleCamSegmentId) ||
      null,
    [normalizedSingleCamSegments, selectedSingleCamSegmentId]
  );
  const selectedFlowSegment = useMemo(
    () => activeFlowSegments.find(segment => segment.id === selectedFlowSegmentId) || null,
    [activeFlowSegments, selectedFlowSegmentId]
  );
  const selectedSingleCamFraming = useMemo(() => {
    if (!selectedSingleCamSegmentId) return DEFAULT_SEGMENT_FRAMING;
    return normalizeSegmentFraming(singleCamSegmentFraming[selectedSingleCamSegmentId]);
  }, [selectedSingleCamSegmentId, singleCamSegmentFraming]);
  const activeFocusPoint = useMemo(
    () => getSegmentFocusPoint(activeSingleCamFraming),
    [activeSingleCamFraming]
  );
  const activeFlowFraming = useMemo(() => {
    if (!flowEditEnabled || !currentFlowSegment?.id) {
      return DEFAULT_SEGMENT_FRAMING;
    }
    return normalizeSegmentFraming(flowSegmentFraming[currentFlowSegment.id]);
  }, [flowEditEnabled, currentFlowSegment, flowSegmentFraming]);
  const currentFlowTransitionState = useMemo(
    () => (flowEditEnabled ? getFlowTransitionState(currentFlowSegment, playhead) : { active: false, progress: 1, intensity: 0 }),
    [flowEditEnabled, currentFlowSegment, playhead]
  );
  const previewActiveVideoStyle = useMemo(() => {
    const style = {};
    const cinematicZoom = Math.max(1, Number(fx.zoom) || 1);
    const segmentFraming = isSingleSourceWorkflow
      ? activeSingleCamFraming
      : flowEditEnabled && currentFlowSegment
        ? activeFlowFraming
        : DEFAULT_SEGMENT_FRAMING;
    const segmentZoom = isSingleSourceWorkflow
      ? Math.max(1, Number(activeSingleCamFraming.zoom) || 1)
      : flowEditEnabled && currentFlowSegment
        ? Math.max(1, Number(activeFlowFraming.zoom) || 1)
        : 1;
    const combinedZoom = cinematicZoom * segmentZoom;
    const translateX = Number(segmentFraming.translateX || 0) * 100;
    const translateY = Number(segmentFraming.translateY || 0) * 100;
    const tilt = Number(segmentFraming.tilt || 0);
    const transformParts = [];
    if (translateX || translateY) {
      transformParts.push(`translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`);
    }
    if (tilt) {
      transformParts.push(`rotate(${tilt.toFixed(2)}deg)`);
    }
    if (flowEditEnabled && currentFlowSegment && currentFlowTransitionState.active) {
      const introLift = currentFlowTransitionState.intensity * (segmentFraming.transitionStyle === "flash" ? 0.032 : 0.018);
      transformParts.push(`scale(${(combinedZoom + introLift).toFixed(3)})`);
    } else if (combinedZoom !== 1) {
      transformParts.push(`scale(${combinedZoom.toFixed(3)})`);
    }
    if (transformParts.length) {
      style.transform = transformParts.join(" ");
    }

    const filterParts = [];
    if (effectsMediaStyle.filter) {
      filterParts.push(effectsMediaStyle.filter);
    }
    if (segmentFraming.brightness && segmentFraming.brightness !== 1) {
      filterParts.push(`brightness(${Number(segmentFraming.brightness).toFixed(3)})`);
    }
    if (segmentFraming.contrast && segmentFraming.contrast !== 1) {
      filterParts.push(`contrast(${Number(segmentFraming.contrast).toFixed(3)})`);
    }
    if (segmentFraming.saturation && segmentFraming.saturation !== 1) {
      filterParts.push(`saturate(${Number(segmentFraming.saturation).toFixed(3)})`);
    }
    if (filterParts.length) {
      style.filter = filterParts.join(" ");
    }

    style.transformOrigin = isSingleSourceWorkflow
        ? getSegmentTransformOrigin(activeSingleCamFraming)
        : flowEditEnabled && currentFlowSegment
          ? getSegmentTransformOrigin(activeFlowFraming)
          : getSegmentTransformOrigin({ zoomAnchor: fx.zoomAnchor || "center" });
    if (segmentFraming.glow > 0) {
      style.boxShadow =
        segmentFraming.frameStyle === "poster"
          ? `0 0 ${Math.round(20 + segmentFraming.glow * 26)}px rgba(249, 115, 22, 0.28)`
          : `0 0 ${Math.round(18 + segmentFraming.glow * 24)}px rgba(56, 189, 248, 0.24)`;
    }
    if (segmentFraming.frameStyle !== "none") {
      style.outline =
        segmentFraming.frameStyle === "poster"
          ? "4px solid rgba(255,247,237,0.72)"
          : segmentFraming.frameStyle === "cinematic"
            ? "2px solid rgba(255,255,255,0.22)"
            : "2px solid rgba(186,230,253,0.42)";
      style.outlineOffset = "-10px";
      style.borderRadius = segmentFraming.frameStyle === "poster" ? "18px" : "14px";
    }

    if (style.transform || style.filter || style.boxShadow || style.outline) {
      style.transition =
        "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), filter 0.35s ease, box-shadow 0.35s ease, outline-color 0.35s ease";
    }

    return style;
  }, [
    effectsMediaStyle.filter,
    fx.zoom,
    fx.zoomAnchor,
    isSingleSourceWorkflow,
    flowEditEnabled,
    currentFlowSegment,
    currentFlowTransitionState,
    activeSingleCamFraming,
    activeFlowFraming,
  ]);
  const flowTransitionOverlayStyle = useMemo(() => {
    if (!flowEditEnabled || !currentFlowSegment || !currentFlowTransitionState.active) {
      return null;
    }
    const framing = activeFlowFraming;
    const intensity = Number(currentFlowTransitionState.intensity || 0);
    const styleName = framing.transitionStyle || "cut";
    if (styleName === "cut" || intensity <= 0.01) return null;
    const palette = getTransitionPalette(framing.accentTone);
    const alpha = (base, multiplier = 1) => (base + intensity * multiplier).toFixed(3);

    if (styleName === "flash") {
      return {
        background: palette.glow.replace("ALPHA", alpha(0.06, 0.22)),
        mixBlendMode: "screen",
        opacity: 1,
      };
    }
    if (styleName === "bloom") {
      return {
        background: `radial-gradient(circle at 50% 46%, ${palette.glow.replace("ALPHA", alpha(0.1, 0.18))} 0%, ${palette.primary.replace("ALPHA", alpha(0.06, 0.12))} 36%, rgba(5,8,16,0) 72%)`,
        mixBlendMode: "screen",
        opacity: 1,
      };
    }
    if (styleName === "sweep") {
      const sweep = 24 + (1 - Number(currentFlowTransitionState.progress || 0)) * 52;
      return {
        background: `linear-gradient(90deg, rgba(5,8,16,0) 0%, rgba(5,8,16,0) ${Math.max(0, sweep - 18)}%, ${palette.primary.replace("ALPHA", alpha(0.08, 0.16))} ${Math.max(0, sweep - 6)}%, ${palette.secondary.replace("ALPHA", alpha(0.12, 0.22))} ${Math.min(100, sweep + 2)}%, rgba(5,8,16,0) ${Math.min(100, sweep + 18)}%, rgba(5,8,16,0) 100%)`,
        mixBlendMode: "screen",
        opacity: 1,
      };
    }
    if (styleName === "lift") {
      return {
        background: `linear-gradient(180deg, rgba(5,8,16,0) 0%, rgba(5,8,16,0) 52%, ${palette.secondary.replace("ALPHA", alpha(0.04, 0.1))} 72%, ${palette.primary.replace("ALPHA", alpha(0.08, 0.18))} 100%)`,
        mixBlendMode: "screen",
        opacity: 1,
      };
    }
    return {
      background: `linear-gradient(135deg, ${palette.secondary.replace("ALPHA", alpha(0.03, 0.08))} 0%, rgba(5,8,16,0) 48%, ${palette.primary.replace("ALPHA", alpha(0.03, 0.08))} 100%)`,
      mixBlendMode: "screen",
      opacity: 1,
    };
  }, [flowEditEnabled, currentFlowSegment, currentFlowTransitionState, activeFlowFraming]);
  const previewVideoStylesByCameraId = useMemo(() => {
    const styles = {};
    const premiumCardBase = {
      boxSizing: "border-box",
      overflow: "hidden",
      borderRadius: "18px",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      background:
        "radial-gradient(circle at 50% 12%, rgba(255,255,255,0.13), transparent 34%), linear-gradient(145deg, rgba(14,20,32,0.96), rgba(3,6,12,0.98))",
      boxShadow:
        "0 18px 34px rgba(0, 0, 0, 0.24), inset 0 0 0 1px rgba(255, 255, 255, 0.055)",
      objectPosition: "center center",
    };
    const assignCardStyle = (cameraId, viewport, extraStyle = {}) => {
      if (!cameraId || !viewport) return;
      styles[cameraId] = {
        opacity: 1,
        zIndex: extraStyle.zIndex || 2,
        left: `${viewport.x}%`,
        top: `${viewport.y}%`,
        right: "auto",
        width: `${viewport.width}%`,
        height: `${viewport.height}%`,
        ...premiumCardBase,
        ...extraStyle,
      };
    };

    readySources.forEach(source => {
      styles[source.id] = {
        opacity: 0,
        zIndex: 0,
      };
    });

    if (!activeCameraId) return styles;

    styles[activeCameraId] = {
      opacity: 1,
      zIndex: 2,
      ...previewActiveVideoStyle,
    };

    if (effectiveMulticamLayoutMode === "scene-grid") {
      const viewports = getSceneGridViewports(100, 100, visibleLayoutCameraIds.length);
      visibleLayoutCameraIds.forEach((cameraId, index) => {
        const viewport = viewports[index];
        assignCardStyle(cameraId, viewport, {
          padding: "0",
          objectFit: "contain",
          borderColor: "rgba(255, 255, 255, 0.12)",
          ...(cameraId === activeCameraId ? previewActiveVideoStyle : {}),
        });
      });
      return styles;
    }

    if (effectiveMulticamLayoutMode === "cut") {
      return styles;
    }

    if (!secondaryCameraId) {
      return styles;
    }

    if (effectiveMulticamLayoutMode === "split-vertical") {
      const [primaryViewport, secondaryViewport] = getSharedMomentPreviewViewports(100, 100);
      assignCardStyle(activeCameraId, primaryViewport, {
        padding: "0",
        objectFit: "contain",
        objectPosition: "center center",
        borderColor: "rgba(255, 255, 255, 0.12)",
        ...previewActiveVideoStyle,
      });
      assignCardStyle(secondaryCameraId, secondaryViewport, {
        padding: "0",
        objectFit: "contain",
        objectPosition: "center center",
        borderColor: "rgba(255, 255, 255, 0.12)",
      });
      return styles;
    }

    const [heroViewport, pipViewport] = getPipPreviewViewports(100, 100);
    assignCardStyle(activeCameraId, heroViewport, {
      padding: "0",
      objectFit: "contain",
      borderColor: "rgba(255, 255, 255, 0.12)",
      ...previewActiveVideoStyle,
    });
    assignCardStyle(secondaryCameraId, pipViewport, {
      zIndex: 3,
      padding: "0",
      objectFit: "contain",
      borderRadius: "18px",
      borderColor: "rgba(255, 255, 255, 0.12)",
      boxShadow:
        "0 18px 34px rgba(0, 0, 0, 0.26), inset 0 0 0 1px rgba(255, 255, 255, 0.055)",
    });
    return styles;
  }, [
    readySources,
    activeCameraId,
    secondaryCameraId,
    visibleLayoutCameraIds,
    effectiveMulticamLayoutMode,
    previewActiveVideoStyle,
  ]);
  const multicamLayoutInsight = useMemo(() => {
    if (isSingleSourceWorkflow) return null;
    if (effectiveMulticamLayoutMode === "scene-grid") {
      return visibleLayoutCameraIds.length >= 5
        ? "AI opened a full scene matrix so the whole conversation stays visible at once."
        : "AI widened the stage to keep several active angles visible together.";
    }
    if (effectiveMulticamLayoutMode === "split-vertical") {
      return resolvedMulticamLayout.reason === "shared_energy"
        ? "AI stacked both angles because they are both lively right now."
        : "Split mode keeps two cameras on screen at once.";
    }
    if (effectiveMulticamLayoutMode === "pip") {
      return resolvedMulticamLayout.reason === "reaction_insert"
        ? "AI kept a second angle on screen as a reaction insert."
        : "PiP mode keeps the secondary angle visible in a corner.";
    }
    return multicamLayoutMode === "smart"
      ? "AI is currently staying on the lead angle because the companion angle is not strong enough."
      : "Cut mode shows one angle at a time.";
  }, [
    isSingleSourceWorkflow,
    visibleLayoutCameraIds.length,
    effectiveMulticamLayoutMode,
    resolvedMulticamLayout.reason,
    multicamLayoutMode,
  ]);
  const leadEnergyScore = useMemo(() => {
    if (!activeCamera || isSingleSourceWorkflow) return 0;
    return getAudioActivityScoreForSourceTime(
      audioAnalysisByCameraId?.[activeCamera.id],
      getSourceTimelineTime(activeCamera, playhead, timelineBounds.timelineStart)
    );
  }, [
    activeCamera,
    isSingleSourceWorkflow,
    audioAnalysisByCameraId,
    playhead,
    timelineBounds.timelineStart,
  ]);
  const companionEnergyScore = resolvedMulticamLayout.secondaryScore || 0;
  const directorSnapshot = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return {
        styleTitle: "Solo Operator",
        modeTitle: "Single Lens",
        reasonTitle: "Solo presence",
        narrative:
          "One lens is carrying the whole scene, so the director stays intimate and direct.",
        mission:
          "Shape one recording into confident beats with reframing and emotional punch-ins only when they help.",
        temperature: 0.28,
      };
    }

    const modeTitle = MULTICAM_LAYOUT_TITLES[effectiveMulticamLayoutMode] || "Pulse Director";
    const reasonTitle = MULTICAM_REASON_TITLES[resolvedMulticamLayout.reason] || "Adaptive framing";
    const temperature = Math.max(leadEnergyScore, companionEnergyScore, 0);

    let narrative = multicamLayoutInsight;
    if (resolvedMulticamLayout.reason === "shared_energy") {
      narrative =
        "Both angles are peaking together, so the director opens the frame and lets the moment breathe as a duet.";
    } else if (resolvedMulticamLayout.reason === "reaction_insert") {
      narrative =
        "A secondary angle is flaring up harder than the lead, so the director keeps it alive as an orbiting reaction window.";
    } else if (effectiveMulticamLayoutMode === "cut") {
      narrative =
        "The scene is cleaner with one hero angle, so the director collapses the frame into a decisive single-camera statement.";
    }

    return {
      styleTitle: activeDirectorStyle.label,
      modeTitle,
      reasonTitle,
      narrative: `${narrative} ${activeDirectorStyle.guidance}`,
      mission: activeDirectorStyle.summary,
      temperature,
    };
  }, [
    isSingleSourceWorkflow,
    activeDirectorStyle,
    effectiveMulticamLayoutMode,
    resolvedMulticamLayout.reason,
    leadEnergyScore,
    companionEnergyScore,
    multicamLayoutInsight,
  ]);
  const previewStageMoodClass = useMemo(() => {
    if (isSingleSourceWorkflow) return "is-mood-solo";
    if (effectiveMulticamLayoutMode === "scene-grid") return "is-mood-ensemble";
    if (effectiveMulticamLayoutMode === "split-vertical") return "is-mood-dual";
    if (effectiveMulticamLayoutMode === "pip") return "is-mood-orbit";
    return "is-mood-focus";
  }, [isSingleSourceWorkflow, effectiveMulticamLayoutMode]);
  const inSyncSourceCount = useMemo(
    () =>
      readySources.filter(source => {
        const mappedTime = getSourceTimelineTime(source, playhead, timelineBounds.timelineStart);
        return mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;
      }).length,
    [readySources, playhead, timelineBounds.timelineStart]
  );
  const directorConfidence = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return 0.86;
    }

    const baseConfidence =
      effectiveMulticamLayoutMode === "scene-grid"
        ? 0.82
        : effectiveMulticamLayoutMode === "split-vertical"
          ? 0.78
          : effectiveMulticamLayoutMode === "pip"
            ? 0.72
            : 0.66;
    const energyLift = Math.max(leadEnergyScore, companionEnergyScore) * 0.22;
    const syncLift = readySources.length ? (inSyncSourceCount / readySources.length) * 0.12 : 0;

    return clampNumber(baseConfidence + energyLift + syncLift, 0.42, 0.97, 0.72);
  }, [
    isSingleSourceWorkflow,
    effectiveMulticamLayoutMode,
    leadEnergyScore,
    companionEnergyScore,
    readySources.length,
    inSyncSourceCount,
  ]);
  const activeFocusSummary = useMemo(() => {
    if (isSingleSourceWorkflow) {
      if (focusPickerActive) return "Focus pick armed";
      if (singleLensAutoSummary.toLowerCase().includes("phone rescue")) return "Phone rescue framing";
      if (singleLensAutoSummary.toLowerCase().includes("performance lift")) return "Performance lift framing";
      if (singleLensAutoSummary.toLowerCase().includes("healing mode")) return "Healing framing";
      if (selectedSingleCamSegment?.role === "hook") return "Hook framing armed";
      if (selectedSingleCamSegment?.role === "claim") return "Claim framing";
      if (selectedSingleCamSegment?.role === "payoff") return "Payoff framing";
      if (selectedSingleCamSegment?.role === "crescendo") return "Crescendo framing";
      if (selectedSingleCamSegment?.role === "afterglow") return "Afterglow framing";
      if (selectedSingleCamFraming.zoom > 1.35) return "Tight reaction framing";
      if (selectedSingleCamFraming.zoom > 1.05) return "Medium punch framing";
      return "Wide two-shot framing";
    }

    if (secondaryCamera && effectiveMulticamLayoutMode !== "cut") {
      return `${activeCamera?.label || "Lead"} with ${secondaryCamera.label || "companion"}`;
    }

    return `${activeCamera?.label || "Lead"} owns the frame`;
  }, [
    isSingleSourceWorkflow,
    focusPickerActive,
    singleLensAutoSummary,
    selectedSingleCamSegment,
    selectedSingleCamFraming.zoom,
    secondaryCamera,
    effectiveMulticamLayoutMode,
    activeCamera,
  ]);
  const liveMomentLabel = useMemo(() => {
    if (isSingleSourceWorkflow) {
      if (selectedSingleCamSegment?.role) {
        return `${selectedSingleCamSegment.role.replace(/_/g, " ")} beat live`;
      }
      return "Solo lens edit";
    }

    if (flowEditEnabled && currentFlowSegment?.heroMoment) {
      return currentFlowSegment.heroLabel === "premium hero" ? "Premium hero moment" : "Hero moment live";
    }

    if (effectiveMulticamLayoutMode === "scene-grid") return "Conversation matrix live";
    if (effectiveMulticamLayoutMode === "split-vertical") return "Shared reaction moment";
    if (effectiveMulticamLayoutMode === "pip") return "Reaction orbit live";
    return "Hero angle locked";
  }, [isSingleSourceWorkflow, flowEditEnabled, currentFlowSegment, effectiveMulticamLayoutMode, selectedSingleCamSegment]);
  const directorHeroNarrative = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return selectedSingleCamSegment?.reason || "Solo lens edit with guided reframing.";
    }
    if (autoDirectorEnabled && autoDirectorSummary?.momentCount) {
      return `Auto Director is staging ${autoDirectorSummary.magicSummary} right now instead of just switching angles mechanically.`;
    }
    if (effectiveMulticamLayoutMode === "split-vertical") {
      return "Two angles stay open because both are active.";
    }
    if (effectiveMulticamLayoutMode === "scene-grid") {
      return "The whole conversation stays open in a living vertical matrix.";
    }
    if (effectiveMulticamLayoutMode === "pip") {
      return "The lead holds frame while a reaction stays alive in orbit.";
    }
    return "The director is holding one hero angle.";
  }, [isSingleSourceWorkflow, effectiveMulticamLayoutMode, autoDirectorEnabled, autoDirectorSummary, selectedSingleCamSegment]);
  const stageCommandSummary = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return selectedSingleCamSegment?.reason || "Split, trim, and reframe this one recording.";
    }
    if (flowEditEnabled && flowEditPlan?.segments?.length) {
      return (
        currentFlowSegment?.reason ||
        flowEditInsight ||
        "Flow Edit is driving cut timing, motion, and pace from the selected audio."
      );
    }
    return multicamLayoutInsight;
  }, [isSingleSourceWorkflow, flowEditEnabled, flowEditPlan, currentFlowSegment, flowEditInsight, multicamLayoutInsight, selectedSingleCamSegment]);
  const workflowModeLabel = isSingleSourceWorkflow ? "Single-Cam Edit" : "Multicam Director";
  const workflowTitle = isSingleSourceWorkflow ? "Single-Camera Workflow" : "Angle Timeline";
  const workflowDescription = isSingleSourceWorkflow
    ? "Split, trim, delete, and reframe sections of one recording. Add more camera angles later if you want multicam switching."
    : "Angle buttons write cut events. Audio stays on the selected audio source throughout, while AI layouts can surface shared moments and reactions.";
  const cameraPanelTitle = isSingleSourceWorkflow ? "Primary Recording" : "Camera Sources";
  const cameraPanelDescription = isSingleSourceWorkflow
    ? "This recording is your source canvas. Split it into beats, trim dead air, and punch into the speaker without leaving the single-cam workflow."
    : "Every recording lines up against the same timeline. Offsets move the source start, not your edit points.";
  const visibleCameraSources = useMemo(
    () => (loadedVisualSources.length ? loadedVisualSources : sources.slice(0, 1)),
    [loadedVisualSources, sources]
  );
  const getStudioSlotLabel = useCallback(index => `Camera ${index + 1}`, []);
  const getCameraMonitorFrameStyle = source => {
    if (!source) return {};
    return {
      aspectRatio: "16 / 9",
      width: "100%",
      minHeight: "clamp(160px, 18vh, 210px)",
      maxHeight: "210px",
    };
  };
  const deckPrimaryLabel = isSingleSourceWorkflow ? "Edit Mode" : "Sources Live";
  const deckPrimaryValue = isSingleSourceWorkflow
    ? "Single Lens"
    : `${inSyncSourceCount} / ${readySources.length || 0}`;
  const deckPrimaryNote = isSingleSourceWorkflow
    ? "Guided split, trim, and reframe workflow"
    : "Angles aligned at current playhead";
  const deckAudioLabel = hasExternalCleanAudio
    ? "Clean Audio"
    : isSingleSourceWorkflow
      ? "Primary Audio"
      : "Voice Bed";
  const deckAudioValue = hasExternalCleanAudio
    ? externalAudioTrack?.name || "External clean audio"
    : masterAudioSource?.label || "Not set";
  const deckAudioNote = hasExternalCleanAudio
    ? externalAudioMixMode === "low_camera"
      ? "Clean mic leads; camera audio stays low underneath"
      : externalAudioMixMode === "mute_camera"
        ? "Clean mic audio is solo; camera audio is muted"
      : "External mic audio is the main render track"
    : "Audio anchor for the whole render";
  const deckTimelineLabel = isSingleSourceWorkflow ? "Edit Span" : "Timeline Span";
  const stageKickerLabel = isSingleSourceWorkflow ? "Single-Cam Edit" : "Stage Intelligence";
  const timelinePanelTitle = isSingleSourceWorkflow ? "Segment Editor" : workflowTitle;
  const timelinePanelDescription = isSingleSourceWorkflow
    ? "Shape this one recording into clean beats, reframed shots, and punch-ins."
    : workflowDescription;
  const footerNoteTitle = isSingleSourceWorkflow ? "Single-cam edit mode" : "Sync window";
  const footerNoteCopy = isSingleSourceWorkflow
    ? singleLensAutoSummary ||
      "One source loaded. Use split, trim, punch-in, and reframe controls to build a sharper cut without adding another angle."
    : `Overlap start ${formatDurationLabel(overlapBounds.overlapStart || 0)} | overlap duration ${formatDurationLabel(overlapBounds.overlapDuration || 0)}`;
  const quickActionItems = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return [
        {
          id: "single-auto",
          label: "Auto Shape",
          caption: "Let AI pace the lens",
          isActive: Boolean(singleLensAutoSummary),
        },
        {
          id: "single-body",
          label: "Body Punch",
          caption: "Medium cinematic crop",
          isActive: Math.abs(selectedSingleCamFraming.zoom - 1.22) < 0.03,
        },
        {
          id: "single-face",
          label: "Face Reaction",
          caption: "Tight emotional close-up",
          isActive: Math.abs(selectedSingleCamFraming.zoom - 1.45) < 0.03,
        },
        {
          id: "single-pick",
          label: "Pick Subject",
          caption: "Tap the person to frame",
          isActive: focusPickerActive,
        },
      ];
    }

    return [
      {
        id: "multi-smart",
        label: "Auto Direct",
        caption: "Let AI steer the conversation",
        isActive: multicamLayoutMode === "smart" && autoDirectorEnabled,
      },
      {
        id: "multi-grid",
        label: "Show Everyone",
        caption: "Open a live conversation matrix",
        isActive: multicamLayoutMode === "scene-grid",
      },
      {
        id: "multi-reaction",
        label: "Catch Reactions",
        caption: "Keep a live reaction window up",
        isActive: multicamLayoutMode === "pip",
      },
      {
        id: "multi-duet",
        label: "Shared Moment",
        caption: "Hold two speakers together",
        isActive: multicamLayoutMode === "split-vertical",
      },
      {
        id: "multi-hit",
        label: "Hit Harder",
        caption: "Turn up pace and visual pressure",
        isActive: flowIntensityMode === "harder",
      },
    ];
  }, [
    isSingleSourceWorkflow,
    singleLensAutoSummary,
    selectedSingleCamFraming.zoom,
    focusPickerActive,
    multicamLayoutMode,
    autoDirectorEnabled,
  ]);
  const previewStageStyle = useMemo(() => {
    const aspectRatioMap = {
      "9:16": "9 / 16",
      "16:9": "16 / 9",
      "1:1": "1 / 1",
    };
    const heightMap = {
      "9:16": "clamp(260px, 50vh, 420px)",
      "16:9": "clamp(220px, 38vh, 420px)",
      "1:1": "clamp(240px, 40vh, 420px)",
    };

    return {
      position: "relative",
      aspectRatio: aspectRatioMap[outputAspectRatio] || "9 / 16",
      height: heightMap[outputAspectRatio] || "clamp(260px, 50vh, 420px)",
      width: "auto",
      maxWidth: "100%",
    };
  }, [outputAspectRatio]);
  const studioProgramStageStyle = useMemo(
    () => ({
      ...previewStageStyle,
      aspectRatio: "16 / 9",
      height: "100%",
      width: "100%",
      maxWidth: "100%",
    }),
    [previewStageStyle]
  );
  const flowBeatCount = flowEditPlan?.beatMarkers?.length || 0;
  const flowEnergyZoneCount = flowEditPlan?.energyZones?.length || 0;
  const isFlowWorkspace = studioMode === "flow";
  const headerTitle = isSingleSourceWorkflow
    ? isFlowWorkspace
      ? "Flow Edit / Mood Match"
      : "Combine Multi-Camera Angles"
    : isFlowWorkspace
      ? "Flow Edit / Sync to Sound"
      : "Combine Multi-Camera Angles";
  const headerDescription = isSingleSourceWorkflow
    ? isFlowWorkspace
      ? "Use one full video as the source, then let Flow Edit pull stronger moments, shape motion, and blend uploaded audio into a more emotional edit."
      : "Load one full recording to edit it on a shared timeline, or add extra camera angles and switch between them while keeping one audio source locked in."
    : isFlowWorkspace
      ? "Use Cam Combiner footage as your visual pool, then optionally drive pacing, camera switches, and speed ramps from uploaded audio or a master source."
      : "Stay in manual Cam Combiner mode to sync cameras, switch angles, and build the edit yourself. Flow Edit is optional and can be opened only when you want rhythm-driven automation.";
  const billingMessage = !canUseFeature("multicam")
    ? "Upgrade to a paid plan to unlock Cam Combiner, Auto Director, and Flow Edit."
    : isFlowWorkspace
      ? "Included on paid plans. Flow Edit preview, Auto Director, and local rhythm shaping do not spend generation credits."
      : "Included on paid plans. Editing and preview are included; clean-audio sync and server MP4 render spend credits when you run them.";
  const studioMonitorSources = useMemo(
    () => visibleCameraSources.filter(isVideoSource).slice(0, 3),
    [visibleCameraSources]
  );
  const studioMonitorSlots = useMemo(
    () => Array.from({ length: 3 }, (_, index) => studioMonitorSources[index] || null),
    [studioMonitorSources]
  );
  const studioSpeakerRows = useMemo(() => {
    const rows = studioMonitorSources.map((source, index) => {
      const mappedTime = getSourceTimelineTime(source, playhead, timelineBounds.timelineStart);
      const score = getAudioActivityScoreForSourceTime(
        audioAnalysisByCameraId?.[source.id],
        mappedTime
      );
      return {
        id: source.id,
        label: getStudioSlotLabel(index),
        score,
        isCurrent: source.id === activeCameraId,
      };
    });
    const peakScore = rows.reduce((maxScore, row) => Math.max(maxScore, row.score), 0);
    return rows
      .map(row => ({
        ...row,
        confidence:
          peakScore > 0
            ? clampNumber(row.score / peakScore, 0.08, 1, row.isCurrent ? 0.86 : 0.32)
            : row.isCurrent
              ? 0.82
              : 0.18,
      }))
      .sort((left, right) => right.confidence - left.confidence);
  }, [
    studioMonitorSources,
    playhead,
    timelineBounds.timelineStart,
    audioAnalysisByCameraId,
    activeCameraId,
    getStudioSlotLabel,
  ]);
  const studioUpcomingSpeaker = useMemo(
    () =>
      studioSpeakerRows.find(row => !row.isCurrent) ||
      studioSpeakerRows[1] ||
      studioSpeakerRows[0] ||
      null,
    [studioSpeakerRows]
  );
  const studioSuggestedAction = useMemo(() => {
    if (studioMonitorSources.length <= 1) {
      return {
        label: "Add Camera 2",
        detail: "Load more angles to unlock real multicam switching and speaker handoffs.",
        actionId: null,
      };
    }
    if (multicamLayoutMode === "scene-grid") {
      return {
        label: "Show Everyone",
        detail: "Keep the whole conversation visible while you judge the next cut.",
        actionId: "multi-grid",
      };
    }
    if (multicamLayoutMode === "pip") {
      return {
        label: "Catch Reaction",
        detail: "Hold the lead, but leave a live reaction window open.",
        actionId: "multi-reaction",
      };
    }
    if (multicamLayoutMode === "split-vertical") {
      return {
        label: "Shared Moment",
        detail: "Both speakers are active. Hold them together on screen.",
        actionId: "multi-duet",
      };
    }
    if (studioUpcomingSpeaker) {
      return {
        label: `Switch to ${studioUpcomingSpeaker.label}`,
        detail: "Upcoming speaker energy is climbing. Prepare the next manual cut.",
        actionId: null,
      };
    }
    return {
      label: `Stay on ${activeCamera?.label || "Program"}`,
      detail: "The current angle is still the cleanest hold right now.",
      actionId: null,
    };
  }, [multicamLayoutMode, studioUpcomingSpeaker, activeCamera, studioMonitorSources.length]);
  const cleanAudioSyncTerminalStatuses = useMemo(
    () => new Set(["ready_for_review", "completed", "failed", "cancelled"]),
    []
  );
  const cleanAudioSyncIsRunning = Boolean(
    cleanAudioSyncJob?.status && !cleanAudioSyncTerminalStatuses.has(cleanAudioSyncJob.status)
  );
  const cleanAudioSyncIsComplete = Boolean(
    cleanAudioSyncJob?.status && cleanAudioSyncTerminalStatuses.has(cleanAudioSyncJob.status)
  );
  const backendTimelineStatus = cleanAudioSyncIsRunning
    ? {
        title: "Safe sync check is processing",
        detail:
          cleanAudioSyncJob?.detail ||
          cleanAudioSyncJob?.stage ||
          "AutoPromote is calculating camera offsets, drift correction, and speaker energy.",
      }
    : cleanAudioSyncIsComplete
      ? {
          title: "Sync corrections loaded",
          detail: "Timeline cuts remain editable. Use the switch deck to replace or refine any segment.",
        }
      : externalAudioTrack
        ? {
            title: "Auto sync ready",
            detail: "Program Output and export will verify clean-audio sync before committing the render.",
          }
        : {
            title: "Manual edit timeline",
            detail: "Load clean audio to let AutoPromote calculate camera offsets automatically.",
          };
  const studioPipelineSteps = useMemo(
    () => [
      {
        id: "analyze",
        label: "Analyze Video",
        detail: readySources.length ? "Footage loaded" : "Waiting for footage",
        state: readySources.length ? "done" : "waiting",
      },
      {
        id: "subjects",
        label: "Detect Subjects",
        detail: readySources.every(source => Number(source.videoWidth || 0) > 0)
          ? "Subjects mapped"
          : "Scanning frames",
        state: readySources.every(source => Number(source.videoWidth || 0) > 0) ? "done" : "active",
      },
      {
        id: "speaker",
        label: "Detect Active Speaker",
        detail: cleanAudioSyncIsRunning
          ? "Worker reading speaker energy"
          : studioSpeakerRows.length
            ? "Live speaker confidence"
            : "Waiting for analysis",
        state: cleanAudioSyncIsRunning ? "active" : studioSpeakerRows.length ? "done" : "active",
      },
      {
        id: "energy",
        label: "Read Audio Energy",
        detail: cleanAudioSyncIsRunning
          ? cleanAudioSyncJob?.detail || "Safe sync check running"
          : hasExternalCleanAudio
            ? "Master audio locked"
            : "Camera bed active",
        state: cleanAudioSyncIsRunning
          ? "active"
          : hasExternalCleanAudio || masterAudioSource
            ? "done"
            : "waiting",
      },
      {
        id: "moves",
        label: "Build Camera Moves",
        detail: cleanAudioSyncIsRunning
          ? "Waiting for sync results"
          : autoDirectorEnabled
            ? "AI assist armed"
            : "Manual director live",
        state: cleanAudioSyncIsRunning ? "waiting" : autoDirectorEnabled ? "active" : "done",
      },
      {
        id: "render",
        label: "Render Final Output",
        detail: exportResult ? "Master ready" : isExporting ? "Rendering now" : "Standing by",
        state: exportResult ? "done" : isExporting ? "active" : "waiting",
      },
    ],
    [
      readySources,
      studioSpeakerRows.length,
      hasExternalCleanAudio,
      masterAudioSource,
      autoDirectorEnabled,
      exportResult,
      isExporting,
      cleanAudioSyncIsRunning,
      cleanAudioSyncJob?.detail,
    ]
  );
  const studioMasterWaveformBars = useMemo(() => {
    const bars =
      audioAnalysisByCameraId[hasExternalCleanAudio ? "external-clean-audio" : masterAudioCameraId]
        ?.bars || [];
    return bars.slice(0, 72);
  }, [audioAnalysisByCameraId, hasExternalCleanAudio, masterAudioCameraId]);
  const studioTimelineEventLabels = [
    "Punch In",
    "Wide Shot",
    "Reaction Cut",
    "Emotional Lock",
    "Audience Lift",
    "Cross Stage",
    "Shared Moment",
    "Lead Focus",
  ];
  const studioEventChips = useMemo(
    () =>
      displaySegments.slice(0, 8).map((segment, index) => ({
        id: segment.id,
        label: studioTimelineEventLabels[index % studioTimelineEventLabels.length],
        time: formatDurationLabel(segment.startTime || segment.timelineStart || 0),
      })),
    [displaySegments]
  );

  // Attach the active camera's video for timed effects
  useEffect(() => {
    const el = previewVideoRefs.current[activeCameraId];
    if (el && typeof el.play === "function") attachVideo(el);
  }, [activeCameraId, attachVideo]);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    currentSourcesRef.current = sources;
  }, [sources]);

  useEffect(() => {
    draftHydratedRef.current = false;
    if (typeof window === "undefined" || !multicamDraftKey) {
      draftHydratedRef.current = true;
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(multicamDraftKey);
      if (!rawDraft) return;

      const draft = JSON.parse(rawDraft);
      if (Array.isArray(draft.switches) && draft.switches.length) {
        setSwitches(draft.switches);
        setSelectedSwitchId(draft.selectedSwitchId || draft.switches[0]?.id || "switch-1");
      }
      if (draft.sourceOffsets && typeof draft.sourceOffsets === "object") {
        setSources(currentSources =>
          currentSources.map(source =>
            Object.prototype.hasOwnProperty.call(draft.sourceOffsets, source.id)
              ? { ...source, offsetSeconds: Number(draft.sourceOffsets[source.id]) || 0, manualOffsetLocked: true }
              : source
          )
        );
      }
      if (draft.masterAudioCameraId) {
        setMasterAudioCameraId(draft.masterAudioCameraId);
      }
      if (draft.outputAspectRatio) {
        setOutputAspectRatio(draft.outputAspectRatio);
      }
      if (draft.useExternalCleanAudio !== undefined) {
        setUseExternalCleanAudio(Boolean(draft.useExternalCleanAudio));
      }
      if (Number.isFinite(Number(draft.cloudRenderWindowStart))) {
        setCloudRenderWindowStart(Math.max(0, Number(draft.cloudRenderWindowStart) || 0));
      }
      if (draft.sourceUploads && typeof draft.sourceUploads === "object") {
        setSources(currentSources =>
          currentSources.map(source => {
            const upload = draft.sourceUploads[source.id];
            if (!upload || typeof upload !== "object") return source;
            return {
              ...source,
              uploadedUrl: upload.uploadedUrl || source.uploadedUrl || "",
              uploadedSyncUrl: upload.uploadedSyncUrl || source.uploadedSyncUrl || "",
              uploadedRenderTrimStart: Number(upload.uploadedRenderTrimStart || 0) || 0,
              uploadedRenderTrimDuration: Number(upload.uploadedRenderTrimDuration || 0) || 0,
            };
          })
        );
      }
      if (draft.externalAudioUpload && typeof draft.externalAudioUpload === "object") {
        setExternalAudioTrack(current =>
          current
            ? {
                ...current,
                url: draft.externalAudioUpload.url || current.url || "",
                cacheKey: draft.externalAudioUpload.cacheKey || current.cacheKey || "",
              }
            : current
        );
      }
      if (draft.flowEditPlan && typeof draft.flowEditPlan === "object") {
        setFlowEditPlan(draft.flowEditPlan);
        setFlowEditEnabled(Boolean(draft.flowEditPlan?.segments?.length));
      }
      setStatusMessage("Restored saved Cam Combiner draft.");
    } catch (error) {
      console.warn("Could not restore multicam draft:", error);
    } finally {
      draftHydratedRef.current = true;
    }
  }, [multicamDraftKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !multicamDraftKey || !draftHydratedRef.current) return;

    try {
      const sourceOffsets = sources.reduce((accumulator, source) => {
        accumulator[source.id] = Number(source.offsetSeconds) || 0;
        return accumulator;
      }, {});
      const sourceUploads = sources.reduce((accumulator, source) => {
        accumulator[source.id] = {
          uploadedUrl: String(source.uploadedUrl || "").startsWith("http")
            ? source.uploadedUrl
            : "",
          uploadedSyncUrl: String(source.uploadedSyncUrl || "").startsWith("http")
            ? source.uploadedSyncUrl
            : "",
          uploadedRenderTrimStart: Number(source.uploadedRenderTrimStart || 0) || 0,
          uploadedRenderTrimDuration: Number(source.uploadedRenderTrimDuration || 0) || 0,
        };
        return accumulator;
      }, {});

      window.localStorage.setItem(
        multicamDraftKey,
        JSON.stringify({
          savedAt: Date.now(),
          switches,
          selectedSwitchId,
          sourceOffsets,
          masterAudioCameraId,
          outputAspectRatio,
          useExternalCleanAudio,
          cloudRenderWindowStart,
          sourceUploads,
          externalAudioUpload: {
            url: String(externalAudioTrack?.url || "").startsWith("http")
              ? externalAudioTrack.url
              : "",
            cacheKey: externalAudioTrack?.cacheKey || "",
          },
          flowEditPlan,
        })
      );
      window.localStorage.setItem("autopromote:multicam-draft:latest", multicamDraftKey);
    } catch (error) {
      console.warn("Could not save multicam draft:", error);
    }
  }, [
    multicamDraftKey,
    switches,
    selectedSwitchId,
    sources,
    masterAudioCameraId,
    outputAspectRatio,
    useExternalCleanAudio,
    cloudRenderWindowStart,
    externalAudioTrack,
    flowEditPlan,
  ]);

  useEffect(() => {
    if (!readySources.length) return;
    if (!readySources.some(source => source.id === masterAudioCameraId)) {
      const fallbackAudioSource = readySources.find(isVideoSource) || readySources[0];
      setMasterAudioCameraId(fallbackAudioSource.id);
      return;
    }
    const currentMasterSource = readySources.find(source => source.id === masterAudioCameraId);
    if (currentMasterSource && !isVideoSource(currentMasterSource)) {
      const fallbackAudioSource = readySources.find(isVideoSource);
      if (fallbackAudioSource) {
        setMasterAudioCameraId(fallbackAudioSource.id);
      }
    }
  }, [readySources, masterAudioCameraId]);

  useEffect(() => {
    if (flowAudioTrack?.mode === "camera" && flowAudioTrack.cameraId !== masterAudioCameraId) {
      setFlowAudioTrack({
        cameraId: masterAudioCameraId,
        name: `${masterAudioSource?.label || "Master"} audio`,
        mode: "camera",
      });
    }
  }, [flowAudioTrack, masterAudioCameraId, masterAudioSource]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [primaryFile, readySources.length]);

  const scrollPreviewPanel = direction => {
    const panel = previewPanelRef.current;
    if (!panel) return;

    panel.scrollBy({
      top: direction * Math.max(240, panel.clientHeight * 0.72),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!isSingleSourceWorkflow || !singleCamSource) {
      singleCamSignatureRef.current = "";
      setSingleCamSegments([]);
      setSelectedSingleCamSegmentId(null);
      setSingleCamSegmentFraming({});
      setSingleLensAutoSummary("");
      return;
    }

    const signature = `${singleCamSource.id}:${Number(singleCamSource.duration || 0).toFixed(3)}`;
    if (singleCamSignatureRef.current === signature && singleCamSegments.length) return;

    const nextSegments = buildDefaultSegments(
      [singleCamSource],
      Number(singleCamSource.duration) || 0
    );
    singleCamSignatureRef.current = signature;
    setSingleCamSegments(nextSegments);
    setSelectedSingleCamSegmentId(nextSegments[0]?.id || null);
    setSingleCamSegmentFraming(
      nextSegments[0]?.id
        ? { [nextSegments[0].id]: normalizeSegmentFraming(DEFAULT_SEGMENT_FRAMING) }
        : {}
    );
  }, [isSingleSourceWorkflow, singleCamSource, singleCamSegments.length]);

  useEffect(() => {
    if (!isSingleSourceWorkflow || !selectedSingleCamSegmentId) {
      setFocusPickerActive(false);
    }
  }, [isSingleSourceWorkflow, selectedSingleCamSegmentId]);

  useEffect(() => {
    if (!isSingleSourceWorkflow || flowEditEnabled) return;
    const activeId = activeSegment?.id || normalizedSingleCamSegments[0]?.id || null;
    setSelectedSingleCamSegmentId(current => {
      if (current && normalizedSingleCamSegments.some(segment => segment.id === current)) {
        return current;
      }
      return activeId;
    });
  }, [isSingleSourceWorkflow, flowEditEnabled, activeSegment, normalizedSingleCamSegments]);

  useEffect(() => {
    if (!flowEditEnabled || !activeFlowSegments.length) {
      setSelectedFlowSegmentId(null);
      return;
    }
    setSelectedFlowSegmentId(current => {
      if (current && activeFlowSegments.some(segment => segment.id === current)) {
        return current;
      }
      return currentFlowSegment?.id || activeFlowSegments[0]?.id || null;
    });
  }, [
    flowEditEnabled,
    activeFlowSegments,
    currentFlowSegment,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const warmAudioAnalysis = async source => {
      const mediaUrl = getSourceMediaUrl(source);
      if (!mediaUrl) return;
      // SKIP if worker already provided voice activity — browser can't decode ProRes
      if (source.backendVoiceActivity && Array.isArray(source.backendVoiceActivity) && source.backendVoiceActivity.length > 0) {
        return; // Worker data is authoritative
      }
      if (!isVideoSource(source)) {
        if (!isCancelled) {
          setAudioAnalysisByCameraId(current => ({
            ...current,
            [source.id]: { mediaUrl, bars: [], isImage: true },
          }));
        }
        return;
      }
      const browserBlockReason = getBrowserSyncBlockReason([source], null);
      if (browserBlockReason) {
        if (!isCancelled) {
          setAudioAnalysisByCameraId(current => ({
            ...current,
            [source.id]: {
              mediaUrl,
              bars: [],
              skipped: true,
              backendRecommended: true,
              message: browserBlockReason,
            },
          }));
        }
        return;
      }

      const cached = audioAnalysisCacheRef.current.get(source.id);
      if (cached?.mediaUrl === mediaUrl) {
        if (!isCancelled) {
          setAudioAnalysisByCameraId(current =>
            current[source.id] ? current : { ...current, [source.id]: cached }
          );
        }
        return;
      }

      try {
        const analysis = await analyzeAudioTrack(mediaUrl);
        if (isCancelled) return;
        const normalizedAnalysis = {
          ...analysis,
          mediaUrl,
          bars: buildWaveformBars(analysis.envelope),
        };
        audioAnalysisCacheRef.current.set(source.id, normalizedAnalysis);
        setAudioAnalysisByCameraId(current => ({ ...current, [source.id]: normalizedAnalysis }));
      } catch {
        if (isCancelled) return;
        const fallback = { mediaUrl, error: true, bars: [] };
        audioAnalysisCacheRef.current.set(source.id, fallback);
        setAudioAnalysisByCameraId(current => ({ ...current, [source.id]: fallback }));
      }
    };

    readySources.forEach(source => {
      warmAudioAnalysis(source);
    });

    return () => {
      isCancelled = true;
    };
  }, [readySources]);

  useEffect(() => {
    if (
      isSingleSourceWorkflow ||
      flowEditEnabled ||
      !autoDirectorEnabled ||
      readySources.length < 2 ||
      !timelineDuration
    ) {
      if (isSingleSourceWorkflow || readySources.length < 2) {
        setAutoDirectorSummary(null);
      }
      return;
    }

    applyAutoDirectorPlan(false);
  }, [
    isSingleSourceWorkflow,
    flowEditEnabled,
    autoDirectorEnabled,
    readySources,
    timelineDuration,
    timelineBounds.timelineStart,
    directorStyleId,
    audioAnalysisByCameraId,
    flowFrameQualityByCameraId,
  ]);

  useEffect(() => {
    if (!timelineDuration) {
      if (playhead !== 0) setPlayhead(0);
      if (isPlaying) setIsPlaying(false);
      return;
    }
    if (playhead > timelineDuration) {
      setPlayhead(timelineDuration);
    }
  }, [playhead, timelineDuration, isPlaying]);

  useEffect(() => {
    if (Math.abs((Number(cloudRenderWindowStart) || 0) - cloudRenderWindowStartSafe) > 0.05) {
      setCloudRenderWindowStart(cloudRenderWindowStartSafe);
    }
  }, [cloudRenderWindowStart, cloudRenderWindowStartSafe]);

  useEffect(() => {
    const unresolvedSources = sources.filter(
      source =>
        getSourceMediaUrl(source) &&
        (isImageSource(source)
          ? Number(source.videoWidth) <= 0 || Number(source.videoHeight) <= 0
          : Number(source.duration) <= 0.05)
    );
    if (!unresolvedSources.length) return;

    let isCancelled = false;
    unresolvedSources.forEach(source => {
      const metadataLoader = isImageSource(source) ? loadImageMetadata : loadVideoMetadata;
      metadataLoader(getSourceMediaUrl(source))
        .then(metadata => {
          if (isCancelled) return;
          setSources(currentSources =>
            currentSources.map(currentSource =>
              currentSource.id === source.id
                ? {
                    ...currentSource,
                    duration:
                      isImageSource(currentSource) && Number(currentSource.duration) > 0.05
                        ? currentSource.duration
                        : metadata.duration,
                    videoWidth: metadata.videoWidth,
                    videoHeight: metadata.videoHeight,
                  }
                : currentSource
            )
          );
        })
        .catch(() => {
          if (isCancelled) return;
          setStatusMessage(`Unable to read ${source.name || source.label}.`);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [sources]);

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(statusMessage);
    }
  }, [statusMessage, onStatusChange]);

  useEffect(() => {
    if (!isPlaying || !timelineDuration) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return undefined;
    }

    if (flowEditEnabled && flowAudioUrl && flowAudioRef.current) {
      const tick = () => {
        const audioTime = Math.min(timelineDuration, Number(flowAudioRef.current?.currentTime) || 0);
        if (Math.abs((Number(playheadRef.current) || 0) - audioTime) > 0.016) {
          setPlayhead(audioTime);
        }
        if (audioTime >= timelineDuration) {
          setIsPlaying(false);
          animationFrameRef.current = null;
          return;
        }
        animationFrameRef.current = requestAnimationFrame(tick);
      };

      animationFrameRef.current = requestAnimationFrame(tick);
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }

    if (!flowAudioUrl && hasExternalCleanAudio && externalAudioRef.current && externalAudioSourceProxy) {
      const tick = () => {
        const externalCurrentTime = Number(externalAudioRef.current?.currentTime) || 0;
        const mappedPlayhead = Math.min(
          timelineDuration,
          Math.max(
            0,
            externalCurrentTime -
              (Number(timelineBounds.timelineStart) || 0) +
              (Number(externalAudioSourceProxy.offsetSeconds) || 0)
          )
        );
        if (Math.abs((Number(playheadRef.current) || 0) - mappedPlayhead) > 0.016) {
          setPlayhead(mappedPlayhead);
        }
        if (mappedPlayhead >= timelineDuration) {
          setIsPlaying(false);
          animationFrameRef.current = null;
          return;
        }
        animationFrameRef.current = requestAnimationFrame(tick);
      };

      animationFrameRef.current = requestAnimationFrame(tick);
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }

    const startedAt = performance.now() - playheadRef.current * 1000;
    const tick = now => {
      const nextPlayhead = Math.min(timelineDuration, (now - startedAt) / 1000);
      setPlayhead(nextPlayhead);
      if (nextPlayhead >= timelineDuration) {
        setIsPlaying(false);
        animationFrameRef.current = null;
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    isPlaying,
    timelineDuration,
    flowEditEnabled,
    flowAudioUrl,
    hasExternalCleanAudio,
    externalAudioSourceProxy,
    timelineBounds.timelineStart,
  ]);

  useEffect(() => {
    readySources.filter(isVideoSource).forEach(source => {
      applySafeMediaSource(audioVideoRefs.current[source.id], getSourceMediaUrl(source));
    });
  }, [readySources]);

  useEffect(() => {
    applySafeMediaSource(flowAudioRef.current, flowAudioUrl);
    forceMediaAudible(flowAudioRef.current);
  }, [flowAudioUrl]);

  useEffect(() => {
    applySafeMediaSource(externalAudioRef.current, externalAudioUrl);
    forceMediaAudible(externalAudioRef.current);
  }, [externalAudioUrl]);

  useEffect(() => {
    readySources.forEach(source => {
      const mappedTime = currentFlowSegment
        ? getFlowSourceTimeAtPlayhead(source, currentFlowSegment, playhead, timelineBounds.timelineStart)
        : isSingleSourceWorkflow
          ? source.id === activeCameraId
            ? mapTimelineTimeToSourceTime(activeSegment, playhead)
            : null
          : getSourceTimelineTime(source, playhead, timelineBounds.timelineStart);
      const isInRange = isSourceAvailableAtTime(source, mappedTime);
      const isActivePreview = source.id === activeCameraId || source.id === secondaryCameraId;
      const playbackRate = currentFlowSegment?.playbackRate || 1;

      syncMediaElement(
        previewVideoRefs.current[source.id],
        mappedTime,
        isPlaying && isInRange && isActivePreview,
        {
          muted: true,
          volume: 0,
          playbackRate,
          driftThreshold: hasExternalCleanAudio ? 0.28 : DRIFT_THRESHOLD_SECONDS,
          softDriftThreshold: hasExternalCleanAudio ? 0.06 : 0.04,
          allowRateCorrection: hasExternalCleanAudio,
          maxRateAdjustment: hasExternalCleanAudio ? 0.14 : 0.08,
        }
      );
      syncMediaElement(thumbnailVideoRefs.current[source.id], mappedTime, false, {
        muted: true,
        volume: 0,
        playbackRate,
      });
      syncMediaElement(
        audioVideoRefs.current[source.id],
        mappedTime,
        !flowAudioUrl &&
          !hasExternalCleanAudio &&
          isPlaying &&
          isInRange &&
          source.id === masterAudioCameraId,
        {
          muted: !!flowAudioUrl || hasExternalCleanAudio || source.id !== masterAudioCameraId,
          volume: !!flowAudioUrl || hasExternalCleanAudio ? 0 : source.id === masterAudioCameraId ? 1 : 0,
          playbackRate,
          driftThreshold: hasExternalCleanAudio ? 0.28 : DRIFT_THRESHOLD_SECONDS,
          softDriftThreshold: hasExternalCleanAudio ? 0.06 : 0.04,
          allowRateCorrection: hasExternalCleanAudio,
          maxRateAdjustment: hasExternalCleanAudio ? 0.14 : 0.08,
        }
      );

      if (hasExternalCleanAudio && externalAudioMixMode === "low_camera") {
        syncMediaElement(
          audioVideoRefs.current[source.id],
          mappedTime,
          isPlaying && isInRange && source.id === activeCameraId,
          {
            muted: false,
            volume: 0.16,
            playbackRate,
            driftThreshold: 0.28,
            softDriftThreshold: 0.08,
            allowRateCorrection: true,
            maxRateAdjustment: 0.12,
          }
        );
      }
    });

    if (flowAudioRef.current) {
      forceMediaAudible(flowAudioRef.current);
      syncMediaElement(
        flowAudioRef.current,
        playhead,
        !!flowAudioUrl && isPlaying,
        {
          muted: false,
          volume: 1,
          playbackRate: 1,
          driftThreshold: 0.22,
        }
      );
    }

    if (!flowAudioUrl && externalAudioRef.current && externalAudioSourceProxy) {
      forceMediaAudible(externalAudioRef.current);
      syncMediaElement(
        externalAudioRef.current,
        getSourceTimelineTime(externalAudioSourceProxy, playhead, timelineBounds.timelineStart),
        hasExternalCleanAudio && isPlaying,
        {
          muted: false,
          volume: 1,
          playbackRate: 1,
          driftThreshold: 0.22,
        }
      );
    }
  }, [
    readySources,
    playhead,
    isPlaying,
    timelineBounds.timelineStart,
    masterAudioCameraId,
    activeCameraId,
    secondaryCameraId,
    isSingleSourceWorkflow,
    activeSegment,
    currentFlowSegment,
    flowAudioUrl,
    hasExternalCleanAudio,
    externalAudioMixMode,
    externalAudioSourceProxy,
  ]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
      if (exportResult?.url) {
        URL.revokeObjectURL(exportResult.url);
      }
    };
  }, [exportResult]);

  useEffect(() => {
    loadRecentRenders();
  }, [loadRecentRenders]);

  useEffect(() => {
    const jobId = cleanAudioSyncJob?.jobId;
    const status = cleanAudioSyncJob?.status;
    if (!jobId || ["ready_for_review", "completed", "failed", "cancelled"].includes(status)) {
      return undefined;
    }

    let isCancelled = false;
    const pollJob = async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || isCancelled) return;

        const nextJob = {
          jobId,
          status: data.status || data.stage || "processing",
          stage: data.stage || data.status || "processing",
          progress: Number(data.progress || 0),
          detail: data.detail || data.message || data.stage || data.status || "Processing",
          error: data.error || "",
        };
        setCleanAudioSyncJob(nextJob);

        if (data.detail || data.stage) {
          setStatusMessage(data.detail || `Clean-audio sync: ${data.stage}`);
        }

        const offsets = Array.isArray(data.offsets)
          ? data.offsets
          : Array.isArray(data.result?.offsets)
            ? data.result.offsets
            : [];
        if (offsets.length && ["ready_for_review", "completed", "sync_complete", "sync_low_confidence"].includes(nextJob.status)) {
          const needsReview = offsets.filter(o => o.status === "needs_review" || o.confidence < 0.45);
          const rejected = offsets.filter(o => o.debug?.rejected);
          const hasDrift = offsets.some(o => o.drift?.hasDrift);
          const syncUnsafe = rejected.length > 0 || needsReview.length > 0;
          const unusableAudioMethods = new Set(["silent_audio", "no_correlation"]);
          const badSyncMatches = offsets.filter(
            o =>
              o.status === "needs_review" ||
              o.debug?.rejected ||
              unusableAudioMethods.has(String(o.method || "")) ||
              /silent|re-extract|no correlation/i.test(String(o.warning || o.message || ""))
          );
          const badSyncSourceIds = new Set(badSyncMatches.map(o => o.sourceId || o.id).filter(Boolean));
          if (badSyncSourceIds.size) {
            currentSourcesRef.current.forEach(source => {
              if (badSyncSourceIds.has(source.id)) {
                deleteCachedSyncAudioFile(buildSyncAudioCacheKey(source.file));
              }
            });
          }

          setSources(currentSources =>
            currentSources.map(source => {
              const match = offsets.find(item => item.sourceId === source.id || item.id === source.id);
              if (!match) return source;
              // Preserve manually locked offsets but still apply worker-computed sync rate
              const isBad =
                match.status === "needs_review" ||
                match.debug?.rejected ||
                unusableAudioMethods.has(String(match.method || "")) ||
                /silent|re-extract|no correlation/i.test(String(match.warning || match.message || ""));
              const voiceActivity = match.voiceActivity;
              const workerSyncRate = isBad
                ? getSourceSyncRate(source)
                : getSyncRateFromWorkerMatch(match, getSourceSyncRate(source));
              if (source.manualOffsetLocked) {
                console.log(`Offset locked for ${source.label}: keeping ${source.offsetSeconds}s, applying worker syncRate ${workerSyncRate}`);
                return {
                  ...source,
                  syncRate: workerSyncRate,
                  sync_rate: workerSyncRate,
                  backendSyncConfidence: Number(match.confidence || source.backendSyncConfidence || 0),
                  backendSyncMethod: match.method || source.backendSyncMethod || "worker",
                  backendSyncStatus: match.status || source.backendSyncStatus || "",
                  backendSyncWarning: match.warning || match.message || source.backendSyncWarning || "",
                  backendSyncDebug: match.debug || source.backendSyncDebug || null,
                  backendSyncDrift: match.drift || source.backendSyncDrift || null,
                  backendVoiceActivity: voiceActivity || source.backendVoiceActivity || null,
                  uploadedSyncUrl: isBad ? "" : source.uploadedSyncUrl,
                  syncAudioUrl: isBad ? "" : source.syncAudioUrl,
                };
              }
              return {
                ...source,
                offsetSeconds: isBad ? Number(source.offsetSeconds || 0) : (Number(match.offsetSeconds ?? match.offset_seconds ?? source.offsetSeconds) || 0),
                syncRate: workerSyncRate,
                sync_rate: workerSyncRate,
                backendSyncConfidence: Number(match.confidence || 0),
                backendSyncMethod: match.method || "worker",
                backendSyncStatus: match.status || "",
                backendSyncWarning: match.warning || match.message || "",
                backendSyncDebug: match.debug || null,
                backendSyncDrift: match.drift || null,
                backendVoiceActivity: voiceActivity || null,
                uploadedSyncUrl: isBad ? "" : source.uploadedSyncUrl,
                syncAudioUrl: isBad ? "" : source.syncAudioUrl,
              };
            })
          );
          // Feed worker-computed voice activity into the audio analysis state
          // so the auto-director can use real ProRes-extracted audio data
          offsets.forEach(match => {
            if (match.voiceActivity && Array.isArray(match.voiceActivity) && match.voiceActivity.length > 0) {
              setAudioAnalysisByCameraId(current => ({
                ...current,
                [match.sourceId]: {
                  ...(current[match.sourceId] || {}),
                  envelope: match.voiceActivity,
                  secondsPerBin: match.voiceActivitySecondsPerBin || 0.5,
                  duration: (match.voiceActivity?.length || 0) * (match.voiceActivitySecondsPerBin || 0.5),
                  source: "worker",
                },
              }));
            }
          });
          // Feed backend director timeline into auto-director
          const directorTimeline = data.directorTimeline || data.result?.directorTimeline || [];
          const directorStatus = data.directorStatus || data.result?.directorStatus || "unknown";

          if (syncUnsafe || directorStatus === "blocked_by_low_sync_confidence") {
            setAutoDirectorEnabled(false);
            setAutoDirectorSummary(null);
            setMulticamLayoutMode(currentMode => (currentMode === "smart" ? "cut" : currentMode));
            setStatusMessage("Auto Director paused until sync is reviewed.");
          } else if (directorTimeline.length > 0 && autoDirectorEnabled) {
            // Convert backend director timeline to Auto Director switches format
            const directorSwitches = [];
            directorTimeline.forEach(seg => {
              if (seg.selectedCameraId && seg.startTime != null) {
                directorSwitches.push({
                  id: `dir-${seg.startTime}`,
                  cameraId: seg.selectedCameraId,
                  startTime: seg.startTime,
                  layoutMode: normalizeMulticamLayoutMode(seg.layoutMode || seg.layout_mode || "cut"),
                });
              }
            });
            if (directorSwitches.length > 0) {
              setSwitches(directorSwitches);
              setSelectedSwitchId(directorSwitches[0]?.id || null);
              setMulticamLayoutMode(
                directorTimeline.some(s => s.layoutMode === "show_everyone") ? "scene-grid" : "smart"
              );
              setStatusMessage(
                `Director timeline loaded: ${directorTimeline.length} segments, ${directorSwitches.length} camera switches.`
              );
            }
          } else if (directorTimeline.length > 0) {
            setAutoDirectorSummary(null);
          }

          setUseExternalCleanAudio(true);

          if (rejected.length > 0) {
            const names = rejected.map(o => o.label).join(", ");
            setStatusMessage(
              `Bad offsets rejected for ${names} — review sync before Auto Director resumes.`
            );
            toast(`Offsets rejected for ${names} — click camera to nudge`, { icon: "⚠️", duration: 10000 });
          } else if (needsReview.length > 0) {
            setStatusMessage(
              `${needsReview.length} camera(s) need manual review — Auto Director is paused.`
            );
            toast(`${needsReview.length} camera(s) need review — check offsets`, { icon: "⚠️", duration: 8000 });
          } else if (hasDrift) {
            setStatusMessage("Sync complete, but possible audio drift detected. Verify alignment.");
            toast("Possible audio drift — verify sync", { icon: "⚠️", duration: 6000 });
          } else {
            setStatusMessage("Sync window matched with high confidence. Play Program Output to verify lips before export.");
          }
        }
      } catch (error) {
        console.warn("Clean-audio sync status poll failed", error);
      }
    };

    pollJob();
    const intervalId = window.setInterval(pollJob, 3500);
    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [cleanAudioSyncJob?.jobId, cleanAudioSyncJob?.status]);

  // Cleanup multicam render export poll interval on unmount
  useEffect(() => {
    return () => {
      if (exportPollIntervalRef.current) {
        window.clearInterval(exportPollIntervalRef.current);
        exportPollIntervalRef.current = null;
      }
    };
  }, []);

  const appendFiles = files => {
    const available = MULTICAM_MAX_SOURCES - sources.length;
    if (available <= 0) {
      toast.error(`Maximum ${MULTICAM_MAX_SOURCES} camera sources allowed.`);
      return;
    }
    const acceptedFiles = Array.from(files || []);
    const filesToAdd = acceptedFiles.slice(0, available);
    const nextSources = filesToAdd.map(file => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      const cameraNumber = nextCameraIndexRef.current;
      nextCameraIndexRef.current += 1;
      const mediaKind = String(file?.type || "").startsWith("image/") ? "image" : "video";
      return {
        id: `cam-${cameraNumber}`,
        label: `Camera ${cameraNumber}`,
        name: file.name,
        file,
        mediaKind,
        previewUrl,
        url: "",
        uploadedUrl: "",
        uploadedSyncUrl: "",
        offsetSeconds: 0,
        duration: mediaKind === "image" ? DEFAULT_IMAGE_SEGMENT_DURATION : 0,
        videoWidth: 0,
        videoHeight: 0,
      };
    });

    setSources(currentSources => [...currentSources, ...nextSources]);
    if (nextSources.length) {
      const largeVideoAdded = nextSources.some(source => getSourceFileSize(source) > BROWSER_SYNC_MAX_SINGLE_VISUAL_BYTES);
      setStatusMessage(
        largeVideoAdded
          ? `${nextSources.length} visual source${nextSources.length > 1 ? "s" : ""} added. This is a large project, so clean-audio sync will run in the background for stability.`
          : `${nextSources.length} visual source${nextSources.length > 1 ? "s" : ""} added.`
      );
    }
    if (filesToAdd.length < Array.from(files || []).length) {
      toast(`Only ${filesToAdd.length} added — max ${MULTICAM_MAX_SOURCES} sources.`);
    }
  };

  const handleRemoveSource = cameraId => {
    const removedSource = sources.find(s => s.id === cameraId);
    const removedSourceHasMedia = !!getSourceMediaUrl(removedSource);
    if (removedSourceHasMedia && readySources.length <= 1) {
      toast.error("Keep at least one loaded visual source in the project.");
      return;
    }
    if (sources.length <= 1) {
      toast.error("Keep at least one camera slot in the project.");
      return;
    }
    setSources(current => current.filter(s => s.id !== cameraId));
    setSwitches(current => {
      const cleaned = current.filter(sw => sw.cameraId !== cameraId);
      if (!cleaned.length) {
        const remaining = sources.filter(s => s.id !== cameraId);
        return [{ id: "switch-1", cameraId: remaining[0]?.id || "cam-1", startTime: 0 }];
      }
      return cleaned;
    });
    if (masterAudioCameraId === cameraId) {
      const remaining = sources.filter(s => s.id !== cameraId);
      setMasterAudioCameraId(remaining[0]?.id || "cam-1");
    }
    if (flowAudioTrack?.cameraId === cameraId) {
      setFlowAudioTrack(null);
      setFlowEditEnabled(false);
      setFlowEditPlan(null);
      setFlowEditVariants([]);
    }
    if (removedSource?.previewUrl && objectUrlsRef.current.has(removedSource.previewUrl)) {
      URL.revokeObjectURL(removedSource.previewUrl);
      objectUrlsRef.current.delete(removedSource.previewUrl);
    }
    setStatusMessage(`Removed ${removedSource?.label || "source"}.`);
  };

  const handleCancelExport = () => {
    cancelExportRef.current = true;
    if (exportPollIntervalRef.current) {
      window.clearInterval(exportPollIntervalRef.current);
      exportPollIntervalRef.current = null;
    }
    setServerExportPending(false);
    setIsExporting(false);
    setExportProgress(0);
    setStatusMessage("Export cancelled.");
  };

  const handleOffsetChange = (cameraId, nextValue) => {
    const numericOffset = Number(nextValue);
    setSources(currentSources =>
      currentSources.map(source => {
        if (source.id !== cameraId) return source;
        const newOffset = Number.isFinite(numericOffset) ? numericOffset : 0;
        console.log(
          `Offset manual change: ${source.label}: ${source.offsetSeconds}s → ${newOffset}s (locked)`);
        return { ...source, offsetSeconds: newOffset, manualOffsetLocked: true };
      })
    );
  };

  const applyAutoDirectorPlan = (forceStatus = false) => {
    if (
      isSingleSourceWorkflow ||
      flowEditEnabled ||
      readySources.length < 2 ||
      !timelineDuration
    ) {
      return;
    }

    const nextPlan = buildAutoDirectorPlan(readySources, timelineDuration, {
      timelineStart: timelineBounds.timelineStart,
      directorStyleId,
      intensityMode: flowIntensityMode,
      audioActivityBySource: audioAnalysisByCameraId,
      qualityBySource: flowFrameQualityByCameraId,
    });
    const signature = JSON.stringify(
      nextPlan.switches.map(item => [item.cameraId, Number(item.startTime).toFixed(2)])
    );

    setAutoDirectorSummary(nextPlan.summary);
    if (signature !== autoDirectorSignatureRef.current) {
      autoDirectorSignatureRef.current = signature;
      setSwitches(nextPlan.switches);
      setSelectedSwitchId(nextPlan.switches[0]?.id || null);
      if (forceStatus) {
        setStatusMessage(
          `Auto Director built ${nextPlan.summary.switchesCount} cuts with ${Math.round(
            nextPlan.summary.confidence * 100
          )}% confidence${flowIntensityMode === "harder" ? " in impact mode" : ""}${nextPlan.summary.momentCount ? ` and staged ${nextPlan.summary.magicSummary}` : ""}.`
        );
      }
    } else if (forceStatus) {
      setStatusMessage(
        `Auto Director is active in ${nextPlan.summary.modeLabel.toLowerCase()}${flowIntensityMode === "harder" ? " with impact mode engaged" : ""}${nextPlan.summary.momentCount ? ` and is watching for ${nextPlan.summary.magicSummary}` : ""}.`
      );
    }
  };

  const disableAutoDirectorForManualControl = reason => {
    setAutoDirectorEnabled(false);
    setAutoDirectorSummary(null);
    setMulticamLayoutMode(currentMode => (currentMode === "smart" ? "cut" : currentMode));
    if (reason) {
      setStatusMessage(reason);
    }
  };

  const handlePreviewProgramSwitch = (cameraId, layoutModeOverride = "cut", reason = "") => {
    if (!cameraId || !timelineDuration) return;
    const sourceScope = readySources.length ? readySources : sources;
    const targetSource = sourceScope.find(source => source.id === cameraId);
    if (!targetSource || !getSourceMediaUrl(targetSource)) {
      toast.error("Load a visual into this slot before previewing it.");
      return;
    }

    const mappedTime = getSourceTimelineTime(targetSource, playhead, timelineBounds.timelineStart);
    const isInRange = mappedTime >= 0 && mappedTime <= Number(targetSource.duration || 0) - 0.01;
    if (!isInRange) {
      const sourceStartAtTimeline = Number(
        ((Number(targetSource.offsetSeconds) || 0) - (Number(timelineBounds.timelineStart) || 0)).toFixed(3)
      );
      const sourceEndAtTimeline = Number(
        (
          sourceStartAtTimeline +
          Math.max(0, Number(targetSource.duration || 0) - 0.01)
        ).toFixed(3)
      );
      setPlayhead(
        Math.max(0, Math.min(timelineDuration, Math.max(sourceStartAtTimeline, Math.min(playhead, sourceEndAtTimeline))))
      );
    }

    const normalizedLayoutMode = normalizeMulticamLayoutMode(layoutModeOverride);
    setPreviewProgramOverride({
      cameraId,
      layoutMode: normalizedLayoutMode,
      updatedAt: Date.now(),
    });
    setStatusMessage(
      reason ||
        `Preview-only sync check: ${targetSource.label || cameraId}. Render plan is unchanged.`
    );
  };

  const activateManualLayoutMode = (layoutMode, reason) => {
    const normalizedLayoutMode = normalizeMulticamLayoutMode(layoutMode);
    if (!manualRenderEditsEnabled) {
      handlePreviewProgramSwitch(
        activeCameraId || readySources[0]?.id || sources[0]?.id,
        normalizedLayoutMode,
        `${MANUAL_TIMELINE_LAYOUT_LABELS[normalizedLayoutMode] || "Layout"} preview only. Render plan is unchanged.`
      );
      return;
    }

    if (autoDirectorEnabled) {
      disableAutoDirectorForManualControl(reason);
    } else if (reason) {
      setStatusMessage(reason);
    }
    setMulticamLayoutMode(normalizedLayoutMode);
    if (!isSingleSourceWorkflow && !flowEditEnabled && activeCameraId && timelineDuration) {
      handleRecordSwitch(activeCameraId, normalizedLayoutMode);
    }
  };

  const handleRecordSwitch = (cameraId, layoutModeOverride = "cut") => {
    if (!cameraId || !timelineDuration) return;
    const normalizedLayoutMode = normalizeMulticamLayoutMode(layoutModeOverride);

    if (!manualRenderEditsEnabled && !flowEditEnabled) {
      handlePreviewProgramSwitch(cameraId, normalizedLayoutMode);
      return;
    }

    if (!isSingleSourceWorkflow && flowEditEnabled && selectedFlowSegmentId) {
      handleApplyCameraToFlowSegment(cameraId);
      setStatusMessage(`Flow segment switched to ${cameraId}.`);
      return;
    }

    if (!isSingleSourceWorkflow && autoDirectorEnabled) {
      disableAutoDirectorForManualControl(
        "Manual cut override engaged. Auto Director is paused until you re-arm it."
      );
    }

    const sourceScope = readySources.length ? readySources : sources;
    const targetSource = sourceScope.find(source => source.id === cameraId);
    if (!targetSource || !getSourceMediaUrl(targetSource)) {
      toast.error("Load a visual into this slot before switching to it.");
      return;
    }

    const mappedTime = getSourceTimelineTime(targetSource, playhead, timelineBounds.timelineStart);
    const isInRange = mappedTime >= 0 && mappedTime <= Number(targetSource.duration || 0) - 0.01;
    const sourceStartAtTimeline = Number(
      ((Number(targetSource.offsetSeconds) || 0) - (Number(timelineBounds.timelineStart) || 0)).toFixed(3)
    );
    const sourceEndAtTimeline = Number(
      (
        sourceStartAtTimeline +
        Math.max(0, Number(targetSource.duration || 0) - 0.01)
      ).toFixed(3)
    );
    const switchTime = Number(
      (
        isInRange
          ? playhead
          : Math.max(0, Math.min(timelineDuration, Math.max(sourceStartAtTimeline, Math.min(playhead, sourceEndAtTimeline))))
      ).toFixed(3)
    );

    if (!isInRange) {
      setPlayhead(switchTime);
      setStatusMessage(
        `${targetSource.label} is not live at the old playhead, so the cut jumped to its first valid frame.`
      );
    }

    setSwitches(currentSwitches => {
      const nextSwitches = [...currentSwitches];
      const existingIndex = nextSwitches.findIndex(
        item => Math.abs(Number(item.startTime) - switchTime) < 0.08
      );
      const nextSwitch = {
        id: existingIndex >= 0 ? nextSwitches[existingIndex].id : `switch-${Date.now()}`,
        cameraId,
        layoutMode: normalizedLayoutMode,
        startTime: switchTime,
      };

      if (existingIndex >= 0) {
        nextSwitches[existingIndex] = nextSwitch;
      } else {
        nextSwitches.push(nextSwitch);
      }

      const normalized = normalizeSwitches(nextSwitches, sourceScope, timelineDuration);
      const selected = normalized.find(
        item => Math.abs(Number(item.startTime) - switchTime) < 0.08 && item.cameraId === cameraId
      );
      if (selected) {
        setSelectedSwitchId(selected.id);
      }
      return normalized;
    });

    setStatusMessage(
      `${MANUAL_TIMELINE_LAYOUT_LABELS[normalizedLayoutMode] || "Manual cut"} saved at ${formatDurationLabel(
        switchTime
      )}. Program Output will replay this edit.`
    );
  };

  const handleResetManualSwitchPlan = () => {
    if (isSingleSourceWorkflow || flowEditEnabled) return;

    const sourceScope = readySources.length ? readySources : sources;
    if (!sourceScope.length || !timelineDuration) return;

    if (autoDirectorEnabled) {
      disableAutoDirectorForManualControl(
        "Manual cut mode engaged. Auto Director is paused so you can place your own switches."
      );
    } else {
      setStatusMessage("Manual cut mode engaged. Build the switch timeline your way.");
    }

    const anchorCameraId = activeCameraId || sourceScope[0]?.id || null;
    if (!anchorCameraId) return;

    const resetSwitches = normalizeSwitches(
      [{ id: "switch-1", cameraId: anchorCameraId, startTime: 0 }],
      sourceScope,
      timelineDuration || 0
    );
    setSwitches(resetSwitches);
    setSelectedSwitchId(resetSwitches[0]?.id || null);
  };

  const handleNudgeSelectedSwitch = deltaSeconds => {
    if (!selectedManualSwitch || !timelineDuration) return;
    const sourceScope = readySources.length ? readySources : sources;
    const switchIndex = normalizedSwitches.findIndex(item => item.id === selectedManualSwitch.id);
    if (switchIndex <= 0) return;

    const previousSwitch = normalizedSwitches[switchIndex - 1];
    const nextSwitch = normalizedSwitches[switchIndex + 1];
    const minTime = Number(previousSwitch?.startTime || 0) + 0.08;
    const maxTime = nextSwitch
      ? Number(nextSwitch.startTime) - 0.08
      : Math.max(minTime, timelineDuration - 0.01);
    const nextTime = clampNumber(
      Number(selectedManualSwitch.startTime || 0) + deltaSeconds,
      minTime,
      maxTime,
      Number(selectedManualSwitch.startTime || 0)
    );

    if (Math.abs(nextTime - Number(selectedManualSwitch.startTime || 0)) < 0.001) return;

    const nextSwitches = normalizedSwitches.map(item =>
      item.id === selectedManualSwitch.id
        ? { ...item, startTime: Number(nextTime.toFixed(3)) }
        : item
    );
    const normalized = normalizeSwitches(nextSwitches, sourceScope, timelineDuration || 0);
    setSwitches(normalized);
    setSelectedSwitchId(selectedManualSwitch.id);
    setPlayhead(Number(nextTime.toFixed(3)));
    setStatusMessage(
      `Moved cut for ${selectedManualSwitch.cameraId} to ${formatDurationLabel(nextTime)}.`
    );
  };

  const handleAssignSelectedSwitchCamera = cameraId => {
    if (!selectedManualSwitch || !cameraId || !timelineDuration) return;
    const sourceScope = readySources.length ? readySources : sources;
    const normalized = normalizeSwitches(
      normalizedSwitches.map(item =>
        item.id === selectedManualSwitch.id ? { ...item, cameraId } : item
      ),
      sourceScope,
      timelineDuration || 0
    );
    setSwitches(normalized);
    setSelectedSwitchId(selectedManualSwitch.id);
    const label = sourceScope.find(source => source.id === cameraId)?.label || cameraId;
    setStatusMessage(
      `Selected cut now switches to ${label} at ${formatDurationLabel(
        Number(selectedManualSwitch.startTime || 0)
      )}.`
    );
  };

  const handleAlignSourceStartToPlayhead = cameraId => {
    const source = sources.find(item => item.id === cameraId);
    if (!source || !getSourceMediaUrl(source)) return;

    const nextOffset = Number((playhead + timelineBounds.timelineStart).toFixed(3));
    setSources(currentSources =>
      currentSources.map(currentSource =>
        currentSource.id === cameraId
          ? { ...currentSource, offsetSeconds: nextOffset, manualOffsetLocked: true }
          : currentSource
      )
    );
    setStatusMessage(
      `${source.label} start aligned to the current playhead at ${formatDurationLabel(playhead)}.`
    );
  };

  const handleNudgeOffset = (cameraId, delta) => {
    const source = sources.find(item => item.id === cameraId);
    if (!source) return;

    const nextOffset = Number(((Number(source.offsetSeconds) || 0) + delta).toFixed(3));
    setSources(currentSources =>
      currentSources.map(currentSource =>
        currentSource.id === cameraId
          ? { ...currentSource, offsetSeconds: nextOffset, manualOffsetLocked: true }
          : currentSource
      )
    );
  };

  const handleSplitSingleCamSegment = () => {
    if (!isSingleSourceWorkflow || !singleCamSource || !selectedSingleCamSegmentId) return;
    const nextSegments = splitSegmentAtTimelineTime(
      normalizedSingleCamSegments,
      [singleCamSource],
      selectedSingleCamSegmentId,
      playhead,
      timelineDuration
    );
    if (nextSegments.length === normalizedSingleCamSegments.length) return;

    setSingleCamSegments(nextSegments);
    const sourceFraming = normalizeSegmentFraming(
      singleCamSegmentFraming[selectedSingleCamSegmentId] || DEFAULT_SEGMENT_FRAMING
    );
    const splitIndex = nextSegments.findIndex(
      segment => segment.id === `${selectedSingleCamSegmentId}-a`
    );
    if (splitIndex >= 0) {
      const leftId = nextSegments[splitIndex]?.id;
      const rightId = nextSegments[splitIndex + 1]?.id;
      setSelectedSingleCamSegmentId(rightId || leftId || selectedSingleCamSegmentId);
      setSingleCamSegmentFraming(current => ({
        ...current,
        [leftId]: normalizeSegmentFraming(sourceFraming),
        [rightId]: normalizeSegmentFraming(sourceFraming),
      }));
    }
  };

  const handleDeleteSingleCamSegment = () => {
    if (!isSingleSourceWorkflow || !singleCamSource || !selectedSingleCamSegmentId) return;
    if (normalizedSingleCamSegments.length <= 1) {
      toast.error("Keep at least one segment in the single-camera edit.");
      return;
    }

    const nextSegments = normalizeSegments(
      normalizedSingleCamSegments.filter(segment => segment.id !== selectedSingleCamSegmentId),
      [singleCamSource],
      null
    );
    setSingleCamSegments(nextSegments);
    setSelectedSingleCamSegmentId(nextSegments[0]?.id || null);
    setSingleCamSegmentFraming(current => {
      const next = { ...current };
      delete next[selectedSingleCamSegmentId];
      return next;
    });
    setPlayhead(current =>
      Math.min(current, nextSegments[nextSegments.length - 1]?.timelineEnd || 0)
    );
  };

  const handleTrimSingleCamSegment = (edge, deltaSeconds) => {
    if (!isSingleSourceWorkflow || !singleCamSource || !selectedSingleCamSegmentId) return;
    const nextSegments = normalizeSegments(
      normalizedSingleCamSegments.map(segment => {
        if (segment.id !== selectedSingleCamSegmentId) return segment;
        const currentStart = Number(segment.sourceStart) || 0;
        const currentEnd = Number(segment.sourceEnd) || 0;
        const sourceDuration = Number(singleCamSource.duration) || currentEnd;
        if (edge === "start") {
          const nextStart = Math.max(0, Math.min(currentEnd - 0.05, currentStart + deltaSeconds));
          return { ...segment, sourceStart: Number(nextStart.toFixed(3)) };
        }
        const nextEnd = Math.max(
          currentStart + 0.05,
          Math.min(sourceDuration, currentEnd + deltaSeconds)
        );
        return { ...segment, sourceEnd: Number(nextEnd.toFixed(3)) };
      }),
      [singleCamSource],
      null
    );
    setSingleCamSegments(nextSegments);
  };

  const handleUpdateSingleCamFraming = patch => {
    if (!selectedSingleCamSegmentId) return;
    setSingleCamSegmentFraming(current => ({
      ...current,
      [selectedSingleCamSegmentId]: normalizeSegmentFraming({
        ...DEFAULT_SEGMENT_FRAMING,
        ...(current[selectedSingleCamSegmentId] || {}),
        ...patch,
      }),
    }));
  };

  const handleApplySingleCamFocusPreset = preset => {
    if (!selectedSingleCamSegmentId) return;

    if (preset.id === "two-shot") {
      handleUpdateSingleCamFraming({
        zoom: 1,
        zoomAnchor: "center",
        targetX: 0.5,
        targetY: 0.5,
      });
      setFocusPickerActive(false);
      return;
    }

    handleUpdateSingleCamFraming({ zoom: preset.zoom });
    setFocusPickerActive(true);
    setStatusMessage(
      `Click the preview on the ${preset.id === "face" ? "face" : "person"} you want this segment to frame.`
    );
  };

  const handleRunQuickAction = actionId => {
    if (isSingleSourceWorkflow) {
      if (actionId === "single-auto") {
        handleAutoShapeSingleLens();
        return;
      }
      if (actionId === "single-body") {
        handleApplySingleCamFocusPreset({ id: "body", zoom: 1.22 });
        return;
      }
      if (actionId === "single-face") {
        handleApplySingleCamFocusPreset({ id: "face", zoom: 1.45 });
        return;
      }
      if (actionId === "single-pick") {
        setFocusPickerActive(current => !current);
        setStatusMessage(
          focusPickerActive
            ? "Focus pick cancelled."
            : "Click the preview on the face or body you want framed."
        );
      }
      return;
    }

    if (actionId === "multi-smart") {
      setMulticamLayoutMode("smart");
      setAutoDirectorEnabled(true);
      setStatusMessage("Auto Director re-armed. Manual layouts pause until you take control again.");
      applyAutoDirectorPlan(true);
      return;
    }
    if (actionId === "multi-grid") {
      activateManualLayoutMode(
        "scene-grid",
        "Show Everyone is now manual. Auto Director is paused until you re-arm it."
      );
      return;
    }
    if (actionId === "multi-reaction") {
      activateManualLayoutMode(
        "pip",
        "Reaction window is now manual. Auto Director is paused until you re-arm it."
      );
      return;
    }
    if (actionId === "multi-duet") {
      activateManualLayoutMode(
        "split-vertical",
        "Shared-moment split is now manual. Auto Director is paused until you re-arm it."
      );
      return;
    }
    if (actionId === "multi-hit") {
      toggleFlowIntensityMode();
    }
  };

  const handlePreviewStageFocusPick = event => {
    if (!focusPickerActive || !isSingleSourceWorkflow || !selectedSingleCamSegmentId) return;

    const rect = previewStageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const targetX = clampNumber((event.clientX - rect.left) / rect.width, 0.05, 0.95, 0.5);
    const targetY = clampNumber((event.clientY - rect.top) / rect.height, 0.08, 0.92, 0.5);
    const zoomAnchor = targetX < 0.4 ? "left" : targetX > 0.6 ? "right" : "center";
    const nextZoom = Math.max(1.12, Number(selectedSingleCamFraming.zoom) || 1.12);

    handleUpdateSingleCamFraming({
      zoom: nextZoom,
      zoomAnchor,
      targetX,
      targetY,
    });
    setFocusPickerActive(false);
    setStatusMessage("Subject focus saved for the selected segment.");
  };

  const handleStepFrame = frameDelta => {
    if (!timelineDuration) return;
    setIsPlaying(false);
    setPlayhead(current => {
      const nextValue = current + frameDelta * FRAME_STEP_SECONDS;
      return Math.max(0, Math.min(timelineDuration, Number(nextValue.toFixed(3))));
    });
  };

  const getOrCreateAudioAnalysis = async source => {
    if (!isVideoSource(source)) {
      throw new Error("Choose a video source when you want audio-driven analysis.");
    }
    const mediaUrl = getSourceMediaUrl(source);
    if (!mediaUrl) {
      throw new Error("No media loaded for this source.");
    }

    const cached = audioAnalysisCacheRef.current.get(source.id);
    if (cached?.mediaUrl === mediaUrl && !cached.error) {
      return cached;
    }

    const analysis = await analyzeAudioTrack(mediaUrl);
    const normalizedAnalysis = {
      ...analysis,
      mediaUrl,
      bars: buildWaveformBars(analysis.envelope),
    };
    audioAnalysisCacheRef.current.set(source.id, normalizedAnalysis);
    setAudioAnalysisByCameraId(current => ({ ...current, [source.id]: normalizedAnalysis }));
    return normalizedAnalysis;
  };

  const getOrCreateExternalAudioAnalysis = async () => {
    if (!externalAudioUrl) {
      throw new Error("Upload an external clean audio file first.");
    }

    const cacheKey = "external-clean-audio";
    const cached = audioAnalysisCacheRef.current.get(cacheKey);
    if (cached?.mediaUrl === externalAudioUrl && !cached.error) {
      return cached;
    }

    const analysis = await analyzeAudioTrack(externalAudioUrl);
    const normalizedAnalysis = {
      ...analysis,
      mediaUrl: externalAudioUrl,
      bars: buildWaveformBars(analysis.envelope),
    };
    audioAnalysisCacheRef.current.set(cacheKey, normalizedAnalysis);
    setAudioAnalysisByCameraId(current => ({ ...current, [cacheKey]: normalizedAnalysis }));
    setExternalAudioTrack(current =>
      current
        ? {
            ...current,
            duration: Number(analysis.duration) || Number(current.duration) || 0,
          }
        : current
    );
    return normalizedAnalysis;
  };

  const handleLoadExternalAudioFile = async file => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    setUseExternalCleanAudio(true);
    setExternalAudioTrack({
      file,
      previewUrl,
      name: file.name || "External clean audio",
      offsetSeconds: 0,
      duration: 0,
    });
    setExternalAudioMixMode("external_only");
    setCleanAudioSyncJob(null);
    const externalAudioTooLarge = Number(file.size || 0) > BROWSER_SYNC_MAX_EXTERNAL_AUDIO_BYTES;
    if (externalAudioTooLarge) {
      const message = `${file.name || "External audio"} loaded. This clean audio is ${formatMediaBytes(
        file.size
      )}, so AutoPromote will sync it in the background instead of decoding the whole waveform in the browser.`;
      setStatusMessage(message);
      toast(message, { duration: 9000 });
      return;
    }
    setStatusMessage("External clean audio loaded. Reading waveform for sync...");

    try {
      const analysis = await analyzeAudioTrack(previewUrl);
      const normalizedAnalysis = {
        ...analysis,
        mediaUrl: previewUrl,
        bars: buildWaveformBars(analysis.envelope),
      };
      audioAnalysisCacheRef.current.set("external-clean-audio", normalizedAnalysis);
      setAudioAnalysisByCameraId(current => ({
        ...current,
        "external-clean-audio": normalizedAnalysis,
      }));
      setExternalAudioTrack(current =>
        current
          ? {
              ...current,
              duration: Number(analysis.duration) || 0,
            }
          : current
      );
      setStatusMessage(
        "Clean audio is ready. Tip: clap once at the start next time for an easier waveform lock."
      );
    } catch (error) {
      setStatusMessage(
        "Clean audio loaded, but waveform analysis failed. You can still adjust the alignment manually."
      );
    }
  };

  const handleClearExternalAudio = () => {
    externalAudioRef.current?.pause?.();
    if (externalAudioTrack?.previewUrl && objectUrlsRef.current.has(externalAudioTrack.previewUrl)) {
      URL.revokeObjectURL(externalAudioTrack.previewUrl);
      objectUrlsRef.current.delete(externalAudioTrack.previewUrl);
    }
    audioAnalysisCacheRef.current.delete("external-clean-audio");
    setAudioAnalysisByCameraId(current => {
      const next = { ...current };
      delete next["external-clean-audio"];
      return next;
    });
    setUseExternalCleanAudio(false);
    setExternalAudioTrack(null);
    setExternalAudioMixMode("external_only");
    setStatusMessage("External clean audio removed. Camera audio is back in control.");
  };

  const handleExternalAudioOffsetChange = nextValue => {
    const numericOffset = Number(nextValue);
    setExternalAudioTrack(current =>
      current
        ? {
            ...current,
            offsetSeconds: Number.isFinite(numericOffset) ? numericOffset : 0,
          }
        : current
    );
  };

  const handleNudgeExternalAudio = delta => {
    setExternalAudioTrack(current =>
      current
        ? {
            ...current,
            offsetSeconds: Number(((Number(current.offsetSeconds) || 0) + delta).toFixed(3)),
          }
        : current
    );
  };

  /**
   * Compress large WAV audio to 16 kHz mono for fast sync upload.
   * Returns { file, originalSize, compressedSize } or null if unsupported.
   */
  const AUDIO_SYNC_COMPRESSION_THRESHOLD = 20 * 1024 * 1024; // 20 MB

  const compressAudioForSync = async (file, label, options = {}) => {
    const isAudio = file.type.startsWith("audio/") || /\.(wav|mp3|aac|ogg|flac|m4a|wma|aiff)$/i.test(file.name || "");
    if (!isAudio) return null;
    if (file.size <= AUDIO_SYNC_COMPRESSION_THRESHOLD) return null;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    setStatusMessage(`Large audio detected (${formatMediaBytes(file.size)}). Creating smaller sync copy...`);
    const arrayBuffer = await file.arrayBuffer();

    return new Promise(resolve => {
      const audioCtx = new AudioContextClass();
      audioCtx.decodeAudioData(arrayBuffer, audioBuffer => {
        try {
          const sampleRate = 16000;
          const channels = 1;
          const rawDuration = Number(audioBuffer.duration) || 0;
          const trimStart = clampNumber(Number(options.trimStart) || 0, 0, Math.max(0, rawDuration - 0.2), 0);
          const requestedDuration = Number(options.trimDuration) || rawDuration;
          const cappedDuration = Math.min(requestedDuration, VIDEO_SYNC_MAX_EXTRACT_SECONDS);
          const duration = clampNumber(
            cappedDuration,
            0.2,
            Math.max(0.2, rawDuration - trimStart),
            Math.min(rawDuration, VIDEO_SYNC_MAX_EXTRACT_SECONDS)
          );
          const offlineCtx = new OfflineAudioContext(channels, Math.ceil(sampleRate * duration), sampleRate);
          const source = offlineCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineCtx.destination);
          source.start(0, trimStart, duration);

          offlineCtx.startRendering().then(rendered => {
            audioCtx.close().catch(() => {});
            // Convert rendered AudioBuffer to WAV blob
            const numSamples = rendered.length;
            const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
            const view = new DataView(wavBuffer);
            // RIFF header
            writeString(view, 0, "RIFF");
            view.setUint32(4, 36 + numSamples * 2, true);
            writeString(view, 8, "WAVE");
            writeString(view, 12, "fmt ");
            view.setUint32(16, 16, true);        // chunk size
            view.setUint16(20, 1, true);          // PCM
            view.setUint16(22, channels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * channels * 2, true);
            view.setUint16(32, channels * 2, true);
            view.setUint16(34, 16, true);
            writeString(view, 36, "data");
            view.setUint32(40, numSamples * 2, true);
            // PCM samples
            const channelData = rendered.getChannelData(0);
            for (let i = 0; i < numSamples; i++) {
              const sample = Math.max(-1, Math.min(1, channelData[i]));
              view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
            }
            const blob = new Blob([wavBuffer], { type: "audio/wav" });
            const compressedFile = new File([blob], file.name.replace(/\.\w+$/, "_sync.wav"), {
              type: "audio/wav",
              lastModified: Date.now(),
            });
            const pctSaved = Math.round((1 - blob.size / file.size) * 100);
            setStatusMessage(`${label}: ${formatMediaBytes(file.size)} → ${formatMediaBytes(blob.size)} sync copy (${pctSaved}% smaller).`);
            resolve({ file: compressedFile, originalSize: file.size, compressedSize: blob.size, trimStart, trimDuration: duration });
          }).catch(() => {
            audioCtx.close().catch(() => {});
            resolve(null);
          });
        } catch (_) {
          audioCtx.close().catch(() => {});
          resolve(null);
        }
      }, () => {
        audioCtx.close().catch(() => {});
        resolve(null);
      });
    });
  };

  const extractVideoAudioForSync = async (file, label, options = {}) => {
    const isVideo = String(file?.type || "").startsWith("video/") || /\.(mov|mp4|avi|mkv|webm|m4v|3gp)$/i.test(file.name || "");
    if (!isVideo || typeof MediaRecorder === "undefined") return null;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return null;

    return new Promise(resolve => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.playsInline = true;
      video.muted = false;
      video.volume = 1;
      const objectUrl = URL.createObjectURL(file);
      if (!applySafeMediaSource(video, objectUrl)) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }

      let resolved = false;
      let audioCtx = null;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        URL.revokeObjectURL(objectUrl);
        if (audioCtx) audioCtx.close().catch(() => {});
      };
      const fail = () => {
        cleanup();
        resolve(null);
      };

      video.onloadedmetadata = async () => {
        try {
          const rawDuration = Math.max(0.2, Number(video.duration) || 0);
          const trimStart = clampNumber(Number(options.trimStart) || 0, 0, Math.max(0, rawDuration - 0.2), 0);
          const requestedDuration = Number(options.trimDuration) || rawDuration;
          const duration = clampNumber(
            Math.min(requestedDuration, VIDEO_SYNC_MAX_EXTRACT_SECONDS),
            0.2,
            Math.max(0.2, rawDuration - trimStart),
            Math.min(rawDuration, VIDEO_SYNC_MAX_EXTRACT_SECONDS)
          );
          const trimEnd = Math.min(rawDuration, trimStart + duration);
          audioCtx = new AudioContextClass();
          await audioCtx.resume?.();
          const sourceNode = audioCtx.createMediaElementSource(video);
          const streamDestination = audioCtx.createMediaStreamDestination();
          const silentOutput = audioCtx.createGain();
          silentOutput.gain.value = 0;
          sourceNode.connect(streamDestination);
          sourceNode.connect(silentOutput);
          silentOutput.connect(audioCtx.destination);

          const recorder = new MediaRecorder(streamDestination.stream, {
            mimeType,
            audioBitsPerSecond: VIDEO_SYNC_AUDIO_BPS,
          });
          const chunks = [];
          recorder.ondataavailable = event => {
            if (event.data.size > 0) chunks.push(event.data);
          };
          recorder.onerror = () => fail();
          recorder.onstop = async () => {
            if (resolved) return;
            const extension = mimeType.includes("mp4") ? "m4a" : "webm";
            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size < 1024) {
              fail();
              return;
            }
            try {
              const decoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
              const channel = decoded.getChannelData(0);
              let sumSquares = 0;
              let maxAbs = 0;
              const stride = Math.max(1, Math.floor(channel.length / 120000));
              let samplesChecked = 0;
              for (let i = 0; i < channel.length; i += stride) {
                const value = Math.abs(channel[i] || 0);
                sumSquares += value * value;
                maxAbs = Math.max(maxAbs, value);
                samplesChecked += 1;
              }
              const rms = Math.sqrt(sumSquares / Math.max(1, samplesChecked));
              if (maxAbs < 0.002 || rms < 0.0002) {
                console.warn("Browser camera sync extraction produced silent audio", {
                  label,
                  rms,
                  maxAbs,
                  blobSize: blob.size,
                });
                fail();
                return;
              }
            } catch (decodeError) {
              console.warn("Could not verify browser camera sync audio before upload:", decodeError.message);
            }
            const audioFile = new File(
              [blob],
              (file.name || `${label || "camera"}.mov`).replace(/\.[^.]+$/, `_sync.${extension}`),
              { type: mimeType, lastModified: Date.now() }
            );
            cleanup();
            resolve({
              file: audioFile,
              originalSize: file.size,
              compressedSize: blob.size,
              duration,
              trimStart,
              trimDuration: duration,
            });
          };

          let lastPct = 0;
          const estimatedBytes = Math.round((VIDEO_SYNC_AUDIO_BPS / 8) * duration * 1.1);
          let captureStarted = false;
          video.ontimeupdate = () => {
            const pct = Math.min(1, Math.max(0, (video.currentTime - trimStart) / duration));
            if (pct - lastPct > 0.02) {
              lastPct = pct;
              setStatusMessage(
                `Extracting camera sync audio for ${label} (${Math.round(pct * 100)}%) — upload target ~${formatMediaBytes(estimatedBytes)}...`
              );
            }
            if (captureStarted && video.currentTime >= trimEnd - 0.05 && recorder.state !== "inactive") {
              recorder.stop();
            }
          };
          video.onended = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };

          const startCapture = () => {
            if (captureStarted || resolved) return;
            captureStarted = true;
            recorder.start(1000);
            video.play().catch(() => {
              if (recorder.state !== "inactive") recorder.stop();
              fail();
            });
          };
          if (trimStart > 0.05) {
            video.onseeked = () => startCapture();
            video.currentTime = trimStart;
          } else {
            startCapture();
          }
        } catch (error) {
          console.warn("Browser video audio extraction failed:", error);
          fail();
        }
      };

      video.onerror = () => fail();
      setTimeout(() => {
        if (!resolved && !Number.isFinite(Number(video.duration))) fail();
      }, 25000);
    });
  };

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /**
   * Compress a video file client-side before upload using MediaRecorder.
   * Returns { file: Blob (renamed), originalSize, compressedSize } or null if unsupported.
   */
  const compressVideoFile = async (file, label, onProgress, options = {}) => {
    const isVideo = String(file?.type || "").startsWith("video/") || /\.(mov|mp4|avi|mkv|webm|m4v|3gp)$/i.test(file.name || "");
    if (!isVideo) return null;

    // Check MediaRecorder support
    if (typeof MediaRecorder === "undefined") return null;

    const mimeTypes = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let mimeType = "";
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
    }
    if (!mimeType) return null;

    return new Promise(resolve => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = false;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(file);
      if (!applySafeMediaSource(video, objectUrl)) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }

      let resolved = false;
      const cleanup = () => {
        if (!resolved) { resolved = true; URL.revokeObjectURL(objectUrl); }
      };
      const fail = () => { cleanup(); resolve(null); };

      const startRecording = () => {
        try {
          const rawDuration = Number(video.duration) || 1;
          const trimStart = clampNumber(Number(options.trimStart) || 0, 0, Math.max(0, rawDuration - 0.2), 0);
          const trimDuration = Number(options.trimDuration) || rawDuration;
          const trimEnd = clampNumber(trimStart + trimDuration, trimStart + 0.2, rawDuration, rawDuration);
          const recordingDuration = Math.max(0.2, trimEnd - trimStart);
          const stream = video.captureStream();
          if (!stream) { fail(); return; }

          const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: UPLOAD_COMPRESSION_TARGET_BPS,
            audioBitsPerSecond: UPLOAD_COMPRESSION_AUDIO_BPS,
          });

          const chunks = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webm"), {
              type: mimeType,
              lastModified: Date.now(),
            });
            cleanup();
            onProgress(1);
            resolve({
              file: compressedFile,
              originalSize: file.size,
              compressedSize: blob.size,
              trimStart,
              trimDuration: recordingDuration,
            });
          };

          recorder.onerror = () => { fail(); };

          recorder.start(1000);
          let lastPct = 0;
          // Accurate estimate: target bitrate × duration (plus audio overhead)
          const estimatedBytes = Math.round(
            ((UPLOAD_COMPRESSION_TARGET_BPS + UPLOAD_COMPRESSION_AUDIO_BPS) / 8) * recordingDuration * 1.05
          );
          video.ontimeupdate = () => {
            if (video.currentTime >= trimEnd - 0.05) {
              video.pause();
              if (recorder.state !== "inactive") recorder.stop();
              return;
            }
            const pct = Math.min(1, Math.max(0, (video.currentTime - trimStart) / recordingDuration));
            if (pct - lastPct > 0.02) {
              lastPct = pct;
              onProgress(pct);
              setStatusMessage(
                `${options.trimDuration ? "Preparing fast upload proxy" : "Compressing"} ${label} (${Math.round(pct * 100)}%) — target ~${formatMediaBytes(estimatedBytes)} at 8 Mbps...`
              );
            }
          };

          video.onended = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };
          video.play().catch(() => fail());
        } catch (_) { fail(); }
      };

      video.onloadedmetadata = () => {
        const rawDuration = Number(video.duration) || 0;
        const trimStart = clampNumber(Number(options.trimStart) || 0, 0, Math.max(0, rawDuration - 0.2), 0);
        if (trimStart > 0.05) {
          video.onseeked = () => startRecording();
          video.currentTime = trimStart;
        } else {
          startRecording();
        }
      };

      video.onerror = () => fail();
      // Timeout: if metadata doesn't load, codec is likely unsupported (ProRes, etc.)
      // Firefox may need extra time for large local files
      setTimeout(() => { if (!resolved) fail(); }, 25000);
    });
  };

  /**
   * Upload a file to the local Python worker.
   * For sync, the worker extracts a tiny WAV and returns as soon as that is ready.
   * For export/proxy, it can still transcode to H.264 in the background.
   */
  const LOCAL_WORKER_URL = "http://127.0.0.1:8000";

  const uploadSourceForLocalRender = async (file, label) => {
    if (!file) throw new Error(`${label || "Camera"} is missing its local file.`);

    const formData = new FormData();
    formData.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    return await new Promise((resolve, reject) => {
      xhr.upload.addEventListener("progress", evt => {
        if (!evt.lengthComputable) return;
        const pct = evt.loaded / evt.total;
        const elapsed = Math.max(1, (Date.now() - startTime) / 1000);
        const speedBps = evt.loaded / elapsed;
        const speedStr = speedBps > 1024 * 1024
          ? `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`
          : `${Math.round(speedBps / 1024)} KB/s`;
        if (pct >= 0.999) {
          setStatusMessage(`Finalizing ${label} on local renderer...`);
          return;
        }
        setStatusMessage(
          `Sending ${label} to local renderer — ${formatMediaBytes(evt.loaded)} / ${formatMediaBytes(evt.total)} (${Math.round(pct * 100)}%, ${speedStr})...`
        );
      });

      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.localPath) {
            resolve(data);
          } else {
            reject(new Error(data.detail || `Local renderer returned ${xhr.status}`));
          }
        } catch (error) {
          reject(new Error(`Invalid local renderer response: ${xhr.responseText?.slice(0, 200)}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Cannot reach local worker at :8000 for server render.")));
      xhr.addEventListener("abort", () => reject(new Error("Local render upload aborted.")));
      xhr.open("POST", `${LOCAL_WORKER_URL}/api/media/upload-source`);
      xhr.send(formData);
    });
  };

  const uploadViaLocalWorker = async (file, label, uid, mode = "auto") => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("uid", uid);
    formData.append("label", label);
    formData.append("mode", mode);

    // Step 1: send file (fast — just saves to disk)
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    const postResult = await new Promise((resolve, reject) => {
      xhr.upload.addEventListener("progress", evt => {
        if (evt.lengthComputable) {
          const pct = evt.loaded / evt.total;
          const elapsed = Math.max(1, (Date.now() - startTime) / 1000);
          const speedBps = evt.loaded / elapsed;
          const speedStr = speedBps > 1024 * 1024
            ? `${(speedBps / (1024 * 1024)).toFixed(0)} MB/s`
            : `${Math.round(speedBps / 1024)} KB/s`;
          if (pct >= 0.999) {
            setStatusMessage(`Finalizing ${label} on local worker disk...`);
            return;
          }
          setStatusMessage(
            `Sending ${label} to local worker (${Math.round(pct * 100)}%, ${speedStr})...`
          );
        }
      });

      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            resolve(data);
          } else {
            reject(new Error(data.detail || `Worker returned ${xhr.status}`));
          }
        } catch (e) {
          reject(new Error(`Invalid worker response: ${xhr.responseText?.slice(0, 200)}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Cannot reach local worker at :8000. Is it running?")));
      xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

      xhr.open("POST", `${LOCAL_WORKER_URL}/api/media/ingest-local`);
      xhr.send(formData);
    });

    // Step 2: if already done (cache hit), return immediately
    if (postResult.status === "done" && (postResult.url || postResult.syncAudioUrl || postResult.videoUrl)) {
      return {
        ...postResult,
        syncAudioUrl: postResult.syncAudioUrl || "",
        videoUrl: postResult.videoUrl || postResult.url || "",
      };
    }

    // Step 3: poll until sync audio or the full proxy is ready
    if (postResult.status === "processing" && postResult.job_id) {
      const jobId = postResult.job_id;
      const originalSize = postResult.original_size || file.size;
      const waitingForSyncAudio = mode === "audio_only";
      setStatusMessage(
        waitingForSyncAudio
          ? `Worker is extracting sync audio for ${label} (${formatMediaBytes(originalSize)}) — no full video transcode needed.`
          : `Worker is preparing ${label} (${formatMediaBytes(originalSize)})...`
      );

      for (let attempt = 0; attempt < 800; attempt++) {
        await new Promise(r => setTimeout(r, 3000)); // poll every 3s
        try {
          const pollRes = await fetch(`${LOCAL_WORKER_URL}/api/media/ingest-local/${jobId}`);
          const pollData = await pollRes.json();
          if (!pollData.success) continue;

          if (pollData.status === "done" && (pollData.url || pollData.syncAudioUrl || pollData.videoUrl)) {
            setStatusMessage(`${label} processed by worker (${pollData.size_saved_pct}% smaller).`);
            return {
              ...pollData,
              syncAudioUrl: pollData.syncAudioUrl || "",
              videoUrl: pollData.videoUrl || pollData.url || "",
            };
          }
          // Return sync audio early — don't wait for full video transcode
          if (pollData.syncAudioUrl) {
            setStatusMessage(
              waitingForSyncAudio
                ? `${label}: sync audio ready. Continuing to the next source...`
                : `${label}: sync audio ready, video still processing...`
            );
            return {
              ...pollData,
              status: "sync_audio_ready",
              earlySyncAudio: true,
              syncAudioUrl: pollData.syncAudioUrl,
              videoUrl: pollData.videoUrl || "",
            };
          }
          if (pollData.status === "failed") {
            throw new Error(pollData.error || "Worker ingest failed");
          }
          // Still processing — update status
          if (pollData.status === "extracting_audio" || pollData.status === "sync_audio_ready") {
            setStatusMessage(`Worker extracting sync audio for ${label}...`);
          } else if (pollData.status === "transcoding") {
            setStatusMessage(`Worker transcoding ${label} — please wait...`);
          } else if (pollData.status === "uploading") {
            setStatusMessage(`Worker uploading ${label} to Firebase...`);
          }
        } catch (e) {
          if (attempt > 10) throw e; // Give up after ~30s of failed polls
        }
      }
      throw new Error(
        waitingForSyncAudio
          ? "Timed out waiting for worker sync audio"
          : "Timed out waiting for worker to finish transcode"
      );
    }

    throw new Error("Unexpected worker response");
  };

  const isBackendReadableMediaUrl = url => {
    const value = String(url || "").trim();
    return (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("/") ||
      value.startsWith("file://")
    );
  };

  const uploadMediaForBackendSync = async ({
    user,
    storage,
    file,
    fallbackUrl,
    folder,
    label,
    mode = "auto",
    trimWindow = null,
  }) => {
    const hasTrimWindow =
      Number(trimWindow?.duration || 0) > 0.05 || Number(trimWindow?.start || 0) > 0.05;
    const reusableFallbackUrl = !hasTrimWindow && isBackendReadableMediaUrl(fallbackUrl) ? fallbackUrl : "";
    if (reusableFallbackUrl) {
      const syncOnly = mode === "audio_only";
      setStatusMessage(
        syncOnly
          ? `${label || "Media"}: using existing worker sync audio. No full camera upload needed.`
          : `${label || "Media"}: using existing uploaded media.`
      );
      return {
        url: reusableFallbackUrl,
        videoUrl: syncOnly ? "" : reusableFallbackUrl,
        syncAudioUrl: syncOnly ? reusableFallbackUrl : "",
      };
    }
    if (!file) throw new Error(`${label || "Media"} is not available for background sync.`);

    // --- FAST PATH: try local worker first ---
    const isAudioOnly = file.type.startsWith("audio/") || /\.(wav|mp3|aac|ogg|flac|m4a|wma)$/i.test(file.name || "");
    const localMediaWorkerEnabled = canUseLocalMediaWorker();
    if (localMediaWorkerEnabled && mode === "audio_only" && !isAudioOnly && file.size > 200 * 1024 * 1024 && user?.uid) {
      try {
        setStatusMessage(
          `Staging ${label} locally for sync (${formatMediaBytes(file.size)}). This avoids Firebase upload.`
        );
        const localResult = await uploadSourceForLocalRender(file, label);
        if (localResult?.localPath) {
          return {
            url: localResult.localPath,
            videoUrl: localResult.localPath,
            syncAudioUrl: "",
          };
        }
      } catch (localStageError) {
        console.warn("Local sync staging failed, falling back to worker ingest:", localStageError.message);
        setStatusMessage(`Local sync staging failed. Trying worker ingest for ${label}...`);
      }
    }

    const useLocalWorker =
      localMediaWorkerEnabled &&
      (file.size > 200 * 1024 * 1024 || (isAudioOnly && file.size > 20 * 1024 * 1024));
    if (useLocalWorker && user?.uid) {
      try {
        setStatusMessage(`Sending ${label} to local worker for ingest (${formatMediaBytes(file.size)})...`);
        const workerResult = await uploadViaLocalWorker(file, label, user.uid, mode);
        const syncAudioUrl = workerResult?.syncAudioUrl || "";
        const videoUrl = workerResult?.videoUrl || "";
        const effectiveUrl = mode === "audio_only" ? (syncAudioUrl || videoUrl) : videoUrl;
        if (effectiveUrl) {
          const summary = workerResult.size_saved_pct > 10
            ? `${label} ingested — ${mode === "audio_only" && syncAudioUrl ? "sync audio ready" : "video ready"}`
            : `${label} ingested by worker.`;
          toast.success(summary, { duration: 5000 });
          setStatusMessage(
            mode === "audio_only" && syncAudioUrl
              ? `${label}: sync audio ready. No full camera transcode needed for sync.`
              : summary
          );
          return {
            url: effectiveUrl,
            videoUrl,
            syncAudioUrl,
          };
        }
      } catch (workerError) {
        console.warn("Local worker ingest failed, falling back to direct upload:", workerError.message);
        setStatusMessage(
          `Local worker unavailable (${workerError.message}). Uploading ${label} directly to Firebase...`
        );
      }
    }

    // --- FALLBACK: direct browser upload to Firebase ---
    // Compress large audio files for sync (WAV → 16kHz mono WAV, ~90% smaller)
    let uploadFile = file;
    if (mode === "audio_only" && !isAudioOnly) {
      const syncCacheKey = buildSyncAudioCacheKey(file, trimWindow);
      const cachedSyncAudioFile = await readCachedSyncAudioFile(syncCacheKey);
      if (cachedSyncAudioFile) {
        const cachedStats = await getAudioFileSignalStats(cachedSyncAudioFile);
        if (hasUsableAudioSignal(cachedStats)) {
          setStatusMessage(
            `Reusing cached camera sync audio for ${label}. No repeat extraction needed.`
          );
          uploadFile = cachedSyncAudioFile;
        } else {
          await deleteCachedSyncAudioFile(syncCacheKey);
          console.warn("Discarded silent cached camera sync audio", {
            label,
            rms: cachedStats?.rms,
            maxAbs: cachedStats?.maxAbs,
          });
          setStatusMessage(`Discarded bad cached sync audio for ${label}. Re-extracting...`);
        }
      }
      if (uploadFile === file) {
        setStatusMessage(
          `Creating audio-only sync upload for ${label}. This avoids uploading the full ${formatMediaBytes(file.size)} camera file.`
        );
        const videoAudio = await extractVideoAudioForSync(file, label, {
          trimStart: trimWindow?.start || 0,
          trimDuration: trimWindow?.duration || 0,
        });
        if (!videoAudio?.file) {
          throw new Error(
            `${label} camera audio could not be extracted in the browser. Please try Chrome/Edge or use a shorter camera file.`
          );
        }
        await writeCachedSyncAudioFile(syncCacheKey, videoAudio.file);
        const pctSaved = Math.round((1 - videoAudio.compressedSize / videoAudio.originalSize) * 100);
        toast.success(
          `${label} sync audio: ${formatMediaBytes(videoAudio.originalSize)} → ${formatMediaBytes(videoAudio.compressedSize)} (${pctSaved}% smaller)`,
          { duration: 6000 }
        );
        uploadFile = videoAudio.file;
      }
    } else if (isAudioOnly && file.size > AUDIO_SYNC_COMPRESSION_THRESHOLD) {
      const audioCompressed = await compressAudioForSync(file, label, {
        trimStart: trimWindow?.start || 0,
        trimDuration: trimWindow?.duration || 0,
      });
      if (audioCompressed) {
        toast.success(
          `${label} sync copy: ${formatMediaBytes(audioCompressed.originalSize)} → ${formatMediaBytes(audioCompressed.compressedSize)}`,
          { duration: 5000 }
        );
        uploadFile = audioCompressed.file;
      }
    }

    // Compress large video files before upload (turns 8GB raw → ~600MB web-friendly)
    const shouldCreateVideoProxy =
      mode !== "audio_only" &&
      !isAudioOnly &&
      (file.size > UPLOAD_COMPRESSION_THRESHOLD_BYTES || Number(trimWindow?.duration || 0) > 0);
    if (shouldCreateVideoProxy) {
      setStatusMessage(
        trimWindow
          ? `Creating fast upload proxy for ${label} (${formatDurationLabel(trimWindow.duration)})...`
          : `Checking if ${label} can be compressed to save upload time...`
      );
      const compressed = await compressVideoFile(file, label, () => {}, {
        trimStart: trimWindow?.start || 0,
        trimDuration: trimWindow?.duration || 0,
      });
      if (compressed) {
        const pctSaved = Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100);
        const summary = trimWindow
          ? `${label} fast proxy: ${formatDurationLabel(compressed.trimDuration)} · ${formatMediaBytes(compressed.compressedSize)} (${pctSaved}% smaller than original)`
          : `${label} compressed: ${formatMediaBytes(compressed.originalSize)} → ${formatMediaBytes(compressed.compressedSize)} (${pctSaved}% smaller)`;
        toast.success(summary, { duration: 6000 });
        setStatusMessage(`${summary}. Uploading now...`);
        uploadFile = compressed.file;
      } else {
        setStatusMessage(
          `Cannot compress ${label} in browser (unsupported codec like ProRes). Uploading original ${formatMediaBytes(file.size)}...`
        );
      }
    }

    const safeName = (uploadFile.name || `${label || "media"}.bin`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const mediaRef = ref(storage, `${folder}/${user.uid}/${Date.now()}_${safeName}`);
    const startTime = Date.now();
    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(mediaRef, uploadFile, {
        contentType: uploadFile.type || "application/octet-stream",
      });
      task.on(
        "state_changed",
        snapshot => {
          const transferred = snapshot.bytesTransferred || 0;
          const total = snapshot.totalBytes || uploadFile.size || 0;
          const pct = total ? (transferred / total) * 100 : 0;
          const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
          const speedBps = transferred / elapsedSec;
          const speedStr = speedBps > 1024 * 1024
            ? `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`
            : `${Math.round(speedBps / 1024)} KB/s`;
          const remainingSec = speedBps > 0 ? (total - transferred) / speedBps : 0;
          const eta = remainingSec > 120
            ? `~${Math.round(remainingSec / 60)} min left`
            : remainingSec > 30
              ? `~${Math.round(remainingSec)} sec left`
              : "";
          setStatusMessage(
            `Uploading ${label || file.name || "media"} for background sync — ${formatMediaBytes(transferred)} / ${formatMediaBytes(total)} (${pct.toFixed(1)}%, ${speedStr}${eta ? `, ${eta}` : ""})...`
          );
        },
        reject,
        resolve
      );
    });
    const directUrl = await getDownloadURL(mediaRef);
    return {
      url: directUrl,
      videoUrl: mode === "audio_only" ? "" : directUrl,
      syncAudioUrl: mode === "audio_only" ? directUrl : "",
      trimStart: Number(trimWindow?.start || 0) || 0,
      trimDuration: Number(trimWindow?.duration || 0) || 0,
    };
  };

  const buildBackendMediaCacheKey = file =>
    file
      ? `${file.name || "media"}:${file.size || 0}:${file.lastModified || 0}`
      : "";

  const buildSyncAudioCacheKey = (file, trimWindow = null) => {
    if (!file) return "";
    const trimStart = Math.max(0, Number(trimWindow?.start || 0) || 0);
    const trimDuration = Math.max(0, Number(trimWindow?.duration || 0) || 0);
    const trimSuffix = trimDuration > 0.05
      ? `:trim:${trimStart.toFixed(3)}:${trimDuration.toFixed(3)}`
      : "";
    return `sync-audio:${buildBackendMediaCacheKey(file)}${trimSuffix}`;
  };

  const handleStartBackendCleanAudioSync = async ({ confirmBeforeStart = true, reason = "" } = {}) => {
    if (!externalAudioTrack) {
      toast.error("Upload external clean audio first.");
      return;
    }
    const candidates = readySources.filter(isVideoSource);
    if (!candidates.length) {
      toast.error("Load at least one video source with camera audio.");
      return;
    }

    if (confirmBeforeStart) {
      const confirmed = window.confirm(
        [
          reason || "This project is large, so AutoPromote will process syncing in the background for better stability.",
          "",
          `Camera files: ${candidates.length}`,
          `Timeline: ${formatDurationLabel(timelineDuration || Math.max(...candidates.map(source => Number(source.duration || 0))))}`,
          `Clean-audio sync cost: ${cleanAudioSyncCreditEstimate} credits`,
          `Available credits: ${Number(credits?.remaining ?? 0).toFixed(0)}`,
          "",
          "This is only the sync check. Server MP4 render is charged separately when you export.",
          "",
          "Approve paid External Clean Audio Sync?",
        ].join("\n")
      );
      if (!confirmed) return;
    }

    setSyncingCameraId("external-clean-audio");
    setCleanAudioSyncJob({
      status: "uploading",
      progress: 0,
      detail: "Uploading media",
    });
    setStatusMessage(
      "Uploading media for background clean-audio sync. You can leave waveform matching to the worker now."
    );

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in before starting background sync.");
      setStatusMessage("Checking Cam Combiner worker before extracting camera audio...");
      const readinessToken = await user.getIdToken(true);
      const readinessResponse = await fetch(`${API_BASE_URL}/api/media/multicam/worker-readiness`, {
        headers: {
          Authorization: `Bearer ${readinessToken}`,
        },
      });
      const readinessData = await readinessResponse.json().catch(() => ({}));
      if (!readinessResponse.ok || !readinessData.success) {
        throw new Error(
          readinessData.message ||
            readinessData.details ||
            `Cam Combiner worker readiness check failed with ${readinessResponse.status}`
        );
      }
      const storage = getStorage();

      const sourcesPayload = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const source = candidates[index];
        const previousSyncUnsafe =
          source.backendSyncStatus === "needs_review" ||
          source.backendSyncMethod === "silent_audio" ||
          /silent|re-extract|no correlation/i.test(String(source.backendSyncWarning || ""));
        const sourceSyncTrimStart = Math.max(
          0,
          cloudRenderWindowStartSafe - (Number(source.offsetSeconds) || 0)
        );
        const sourceSyncTrimDuration = Math.min(
          VIDEO_SYNC_MAX_EXTRACT_SECONDS,
          cloudRenderWindowDuration || Number(source.duration || 0) || VIDEO_SYNC_MAX_EXTRACT_SECONDS
        );
        // eslint-disable-next-line no-await-in-loop
        const uploadResult = await uploadMediaForBackendSync({
          user,
          storage,
          file: source.file,
          fallbackUrl: previousSyncUnsafe ? "" : source.uploadedSyncUrl || source.syncAudioUrl || "",
          folder: "temp/multicam-clean-sync",
          label: `${source.label || `Camera ${index + 1}`} (${index + 1}/${candidates.length})`,
          mode: "audio_only",
          trimWindow: {
            start: sourceSyncTrimStart,
            duration: sourceSyncTrimDuration,
          },
        });
        const reusableSyncUrl = uploadResult.syncAudioUrl || uploadResult.url;
        sourcesPayload.push({
          id: source.id,
          label: source.label || `Camera ${index + 1}`,
          name: source.name || source.file?.name || source.label,
          url: reusableSyncUrl,
          syncAudioUrl: uploadResult.syncAudioUrl || "",
          videoUrl: uploadResult.videoUrl || "",
          size: getSourceFileSize(source),
          duration: Number(source.duration || 0),
          offset_seconds: Number(source.offsetSeconds) || 0,
          sync_trim_start: Number(sourceSyncTrimStart || 0) || 0,
          sync_trim_duration: Number(sourceSyncTrimDuration || 0) || 0,
          cache_key: buildBackendMediaCacheKey(source.file) || `${source.id}:${source.name || source.label}`,
        });
      }

      const externalSyncTrimStart = Math.max(
        0,
        cloudRenderWindowStartSafe - (Number(externalAudioTrack.offsetSeconds) || 0)
      );
      const externalSyncTrimDuration = Math.min(
        VIDEO_SYNC_MAX_EXTRACT_SECONDS,
        cloudRenderWindowDuration || Number(externalAudioTrack.duration || 0) || VIDEO_SYNC_MAX_EXTRACT_SECONDS
      );
      const externalAudioUpload = await uploadMediaForBackendSync({
        user,
        storage,
        file: externalAudioTrack.file,
        fallbackUrl: externalAudioTrack.url,
        folder: "temp/multicam-clean-sync-audio",
        label: "External clean audio",
        mode: "audio_only",
        trimWindow: {
          start: externalSyncTrimStart,
          duration: externalSyncTrimDuration,
        },
      });
      const externalAudioRemoteUrl = externalAudioUpload.url;

      setSources(currentSources =>
        currentSources.map(source => {
          const uploaded = sourcesPayload.find(item => item.id === source.id);
          return uploaded
            ? {
                ...source,
                uploadedSyncUrl: uploaded.syncAudioUrl || uploaded.url,
                localRenderPath:
                  uploaded.videoUrl && String(uploaded.videoUrl).startsWith("/")
                    ? uploaded.videoUrl
                    : source.localRenderPath,
              }
            : source;
        })
      );
      setExternalAudioTrack(current =>
        current
          ? {
              ...current,
              url: externalAudioRemoteUrl,
              cacheKey: buildBackendMediaCacheKey(current.file),
            }
          : current
      );

      setStatusMessage("Media uploaded. Asking the worker to extract audio and calculate offsets...");
      const freshToken = await user.getIdToken(true);
      const response = await fetch(`${API_BASE_URL}/api/media/multicam/clean-audio-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({
          sources: sourcesPayload,
          externalAudio: {
            url: externalAudioRemoteUrl,
            name: externalAudioTrack.name || externalAudioTrack.file?.name || "External clean audio",
            size: Number(externalAudioTrack.file?.size || 0),
            duration: Number(externalAudioTrack.duration || 0),
            offset_seconds: Number(externalAudioTrack.offsetSeconds || 0),
            sync_trim_start: Number(externalSyncTrimStart || 0) || 0,
            sync_trim_duration: Number(externalSyncTrimDuration || 0) || 0,
            cache_key: buildBackendMediaCacheKey(externalAudioTrack.file) || externalAudioTrack.name,
          },
          mixMode: externalAudioMixMode,
          mix_mode: externalAudioMixMode,
          outputAspectRatio,
          output_aspect_ratio: outputAspectRatio,
          estimatedCredits: cleanAudioSyncCreditEstimate,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || `Background sync failed with ${response.status}`);
      }

      setUseExternalCleanAudio(true);
      setCleanAudioSyncJob({
        jobId: data.jobId,
        status: "queued",
        progress: 1,
        detail: data.message || "Background sync queued",
      });
      setStatusMessage(`Background clean-audio sync started. Job ${data.jobId}`);
    } catch (error) {
      console.error(error);
      setCleanAudioSyncJob({
        status: "failed",
        progress: 0,
        detail: error.message || "Background clean-audio sync failed",
      });
      setStatusMessage(error.message || "Background clean-audio sync failed.");
      toast.error(error.message || "Background clean-audio sync failed.");
    } finally {
      setSyncingCameraId(null);
    }
  };

  const handleSyncCameraToExternalAudio = async cameraId => {
    const source = sources.find(item => item.id === cameraId);
    if (!source || !getSourceMediaUrl(source)) return false;
    if (!isVideoSource(source)) {
      toast.error("Only video sources can waveform-sync to clean audio.");
      return false;
    }
    if (!externalAudioUrl) {
      toast.error("Upload external clean audio first.");
      return false;
    }
    if (getBrowserSyncBlockReason([source], externalAudioTrack)) {
      setStatusMessage(
        "This camera/clean-audio pair is too large for browser waveform matching. Use Check Sync Now so AutoPromote can calculate safe offsets without freezing the browser."
      );
      return false;
    }

    setSyncingCameraId(cameraId);
    setStatusMessage(`Matching ${source.label} to the clean audio waveform...`);

    try {
      const [cleanAnalysis, sourceAnalysis] = await Promise.all([
        getOrCreateExternalAudioAnalysis(),
        getOrCreateAudioAnalysis(source),
      ]);
      const estimatedDelta = estimateAudioOffsetSeconds(
        cleanAnalysis,
        sourceAnalysis,
        Math.min(240, Math.max(cleanAnalysis.duration || 0, sourceAnalysis.duration || 0, 30))
      );
      const nextOffset = Number(
        ((Number(externalAudioTrack?.offsetSeconds) || 0) + estimatedDelta).toFixed(3)
      );
      setSources(currentSources =>
        currentSources.map(currentSource =>
          currentSource.id === cameraId
            ? { ...currentSource, offsetSeconds: nextOffset, manualOffsetLocked: true }
            : currentSource
        )
      );
      setStatusMessage(
        `${source.label} locked to clean audio at ${estimatedDelta >= 0 ? "+" : ""}${estimatedDelta.toFixed(2)}s.`
      );
      return true;
    } catch (error) {
      setStatusMessage(
        "We could not sync automatically. Please adjust the audio alignment manually."
      );
      return false;
    } finally {
      setSyncingCameraId(null);
    }
  };

  const handleSyncAllCamerasToExternalAudio = async () => {
    if (!externalAudioUrl) {
      toast.error("Upload external clean audio first.");
      return;
    }
    const candidates = readySources.filter(isVideoSource);
    if (!candidates.length) {
      toast.error("Load at least one video source with camera audio.");
      return;
    }
    if (shouldUseBackendCleanAudioSync) {
      await handleStartBackendCleanAudioSync();
      return;
    }

    let syncedCount = 0;
    for (const source of candidates) {
      // Sequential keeps the browser responsive and avoids decoding every file at once.
      // eslint-disable-next-line no-await-in-loop
      const synced = await handleSyncCameraToExternalAudio(source.id);
      if (synced) syncedCount += 1;
    }

    if (syncedCount) {
      setUseExternalCleanAudio(true);
      setStatusMessage(
        `${syncedCount} camera${syncedCount === 1 ? "" : "s"} synced to clean audio. Preview the result and nudge if needed.`
      );
    } else {
      setStatusMessage(
        "We could not sync automatically. Please adjust the audio alignment manually."
      );
    }
  };

  const sourceHasPreviewSyncCorrection = source => {
    if (!isVideoSource(source)) return true;
    const offsetSeconds = Number(source.offsetSeconds || 0);
    const syncRate = getSourceSyncRate(source);
    const backendStatus = String(source.backendSyncStatus || "").toLowerCase();
    return Boolean(
      source.autoSyncApplied ||
        source.manualOffsetLocked ||
        ["synced", "ready", "ready_for_review", "completed"].includes(backendStatus) ||
        Number(source.backendSyncConfidence || 0) >= 0.45 ||
        Math.abs(offsetSeconds) > 0.001 ||
        Math.abs(syncRate - 1) > 0.000001
    );
  };

  const previewSyncState = useMemo(() => {
    const videoSources = readySources.filter(isVideoSource);
    if (!videoSources.length) {
      return {
        tone: "waiting",
        title: "Waiting for cameras",
        detail: "Load at least two camera angles before sync can be verified.",
      };
    }

    if (!hasExternalCleanAudio) {
      return {
        tone: "warning",
        title: "Visual preview only",
        detail: "No clean audio is loaded, so offsets are not proven against a master track.",
      };
    }

    if (cleanAudioSyncIsRunning) {
      return {
        tone: "processing",
        title: "Sync check running",
        detail: cleanAudioSyncJob?.detail || "Program Output will use corrected timing once the worker finishes.",
      };
    }

    if (cleanAudioSyncJob?.status === "failed") {
      return {
        tone: "danger",
        title: "Sync failed",
        detail: cleanAudioSyncJob?.detail || "Review offsets before trusting preview or export.",
      };
    }

    const unsyncedSources = videoSources.filter(source => !sourceHasPreviewSyncCorrection(source));
    if (unsyncedSources.length) {
      return {
        tone: "warning",
        title: "Sync not verified",
        detail: `${unsyncedSources.length} camera${unsyncedSources.length === 1 ? "" : "s"} still need clean-audio sync or manual offset lock.`,
      };
    }

    return {
      tone: "good",
      title: "Sync verified",
      detail: "Preview is using corrected offsets and export will still run preflight before rendering.",
    };
  }, [
    readySources,
    hasExternalCleanAudio,
    cleanAudioSyncIsRunning,
    cleanAudioSyncJob,
  ]);

  const ensureProgramOutputCleanAudioSync = async () => {
    if (!hasExternalCleanAudio) return true;

    const candidates = readySources.filter(isVideoSource);
    if (!candidates.length) return true;

    if (candidates.every(sourceHasPreviewSyncCorrection)) {
      return true;
    }

    if (cleanAudioSyncIsRunning) {
      setStatusMessage("Clean-audio sync is still running. Program Output will use the corrected timing once it finishes.");
      toast("Clean-audio sync is still running. Try Play again when it finishes.", {
        icon: "⏳",
        duration: 5000,
      });
      return false;
    }

    if (shouldUseBackendCleanAudioSync) {
      setStatusMessage("Program Output needs a safe clean-audio sync check before preview playback.");
      await handleStartBackendCleanAudioSync({
        confirmBeforeStart: true,
        reason:
          "Program Output should preview the same synced timing the final render will use. This project needs worker clean-audio sync before playback.",
      });
      return false;
    }

    const approvedBrowserSync = window.confirm(
      [
        "Program Output needs to sync the cameras to the clean audio before playback.",
        "",
        "Cost: 0 credits",
        "This runs in your browser because the files are small enough.",
        "",
        "Approve browser clean-audio sync now?",
      ].join("\n")
    );
    if (!approvedBrowserSync) {
      setStatusMessage("Preview sync cancelled. Program Output is still not verified.");
      return false;
    }

    setStatusMessage("Syncing cameras to clean audio before Program Output playback...");
    await handleSyncAllCamerasToExternalAudio();
    setStatusMessage("Clean-audio sync applied. Press Play again to preview with corrected offsets.");
    return false;
  };

  const handleAutoShapeSingleLens = async (auraOverrideId = flowAuraTemplateId) => {
    if (!isSingleSourceWorkflow || !singleCamSource) return;

    try {
      setStatusMessage("Auto Shape is reading the mood of your single-lens take...");
      const analysis = await getOrCreateAudioAnalysis(singleCamSource);
      const plan = buildSingleLensAutoPlan({
        source: singleCamSource,
        audioAnalysis: analysis,
        timelineDuration: Number(singleCamSource.duration) || timelineDuration,
        auraTemplateId: auraOverrideId,
      });
      if (!plan.segments.length) {
        toast.error("Auto Shape could not build a single-lens plan from this take.");
        return;
      }
      setSingleCamSegments(plan.segments);
      setSingleCamSegmentFraming(plan.framingMap);
      setSelectedSingleCamSegmentId(plan.segments[0]?.id || null);
      setPlayhead(0);
      setSingleLensAutoSummary(plan.summary);
      setStatusMessage(plan.summary);
    } catch (error) {
      toast.error(error.message || "Auto Shape failed for this single-lens take.");
      setStatusMessage(error.message || "Auto Shape failed.");
    }
  };

  const handleAutoSyncToMasterAudio = async cameraId => {
    const source = sources.find(item => item.id === cameraId);
    const masterSource = sources.find(item => item.id === masterAudioCameraId);
    if (!source || !masterSource) return;
    if (!isVideoSource(source) || !isVideoSource(masterSource)) {
      toast.error("Audio sync only works with video sources that contain sound.");
      return;
    }
    if (cameraId === masterAudioCameraId) {
      toast("This source is already the audio source.");
      return;
    }

    setSyncingCameraId(cameraId);
    setStatusMessage(`Analyzing ${source.label} against ${masterSource.label}...`);

    try {
      const [masterAnalysis, sourceAnalysis] = await Promise.all([
        getOrCreateAudioAnalysis(masterSource),
        getOrCreateAudioAnalysis(source),
      ]);
      const estimatedDelta = estimateAudioOffsetSeconds(
        masterAnalysis,
        sourceAnalysis,
        Math.min(180, Math.max(masterAnalysis.duration || 0, sourceAnalysis.duration || 0, 30))
      );
      const nextOffset = Number(
        ((Number(masterSource.offsetSeconds) || 0) + estimatedDelta).toFixed(3)
      );
      setSources(currentSources =>
        currentSources.map(currentSource =>
          currentSource.id === cameraId
            ? { ...currentSource, offsetSeconds: nextOffset, manualOffsetLocked: true }
            : currentSource
        )
      );
      setStatusMessage(
        `${source.label} auto-synced to ${masterSource.label} by audio at ${estimatedDelta >= 0 ? "+" : ""}${estimatedDelta.toFixed(2)}s.`
      );
    } catch (error) {
      toast.error(error.message || "Audio sync failed for this source.");
      setStatusMessage(`Unable to auto-sync ${source.label}. Try Start Here or fine nudges.`);
    } finally {
      setSyncingCameraId(null);
    }
  };

  const handleSyncSourceToFlowSound = async sourceId => {
    const source = sources.find(item => item.id === sourceId);
    if (!source || !getSourceMediaUrl(source)) {
      toast.error("Load a visual first.");
      return;
    }

    const hasFlowSoundtrack = Boolean(flowAudioUrl || masterAudioSource);
    if (!hasFlowSoundtrack) {
      toast.error("Upload a Flow soundtrack or choose master audio first.");
      return;
    }

    setSyncingCameraId(sourceId);
    setStatusMessage(`${source.label} is syncing to the Flow soundtrack...`);
    try {
      await handleGenerateFlowEdit();
      setStatusMessage(`${source.label} is now timed against the Flow soundtrack.`);
    } finally {
      setSyncingCameraId(null);
    }
  };

  const persistFlowPlan = nextPlan => {
    setFlowEditPlan(nextPlan);
    setFlowEditEnabled(Boolean(nextPlan?.segments?.length));
    setSelectedFlowSegmentId(nextPlan?.segments?.[0]?.id || null);
    setFlowSegmentFraming(nextPlan?.framingMap || {});
    if (nextPlan?.switches?.length) {
      setSwitches(nextPlan.switches);
      setSelectedSwitchId(nextPlan.switches[0]?.id || null);
    }
  };

  const handleUseMasterAudioForFlow = () => {
    if (!masterAudioSource || !isVideoSource(masterAudioSource)) {
      toast.error("Pick a master audio source first.");
      return;
    }
    setFlowAudioTrack({
      cameraId: masterAudioSource.id,
      name: `${masterAudioSource.label} audio`,
      mode: "camera",
    });
    setFlowEditInsight(`${masterAudioSource.label} will drive the rhythm analysis.`);
  };

  const handleLoadFlowAudioFile = file => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    setFlowAudioTrack({
      file,
      previewUrl,
      name: file.name,
      mode: "upload",
    });
    setFlowEditInsight(`${file.name} is loaded as the Flow Edit soundtrack.`);
  };

  const handleClearFlowAudio = () => {
    if (flowAudioTrack?.previewUrl && objectUrlsRef.current.has(flowAudioTrack.previewUrl)) {
      URL.revokeObjectURL(flowAudioTrack.previewUrl);
      objectUrlsRef.current.delete(flowAudioTrack.previewUrl);
    }
    setFlowAudioTrack(null);
    setFlowEditPlan(null);
    setFlowEditVariants([]);
    setFlowEditEnabled(false);
    setSelectedFlowSegmentId(null);
    setFlowSegmentFraming({});
    setFlowEditWarning("");
    setFlowEditStatusStep("");
    setFlowEditInsight("");
  };

  const updateFlowPlanSegments = updater => {
    setFlowEditPlan(currentPlan => {
      if (!currentPlan?.segments?.length) return currentPlan;
      const updatedSegments = updater(currentPlan.segments.map(segment => ({ ...segment })));
      if (!Array.isArray(updatedSegments) || !updatedSegments.length) return currentPlan;
      const normalizedSegments = updatedSegments.map((segment, index) => ({
        ...segment,
        id: segment.id || `flow-segment-${index + 1}`,
        startTime: Number(segment.startTime.toFixed(3)),
        endTime: Number(segment.endTime.toFixed(3)),
        duration: Number((segment.endTime - segment.startTime).toFixed(3)),
        sourceTimeByCameraId: (readySources.length ? readySources : sources).reduce(
          (accumulator, source) => {
            accumulator[source.id] = {
              sourceStart: getSourceTimelineTime(
                source,
                Number(segment.startTime.toFixed(3)),
                timelineBounds.timelineStart
              ),
              playbackRate: segment.playbackRate || 1,
            };
            return accumulator;
          },
          {}
        ),
      }));
      const nextPlan = {
        ...currentPlan,
        segments: normalizedSegments,
        framingMap:
          currentPlan.visualMode === "image_story"
            ? buildImageStoryFramingMap(
                normalizedSegments,
                currentPlan.audioType,
                currentPlan.imageStoryTemplateId || flowImageStoryTemplateId,
                currentPlan.auraTemplateId || flowAuraTemplateId
              )
            : buildVideoFlowFramingMap(
                normalizedSegments,
                currentPlan.audioType,
                flowEditStyleId,
                currentPlan.intensityMode || flowIntensityMode,
                currentPlan.auraTemplateId || flowAuraTemplateId
              ),
        switches: normalizeSwitches(
          normalizedSegments.map(segment => ({
            id: segment.id,
            cameraId: segment.cameraId,
            startTime: segment.startTime,
          })),
          readySources.length ? readySources : sources,
          currentPlan.duration || timelineDuration
        ),
      };
      setFlowSegmentFraming(nextPlan.framingMap || {});
      setSwitches(nextPlan.switches);
      return nextPlan;
    });
  };

  const handleGenerateFlowEdit = async (overrides = null) => {
    const resolvedOverrides =
      typeof overrides === "string" ? { styleId: overrides } : overrides || {};
    const activeStyleId = resolvedOverrides.styleId || flowEditStyleId;
    const activeImageStoryTemplateId =
      resolvedOverrides.imageStoryTemplateId || flowImageStoryTemplateId;
    const activeIntensityMode = resolvedOverrides.intensityMode || flowIntensityMode;
    const activeAuraTemplateId = resolvedOverrides.auraTemplateId || flowAuraTemplateId;
    const activeAuraPreset = getFlowAuraPreset(activeAuraTemplateId);
    const analysisUrl = flowAudioUrl || getSourceMediaUrl(masterAudioSource);
    const isImageStoryFlow = readySources.length >= 2 && readySources.every(isImageSource);
    const isSingleSourceFlow = readySources.length === 1 && isVideoSource(readySources[0]);
    if (!isSingleSourceFlow && (isSingleSourceWorkflow || readySources.length < 2)) {
      toast.error("Flow Edit needs at least two synced camera sources, or one long video for highlight pull.");
      return;
    }
    if (!analysisUrl) {
      toast.error("Load or choose audio first.");
      return;
    }

    setIsGeneratingFlowEdit(true);
    setFlowEditWarning("");
    setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[0]);
    setStatusMessage("Analyzing audio for Flow Edit...");

    try {
      const analysis = await analyzeAudioTrack(analysisUrl);
      const alignedTimelineDuration = Number(
        Math.max(baseTimelineDuration, Number(analysis.duration) || 0, DEFAULT_IMAGE_SEGMENT_DURATION).toFixed(3)
      );
      const flowPlanSources = isImageStoryFlow
        ? readySources.map(source => ({
            ...source,
            offsetSeconds: 0,
            duration: alignedTimelineDuration,
          }))
        : readySources;

      if (isImageStoryFlow) {
        setSources(currentSources =>
          currentSources.map(currentSource =>
            readySources.some(source => source.id === currentSource.id)
              ? {
                  ...currentSource,
                  offsetSeconds: 0,
                  duration: alignedTimelineDuration,
                }
              : currentSource
          )
        );
      }

      setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[1]);
      const variants = FLOW_EDIT_STYLE_PRESETS.map(style => ({
        ...style,
        plan: buildFlowEditPlan({
          sources: flowPlanSources,
          timelineDuration:
            isImageStoryFlow || isSingleSourceFlow
              ? alignedTimelineDuration
              : baseTimelineDuration,
          timelineStart: isImageStoryFlow ? 0 : timelineBounds.timelineStart,
          audioAnalysis: analysis,
          sourceActivityByCameraId: audioAnalysisByCameraId,
          styleId: style.id,
          frameQualityByCameraId: flowFrameQualityByCameraId,
          imageStoryTemplateId: activeImageStoryTemplateId,
          intensityMode: activeIntensityMode,
          auraTemplateId: activeAuraTemplateId,
        }),
      }));
      setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[2]);
      const preferred =
        variants.find(variant => variant.id === activeStyleId) || variants[0];
      persistFlowPlan(preferred.plan);
      setFlowEditVariants(
        variants.map(variant => ({
          id: variant.id,
          label: variant.label,
          summary: variant.summary,
          duration: variant.plan.duration,
          clipCount: variant.plan.segments.length,
          audioType: variant.plan.audioType,
          rescueMode: variant.plan.rescueMode,
          rescueFinishMode: variant.plan.rescueFinishMode,
          warning: variant.plan.warning,
        }))
      );
      setSelectedFlowSegmentId(preferred.plan.segments[0]?.id || null);
      setFlowEditWarning(preferred.plan.warning || "");
      setFlowEditInsight(
        isImageStoryFlow
          ? `Image story mode is active. ${activeAuraPreset.label} is driving the ${IMAGE_STORY_TEMPLATE_PRESETS.find(template => template.id === activeImageStoryTemplateId)?.label || "selected template"} so the story cards feel intentionally directed.${preferred.plan.loopsAudio ? " The soundtrack will loop smoothly until the edit finishes." : ""}`
          : preferred.plan.highlightPullMode
            ? `${activeAuraPreset.label} is shaping the highlight pull. ${preferred.plan.highlightSummary}${preferred.plan.loopsAudio ? " The soundtrack will loop smoothly until the full edit lands." : ""}`
            : preferred.plan.rescuePolishSummary ||
              preferred.plan.rescueSummary ||
              `${activeAuraPreset.label} is shaping the motion, polish, and transitions for this pass.`
      );
      setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[3]);
      setStatusMessage(
        isImageStoryFlow
          ? "Flow Edit story sequence is ready."
          : preferred.plan.highlightPullMode
            ? "Flow Edit highlight pull is ready."
            : "Flow Edit preview is ready."
      );
    } catch (error) {
      toast.error(error.message || "Flow Edit analysis failed.");
      setFlowEditStatusStep("");
      setStatusMessage(error.message || "Flow Edit analysis failed.");
    } finally {
      setIsGeneratingFlowEdit(false);
    }
  };

  const handleApplyFlowVariant = styleId => {
    if (!flowAudioUrl && !masterAudioSource) {
      setFlowEditStyleId(styleId);
      return;
    }
    setFlowEditStyleId(styleId);
    handleGenerateFlowEdit({ styleId });
  };

  const handleApplyImageStoryTemplate = templateId => {
    setFlowImageStoryTemplateId(templateId);
    if (!isImageStoryEligible) return;
    if (!flowAudioUrl && !masterAudioSource) {
      return;
    }
    handleGenerateFlowEdit({
      styleId: flowEditStyleId,
      imageStoryTemplateId: templateId,
    });
  };

  const handleApplyFlowAuraTemplate = templateId => {
    const auraPreset = getFlowAuraPreset(templateId);
    setFlowAuraTemplateId(templateId);
    setFlowEditStyleId(auraPreset.defaultStyleId);
    setFlowImageStoryTemplateId(auraPreset.defaultImageStoryTemplateId);
    setFlowIntensityMode(auraPreset.defaultIntensityMode);
    setStatusMessage(
      `${auraPreset.label} is loaded. Flow Edit will lean into ${auraPreset.summary.toLowerCase()}`
    );

    if (isSingleSourceWorkflow && singleCamSource) {
      handleAutoShapeSingleLens(templateId);
    }

    if (flowAudioUrl || masterAudioSource) {
      handleGenerateFlowEdit({
        styleId: auraPreset.defaultStyleId,
        imageStoryTemplateId: auraPreset.defaultImageStoryTemplateId,
        intensityMode: auraPreset.defaultIntensityMode,
        auraTemplateId: templateId,
      });
    }
  };

  const toggleFlowIntensityMode = () => {
    flowIntensityRefreshRef.current = true;
    setFlowIntensityMode(current => {
      const next = current === "harder" ? "standard" : "harder";
      setStatusMessage(
        next === "harder"
          ? "Impact mode armed. Flow Edit and Auto Director will hit harder."
          : "Impact mode eased off. Back to a more balanced cut feel."
      );
      return next;
    });
  };

  useEffect(() => {
    if (autoDirectorEnabled && !isSingleSourceWorkflow && !flowEditEnabled && readySources.length >= 2) {
      applyAutoDirectorPlan();
    }
  }, [
    flowIntensityMode,
    autoDirectorEnabled,
    isSingleSourceWorkflow,
    flowEditEnabled,
    readySources.length,
    directorStyleId,
  ]);

  useEffect(() => {
    if (!flowIntensityRefreshRef.current) return;
    flowIntensityRefreshRef.current = false;
    if (flowEditEnabled && (flowAudioUrl || masterAudioSource)) {
      handleGenerateFlowEdit(flowEditStyleId);
    }
  }, [flowIntensityMode]);

  const handleDisableFlowEdit = () => {
    setFlowEditEnabled(false);
    setFlowEditStatusStep("");
    setFlowEditWarning("");
    setFlowEditInsight("Flow Edit is off. Manual multicam control is back in charge.");
  };

  const handleMoveFlowCut = deltaSeconds => {
    if (!selectedFlowSegmentId) return;
    updateFlowPlanSegments(segments => {
      const targetIndex = segments.findIndex(segment => segment.id === selectedFlowSegmentId);
      if (targetIndex <= 0) return segments;
      const previous = segments[targetIndex - 1];
      const current = segments[targetIndex];
      const nextStart = clampNumber(
        current.startTime + deltaSeconds,
        previous.startTime + 0.35,
        current.endTime - 0.35,
        current.startTime
      );
      previous.endTime = Number(nextStart.toFixed(3));
      current.startTime = Number(nextStart.toFixed(3));
      previous.duration = Number((previous.endTime - previous.startTime).toFixed(3));
      current.duration = Number((current.endTime - current.startTime).toFixed(3));
      return segments;
    });
  };

  const handleDeleteFlowSegment = (segmentId = selectedFlowSegmentId) => {
    if (!segmentId) return;
    updateFlowPlanSegments(segments => {
      if (segments.length <= 1) return segments;
      const targetIndex = segments.findIndex(segment => segment.id === segmentId);
      if (targetIndex < 0) return segments;
      if (targetIndex === 0) {
        segments[1].startTime = 0;
        return segments.slice(1);
      }
      const previous = segments[targetIndex - 1];
      previous.endTime = segments[targetIndex].endTime;
      previous.duration = Number((previous.endTime - previous.startTime).toFixed(3));
      return segments.filter(segment => segment.id !== segmentId);
    });
    setSelectedFlowSegmentId(currentFlowSegment?.id || null);
  };

  const handleSplitFlowAtPlayhead = () => {
    if (!currentFlowSegment) return;
    const splitTime = clampNumber(
      playhead,
      currentFlowSegment.startTime + 0.35,
      currentFlowSegment.endTime - 0.35,
      currentFlowSegment.startTime
    );
    if (splitTime <= currentFlowSegment.startTime + 0.2 || splitTime >= currentFlowSegment.endTime - 0.2) {
      return;
    }
    updateFlowPlanSegments(segments => {
      const index = segments.findIndex(segment => segment.id === currentFlowSegment.id);
      if (index < 0) return segments;
      const current = segments[index];
      const alternate =
        readySources.find(source => source.id !== current.cameraId)?.id || current.cameraId;
      const left = {
        ...current,
        id: `${current.id}-a`,
        endTime: Number(splitTime.toFixed(3)),
      };
      left.duration = Number((left.endTime - left.startTime).toFixed(3));
      const right = {
        ...current,
        id: `${current.id}-b`,
        cameraId: alternate,
        startTime: Number(splitTime.toFixed(3)),
      };
      right.duration = Number((right.endTime - right.startTime).toFixed(3));
      return [...segments.slice(0, index), left, right, ...segments.slice(index + 1)];
    });
  };

  const handleApplyCameraToFlowSegment = cameraId => {
    if (!selectedFlowSegmentId || !cameraId) return;
    updateFlowPlanSegments(segments =>
      segments.map(segment =>
        segment.id === selectedFlowSegmentId ? { ...segment, cameraId } : segment
      )
    );
  };

  handleRecordSwitchRef.current = handleRecordSwitch;

  const handleRemoveSwitch = switchId => {
    if (!switchId) return;
    if (!isSingleSourceWorkflow && flowEditEnabled) {
      setSelectedFlowSegmentId(switchId);
      handleDeleteFlowSegment(switchId);
      return;
    }
    if (!isSingleSourceWorkflow && autoDirectorEnabled) {
      disableAutoDirectorForManualControl(
        "Manual timeline editing paused Auto Director. Re-enable Auto Direct when you want it back in control."
      );
    }
    setSwitches(currentSwitches => {
      const sourceScope = readySources.length ? readySources : sources;
      const removableSwitch = currentSwitches.find(item => item.id === switchId);
      if (!removableSwitch || Number(removableSwitch.startTime) <= 0.001) {
        return currentSwitches;
      }

      const normalized = normalizeSwitches(
        currentSwitches.filter(item => item.id !== switchId),
        sourceScope,
        timelineDuration || 0
      );
      setSelectedSwitchId(normalized[0]?.id || null);
      return normalized;
    });
  };

  const getDiagnosticAudioContext = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!diagnosticAudioContextRef.current) {
      diagnosticAudioContextRef.current = new AudioContextCtor();
    }
    return diagnosticAudioContextRef.current;
  };

  const handleTestBrowserAudio = async () => {
    const audioContext = getDiagnosticAudioContext();
    if (!audioContext) {
      setStatusMessage("This browser does not expose Web Audio for diagnostics.");
      return;
    }
    try {
      await audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.38);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.42);
      setStatusMessage("Browser speaker test played. If you did not hear it, the issue is outside the editor pipeline.");
    } catch (error) {
      setStatusMessage(`Browser audio test failed: ${error?.name || "audio blocked"}.`);
    }
  };

  const handleForcePlayFlowSound = async () => {
    if (!flowAudioUrl) {
      setStatusMessage("Upload or choose a Flow soundtrack first.");
      return;
    }
    try {
      const tagName = flowAudioIsVideoSoundtrack ? "video" : "audio";
      let media = diagnosticMediaRef.current;
      if (!media || media.tagName.toLowerCase() !== tagName || media.dataset.sourceUrl !== flowAudioUrl) {
        media?.pause?.();
        media = document.createElement(tagName);
        diagnosticMediaRef.current = media;
        media.preload = "auto";
        media.playsInline = true;
        media.loop = shouldLoopFlowAudio;
        media.dataset.sourceUrl = flowAudioUrl;
        applySafeMediaSource(media, flowAudioUrl);
      }
      forceMediaAudible(media);
      media.playbackRate = 1;
      media.currentTime = Math.max(0, Number(playheadRef.current) || 0);
      await media.play();
      setStatusMessage("Forced Flow soundtrack playback started. This bypasses timeline sync for media diagnostics.");
    } catch (error) {
      setStatusMessage(`Forced soundtrack playback failed: ${error?.name || "media playback blocked"}.`);
    }
  };

  const handlePlayPause = async () => {
    if (!timelineDuration) return;
    const isRestarting = playhead >= timelineDuration;
    const shouldPlay = !isPlaying;

    if (shouldPlay) {
      const syncReady = await ensureProgramOutputCleanAudioSync();
      if (!syncReady) return;
    }

    if (playhead >= timelineDuration) {
      setPlayhead(0);
      if (flowAudioRef.current) {
        try {
          flowAudioRef.current.currentTime = 0;
        } catch {}
      }
      if (externalAudioRef.current) {
        try {
          externalAudioRef.current.currentTime = 0;
        } catch {}
      }
    }

    if (flowAudioUrl && flowAudioRef.current) {
      if (shouldPlay) {
        applySafeMediaSource(flowAudioRef.current, flowAudioUrl);
        forceMediaAudible(flowAudioRef.current);
        flowAudioRef.current.playbackRate = 1;
        try {
          flowAudioRef.current.currentTime = isRestarting
            ? 0
            : Math.max(0, Number(playheadRef.current) || 0);
        } catch {}
        flowAudioRef.current.play?.().catch(error => {
          setIsPlaying(false);
          setStatusMessage(
            `Flow soundtrack could not start: ${error?.name || "playback blocked"}. Click Play again.`
          );
        });
      } else {
        flowAudioRef.current.pause?.();
      }
    } else if (hasExternalCleanAudio && externalAudioRef.current && externalAudioSourceProxy) {
      if (shouldPlay) {
        applySafeMediaSource(externalAudioRef.current, externalAudioUrl);
        forceMediaAudible(externalAudioRef.current);
        externalAudioRef.current.playbackRate = 1;
        try {
          externalAudioRef.current.currentTime = isRestarting
            ? 0
            : Math.max(
                0,
                getSourceTimelineTime(
                  externalAudioSourceProxy,
                  playheadRef.current,
                  timelineBounds.timelineStart
                )
              );
        } catch {}
        externalAudioRef.current.play?.().catch(error => {
          setIsPlaying(false);
          setStatusMessage(
            `Clean audio could not start: ${error?.name || "playback blocked"}. Click Play again.`
          );
        });
      } else {
        externalAudioRef.current.pause?.();
      }
    }

    setIsPlaying(shouldPlay);
  };

  const handleSeek = nextValue => {
    const numericValue = Number(nextValue);
    setPlayhead(Number.isFinite(numericValue) ? numericValue : 0);
  };

  const handleUseExportInEditor = () => {
    if (!exportResult || !onComplete) return;
    onComplete({
      file: exportResult.file,
      duration: exportResult.duration,
      workflowAction: "refine-full-video",
    });
  };

  const handleLoadFileForCamera = (cameraId, file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    const mediaKind = String(file?.type || "").startsWith("image/") ? "image" : "video";
    setSources(current =>
      current.map(s =>
        s.id === cameraId
          ? {
              ...s,
              file,
              mediaKind,
              name: file.name,
              previewUrl,
              url: "",
              uploadedUrl: "",
              uploadedSyncUrl: "",
              duration: mediaKind === "image" ? DEFAULT_IMAGE_SEGMENT_DURATION : 0,
              videoWidth: 0,
              videoHeight: 0,
            }
          : s
      )
    );
    setStatusMessage(`Loaded ${file.name} into ${cameraId}.`);
  };

  // Keyboard shortcuts: 1-6 switch cameras, W wide, R reaction, Space play/pause
  useEffect(() => {
    const onKeyDown = e => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "SELECT"
      )
        return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!timelineDuration) return;
        if (playheadRef.current >= timelineDuration) {
          setPlayhead(0);
        }
        setIsPlaying(prev => !prev);
        return;
      }

      if (!isSingleSourceWorkflow && !flowEditEnabled) {
        if (e.code === "KeyW") {
          e.preventDefault();
          activateManualLayoutMode("scene-grid", "Wide view is live in Program Output.");
          return;
        }
        if (e.code === "KeyR") {
          e.preventDefault();
          activateManualLayoutMode("pip", "Reaction window mode enabled.");
          return;
        }
      }

      const keyNum = parseInt(e.key, 10);
      if (keyNum >= 1 && keyNum <= MULTICAM_MAX_SOURCES && sources[keyNum - 1]) {
        const target = sources[keyNum - 1];
        if (getSourceMediaUrl(target) && handleRecordSwitchRef.current) {
          handleRecordSwitchRef.current(target.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sources, timelineDuration, isSingleSourceWorkflow, flowEditEnabled, autoDirectorEnabled]);

  const handleExport = async () => {
    if (!readySources.length) {
      setStatusMessage("Load at least one visual source before exporting.");
      return;
    }
    if (!timelineDuration || !activeCameraId || (!masterAudioSource && !flowAudioUrl)) {
      setStatusMessage("Set up synced sources and choose audio before exporting.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatusMessage("This browser does not support in-browser video export.");
      return;
    }

    cancelExportRef.current = false;
    setIsExporting(true);
    setExportProgress(0);
    setStatusMessage("Rendering browser-based multicam master (runs in real-time)...");

    const exportVisuals = new Map();
    let recorder;
    let recorderStream;
    let audioContext;
    let audioDestination;
    let externalFlowAudio;
    let externalCleanAudio;
    let cameraRoomAudio;

    try {
      await Promise.all(
        readySources.map(async source => {
          if (isImageSource(source)) {
            const image = new Image();
            image.decoding = "async";
            image.draggable = false;
            await new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = () => reject(new Error(`Unable to load ${source.label} for export.`));
              if (!applySafeMediaSource(image, getSourceMediaUrl(source))) {
                reject(new Error(`Unable to load ${source.label} for export.`));
              }
            });
            exportVisuals.set(source.id, image);
            return;
          }

          const video = document.createElement("video");
          video.preload = "auto";
          video.muted = true;
          video.playsInline = true;
          if (!applySafeMediaSource(video, getSourceMediaUrl(source))) {
            throw new Error(`Unable to load ${source.label} for export.`);
          }
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(new Error(`Unable to load ${source.label} for export.`));
          });
          exportVisuals.set(source.id, video);
        })
      );

      const baseSource = activeCamera || readySources[0];
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(640, Number(baseSource.videoWidth) || 1080);
      canvas.height = Math.max(360, Number(baseSource.videoHeight) || 1920);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create export canvas.");
      }

      const canvasStream = canvas.captureStream(EXPORT_FRAME_RATE);
      const masterVideo = isVideoSource(masterAudioSource) ? exportVisuals.get(masterAudioCameraId) : null;
      audioContext = new AudioContext();
      await audioContext.resume();
      audioDestination = audioContext.createMediaStreamDestination();

      if (flowAudioUrl) {
        externalFlowAudio = document.createElement("audio");
        externalFlowAudio.preload = "auto";
        externalFlowAudio.loop = shouldLoopFlowAudio;
        externalFlowAudio.playsInline = true;
        if (!applySafeMediaSource(externalFlowAudio, flowAudioUrl)) {
          throw new Error("Unable to load Flow Edit audio.");
        }
        await new Promise((resolve, reject) => {
          externalFlowAudio.onloadeddata = resolve;
          externalFlowAudio.onerror = () => reject(new Error("Unable to load Flow Edit audio."));
        });
        const audioSource = audioContext.createMediaElementSource(externalFlowAudio);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        audioSource.connect(gainNode);
        gainNode.connect(audioDestination);
      } else if (hasExternalCleanAudio) {
        externalCleanAudio = document.createElement("audio");
        externalCleanAudio.preload = "auto";
        externalCleanAudio.playsInline = true;
        if (!applySafeMediaSource(externalCleanAudio, externalAudioUrl)) {
          throw new Error("Unable to load external clean audio.");
        }
        await new Promise((resolve, reject) => {
          externalCleanAudio.onloadeddata = resolve;
          externalCleanAudio.onerror = () => reject(new Error("Unable to load external clean audio."));
        });
        const cleanAudioSource = audioContext.createMediaElementSource(externalCleanAudio);
        const cleanGainNode = audioContext.createGain();
        cleanGainNode.gain.value = 1;
        cleanAudioSource.connect(cleanGainNode);
        cleanGainNode.connect(audioDestination);

        if (externalAudioMixMode === "low_camera" && isVideoSource(masterAudioSource)) {
          cameraRoomAudio = document.createElement("audio");
          cameraRoomAudio.preload = "auto";
          cameraRoomAudio.playsInline = true;
          if (applySafeMediaSource(cameraRoomAudio, getSourceMediaUrl(masterAudioSource))) {
            await new Promise(resolve => {
              cameraRoomAudio.onloadeddata = resolve;
              cameraRoomAudio.onerror = resolve;
            });
            const roomAudioSource = audioContext.createMediaElementSource(cameraRoomAudio);
            const roomGainNode = audioContext.createGain();
            roomGainNode.gain.value = 0.16;
            roomAudioSource.connect(roomGainNode);
            roomGainNode.connect(audioDestination);
          }
        }
      } else if (masterVideo) {
        const audioSource = audioContext.createMediaElementSource(masterVideo);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        audioSource.connect(gainNode);
        gainNode.connect(audioDestination);
      }

      recorderStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const chunks = [];
      const mimeType = pickExportMimeType();
      recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => {
        if (event.data.size) {
          chunks.push(event.data);
        }
      };

      const completion = new Promise(resolve => {
        recorder.onstop = resolve;
      });

      recorder.start(250);

      await new Promise(resolve => {
        const startedAt = performance.now();
        const renderFrame = now => {
          if (cancelExportRef.current) {
            recorder.stop();
            resolve();
            return;
          }
          const exportPlayhead = Math.min(timelineDuration, (now - startedAt) / 1000);
          setExportProgress(exportPlayhead / timelineDuration);

          if (externalFlowAudio) {
            syncMediaElement(
              externalFlowAudio,
              getLoopedTrackTime(exportPlayhead, flowEditPlan?.audioDuration, shouldLoopFlowAudio),
              true,
              {
                muted: false,
                volume: 1,
                playbackRate: 1,
                driftThreshold: 0.24,
              }
            );
          }
          if (externalCleanAudio && externalAudioSourceProxy) {
            syncMediaElement(
              externalCleanAudio,
              getSourceTimelineTime(externalAudioSourceProxy, exportPlayhead, timelineBounds.timelineStart),
              true,
              {
                muted: false,
                volume: 1,
                playbackRate: 1,
                driftThreshold: 0.24,
              }
            );
          }
          if (cameraRoomAudio && masterAudioSource) {
            const roomTime = getSourceTimelineTime(
              masterAudioSource,
              exportPlayhead,
              timelineBounds.timelineStart
            );
            syncMediaElement(cameraRoomAudio, roomTime, isSourceAvailableAtTime(masterAudioSource, roomTime), {
              muted: false,
              volume: 1,
              playbackRate: 1,
              driftThreshold: 0.24,
            });
          }

          if (isSingleSourceWorkflow) {
            const currentSegment =
              flowEditEnabled && activeFlowSegments.length
                ? getFlowSegmentAtTime(activeFlowSegments, exportPlayhead)
                : getActiveSegmentAtTime(normalizedSingleCamSegments, exportPlayhead);
            const sourceVideo = exportVisuals.get(currentSegment?.cameraId || singleCamSource?.id);
            const sourceTime =
              flowEditEnabled && currentSegment?.sourceTimeByCameraId
                ? getFlowSourceTimeAtPlayhead(
                    singleCamSource,
                    currentSegment,
                    exportPlayhead,
                    timelineBounds.timelineStart
                  )
                : mapTimelineTimeToSourceTime(currentSegment, exportPlayhead);
            const isInRange = Number.isFinite(sourceTime);
            syncMediaElement(sourceVideo, sourceTime, isInRange, {
              muted: true,
              volume: 0,
              driftThreshold: 0.24,
              playbackRate: currentSegment?.playbackRate || 1,
            });
            drawVisualToCanvas(
              context,
              canvas,
              sourceVideo,
              singleCamSource?.label,
              (flowEditEnabled
                ? flowSegmentFraming[currentSegment?.id]
                : singleCamSegmentFraming[currentSegment?.id]) || { zoom: 1, zoomAnchor: "center" }
            );
          } else {
            readySources.forEach(source => {
              const video = exportVisuals.get(source.id);
              const exportFlowSegment = flowEditEnabled
                ? getFlowSegmentAtTime(activeFlowSegments, exportPlayhead)
                : null;
              const mappedTime = exportFlowSegment
                ? getFlowSourceTimeAtPlayhead(
                    source,
                    exportFlowSegment,
                    exportPlayhead,
                    timelineBounds.timelineStart
                  )
                : getSourceTimelineTime(source, exportPlayhead, timelineBounds.timelineStart);
              const isInRange = isSourceAvailableAtTime(source, mappedTime);
              syncMediaElement(video, mappedTime, isInRange, {
                muted: true,
                volume: 0,
                driftThreshold: 0.24,
                playbackRate: exportFlowSegment?.playbackRate || 1,
              });
            });

            const currentSegment =
              flowEditEnabled && activeFlowSegments.length
                ? getFlowSegmentAtTime(activeFlowSegments, exportPlayhead)
                : getActiveCameraAtTime(normalizedSwitches, readySources, exportPlayhead, timelineDuration);
            const currentCameraLabel = readySources.find(
              source => source.id === currentSegment?.cameraId
            )?.label;
            const exportLayout = applyDirectorStyleToLayout(
              resolveSmartMulticamLayoutAtTime(
                readySources,
                currentSegment?.cameraId,
                exportPlayhead,
                timelineBounds.timelineStart,
                audioAnalysisByCameraId,
                currentSegment?.layoutMode || multicamLayoutMode
              ),
              directorStyleId,
              readySources
            );
            const visibleFeeds = (exportLayout.visibleCameraIds || [currentSegment?.cameraId])
              .filter(Boolean)
              .slice(0, 6)
              .map((cameraId, index) => ({
                video: exportVisuals.get(cameraId),
                label: readySources.find(source => source.id === cameraId)?.label || cameraId,
                framing: index === 0 ? activeSingleCamFraming : {},
              }))
              .filter(feed => feed.video);
            drawCompositeVisualToCanvas(context, canvas, {
              layoutMode: exportLayout.layoutMode,
              primaryVideo: exportVisuals.get(currentSegment?.cameraId),
              secondaryVideo: exportVisuals.get(exportLayout.secondaryCameraId),
              primaryLabel: currentCameraLabel,
              primaryFraming:
                flowEditEnabled && currentSegment?.id
                  ? normalizeSegmentFraming(flowSegmentFraming[currentSegment?.id])
                  : activeSingleCamFraming,
              secondaryLabel: readySources.find(
                source => source.id === exportLayout.secondaryCameraId
              )?.label,
              transitionState: getFlowTransitionState(currentSegment, exportPlayhead),
              visibleFeeds,
            });
          }

          if (exportPlayhead >= timelineDuration) {
            recorder.stop();
            resolve();
            return;
          }

          requestAnimationFrame(renderFrame);
        };

        requestAnimationFrame(renderFrame);
      });

      await completion;

      if (cancelExportRef.current) {
        setStatusMessage("Export cancelled.");
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const exportUrl = URL.createObjectURL(blob);
      const exportFile = new File([blob], `multicam-master-${Date.now()}.webm`, {
        type: blob.type || "video/webm",
      });

      if (exportResult?.url) {
        URL.revokeObjectURL(exportResult.url);
      }

      setExportResult({
        url: exportUrl,
        file: exportFile,
        duration: timelineDuration,
      });
      setStatusMessage("Browser render complete. Download the master or continue into the editor.");
    } catch (error) {
      console.error(error);
      setStatusMessage(error.message || "Browser export failed.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      exportVisuals.forEach(video => {
        if (typeof video.pause === "function") {
          video.pause();
        }
        if (typeof video.removeAttribute === "function") {
          video.removeAttribute("src");
        }
        if (typeof video.load === "function") {
          video.load();
        }
      });
      if (recorderStream) {
        recorderStream.getTracks().forEach(track => track.stop());
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
      if (externalFlowAudio) {
        externalFlowAudio.pause();
        externalFlowAudio.removeAttribute("src");
        externalFlowAudio.load();
      }
      if (externalCleanAudio) {
        externalCleanAudio.pause();
        externalCleanAudio.removeAttribute("src");
        externalCleanAudio.load();
      }
      if (cameraRoomAudio) {
        cameraRoomAudio.pause();
        cameraRoomAudio.removeAttribute("src");
        cameraRoomAudio.load();
      }
    }
  };

  const handleServerExport = async () => {
    if (flowEditEnabled) {
      setStatusMessage(
        "Flow Edit currently exports in-browser so your local soundtrack and speed ramps stay intact."
      );
      return;
    }
    if (readySources.some(isImageSource)) {
      setStatusMessage(
        "Story slides with images currently export in-browser so motion treatment and timing stay accurate."
      );
      return;
    }
    if (!readySources.length) {
      setStatusMessage("Load at least one visual source before exporting.");
      return;
    }
    if (!timelineDuration) {
      setStatusMessage("Set up synced sources before exporting.");
      return;
    }
    if (cloudRenderWindowDuration <= 0.5) {
      setStatusMessage("Pick a valid render window before starting the cloud export.");
      toast.error("Pick a valid render window first.");
      return;
    }

    setServerExportPending(true);
    setIsExporting(true);
    setExportProgress(0);
    setStatusMessage("Preparing local server render (MP4)...");

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in to use server rendering.");
      const token = await user.getIdToken();
      const storage = getStorage();
      const renderWindowStart = cloudRenderWindowStartSafe;
      const renderWindowEnd = cloudRenderWindowEnd;
      const renderWindowDuration = cloudRenderWindowDuration;
      const renderTimelineStart = (Number(timelineBounds.timelineStart) || 0) + renderWindowStart;

      const sourcesPayload = [];
      for (let i = 0; i < readySources.length; i++) {
        const source = readySources[i];
        setExportProgress((i / readySources.length) * 0.5);
        const sourceLabel = source.label || `source ${i + 1}`;
        setStatusMessage(
          `Preparing ${sourceLabel} for cloud render (${i + 1}/${readySources.length})...`
        );
        const sourceDuration = Number(source.duration || 0);
        const sourceTrimStartForWindow = clampNumber(
          getSourceTimelineTime(source, renderWindowStart, timelineBounds.timelineStart) - 2,
          0,
          Math.max(0, sourceDuration - 0.2),
          0
        );
        const sourceTrimEndForWindow = clampNumber(
          getSourceTimelineTime(source, renderWindowEnd, timelineBounds.timelineStart) + 2,
          sourceTrimStartForWindow + 0.2,
          sourceDuration || sourceTrimStartForWindow + renderWindowDuration,
          sourceTrimStartForWindow + renderWindowDuration
        );
        const sourceTrimDurationForWindow = Math.max(
          0.2,
          sourceTrimEndForWindow - sourceTrimStartForWindow
        );
        const uploadedTrimStart = Number(source.uploadedRenderTrimStart || 0) || 0;
        const uploadedTrimDuration = Number(source.uploadedRenderTrimDuration || 0) || 0;
        const hasMatchingRenderProxy =
          String(source.uploadedUrl || "").startsWith("http") &&
          uploadedTrimDuration > 0 &&
          Math.abs(uploadedTrimStart - sourceTrimStartForWindow) <= 1 &&
          Math.abs(
            (uploadedTrimStart + uploadedTrimDuration) -
              (sourceTrimStartForWindow + sourceTrimDurationForWindow)
          ) <= 2;

        let usingRenderProxy = hasMatchingRenderProxy;
        let remoteUrl =
          hasMatchingRenderProxy
            ? source.uploadedUrl
            : String(source.url || "").startsWith("http")
              ? source.url
              : "";
        if (!remoteUrl && source.file) {
          const uploadResult = await uploadMediaForBackendSync({
            user,
            storage,
            file: source.file,
            fallbackUrl: "",
            folder: "temp/multicam-clean-sync",
            label: sourceLabel,
            mode: "auto",
            trimWindow: {
              start: sourceTrimStartForWindow,
              duration: sourceTrimDurationForWindow,
            },
          });
          remoteUrl = uploadResult.videoUrl || uploadResult.url;
          usingRenderProxy = true;
          setStatusMessage(`${sourceLabel} ready for cloud render.`);
        }
        if (!remoteUrl) {
          remoteUrl = source.serverRenderLocalPath || source.localRenderPath || "";
        }
        if (!remoteUrl) throw new Error(`No video file for ${source.label}.`);

        sourcesPayload.push({
          id: source.id,
          url: remoteUrl,
          label: source.label || `Camera ${i + 1}`,
          offset_seconds: Number(source.offsetSeconds) || 0,
          sync_rate: getSourceSyncRate(source),
          syncRate: getSourceSyncRate(source),
          upload_trim_start: usingRenderProxy ? sourceTrimStartForWindow : 0,
          upload_trim_duration: usingRenderProxy ? sourceTrimDurationForWindow : 0,
        });
      }
      const usingFastUploadProxies = sourcesPayload.some(
        source => Number(source.upload_trim_duration || 0) > 0
      );
      setSources(currentSources =>
        currentSources.map(source => {
          const uploaded = sourcesPayload.find(item => item.id === source.id);
          return uploaded && String(uploaded.url || "").startsWith("/")
            ? { ...source, serverRenderLocalPath: uploaded.url, localRenderPath: uploaded.url }
            : uploaded
              ? {
                  ...source,
                  uploadedUrl: uploaded.url,
                  uploadedRenderTrimStart: Number(uploaded.upload_trim_start || 0) || 0,
                  uploadedRenderTrimDuration: Number(uploaded.upload_trim_duration || 0) || 0,
                }
              : source;
        })
      );

      let externalAudioPayload = null;
      if (hasExternalCleanAudio && externalAudioTrack) {
        setStatusMessage("Uploading external clean audio for server render...");
        const externalAudioUpload = await uploadMediaForBackendSync({
          user,
          storage,
          file: externalAudioTrack.file,
          fallbackUrl: externalAudioTrack.url,
          folder: "temp/multicam-clean-sync-audio",
          label: "External clean audio",
          mode: "audio_only",
        });
        const externalAudioRemoteUrl = externalAudioUpload.url;
        externalAudioPayload = {
          url: externalAudioRemoteUrl,
          offset_seconds: Number(externalAudioTrack.offsetSeconds || 0),
          mix_mode: externalAudioMixMode,
          cache_key: buildBackendMediaCacheKey(externalAudioTrack.file) || externalAudioTrack.name,
        };
        setExternalAudioTrack(current =>
          current
            ? {
                ...current,
                url: externalAudioRemoteUrl,
                cacheKey: externalAudioPayload.cache_key,
              }
            : current
        );
      }

      if (externalAudioPayload?.url && sourcesPayload.length && !usingFastUploadProxies) {
        setStatusMessage("Preflight: calculating corrected camera offsets and drift rates...");
        try {
          const preflightBody = {
            sources: sourcesPayload.map(source => ({
              url: source.url,
              offset_seconds: source.offset_seconds,
              sync_rate: source.sync_rate,
              syncRate: source.syncRate,
            })),
            external_audio_url: externalAudioPayload.url,
          };
          const preflightRes = await fetch(`${API_BASE_URL}/api/media/multicam/preflight-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(preflightBody),
          });
          const preflight = await preflightRes.json();
          console.log("PREFLIGHT AUTO-ALIGN RESULT:", preflight);
          const adjustments = applyPreflightSyncSuggestions(sourcesPayload, preflight);
          if (adjustments.length) {
            setSources(currentSources =>
              currentSources.map(source => {
                const adjustment = adjustments.find(item => item.id === source.id);
                return adjustment
                  ? {
                      ...source,
                      offsetSeconds: adjustment.offsetSeconds,
                      syncRate: adjustment.syncRate,
                      sync_rate: adjustment.syncRate,
                      autoSyncApplied: true,
                    }
                  : source;
              })
            );
            setStatusMessage(
              `Applied safe sync correction to ${adjustments.length} camera${adjustments.length === 1 ? "" : "s"}. Rendering with corrected offsets.`
            );
          } else if (preflight.status === "unsafe") {
            setStatusMessage("⚠️ Sync preflight could not find a safe automatic correction.");
          }
        } catch (preflightErr) {
          console.warn("Preflight auto-align failed before render:", preflightErr);
        }
      }

      setExportProgress(0.6);
      setStatusMessage(
        `Sources ready. Rendering ${formatDurationLabel(renderWindowStart)} to ${formatDurationLabel(renderWindowEnd)} on server...`
      );

      const renderSourceScope = readySources.map(source => {
        const payload = sourcesPayload.find(item => item.id === source.id);
        return payload
          ? {
              ...source,
              offsetSeconds: Number(payload.offset_seconds) || 0,
              syncRate: getSourceSyncRate(payload),
              sync_rate: getSourceSyncRate(payload),
              uploadTrimStart: Number(payload.upload_trim_start || 0) || 0,
              uploadTrimDuration: Number(payload.upload_trim_duration || 0) || 0,
            }
          : source;
      });
      const sourceMapForRender = new Map(renderSourceScope.map(source => [source.id, source]));

      // Build segments from flow plan if active, otherwise from auto switches
      let renderSegmentsPayload;
      if (flowEditEnabled && activeFlowSegments.length > 0) {
        renderSegmentsPayload = activeFlowSegments
          .map(seg => {
            const source = sourceMapForRender.get(seg.cameraId);
            if (!source) return null;
            const timelineStart = Number(seg.startTime) || 0;
            const timelineEnd = Number(seg.endTime) || 0;
            const clippedTimelineStart = Math.max(timelineStart, renderWindowStart);
            const clippedTimelineEnd = Math.min(timelineEnd, renderWindowEnd);
            const duration = Math.max(0, clippedTimelineEnd - clippedTimelineStart);
            if (duration <= 0.02) return null;
            const sourceStart = getSourceTimelineTime(source, clippedTimelineStart, timelineBounds.timelineStart);
            const sourceEnd = getSourceTimelineTime(source, clippedTimelineEnd, timelineBounds.timelineStart);
            const sourceDuration = Number(source.duration || 0);
            const rawSourceDuration = Math.max(0, sourceEnd - sourceStart);
            if (sourceEnd < 0.02 || sourceStart > sourceDuration - 0.02 || rawSourceDuration <= 0.02) return null;
            const clampedSourceStart = Math.max(0, sourceStart);
            const syncRate = getSourceSyncRate(source);
            const clampedDuration = Math.max(
              0,
              Math.min(duration, (sourceDuration - clampedSourceStart) / syncRate)
            );
            if (clampedDuration <= 0.02) return null;
            const clampedSourceDuration = Math.max(
              0.02,
              (clampedDuration * syncRate) - Math.max(0, clampedSourceStart - sourceStart)
            );
            return {
              camera_id: seg.cameraId,
              timeline_start: Number((clippedTimelineStart - renderWindowStart).toFixed(3)),
              timeline_end: Number((clippedTimelineStart - renderWindowStart + clampedDuration).toFixed(3)),
              source_start: Number(
                Math.max(0, clampedSourceStart - (Number(source.uploadTrimStart) || 0)).toFixed(3)
              ),
              source_end: Number(
                Math.max(
                  0.02,
                  clampedSourceStart +
                    clampedSourceDuration -
                    (Number(source.uploadTrimStart) || 0)
                ).toFixed(3)
              ),
              layout_mode: normalizeMulticamLayoutMode(seg.layoutMode || seg.layout_mode || multicamLayoutMode || "cut"),
            };
          })
          .filter(Boolean);
      } else {
        renderSegmentsPayload = normalizedSwitches
          .map((sw, index) => {
            const nextSwitch = normalizedSwitches[index + 1];
            const timelineStart = Number(sw.startTime) || 0;
            const timelineEnd = nextSwitch
              ? Number(nextSwitch.startTime) || timelineStart
              : Number(timelineDuration) || timelineStart;
            const clippedTimelineStart = Math.max(timelineStart, renderWindowStart);
            const clippedTimelineEnd = Math.min(timelineEnd, renderWindowEnd);
            const duration = Math.max(0, clippedTimelineEnd - clippedTimelineStart);
            const source = sourceMapForRender.get(sw.cameraId);
            if (!source || duration <= 0.02) return null;
            const sourceStart = getSourceTimelineTime(source, clippedTimelineStart, timelineBounds.timelineStart);
            const sourceEnd = getSourceTimelineTime(source, clippedTimelineEnd, timelineBounds.timelineStart);
            const sourceDuration = Number(source.duration || 0);
            const rawSourceDuration = Math.max(0, sourceEnd - sourceStart);
            if (sourceEnd < 0.02 || sourceStart > sourceDuration - 0.02 || rawSourceDuration <= 0.02) return null;
            const clampedSourceStart = Math.max(0, sourceStart);
            const sourceTrimmedFromStart = Math.max(0, clampedSourceStart - sourceStart);
            const syncRate = getSourceSyncRate(source);
            const clampedDuration = Math.max(
              0,
              Math.min(duration, (sourceDuration - clampedSourceStart) / syncRate)
            );
            if (clampedDuration <= 0.02) return null;
            const clampedSourceDuration = Math.max(
              0.02,
              (clampedDuration * syncRate) - sourceTrimmedFromStart
            );
            return {
              camera_id: sw.cameraId,
              timeline_start: Number((clippedTimelineStart - renderWindowStart).toFixed(3)),
              timeline_end: Number((clippedTimelineStart - renderWindowStart + clampedDuration).toFixed(3)),
              source_start: Number(
                Math.max(0, clampedSourceStart - (Number(source.uploadTrimStart) || 0)).toFixed(3)
              ),
              source_end: Number(
                Math.max(
                  0.02,
                  clampedSourceStart +
                    clampedSourceDuration -
                    (Number(source.uploadTrimStart) || 0)
                ).toFixed(3)
              ),
              layout_mode: normalizeMulticamLayoutMode(sw.layoutMode || sw.layout_mode || multicamLayoutMode || "cut"),
            };
          })
          .filter(Boolean);
      }

      if (!renderSegmentsPayload?.length) {
        throw new Error(
          "No valid camera segments inside this 20-minute window. Move the render window to where your synced cameras overlap."
        );
      }

      const switchesPayload = renderSegmentsPayload.map(seg => ({
        camera_id: seg.camera_id,
        start_time: Number(seg.timeline_start) || 0,
        layout_mode: normalizeMulticamLayoutMode(seg.layout_mode || "cut"),
      }));

      // ===== TRACE: frontend payload =====
      console.group("TRACE renderSegmentsPayload (first 8)");
      (renderSegmentsPayload || []).slice(0, 8).forEach((seg, idx) => {
        console.log(
          `[FRONTEND] seg[${idx}] camera=${seg.camera_id} layout=${seg.layout_mode} ` +
          `timeline=${seg.timeline_start}→${seg.timeline_end} source=${seg.source_start}→${seg.source_end}`
        );
      });
      console.groupEnd();
      console.log("TRACE total segments:", renderSegmentsPayload.length);
      console.log("TRACE layout summary:", (renderSegmentsPayload || []).reduce((acc, s) => { acc[s.layout_mode] = (acc[s.layout_mode] || 0) + 1; return acc; }, {}));
      // ===== END TRACE =====

      // -------- Preflight sync check (when external audio is available) --------
      if (externalAudioPayload?.url && !usingFastUploadProxies) {
        setStatusMessage("Preflight: checking camera sync against clean audio...");
        const preflightBody = {
          sources: sourcesPayload.map(s => ({
            url: s.url,
            offset_seconds: s.offset_seconds,
            sync_rate: s.sync_rate,
            syncRate: s.syncRate,
          })),
          external_audio_url: externalAudioPayload.url,
        };
        try {
          const preflightRes = await fetch(`${API_BASE_URL}/api/media/multicam/preflight-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(preflightBody),
          });
          const preflight = await preflightRes.json();
          console.log("PREFLIGHT RESULT:", preflight);
          if (preflight.status === "unsafe") {
            setStatusMessage("⚠️ Sync preflight FAILED: cameras do not match clean audio. Adjust offsets and try again.");
            console.error("PREFLIGHT FAILED:", preflight);
            const continueAnyway = window.confirm(
              "⚠️ Sync Preflight Warning\n\n" +
              "The camera sync does not match the clean audio track well enough to guarantee a good render.\n\n" +
              "This usually means camera offsets are wrong or audio drifted significantly during recording.\n\n" +
              "Click OK to render anyway (result may have sync issues) or Cancel to abort and fix offsets."
            );
            if (!continueAnyway) {
              setIsExporting(false);
              setServerExportPending(false);
              setStatusMessage("Preflight check failed. Please review camera offsets and try again.");
              return;
            }
            setStatusMessage("⚠️ Proceeding with render despite sync warnings...");
          } else if (preflight.status === "questionable") {
            console.warn("PREFLIGHT WARNING:", preflight);
            setStatusMessage("⚠️ Sync is questionable — render may have minor sync issues. Adjust offsets for best results.");
            // Brief warning, then proceed
            await new Promise(r => setTimeout(r, 2000));
          } else {
            setStatusMessage("✅ Preflight sync check passed. Rendering...");
          }
        } catch (preflightErr) {
          console.warn("Preflight sync check failed (non-fatal):", preflightErr);
          // Don't block render — let user decide
          const go = window.confirm(
            "Could not run sync preflight check (network or server issue).\n\nRender anyway?"
          );
          if (!go) {
            setIsExporting(false);
            setServerExportPending(false);
            setStatusMessage("Render aborted — preflight check unavailable.");
            return;
          }
        }
      }
      // ----------------------------------------------------------------

      const response = await fetch(`${API_BASE_URL}/api/media/render-multicam`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sources: sourcesPayload,
          segments: renderSegmentsPayload,
          switches: switchesPayload,
          primaryAudioCameraId: masterAudioCameraId,
          primary_audio_camera_id: masterAudioCameraId,
          timelineStart: renderTimelineStart,
          timeline_start: renderTimelineStart,
          overlapStart: renderTimelineStart,
          overlap_start: renderTimelineStart,
          overlapDuration: renderWindowDuration,
          overlap_duration: renderWindowDuration,
          outputAspectRatio: outputAspectRatio,
          output_aspect_ratio: outputAspectRatio,
          renderTier: multicamRenderTier,
          render_tier: multicamRenderTier,
          externalAudio: externalAudioPayload,
          external_audio_url: externalAudioPayload?.url || null,
          external_audio_offset_seconds: Number(externalAudioPayload?.offset_seconds || 0),
          external_audio_mix_mode: externalAudioPayload?.mix_mode || "external_only",
          external_audio_cache_key: externalAudioPayload?.cache_key || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      if (!data.success && !data.output_url) {
        throw new Error(data.error || "Server render did not return a result.");
      }

      setExportProgress(1);
      const outputUrl = data.output_url || data.outputUrl;
      if (outputUrl) {
        setExportResult({
          url: outputUrl,
          file: { name: `multicam-master-${Date.now()}.mp4` },
          duration: data.duration || renderWindowDuration,
          isServerRender: true,
        });
        setStatusMessage("Local MP4 render complete. Download it to your laptop.");
      } else {
        const renderJobId = data.jobId;
        if (!renderJobId) {
          throw new Error("Server did not return a job ID");
        }
        setStatusMessage(
          `Server render started (Job: ${renderJobId}). Waiting for completion...`
        );

        // Poll for render completion
        const pollInterval = window.setInterval(async () => {
          if (cancelExportRef.current) {
            window.clearInterval(pollInterval);
            return;
          }
          try {
            const user = getAuth().currentUser;
            if (!user) {
              window.clearInterval(pollInterval);
              return;
            }
            const idToken = await user.getIdToken();
            const statusRes = await fetch(`${API_BASE_URL}/api/media/status/${renderJobId}`, {
              headers: { Authorization: `Bearer ${idToken}` },
            });
            const statusData = await statusRes.json().catch(() => ({}));
            if (!statusRes.ok || !statusData.success) return;

            setExportProgress(Math.min(0.99, (statusData.progress || 0) / 100));
            setStatusMessage(
              statusData.detail || `Server rendering... ${statusData.progress || 0}%`
            );

            if (statusData.status === "completed") {
              window.clearInterval(pollInterval);
              const completedUrl =
                statusData.output_url ||
                statusData.outputUrl ||
                statusData.result?.url ||
                statusData.result?.output_url;
              if (completedUrl) {
                setExportProgress(1);
                setExportResult({
                  url: completedUrl,
                  file: { name: `multicam-master-${Date.now()}.mp4` },
                  duration: statusData.result?.duration || renderWindowDuration,
                  isServerRender: true,
                });
                setStatusMessage("Multi-camera render complete. Download ready.");
                loadRecentRenders();
              } else {
                setStatusMessage("Render completed but no output URL was returned.");
              }
              setServerExportPending(false);
              setIsExporting(false);
            } else if (statusData.status === "failed") {
              window.clearInterval(pollInterval);
              setStatusMessage(
                statusData.error || statusData.detail || "Server render failed."
              );
              toast.error(statusData.error || "Server render failed.");
              setServerExportPending(false);
              setIsExporting(false);
              setExportProgress(0);
            }
          } catch (pollErr) {
            console.warn("Multicam render status poll failed", pollErr);
          }
        }, 5000);

        // Store interval for cleanup
        exportPollIntervalRef.current = pollInterval;
      }
    } catch (error) {
      console.error(error);
      setStatusMessage(error.message || "Server export failed.");
      toast.error(error.message || "Server export failed.");
    } finally {
      setServerExportPending(false);
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const renderCloudRenderWindowPanel = () => {
    if (!isLongCloudRenderSource) return null;
    return (
      <div className="nle-cloud-render-window">
        <div className="nle-cloud-render-window-copy">
          <strong>Cloud render window</strong>
          <span>
            Long source detected. Upload the full cameras once, then render any 20-minute section.
          </span>
        </div>
        <div className="nle-cloud-render-window-range">
          <input
            type="range"
            min="0"
            max={Math.max(1, Math.round(cloudRenderWindowMaxStart))}
            step="1"
            value={Math.round(cloudRenderWindowStartSafe)}
            onChange={event => setCloudRenderWindowStart(Number(event.target.value) || 0)}
            disabled={isExporting}
            aria-label="Cloud render window start time"
          />
          <div className="nle-cloud-render-window-times">
            <span>
              Rendering {formatDurationLabel(cloudRenderWindowStartSafe)} to{" "}
              {formatDurationLabel(cloudRenderWindowEnd)}
            </span>
            <strong>{formatDurationLabel(cloudRenderWindowDuration)} max</strong>
          </div>
        </div>
        <div className="nle-cloud-render-window-actions">
          <button
            type="button"
            className="nle-mini-btn"
            onClick={() => setCloudRenderWindowStart(0)}
            disabled={isExporting || cloudRenderWindowStartSafe <= 0.5}
          >
            First 20 min
          </button>
          <button
            type="button"
            className="nle-mini-btn"
            onClick={() => setCloudRenderWindowStart(cloudRenderWindowMaxStart)}
            disabled={isExporting || cloudRenderWindowMaxStart <= 0.5}
          >
            Final 20 min
          </button>
        </div>
      </div>
    );
  };

  const renderRecentRendersPanel = () => {
    const savedMasters = recentRenders.filter(render => {
      const downloadUrl = render.outputUrl || render.output_url;
      return render.status === "completed" && !!downloadUrl;
    });
    if (!savedMasters.length && !recentRendersStatus) return null;
    return (
      <div className="nle-saved-renders">
        <div className="nle-saved-renders-head">
          <strong>Saved Cam Combiner masters</strong>
          <button type="button" className="nle-mini-btn" onClick={loadRecentRenders}>
            Refresh
          </button>
        </div>
        {recentRendersStatus ? <span>{recentRendersStatus}</span> : null}
        {savedMasters.slice(0, 4).map(render => {
          const downloadUrl = render.outputUrl || render.output_url;
          return (
            <div className="nle-saved-render-card" key={render.jobId}>
              {render.thumbnailUrl ? (
                <img src={render.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <div className="nle-saved-render-thumb">MP4</div>
              )}
              <div>
                <strong>Master ready</strong>
                <span>
                  {formatDurationLabel(Number(render.duration || 0))} ·{" "}
                  {formatRenderExpiry(render.expiresAt)}
                </span>
              </div>
              <a
                className="nle-mini-btn"
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`nle-overlay ${isFlowWorkspace ? "" : "is-combine-overlay"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Combine Multi-Camera Studio"
    >
      <div
        className={`nle-shell ${isSingleSourceWorkflow ? "is-single-cam" : "is-multicam"} ${
          isFlowWorkspace ? "is-flow-workspace" : "is-combine-workspace"
        } ${leftStudioRailCollapsed ? "is-left-rail-collapsed" : ""} ${
          rightStudioRailCollapsed ? "is-right-rail-collapsed" : ""
        }`}
      >
        <div className="nle-header">
          <div className="nle-header-copy">
            <span className="nle-eyebrow">Multicam Studio</span>
            <h3>{headerTitle}</h3>
            <p>{headerDescription}</p>
            <div className="nle-mode-switcher">
              <button
                type="button"
                className={`nle-mode-btn ${studioMode === "combine" ? "is-active" : ""}`}
                onClick={() => setStudioMode("combine")}
              >
                Cam Combiner
              </button>
              <button
                type="button"
                className={`nle-mode-btn ${studioMode === "flow" ? "is-active" : ""}`}
                onClick={() => setStudioMode("flow")}
              >
                Flow Edit
              </button>
              {flowEditEnabled && (
                <span className="nle-chip nle-chip-secondary">Flow edit active</span>
              )}
            </div>
            <div className="nle-billing-strip">
              <span className="nle-billing-pill is-included">Included workflow</span>
              <span className="nle-billing-pill">{billingMessage}</span>
            </div>
          </div>
          <button
            className="nle-close-btn"
            type="button"
            onClick={onCancel}
            aria-label="Close multicam studio"
          >
            &times;
          </button>
        </div>

        {!isFlowWorkspace && (
          <div className="nle-studio-shell" ref={scrollContainerRef}>
            <aside className={`nle-studio-sidebar nle-studio-sidebar-left ${leftStudioRailCollapsed ? "is-collapsed" : ""}`}>
              <button
                type="button"
                className="nle-studio-rail-toggle"
                onClick={() => setLeftStudioRailCollapsed(value => !value)}
                aria-label={leftStudioRailCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
              >
                {leftStudioRailCollapsed ? "›" : "‹"}
              </button>
              {!leftStudioRailCollapsed && (
                <>
                  <div className="nle-studio-card nle-studio-brand-card">
                    <div className="nle-studio-brand-mark">
                      <span className="nle-studio-brand-icon">▶</span>
                      <div>
                        <strong>Cam Combiner</strong>
                        <span>AI Multicam Director Studio</span>
                      </div>
                    </div>
                    <div className="nle-studio-status-line">
                      <span className="nle-studio-dot is-good" />
                      Sync status: {hasExternalCleanAudio ? "Audio locked" : "Camera audio master"}
                    </div>
                  </div>

                  <div className="nle-studio-card nle-studio-pipeline-card">
                    <div className="nle-studio-card-header">
                      <strong>Processing Pipeline</strong>
                      <span>{Math.round((studioPipelineSteps.filter(step => step.state === "done").length / studioPipelineSteps.length) * 100)}%</span>
                    </div>
                    <div className="nle-studio-pipeline">
                      {studioPipelineSteps.map((step, index) => (
                        <div key={step.id} className={`nle-studio-pipeline-row is-${step.state}`}>
                          <span className="nle-studio-pipeline-index">{index + 1}</span>
                          <div>
                            <strong>{step.label}</strong>
                            <span>{step.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </>
              )}
            </aside>

            <section className="nle-studio-main" ref={previewPanelRef}>
              <div className="nle-studio-topbar">
                <div className={`nle-studio-topbar-pill is-sync-${previewSyncState.tone}`}>
                  <span>Sync Status</span>
                  <strong>{previewSyncState.title}</strong>
                </div>
                <div className="nle-studio-topbar-pill">
                  <span>Sources</span>
                  <strong>{studioMonitorSources.length} / {Math.max(studioMonitorSources.length, 3)}</strong>
                </div>
                <div className="nle-studio-topbar-pill">
                  <span>Clean Audio</span>
                  <strong>{externalAudioTrack?.name || "None loaded"}</strong>
                </div>
                <div className="nle-studio-topbar-pill">
                  <span>Render Cost</span>
                  <strong>{multicamRenderCreditEstimate} cr · {multicamRenderTier}</strong>
                </div>
                <button
                  className="nle-btn secondary nle-studio-clean-audio-btn"
                  type="button"
                  onClick={() => externalAudioInputRef.current?.click()}
                >
                  {externalAudioTrack ? "Replace Clean Audio" : "Upload Clean Audio"}
                </button>
                <button
                  className="nle-btn nle-studio-add-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add Visual Files
                </button>
                <input
                  ref={externalAudioInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  onChange={event => {
                    handleLoadExternalAudioFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  className="nle-hidden-input"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  multiple
                  onChange={event => {
                    appendFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className="nle-hidden-input"
                />
              </div>

              <div className={`nle-studio-commerce-strip is-sync-${previewSyncState.tone}`}>
                <div className="nle-studio-sync-proof">
                  <strong>{previewSyncState.title}</strong>
                  <span>{previewSyncState.detail}</span>
                </div>
                <div className="nle-render-tier-group" aria-label="Cam Combiner render pricing">
                  {MULTICAM_RENDER_TIERS.map(tier => (
                    <button
                      key={tier.id}
                      type="button"
                      className={`nle-render-tier ${multicamRenderTier === tier.id ? "is-active" : ""}`}
                      onClick={() => setMulticamRenderTier(tier.id)}
                    >
                      <span>{tier.eyebrow}</span>
                      <strong>{tier.label} · {estimateMulticamRenderCredits(tier.id)} cr</strong>
                    </button>
                  ))}
                </div>
                <div className="nle-studio-credit-note">
                  <strong>Credits</strong>
                  <span>
                    Balance: {Number(credits?.remaining ?? 0).toFixed(0)} cr. Preview is included.
                    Clean-audio sync is {cleanAudioSyncCreditEstimate} cr when needed; server MP4 render is {multicamRenderCreditEstimate} cr.
                  </span>
                  <button
                    className="nle-mini-paypal-btn"
                    type="button"
                    onClick={() => setBillingPanelOpen(true)}
                  >
                    Buy credits with PayPal
                  </button>
                </div>
              </div>

              <div className="nle-studio-stage-grid">
                {studioMonitorSlots.map((source, index) => {
                  if (!source) {
                    return (
                      <article
                        key={`studio-monitor-empty-${index}`}
                        className="nle-studio-monitor-card is-empty"
                      >
                        <div className="nle-studio-monitor-head">
                          <span className="nle-studio-monitor-label">{getStudioSlotLabel(index)}</span>
                          <span className="nle-studio-monitor-badge">Empty</span>
                        </div>
                        <button
                          type="button"
                          className="nle-studio-monitor-frame nle-drop-target"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Load Camera {index + 1}
                        </button>
                        <div className="nle-studio-monitor-meta">
                          <span>Offset 0.00s</span>
                          <span>Awaiting source</span>
                        </div>
                      </article>
                    );
                  }
                  const mediaUrl = getSourceMediaUrl(source);
                  const mappedTime = getSourceTimelineTime(
                    source,
                    playhead,
                    timelineBounds.timelineStart
                  );
                  const confidence = studioSpeakerRows.find(row => row.id === source.id)?.confidence || 0;
                  const isLive = source.id === activeCameraId;
                  return (
                    <article
                      key={`studio-monitor-${source.id}`}
                      className={`nle-studio-monitor-card ${isLive ? "is-live" : ""}`}
                    >
                      <div className="nle-studio-monitor-head">
                        <span className="nle-studio-monitor-label">{getStudioSlotLabel(index)}</span>
                        <span className={`nle-studio-monitor-badge ${isLive ? "is-live" : ""}`}>
                          {isLive ? "Current" : `${Math.round(confidence * 100)}%`}
                        </span>
                      </div>
                      <div className="nle-studio-monitor-frame" style={getCameraMonitorFrameStyle(source)}>
                        {mediaUrl ? (
                          <video
                            ref={node => {
                              thumbnailVideoRefs.current[source.id] = node;
                              if (node) {
                                applySafeMediaSource(node, mediaUrl);
                              }
                            }}
                            className="nle-thumbnail-video"
                            playsInline
                            muted
                          />
                        ) : (
                          <div className="nle-thumbnail-placeholder">Load visual</div>
                        )}
                      </div>
                      <div className="nle-studio-monitor-meta">
                        <span>Offset {Number(source.offsetSeconds || 0).toFixed(2)}s</span>
                        <span>{mappedTime >= 0 ? formatDurationLabel(mappedTime) : "Off timeline"}</span>
                      </div>
                    </article>
                  );
                })}

                <article className="nle-studio-program-card">
                  <div className="nle-studio-monitor-head">
                    <span className="nle-studio-monitor-label">Program Output</span>
                    <span className="nle-studio-rec-pill">REC</span>
                  </div>
                  <div className="nle-preview-shell nle-studio-program-shell">
                    <div
                      ref={previewStageRef}
                      className={`nle-preview-stage is-layout-${effectiveMulticamLayoutMode} ${focusPickerActive ? "is-focus-picking" : ""} ${previewStageMoodClass}`}
                      style={studioProgramStageStyle}
                    >
                      {readySources.map(source => {
                        const previewClassName = `nle-preview-video ${source.id === activeCameraId ? "is-active" : ""} ${
                          source.id === secondaryCameraId ? "is-secondary" : ""
                        }`;
                        if (isImageSource(source)) {
                          return (
                            <img
                              key={`preview-${source.id}`}
                              ref={node => {
                                previewVideoRefs.current[source.id] = node;
                                if (node) {
                                  applySafeMediaSource(node, getSourceMediaUrl(source));
                                }
                              }}
                              className={previewClassName}
                              alt={source.label || source.name || "Story visual"}
                              draggable="false"
                              style={previewVideoStylesByCameraId[source.id]}
                            />
                          );
                        }
                        return (
                          <video
                            key={`preview-${source.id}`}
                            ref={node => {
                              previewVideoRefs.current[source.id] = node;
                              if (node) {
                                applySafeMediaSource(node, getSourceMediaUrl(source));
                              }
                            }}
                            className={previewClassName}
                            playsInline
                            muted
                            style={previewVideoStylesByCameraId[source.id]}
                          />
                        );
                      })}
                      {!readySources.length ? (
                        <div className="nle-empty-state">
                          <strong>Load your first visual to start editing.</strong>
                          <span>Program output appears here once visuals are ready.</span>
                        </div>
                      ) : null}
                      {!isSingleSourceWorkflow &&
                        effectiveMulticamLayoutMode === "split-vertical" &&
                        secondaryCamera && <div className="nle-preview-split-divider" />}
                    </div>
                  </div>
                  <div className="nle-preview-toolbar nle-studio-transport">
                    <div className="nle-transport-controls">
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() => handleStepFrame(-1)}
                        disabled={!timelineDuration}
                      >
                        -1f
                      </button>
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={handlePlayPause}
                        disabled={!timelineDuration}
                      >
                        Play
                      </button>
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() => handleStepFrame(1)}
                        disabled={!timelineDuration}
                      >
                        +1f
                      </button>
                    </div>
                    <div className="nle-seek-block">
                      <input
                        type="range"
                        min={0}
                        max={timelineDuration || 0}
                        step="0.01"
                        value={playhead}
                        onChange={event => handleSeek(event.target.value)}
                      />
                      <div className="nle-time-row">
                        <span>{formatDurationLabel(playhead)}</span>
                        <span>{formatDurationLabel(timelineDuration || 0)}</span>
                      </div>
                    </div>
                    <div className="nle-preview-badges">
                      <span className="nle-chip">Lead: {activeCamera?.label || "None"}</span>
                      <span className="nle-chip nle-chip-secondary">
                        Voice bed: {deckAudioValue}
                      </span>
                      <span className="nle-chip nle-chip-secondary">
                        {isSingleSourceWorkflow ? "Cam Combiner Manual" : directorSnapshot.modeTitle}
                      </span>
                    </div>
                  </div>
                </article>
              </div>

              <div className="nle-studio-card nle-studio-timeline-card">
                <div className="nle-studio-card-header">
                  <strong>Timeline</strong>
                  <span>{formatDurationLabel(playhead)} / {formatDurationLabel(timelineDuration || 0)}</span>
                </div>
                <div className="nle-studio-timeline-legend">
                  <span>Multicam Edit</span>
                  <span>Audio locked as master</span>
                </div>
                <div className={`nle-studio-timeline-status ${cleanAudioSyncIsRunning ? "is-processing" : ""}`}>
                  <strong>{backendTimelineStatus.title}</strong>
                  <span>{backendTimelineStatus.detail}</span>
                  {cleanAudioSyncJob?.progress != null && (
                    <span className="nle-studio-timeline-progress">
                      <span
                        style={{
                          width: `${Math.max(4, Math.min(100, Number(cleanAudioSyncJob.progress || 0)))}%`,
                        }}
                      />
                    </span>
                  )}
                </div>
                <div className="nle-studio-track-grid">
                  <div className="nle-studio-track-row is-master">
                    <label>Clean Audio (Master)</label>
                    <div className="nle-studio-wave-row">
                      {studioMasterWaveformBars.length ? (
                        studioMasterWaveformBars.map((barHeight, index) => (
                          <span
                            key={`master-wave-${index}`}
                            className="nle-studio-wave-bar"
                            style={{ height: `${Math.max(10, barHeight)}%` }}
                          />
                        ))
                      ) : (
                        <span className="nle-waveform-placeholder">Master waveform waiting</span>
                      )}
                      <div
                        className="nle-playhead-marker-inline"
                        style={{
                          left: `${timelineDuration ? (playhead / timelineDuration) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {studioMonitorSlots.map((source, index) => (
                    <div
                      key={source ? `track-${source.id}` : `track-empty-${index}`}
                      className={`nle-studio-track-row ${source ? "" : "is-empty"}`}
                    >
                      <label>
                        {source ? getStudioSlotLabel(index) : getStudioSlotLabel(index)}
                        <span>
                          {source
                            ? `Offset ${Number(source.offsetSeconds || 0).toFixed(2)}s`
                            : "Waiting for source"}
                        </span>
                      </label>
                      <div className="nle-switch-track nle-studio-track-shell">
                        {source ? (
                          displaySegments
                            .filter(segment => segment.cameraId === source.id)
                            .map(segment => (
                              <button
                                key={`track-segment-${segment.id}`}
                                type="button"
                                className={`nle-switch-segment ${
                                  selectedSwitchId === segment.id ? "is-selected" : ""
                                }`}
                                style={{
                                  left: `${segment.startPercent}%`,
                                  width: `${segment.widthPercent}%`,
                                  background: `${getCameraColor(source.id, readySources.length ? readySources : sources)}cc`,
                                }}
                                onClick={() => {
                                  setSelectedSwitchId(segment.id);
                                  handleSeek(segment.startTime || segment.timelineStart);
                                }}
                              >
                                <span>{segment.label}</span>
                              </button>
                            ))
                        ) : (
                          <div className="nle-studio-track-placeholder">No cuts yet</div>
                        )}
                        <div
                          className="nle-playhead-marker-inline"
                          style={{
                            left: `${timelineDuration ? (playhead / timelineDuration) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="nle-studio-track-row is-program">
                    <label>Program Output</label>
                    <div className="nle-switch-track nle-studio-track-shell">
                      {displaySegments.map(segment => (
                        <button
                          key={`program-segment-${segment.id}`}
                          type="button"
                          className={`nle-switch-segment ${
                            selectedSwitchId === segment.id ? "is-selected" : ""
                          }`}
                          style={{
                            left: `${segment.startPercent}%`,
                            width: `${segment.widthPercent}%`,
                          }}
                          onClick={() => {
                            setSelectedSwitchId(segment.id);
                            handleSeek(segment.startTime || segment.timelineStart);
                          }}
                        >
                          <span>{segment.label}</span>
                        </button>
                      ))}
                      <div
                        className="nle-playhead-marker-inline"
                        style={{
                          left: `${timelineDuration ? (playhead / timelineDuration) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="nle-studio-event-row">
                  {studioEventChips.map(chip => (
                    <span key={chip.id} className="nle-studio-event-chip">
                      <strong>{chip.label}</strong>
                      <span>{chip.time}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="nle-studio-card nle-studio-deck-card">
                <div className="nle-studio-card-header">
                  <strong>Program Check Deck</strong>
                  <span>
                    {manualRenderEditsEnabled
                      ? "Manual render edits are ON."
                      : "Preview-only. Render plan stays unchanged."}
                  </span>
                </div>
                <div className="nle-render-safety-toggle">
                  <button
                    type="button"
                    className={`nle-mini-btn ${manualRenderEditsEnabled ? "nle-mini-btn-accent" : ""}`}
                    onClick={() => {
                      setManualRenderEditsEnabled(value => !value);
                      setPreviewProgramOverride(null);
                      setStatusMessage(
                        manualRenderEditsEnabled
                          ? "Manual render edits off. Camera/layout buttons are preview-only again."
                          : "Manual render edits on. Camera/layout buttons will change the final render plan."
                      );
                    }}
                  >
                    {manualRenderEditsEnabled ? "Manual edits affect render" : "Preview only"}
                  </button>
                  {previewProgramOverride ? (
                    <button
                      type="button"
                      className="nle-mini-btn"
                      onClick={() => {
                        setPreviewProgramOverride(null);
                        setStatusMessage("Preview override cleared. Program Output follows the render plan again.");
                      }}
                    >
                      Follow render plan
                    </button>
                  ) : null}
                </div>
                <div className="nle-live-switch-deck is-studio-deck">
                  {studioMonitorSlots.map((source, index) => (
                    <button
                      key={source ? `deck-main-${source.id}` : `deck-empty-${index}`}
                      type="button"
                      className={`nle-live-switch-btn ${
                        source?.id === activeCameraId ? "is-live" : ""
                      } ${source ? "" : "is-disabled"}`}
                      onClick={() => {
                        if (source) {
                          handleRecordSwitch(source.id);
                        } else {
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      <strong>
                        {source ? getStudioSlotLabel(index) : getStudioSlotLabel(index)}
                      </strong>
                      <span>{index + 1}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`nle-live-switch-btn ${multicamLayoutMode === "scene-grid" ? "is-live" : ""}`}
                    onClick={() => activateManualLayoutMode("scene-grid", "Wide view is live in Program Output.")}
                  >
                    <strong>Wide</strong>
                    <span>W</span>
                  </button>
                  <button
                    type="button"
                    className={`nle-live-switch-btn ${multicamLayoutMode === "pip" ? "is-live" : ""}`}
                    onClick={() =>
                      activateManualLayoutMode(
                        "pip",
                        "Reaction window is now manual. Auto Director is paused until you re-arm it."
                      )
                    }
                  >
                    <strong>Reaction</strong>
                    <span>R</span>
                  </button>
                  <button
                    type="button"
                    className={`nle-live-switch-btn ${multicamLayoutMode === "scene-grid" ? "is-live" : ""}`}
                    onClick={() =>
                      activateManualLayoutMode(
                        "scene-grid",
                        "Show Everyone is now manual. Auto Director is paused until you re-arm it."
                      )
                    }
                  >
                    <strong>Show Everyone</strong>
                    <span>Grid</span>
                  </button>
                  <button
                    type="button"
                    className={`nle-live-switch-btn ${multicamLayoutMode === "split-vertical" ? "is-live" : ""}`}
                    onClick={() =>
                      activateManualLayoutMode(
                        "split-vertical",
                        "Shared-moment split is now manual. Auto Director is paused until you re-arm it."
                      )
                    }
                  >
                    <strong>Shared Moment</strong>
                    <span>Dual</span>
                  </button>
                  <button
                    type="button"
                    className={`nle-live-switch-btn is-accent ${autoDirectorEnabled ? "is-live" : ""}`}
                    onClick={() => handleRunQuickAction("multi-smart")}
                  >
                    <strong>Auto Direct</strong>
                    <span>AI</span>
                  </button>
                </div>

                {selectedManualSwitch && manualRenderEditsEnabled && (
                  <div className="nle-manual-cut-panel is-studio-panel">
                    <div className="nle-manual-cut-header">
                      <div>
                        <strong>
                          Selected cut:{" "}
                          {selectedManualSwitch.layoutMode && selectedManualSwitch.layoutMode !== "cut"
                            ? MANUAL_TIMELINE_LAYOUT_LABELS[selectedManualSwitch.layoutMode]
                            : readySources.find(source => source.id === selectedManualSwitch.cameraId)?.label ||
                              selectedManualSwitch.cameraId}
                        </strong>
                        <span>
                          Starts at {formatDurationLabel(Number(selectedManualSwitch.startTime || 0))}
                        </span>
                      </div>
                      <div className="nle-sync-actions">
                        <button
                          className="nle-mini-btn"
                          type="button"
                          onClick={() => handleNudgeSelectedSwitch(-0.1)}
                          disabled={Number(selectedManualSwitch.startTime || 0) <= 0.001}
                        >
                          -0.1s
                        </button>
                        <button
                          className="nle-mini-btn"
                          type="button"
                          onClick={() => handleNudgeSelectedSwitch(0.1)}
                          disabled={Number(selectedManualSwitch.startTime || 0) <= 0.001}
                        >
                          +0.1s
                        </button>
                        <button
                          className="nle-mini-btn nle-mini-btn-accent"
                          type="button"
                          onClick={() => handleRemoveSwitch(selectedManualSwitch.id)}
                          disabled={Number(selectedManualSwitch.startTime || 0) <= 0.001}
                        >
                          Delete Cut
                        </button>
                      </div>
                    </div>
                    <div className="nle-manual-cut-camera-row">
                      {studioMonitorSlots.filter(Boolean).map((source, index) => (
                        <button
                          key={`studio-selected-cut-camera-${source.id}`}
                          type="button"
                          className={`nle-mini-btn ${
                            selectedManualSwitch.cameraId === source.id ? "nle-mini-btn-accent" : ""
                          }`}
                          onClick={() => handleAssignSelectedSwitchCamera(source.id)}
                        >
                          {getStudioSlotLabel(index)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {renderCloudRenderWindowPanel()}

                <div className="nle-footer-grid is-studio-footer">
                  <div className="nle-footer-note">
                    <strong>Cam Combiner</strong>
                    <span>
                      Original audio stays continuous. Add more camera angles, lock offsets, then
                      cut manually while AI only assists.
                    </span>
                  </div>
                  <div className="nle-footer-actions">
                    <button
                      className="nle-btn secondary"
                      type="button"
                      onClick={handleResetManualSwitchPlan}
                      disabled={!timelineDuration}
                    >
                      Reset Cuts
                    </button>
                    <button
                      className="nle-btn"
                      type="button"
                      onClick={handleServerExport}
                      disabled={isExporting || !canExportProject || isSingleSourceWorkflow}
                    >
                      {serverExportPending
                        ? "Server Rendering..."
                        : hasExternalCleanAudio
                          ? `Render Clean Audio MP4 (${multicamRenderCreditEstimate} cr)`
                          : `Render MP4 on Server (${multicamRenderCreditEstimate} cr)`}
                    </button>
                    <button
                      className="nle-btn secondary"
                      type="button"
                      onClick={handleExport}
                      disabled={isExporting || !canExportProject}
                    >
                      Render WebM in Browser
                    </button>
                  </div>
                </div>

                {isExporting ? (
                  <div className="nle-export-progress">
                    <div
                      className="nle-export-progress-bar"
                      style={{ width: `${Math.round(exportProgress * 100)}%` }}
                    />
                    <span className="nle-export-progress-label">
                      {Math.round(exportProgress * 100)}%
                    </span>
                  </div>
                ) : null}

                {exportResult ? (
                  <div className="nle-export-result">
                    <strong>Multicam master ready</strong>
                    <span>
                      {exportResult.isServerRender
                        ? "Server render is available as MP4. Download it or continue into the editor."
                        : "The browser render is available as WebM. Download it or continue into the editor."}
                    </span>
                    <div className="nle-export-actions">
                      <a
                        className="nle-btn secondary"
                        href={exportResult.url}
                        download={exportResult.file?.name || exportResult.file}
                        target={exportResult.isServerRender ? "_blank" : undefined}
                        rel={exportResult.isServerRender ? "noopener noreferrer" : undefined}
                      >
                        Download Master
                      </a>
                      <button className="nle-btn" type="button" onClick={handleUseExportInEditor}>
                        Use This Master
                      </button>
                    </div>
                  </div>
                ) : null}

                {renderRecentRendersPanel()}

                {statusMessage ? <div className="nle-status-banner">{statusMessage}</div> : null}
              </div>
            </section>

            <aside className={`nle-studio-sidebar nle-studio-sidebar-right ${rightStudioRailCollapsed ? "is-collapsed" : ""}`}>
              <button
                type="button"
                className="nle-studio-rail-toggle is-right"
                onClick={() => setRightStudioRailCollapsed(value => !value)}
                aria-label={rightStudioRailCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
              >
                {rightStudioRailCollapsed ? "‹" : "›"}
              </button>
              {!rightStudioRailCollapsed && (
                <>
                  <div className="nle-studio-card nle-studio-assist-card">
                    <div className="nle-studio-card-header">
                      <strong>AI Director Assist</strong>
                      <span>{autoDirectorEnabled ? "Live" : "Manual"}</span>
                    </div>
                    <div className="nle-studio-ai-section">
                      <label>Speaker Analysis</label>
                      {studioSpeakerRows.map(row => (
                        <div key={`speaker-${row.id}`} className="nle-studio-speaker-row">
                          <div className="nle-studio-speaker-copy">
                            <strong>
                              {row.label}
                              {row.isCurrent ? " (Current)" : ""}
                            </strong>
                            <span>{Math.round(row.confidence * 100)}%</span>
                          </div>
                          <div className="nle-director-meter-track">
                            <div
                              className={`nle-director-meter-fill ${row.isCurrent ? "is-lead" : "is-companion"}`}
                              style={{ width: `${Math.round(row.confidence * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="nle-studio-ai-section">
                      <label>Suggested Action</label>
                      <strong>{studioSuggestedAction.label}</strong>
                      <span>{studioSuggestedAction.detail}</span>
                    </div>
                    <div className="nle-studio-ai-actions">
                      <button
                        className="nle-btn"
                        type="button"
                        onClick={() => {
                          if (studioSuggestedAction.actionId) {
                            handleRunQuickAction(studioSuggestedAction.actionId);
                          } else if (studioUpcomingSpeaker) {
                            handleRecordSwitch(studioUpcomingSpeaker.id);
                          }
                        }}
                      >
                        Accept
                      </button>
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() => {
                          setAutoDirectorEnabled(false);
                          setMulticamLayoutMode(currentMode => (currentMode === "smart" ? "cut" : currentMode));
                          setStatusMessage("AI suggestion ignored. Manual director still has control.");
                        }}
                      >
                        Ignore
                      </button>
                    </div>
                    <label className="nle-clean-audio-toggle is-studio-toggle">
                      <input
                        type="checkbox"
                        checked={autoDirectorEnabled}
                        onChange={event => {
                          setAutoDirectorEnabled(event.target.checked);
                          setMulticamLayoutMode(currentMode =>
                            event.target.checked ? "smart" : currentMode === "smart" ? "cut" : currentMode
                          );
                        }}
                      />
                      <span>Auto Follow Suggestions</span>
                    </label>
                  </div>

                  <div className="nle-studio-card nle-studio-sync-card">
                    <div className="nle-studio-card-header">
                      <strong>Sync + Offset</strong>
                      <span>{hasExternalCleanAudio ? "Clean audio master" : "Manual sync"}</span>
                    </div>
                <div className="nle-panel-actions">
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={() => externalAudioInputRef.current?.click()}
                  >
                    {externalAudioTrack ? "Replace Clean Audio" : "Upload Clean Audio"}
                  </button>
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleSyncAllCamerasToExternalAudio}
                    disabled={!externalAudioUrl || syncingCameraId}
                  >
                    Sync to Clean Audio
                  </button>
                </div>
                <label className="nle-clean-audio-toggle is-studio-toggle">
                  <input
                    type="checkbox"
                    checked={useExternalCleanAudio}
                    disabled={!externalAudioTrack}
                    onChange={event => {
                      if (event.target.checked && !externalAudioTrack) {
                        toast.error("Upload external clean audio first.");
                        return;
                      }
                      setUseExternalCleanAudio(event.target.checked);
                    }}
                  />
                  <span>Audio locked as master</span>
                </label>
                {shouldUseBackendCleanAudioSync && (
                  <p className="nle-clean-audio-tip is-warning">
                    Large project: AutoPromote will use the safer server-side sync path when preview or export needs it.
                  </p>
                )}
                {studioMonitorSlots.map((source, index) => {
                  if (!source) {
                    return (
                      <div key={`offset-empty-${index}`} className="nle-studio-offset-card is-empty">
                        <div className="nle-studio-offset-head">
                          <strong>Camera {index + 1}</strong>
                          <span className="nle-camera-badge">Empty</span>
                        </div>
                        <button
                          className="nle-btn secondary"
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Load Visual
                        </button>
                      </div>
                    );
                  }
                  const mediaUrl = getSourceMediaUrl(source);
                  const syncUsesCleanAudio = hasExternalCleanAudio;
                  const syncDisabled =
                    !mediaUrl ||
                    !isVideoSource(source) ||
                    syncingCameraId === source.id ||
                    (syncUsesCleanAudio ? !externalAudioUrl : source.id === masterAudioCameraId);
                  return (
                    <div key={`offset-${source.id}`} className="nle-studio-offset-card">
                      <div className="nle-studio-offset-head">
                        <strong>{getStudioSlotLabel(index)}</strong>
                        <span className={`nle-camera-badge ${source.backendSyncStatus === "synced" ? "is-live" : ""}`}>
                          {source.backendSyncStatus
                            ? String(source.backendSyncStatus).replace(/_/g, " ")
                            : source.manualOffsetLocked
                              ? "manual lock"
                              : "review"}
                        </span>
                      </div>
                      <div className="nle-field-grid">
                        <label className="nle-field-block">
                          <span>Offset Seconds</span>
                          <input
                            className="nle-input"
                            type="number"
                            step="0.05"
                            value={Number(source.offsetSeconds) || 0}
                            onChange={event => handleOffsetChange(source.id, event.target.value)}
                          />
                        </label>
                        <label className="nle-field-block nle-radio-block">
                          <span>Use Audio</span>
                          <input
                            type="radio"
                            checked={masterAudioCameraId === source.id}
                            onChange={() => setMasterAudioCameraId(source.id)}
                            disabled={!mediaUrl || !isVideoSource(source)}
                          />
                        </label>
                      </div>
                      <div className="nle-sync-actions">
                        <button className="nle-mini-btn" type="button" onClick={() => handleNudgeOffset(source.id, -1)}>
                          -1
                        </button>
                        <button className="nle-mini-btn" type="button" onClick={() => handleNudgeOffset(source.id, -0.1)}>
                          -0.1
                        </button>
                        <button className="nle-mini-btn" type="button" onClick={() => handleNudgeOffset(source.id, 0.1)}>
                          +0.1
                        </button>
                        <button className="nle-mini-btn" type="button" onClick={() => handleNudgeOffset(source.id, 1)}>
                          +1
                        </button>
                      </div>
                      <div className="nle-sync-actions">
                        <button
                          className="nle-mini-btn nle-mini-btn-accent"
                          type="button"
                          onClick={() =>
                            setSources(currentSources =>
                              currentSources.map(currentSource =>
                                currentSource.id === source.id
                                  ? { ...currentSource, manualOffsetLocked: true }
                                  : currentSource
                              )
                            )
                          }
                        >
                          Lock Offset
                        </button>
                        <button
                          className="nle-mini-btn"
                          type="button"
                          onClick={() =>
                            setSources(currentSources =>
                              currentSources.map(currentSource =>
                                currentSource.id === source.id
                                  ? {
                                      ...currentSource,
                                      offsetSeconds: 0,
                                      manualOffsetLocked: false,
                                      backendSyncStatus: null,
                                      backendSyncWarning: null,
                                    }
                                  : currentSource
                              )
                            )
                          }
                        >
                          Reset Offset
                        </button>
                        <button
                          className="nle-mini-btn nle-mini-btn-accent"
                          type="button"
                          onClick={() =>
                            syncUsesCleanAudio
                              ? handleSyncCameraToExternalAudio(source.id)
                              : handleAutoSyncToMasterAudio(source.id)
                          }
                          disabled={syncDisabled}
                        >
                          {syncUsesCleanAudio ? "Check Sync" : "Sync by Audio"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        {isFlowWorkspace && (
          <>
        <div className="nle-director-deck">
          <div className="nle-director-hero-card">
            <div className="nle-director-hero-topline">
              <span className="nle-eyebrow">Live Director</span>
              <span className="nle-director-signal-pill">{liveMomentLabel}</span>
            </div>
            <h4>{directorSnapshot.modeTitle}</h4>
            <p>{directorHeroNarrative}</p>
            <div className="nle-director-hero-meta">
              <span className="nle-chip nle-chip-secondary">Mode: {workflowModeLabel}</span>
              {!isSingleSourceWorkflow && (
                <span className={`nle-chip ${autoDirectorEnabled ? "" : "nle-chip-secondary"}`}>
                  {autoDirectorEnabled ? "Auto Director armed" : "Manual override live"}
                </span>
              )}
              <span className="nle-chip">Reason: {directorSnapshot.reasonTitle}</span>
              <span className="nle-chip nle-chip-secondary">
                Confidence: {Math.round(directorConfidence * 100)}%
              </span>
              <span className="nle-chip nle-chip-secondary">Focus: {activeFocusSummary}</span>
              {!isSingleSourceWorkflow && autoDirectorSummary?.momentCount ? (
                <span className="nle-chip nle-chip-secondary">
                  Magic: {autoDirectorSummary.magicSummary}
                </span>
              ) : null}
            </div>
          </div>

          <div className="nle-director-meta-grid">
            <div className="nle-director-stat-card">
              <span>{deckPrimaryLabel}</span>
              <strong>{deckPrimaryValue}</strong>
              <small>{deckPrimaryNote}</small>
            </div>
            <div className="nle-director-stat-card">
              <span>{deckAudioLabel}</span>
              <strong>{deckAudioValue}</strong>
              <small>{deckAudioNote}</small>
            </div>
            <div className="nle-director-stat-card">
              <span>{deckTimelineLabel}</span>
              <strong>{formatDurationLabel(timelineDuration || 0)}</strong>
              <small>
                {autoDirectorSummary?.switchesCount
                  ? `${autoDirectorSummary.switchesCount} auto cuts · ${autoDirectorSummary.averageHold.toFixed(
                      1
                    )}s avg hold${autoDirectorSummary.momentCount ? ` · ${autoDirectorSummary.momentCount} magic moment${autoDirectorSummary.momentCount === 1 ? "" : "s"}` : ""}`
                  : workflowTitle}
              </small>
            </div>
            <div className="nle-director-stat-card is-output-card">
              <span>Output Stage</span>
              <strong>{outputAspectRatio}</strong>
              <div className="nle-aspect-buttons">
                {["9:16", "16:9", "1:1"].map(ar => (
                  <button
                    key={ar}
                    type="button"
                    className={`nle-aspect-btn ${outputAspectRatio === ar ? "is-active" : ""}`}
                    onClick={() => setOutputAspectRatio(ar)}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="nle-quickstart-strip">
          <div className="nle-quickstart-copy">
            <span className="nle-eyebrow">Magic Moves</span>
            <strong>
              {isSingleSourceWorkflow
                ? "One tap to shape a polished single-camera edit"
                : "One tap to direct the conversation with confidence"}
            </strong>
            <p>
              {isSingleSourceWorkflow
                ? "Start with a framing move, then refine only if you need to."
                : "Pick the conversation behavior you want first. The detailed controls stay available underneath."}
            </p>
          </div>
          <div className="nle-quickstart-actions">
            {quickActionItems.map(action => (
              <button
                key={action.id}
                type="button"
                className={`nle-quickstart-card ${action.isActive ? "is-active" : ""}`}
                onClick={() => handleRunQuickAction(action.id)}
              >
                <strong>{action.label}</strong>
                <span>{action.caption}</span>
              </button>
            ))}
          </div>
        </div>

        {isFlowWorkspace && (
          <div className="nle-flow-shell">
            <div className="nle-flow-topline">
              <div className="nle-flow-copy">
                <span className="nle-eyebrow">
                  {isSingleSourceWorkflow ? "Flow Edit / Highlight Pull" : "Flow Edit / Sync to Sound"}
                </span>
                <strong>
                  {isSingleSourceWorkflow
                    ? "Find the best moments inside one full video and mood-match them to the selected audio."
                    : "Auto-switch cameras and shape motion to the rhythm, energy, and emotion of audio."}
                </strong>
                <p>
                  {isSingleSourceWorkflow
                    ? "Everything stays local during preview. Upload a soundtrack or use the original voice bed; Flow Edit will build contrast, breathing room, punch-ins, and release moments instead of dragging one continuous take."
                    : "Everything stays local during preview. Bring your boring audio if you want to. We will still shape the mood, pace, and contrast so the edit feels smarter than the source material had any right to feel."}
                </p>
              </div>
              <div className="nle-flow-status-stack">
                {FLOW_EDIT_STATUS_STEPS.map(step => (
                  <span
                    key={step}
                    className={`nle-flow-status-pill ${
                      flowEditStatusStep === step
                        ? "is-active"
                        : flowEditStatusStep && FLOW_EDIT_STATUS_STEPS.indexOf(flowEditStatusStep) > FLOW_EDIT_STATUS_STEPS.indexOf(step)
                          ? "is-complete"
                          : ""
                    }`}
                  >
                    {step}
                  </span>
                ))}
              </div>
            </div>

            <div className="nle-flow-grid">
              <div className="nle-flow-card">
                <div className="nle-flow-card-header">
                  <div>
                    <strong>Audio Driver</strong>
                    <span>{flowAudioTrack?.name || masterAudioSource?.label || "Choose the soundtrack for Flow Edit."}</span>
                  </div>
                  {flowAudioUrl && <span className="nle-chip nle-chip-secondary">Ready</span>}
                </div>
                <div className="nle-flow-action-row">
                  <input
                    ref={flowAudioInputRef}
                    type="file"
                    accept="audio/*,video/*"
                    className="nle-hidden-input"
                    onChange={event => {
                      handleLoadFlowAudioFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleUseMasterAudioForFlow}
                    disabled={!masterAudioSource || !isVideoSource(masterAudioSource)}
                  >
                    Use Master Audio
                  </button>
                  <button className="nle-btn secondary" type="button" onClick={() => flowAudioInputRef.current?.click()}>
                    Upload Audio / Video
                  </button>
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleClearFlowAudio}
                    disabled={!flowAudioTrack}
                  >
                    Clear
                  </button>
                </div>
                {flowAudioUrl && (
                  <div className="nle-flow-sound-check">
                    <div>
                      <strong>Sound Check</strong>
                      <span>
                        This plays the exact Flow Edit soundtrack with native browser controls. If captions move but this is silent, check tab/site/system output.
                      </span>
                    </div>
                    {flowAudioIsVideoSoundtrack ? (
                      <SafeVideo
                        controls
                        playsInline
                        preload="metadata"
                        src={getSafeMediaSource(flowAudioUrl)}
                        onLoadedMetadata={event => forceMediaAudible(event.currentTarget)}
                        onPlay={event => forceMediaAudible(event.currentTarget)}
                        onVolumeChange={event => forceMediaAudible(event.currentTarget)}
                      />
                    ) : (
                      <SafeAudio
                        controls
                        preload="metadata"
                        src={getSafeMediaSource(flowAudioUrl)}
                        onLoadedMetadata={event => forceMediaAudible(event.currentTarget)}
                        onPlay={event => forceMediaAudible(event.currentTarget)}
                        onVolumeChange={event => forceMediaAudible(event.currentTarget)}
                      />
                    )}
                    <div className="nle-flow-sound-check-actions">
                      <button className="nle-btn secondary" type="button" onClick={handleTestBrowserAudio}>
                        Test Browser Sound
                      </button>
                      <button className="nle-btn secondary" type="button" onClick={handleForcePlayFlowSound}>
                        Force Play Soundtrack
                      </button>
                    </div>
                  </div>
                )}
                <div className="nle-flow-source-note">
                  {flowEditInsight ||
                    "Music, speech, choir, and ambient beds each trigger different pacing logic. Image slides can ride the same soundtrack with story-style motion."}
                </div>
              </div>

              <div className="nle-flow-card">
                <div className="nle-flow-card-header">
                  <div>
                    <strong>Editing Style</strong>
                    <span>Generate one version or flip between Smooth, Hype, and Cinematic.</span>
                  </div>
                  <span className="nle-chip nle-chip-secondary">
                    {flowEditEnabled ? "Preview live" : "Optional layer"}
                  </span>
                </div>
                <div className="nle-flow-template-block">
                  <div className="nle-flow-template-copy">
                    <strong>AI Aura Template</strong>
                    <span>Pick the creative director vibe first. It shapes motion, polish, transitions, and overall pressure.</span>
                  </div>
                  <div className="nle-flow-style-row nle-flow-template-row">
                    {FLOW_AURA_TEMPLATE_PRESETS.map(template => (
                      <button
                        key={template.id}
                        type="button"
                        className={`nle-flow-style-card ${flowAuraTemplateId === template.id ? "is-active" : ""}`}
                        onClick={() => handleApplyFlowAuraTemplate(template.id)}
                      >
                        <strong>{template.label}</strong>
                        <span>{template.summary}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="nle-flow-style-row">
                  {FLOW_EDIT_STYLE_PRESETS.map(style => (
                    <button
                      key={style.id}
                      type="button"
                      className={`nle-flow-style-card ${flowEditStyleId === style.id ? "is-active" : ""}`}
                      onClick={() => handleApplyFlowVariant(style.id)}
                    >
                      <strong>{style.label}</strong>
                      <span>{style.summary}</span>
                    </button>
                  ))}
                </div>
                {(isImageStoryEligible || isImageStoryFlow) && (
                  <div className="nle-flow-template-block">
                    <div className="nle-flow-template-copy">
                      <strong>Image Story Template</strong>
                      <span>Choose the kind of magic you want the soundtrack to pull out of your images.</span>
                    </div>
                    <div className="nle-flow-style-row nle-flow-template-row">
                      {IMAGE_STORY_TEMPLATE_PRESETS.map(template => (
                        <button
                          key={template.id}
                          type="button"
                          className={`nle-flow-style-card ${flowImageStoryTemplateId === template.id ? "is-active" : ""}`}
                          onClick={() => handleApplyImageStoryTemplate(template.id)}
                        >
                          <strong>{template.label}</strong>
                          <span>{template.summary}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {flowEditVariants.length > 0 && (
                  <div className="nle-flow-variant-row">
                    {flowEditVariants.map(variant => (
                      <div key={variant.id} className="nle-flow-variant-chip">
                        <strong>{variant.label}</strong>
                        <span>
                          {variant.clipCount} cuts · {variant.audioType}
                          {variant.rescueMode
                            ? ` · ${variant.rescueFinishMode === "premium rescue" ? "premium rescue" : "rescue"}`
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="nle-flow-action-row">
                  <button
                    className="nle-btn"
                    type="button"
                    onClick={handleGenerateFlowEdit}
                    disabled={
                      isGeneratingFlowEdit ||
                      (!(
                        readySources.length >= 2 ||
                        (readySources.length === 1 && isVideoSource(readySources[0]))
                      ))
                    }
                  >
                    {isGeneratingFlowEdit ? "Generating..." : "Flow Edit"}
                  </button>
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleDisableFlowEdit}
                    disabled={!flowEditEnabled}
                  >
                    Disable Flow
                  </button>
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleSplitFlowAtPlayhead}
                    disabled={!flowEditEnabled || !currentFlowSegment}
                  >
                    Add Cut at Playhead
                  </button>
                  <button
                    className={`nle-btn secondary ${flowIntensityMode === "harder" ? "is-hot" : ""}`}
                    type="button"
                    onClick={toggleFlowIntensityMode}
                  >
                    {flowIntensityMode === "harder" ? "Impact On" : "Hit Harder"}
                  </button>
                </div>
              </div>

              <div className="nle-flow-card nle-flow-card-stats">
                <div className="nle-flow-card-header">
                  <div>
                    <strong>Flow Signals</strong>
                    <span>Beat map, energy zones, and auto-switch confidence for the current pass.</span>
                  </div>
                  {flowEditPlan?.audioType && (
                    <span className="nle-chip">{flowEditPlan.audioType}</span>
                  )}
                  {flowEditPlan?.rescueMode && (
                    <span className="nle-chip nle-chip-secondary">
                      {flowEditPlan?.rescueFinishMode === "premium rescue" ? "Premium rescue" : "Mismatch rescue"}
                    </span>
                  )}
                </div>
                <div className="nle-flow-metric-grid">
                  <div className="nle-director-stat-card">
                    <span>Beat Markers</span>
                    <strong>{flowBeatCount}</strong>
                    <small>{flowEditWarning || "Beat and timing cues detected for this timeline."}</small>
                  </div>
                  <div className="nle-director-stat-card">
                    <span>Energy Zones</span>
                    <strong>{flowEnergyZoneCount}</strong>
                    <small>Low, build, peak, and release lanes shape the cut density.</small>
                  </div>
                  <div className="nle-director-stat-card">
                    <span>Generated Cuts</span>
                    <strong>{flowEditPlan?.segments?.length || 0}</strong>
                    <small>
                      {flowEditPlan?.rescuePolishSummary ||
                        flowEditPlan?.rescueSummary ||
                        "Every segment keeps manual override available after generation."}
                    </small>
                  </div>
                  {flowEditPlan?.loopsAudio && (
                    <div className="nle-director-stat-card">
                      <span>Audio Bed</span>
                      <strong>Looping</strong>
                      <small>Short soundtrack will repeat smoothly until the full edit finishes.</small>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="nle-container" ref={scrollContainerRef}>
          <div className="nle-preview-panel" ref={previewPanelRef}>
            <div className="nle-stage-command-bar">
              <div className="nle-stage-command-copy">
                <span className="nle-stage-kicker">{stageKickerLabel}</span>
                <strong>{liveMomentLabel}</strong>
                <p>{stageCommandSummary}</p>
              </div>
              {!isSingleSourceWorkflow && (
                <div className="nle-stage-command-actions">
                  {MULTICAM_LAYOUT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      className={`nle-layout-mode-btn ${multicamLayoutMode === option.id ? "is-active" : ""}`}
                      onClick={() => {
                        setMulticamLayoutMode(option.id);
                        // Also apply to the currently selected flow segment
                        if (selectedFlowSegmentId) {
                          updateFlowPlanSegments(segments =>
                            segments.map(seg =>
                              seg.id === selectedFlowSegmentId
                                ? { ...seg, layoutMode: option.id }
                                : seg
                            )
                          );
                        }
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="nle-preview-shell">
              <div
                ref={previewStageRef}
                className={`nle-preview-stage is-layout-${effectiveMulticamLayoutMode} ${focusPickerActive ? "is-focus-picking" : ""} ${previewStageMoodClass}`}
                style={previewStageStyle}
                onClick={handlePreviewStageFocusPick}
              >
                <div className="nle-stage-live-overlay">
                  <div className="nle-stage-overlay-cluster">
                    <span className="nle-stage-live-pill">LIVE</span>
                    <span className="nle-stage-overlay-text">{directorSnapshot.modeTitle}</span>
                    {flowEditEnabled && flowEditPlan?.audioType && (
                      <span className="nle-stage-overlay-text">
                        Flow {flowEditPlan.audioType} · {activeFlowAuraPreset.label}
                      </span>
                    )}
                  </div>
                  <div className="nle-stage-overlay-cluster is-right">
                    <span className="nle-stage-overlay-text">
                      {Math.round(directorSnapshot.temperature * 100)}% heat ·{" "}
                      {Math.round(directorConfidence * 100)}% sure
                    </span>
                    {currentFlowSegment && (
                      <span className="nle-stage-overlay-text">
                        {currentFlowSegment.energyZone} · {Number(currentFlowSegment.playbackRate || 1).toFixed(2)}x
                      </span>
                    )}
                  </div>
                </div>
                {readySources.map(source => {
                  const previewClassName = `nle-preview-video ${source.id === activeCameraId ? "is-active" : ""} ${
                    source.id === secondaryCameraId ? "is-secondary" : ""
                  }`;
                  if (isImageSource(source)) {
                    return (
                      <img
                        key={`preview-${source.id}`}
                        ref={node => {
                          previewVideoRefs.current[source.id] = node;
                          if (node) {
                            applySafeMediaSource(node, getSourceMediaUrl(source));
                          }
                        }}
                        className={previewClassName}
                        alt={source.label || source.name || "Story visual"}
                        draggable="false"
                        style={previewVideoStylesByCameraId[source.id]}
                      />
                    );
                  }
                  return (
                    <video
                      key={`preview-${source.id}`}
                      ref={node => {
                        previewVideoRefs.current[source.id] = node;
                        if (node) {
                          applySafeMediaSource(node, getSourceMediaUrl(source));
                        }
                      }}
                      className={previewClassName}
                      playsInline
                      muted
                      style={previewVideoStylesByCameraId[source.id]}
                    />
                  );
                })}
                {!readySources.length ? (
                  <div className="nle-empty-state">
                    <strong>Load your first visual to start editing.</strong>
                    <span>
                      Start with a full recording, a stack of image slides, or mix both when you
                      want story-style pacing.
                    </span>
                  </div>
                ) : null}
                {edgeBlurStyle && <div style={edgeBlurStyle} />}
                {vignetteStyle && <div style={vignetteStyle} />}
                {flowTransitionOverlayStyle && (
                  <div
                    className="nle-preview-transition-overlay"
                    style={flowTransitionOverlayStyle}
                  />
                )}
                {overlayStyle && <div style={overlayStyle} />}
                {grainStyle && <div style={grainStyle} />}
                {letterboxStyle && (
                  <>
                    <div style={letterboxStyle.top} />
                    <div style={letterboxStyle.bottom} />
                  </>
                )}
                {fadeStyle && <div style={fadeStyle} />}
                {!isSingleSourceWorkflow &&
                  effectiveMulticamLayoutMode === "split-vertical" &&
                  secondaryCamera && <div className="nle-preview-split-divider" />}
                {!isSingleSourceWorkflow &&
                  effectiveMulticamLayoutMode === "scene-grid" &&
                  visibleLayoutCameras.length > 0 && (
                    <>
                      {visibleLayoutCameras.map((camera, index) => {
                        const viewport = getSceneGridViewports(
                          100,
                          100,
                          visibleLayoutCameras.length
                        )[index];
                        if (!viewport) return null;
                        return (
                          <div
                            key={`preview-label-${camera.id}`}
                            className={`nle-preview-label nle-preview-label-grid ${camera.id === activeCameraId ? "is-grid-primary" : ""}`}
                            style={{
                              left: `calc(${viewport.x}% + 12px)`,
                              top: `calc(${viewport.y}% + 12px)`,
                            }}
                          >
                            {camera.label || `Camera ${index + 1}`}
                          </div>
                        );
                      })}
                    </>
                  )}
                {!isSingleSourceWorkflow &&
                  effectiveMulticamLayoutMode !== "scene-grid" &&
                  activeCamera && (
                    <>
                      <div className="nle-preview-label nle-preview-label-primary">
                        {activeCamera.label || "Primary"}
                      </div>
                      {secondaryCamera && effectiveMulticamLayoutMode !== "cut" && (
                        <div
                          className={`nle-preview-label nle-preview-label-secondary ${effectiveMulticamLayoutMode === "pip" ? "is-pip" : "is-split"}`}
                        >
                          {secondaryCamera.label || "Secondary"}
                        </div>
                      )}
                    </>
                  )}
                {isSingleSourceWorkflow && readySources.length > 0 ? (
                  <>
                    <div
                      className={`nle-focus-reticle ${focusPickerActive ? "is-picking" : ""}`}
                      style={{
                        left: `${(activeFocusPoint.x * 100).toFixed(2)}%`,
                        top: `${(activeFocusPoint.y * 100).toFixed(2)}%`,
                      }}
                    />
                    {focusPickerActive && (
                      <div className="nle-focus-hint">
                        Click the face or body you want this segment to punch into.
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            <div className="nle-preview-toolbar">
              <div className="nle-transport-controls">
                <button
                  className="nle-btn secondary"
                  type="button"
                  onClick={() => handleStepFrame(-1)}
                  disabled={!timelineDuration}
                  title="Step back one frame"
                >
                  -1f
                </button>
                <button
                  className="nle-btn secondary"
                  type="button"
                  onClick={handlePlayPause}
                  disabled={!timelineDuration}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  className="nle-btn secondary"
                  type="button"
                  onClick={() => handleStepFrame(1)}
                  disabled={!timelineDuration}
                  title="Step forward one frame"
                >
                  +1f
                </button>
              </div>
              <div className="nle-seek-block">
                <input
                  type="range"
                  min="0"
                  max={timelineDuration || 0}
                  step="0.01"
                  value={Math.min(playhead, timelineDuration || 0)}
                  onChange={event => handleSeek(event.target.value)}
                  disabled={!timelineDuration}
                />
                <div className="nle-time-row">
                  <span>{formatDurationLabel(playhead)}</span>
                  <span>{formatDurationLabel(timelineDuration || 0)}</span>
                </div>
              </div>
              <div className="nle-preview-badges">
                <span className="nle-chip">Lead: {activeCamera?.label || "None"}</span>
                <span className="nle-chip nle-chip-secondary">
                  Voice bed: {masterAudioSource?.label || "None"}
                </span>
                {!isSingleSourceWorkflow && (
                  <span className="nle-chip nle-chip-secondary">
                    Director mode: {directorSnapshot.modeTitle}
                  </span>
                )}
                {isSingleSourceWorkflow && (
                  <span className="nle-chip nle-chip-secondary">
                    Focus:{" "}
                    {focusPickerActive
                      ? "Pick in preview"
                      : selectedSingleCamFraming.zoom > 1.01
                        ? "Punch-in active"
                        : "Two shot"}
                  </span>
                )}
                {/* Effects toggle */}
                <button
                  type="button"
                  className={`cep-toggle-btn ${showEffectsPanel ? "is-active" : ""}`}
                  onClick={() => setShowEffectsPanel(v => !v)}
                  title="Toggle Cinematic Effects"
                  style={{ fontSize: "12px", padding: "5px 10px" }}
                >
                  {hasEffects && <span className="cep-dot" />}✨{" "}
                  {showEffectsPanel ? "Hide FX" : "Effects"}
                </button>
              </div>
            </div>

            <div className="nle-layout-control-row">
              <div className="nle-layout-insight nle-director-insight-card">
                <div className="nle-director-headline-row">
                  <div>
                    <strong>Director Console</strong>
                    <span className="nle-director-mode-title">{directorSnapshot.styleTitle}</span>
                    <span className="nle-director-mode-title">{directorSnapshot.modeTitle}</span>
                  </div>
                  <span className="nle-director-reason-pill">{directorSnapshot.reasonTitle}</span>
                </div>
                <p className="nle-director-copy">{directorSnapshot.mission}</p>
                {!isSingleSourceWorkflow && (
                  <div className="nle-layout-mode-group">
                    {DIRECTOR_STYLE_PRESETS.map(style => (
                      <button
                        key={style.id}
                        type="button"
                        className={`nle-layout-mode-btn ${directorStyleId === style.id ? "is-active" : ""}`}
                        onClick={() => setDirectorStyleId(style.id)}
                        title={style.summary}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                )}
                <p className="nle-director-copy">{directorSnapshot.narrative}</p>
                <div className="nle-director-meters">
                  <div className="nle-director-meter-card">
                    <label>Lead charge</label>
                    <div className="nle-director-meter-track">
                      <span
                        className="nle-director-meter-fill is-lead"
                        style={{ width: `${Math.round(leadEnergyScore * 100)}%` }}
                      />
                    </div>
                    <strong>{Math.round(leadEnergyScore * 100)}%</strong>
                  </div>
                  <div className="nle-director-meter-card">
                    <label>Companion charge</label>
                    <div className="nle-director-meter-track">
                      <span
                        className="nle-director-meter-fill is-companion"
                        style={{ width: `${Math.round(companionEnergyScore * 100)}%` }}
                      />
                    </div>
                    <strong>{Math.round(companionEnergyScore * 100)}%</strong>
                  </div>
                  <div className="nle-director-meter-card">
                    <label>Scene temperature</label>
                    <div className="nle-director-temperature-readout">
                      <span>{Math.round(directorSnapshot.temperature * 100)}%</span>
                      <small>
                        {directorSnapshot.temperature >= 0.7
                          ? "Voltage spike"
                          : directorSnapshot.temperature >= 0.4
                            ? "Building pressure"
                            : "Calm frame"}
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cinematic Effects Panel — appears below toolbar for multicam */}
            {showEffectsPanel && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <CinematicEffectsPanel
                  fx={fx}
                  onUpdate={(key, val) => updateFx(key, val)}
                  onApplyPreset={applyPreset}
                  onReset={resetFx}
                  hasEffects={hasEffects}
                />
              </div>
            )}
            <div className="nle-preview-scroll-rail" aria-label="Preview panel scroll controls">
              <button
                type="button"
                className="nle-preview-scroll-btn"
                onClick={() => scrollPreviewPanel(-1)}
                aria-label="Scroll preview controls up"
              >
                ↑
              </button>
              <button
                type="button"
                className="nle-preview-scroll-btn"
                onClick={() => scrollPreviewPanel(1)}
                aria-label="Scroll preview controls down"
              >
                ↓
              </button>
            </div>
          </div>

          <div className="nle-right-stack">
            {!isSingleSourceWorkflow && !isFlowWorkspace && (
              <div className={`nle-panel nle-clean-audio-panel ${hasExternalCleanAudio ? "is-active" : ""}`}>
                <div className="nle-panel-header">
                  <div>
                    <h4>External Clean Audio</h4>
                    <p>
                      Upload a Behringer/Audacity mic recording, sync it to the cameras, then let
                      the final edit use that clean sound instead of rough phone audio.
                    </p>
                  </div>
                  <div className="nle-panel-actions">
                    <input
                      ref={externalAudioInputRef}
                      type="file"
                      accept="audio/*,video/*"
                      onChange={event => {
                        handleLoadExternalAudioFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                      className="nle-hidden-input"
                    />
                    <button
                      className="nle-btn secondary"
                      type="button"
                      onClick={() => externalAudioInputRef.current?.click()}
                    >
                      {externalAudioTrack ? "Replace Clean Audio" : "Upload Clean Audio"}
                    </button>
                  </div>
                </div>

                <label className="nle-clean-audio-toggle">
                  <input
                    type="checkbox"
                    checked={useExternalCleanAudio}
                    disabled={!externalAudioTrack}
                    onChange={event => {
                      if (event.target.checked && !externalAudioTrack) {
                        toast.error("Upload external clean audio first.");
                        return;
                      }
                      setUseExternalCleanAudio(event.target.checked);
                      setStatusMessage(
                        event.target.checked
                          ? "Clean audio is now the main audio bed. Sync cameras or nudge manually."
                          : "Clean audio is parked. Camera audio is back in control."
                      );
                    }}
                  />
                  <span>Use external clean audio</span>
                </label>

                <p className="nle-clean-audio-tip">
                  For best syncing, clap once at the start of recording so AutoPromote can lock the
                  waveform spike quickly. Export will still run a safety preflight before rendering.
                </p>
                {shouldUseBackendCleanAudioSync && (
                  <p className="nle-clean-audio-tip is-warning">
                    This project is large, so AutoPromote will use the safer server-side sync path
                    when preview/export needs correction. Browser waveform matching stays off to avoid freezing Chrome or Firefox.
                  </p>
                )}
                {cleanAudioSyncJob && (
                  <div className="nle-clean-audio-job">
                    <strong>
                      {cleanAudioSyncJob.status === "ready_for_review"
                        ? "Ready for review"
                        : cleanAudioSyncJob.status === "failed"
                          ? "Sync needs attention"
                          : "Safe sync check running"}
                    </strong>
                    <span>{cleanAudioSyncJob.detail || cleanAudioSyncJob.stage || cleanAudioSyncJob.status}</span>
                    <div className="nle-clean-audio-progress">
                      <span style={{ width: `${Math.max(4, Math.min(100, Number(cleanAudioSyncJob.progress || 0)))}%` }} />
                    </div>
                  </div>
                )}

                {externalAudioTrack ? (
                  <>
                    <div className="nle-clean-audio-track">
                      <div>
                        <strong>{externalAudioTrack.name || "External clean audio"}</strong>
                        <span>
                          {formatDurationLabel(externalAudioTrack.duration || 0)} · offset{" "}
                          {(Number(externalAudioTrack.offsetSeconds) || 0).toFixed(2)}s
                        </span>
                      </div>
                      <div className="nle-waveform-strip nle-clean-audio-meter">
                        {audioAnalysisByCameraId["external-clean-audio"]?.bars?.length ? (
                          audioAnalysisByCameraId["external-clean-audio"].bars.map((height, index) => (
                            <span
                              key={`external-wave-${index}`}
                              className="nle-waveform-bar"
                              style={{ height: `${height}%` }}
                            />
                          ))
                        ) : (
                          <span className="nle-waveform-placeholder">
                            Waveform loading or manual sync mode
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nle-clean-audio-offset-row">
                      <label className="nle-field-block">
                        <span>Clean Audio Offset Seconds</span>
                        <input
                          className="nle-input"
                          type="number"
                          step="0.01"
                          value={Number(externalAudioTrack.offsetSeconds) || 0}
                          onChange={event => handleExternalAudioOffsetChange(event.target.value)}
                        />
                      </label>
                      <div className="nle-clean-audio-nudges">
                        {[-1, -0.1, 0.1, 1].map(delta => (
                          <button
                            key={`clean-nudge-${delta}`}
                            className="nle-mini-btn"
                            type="button"
                            onClick={() => handleNudgeExternalAudio(delta)}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta}s
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="nle-clean-audio-mix-grid">
                      {[
                        {
                          id: "external_only",
                          label: "External Only",
                          copy: "Clean mic becomes the final voice bed.",
                        },
                        {
                          id: "low_camera",
                          label: "Low Camera Bed",
                          copy: "Keep camera room tone quietly underneath.",
                        },
                        {
                          id: "mute_camera",
                          label: "Mute Cameras",
                          copy: "Silence all phone/camera audio.",
                        },
                      ].map(option => (
                        <button
                          key={option.id}
                          type="button"
                          className={`nle-mix-option ${externalAudioMixMode === option.id ? "is-active" : ""}`}
                          onClick={() => setExternalAudioMixMode(option.id)}
                        >
                          <strong>{option.label}</strong>
                          <span>{option.copy}</span>
                        </button>
                      ))}
                    </div>

                    <div className="nle-sync-actions">
                      <button
                        className="nle-btn"
                        type="button"
                        onClick={handleSyncAllCamerasToExternalAudio}
                        disabled={!externalAudioUrl || syncingCameraId}
                      >
                        {syncingCameraId
                          ? "Syncing..."
                          : shouldUseBackendCleanAudioSync
                            ? `Check Sync Now (${cleanAudioSyncCreditEstimate} cr)`
                            : "Auto-Sync Cameras"}
                      </button>
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={handleClearExternalAudio}
                      >
                        Clear Clean Audio
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="nle-clean-audio-empty">
                    <strong>Podcast-ready audio lane</strong>
                    <span>
                      Upload WAV, MP3, M4A, or a video file with the clean sound. If waveform sync
                      cannot lock, the manual offset controls stay available.
                    </span>
                  </div>
                )}
              </div>
            )}

            {!isSingleSourceWorkflow && (
              <div className="nle-panel nle-camera-panel">
            <div className="nle-panel-header">
              <div>
                <h4>{isFlowWorkspace ? "Flow Visuals" : cameraPanelTitle}</h4>
                <p>
                  {isFlowWorkspace
                    ? "Images and videos become the visual pool. Flow Edit times them to the uploaded soundtrack, not camera audio."
                    : cameraPanelDescription}
                </p>
              </div>
              <div className="nle-panel-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  multiple
                  onChange={event => {
                    appendFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className="nle-hidden-input"
                />
                <button
                  className="nle-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add Visual Files
                </button>
              </div>
            </div>

            <div className="nle-camera-grid">
              {visibleCameraSources.map((source, index) => {
                const mediaUrl = getSourceMediaUrl(source);
                const mappedTime = getSourceTimelineTime(
                  source,
                  playhead,
                  timelineBounds.timelineStart
                );
                const timelineAvailable =
                  mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;
                const isAvailable = isFlowWorkspace ? Boolean(mediaUrl) : timelineAvailable;
                const isExpanded = expandedCameraId === source.id;
                const sourceDisplayLabel = isFlowWorkspace
                  ? `Visual ${index + 1}`
                  : normalizeSourceLabel(source.label, index);
                const sourceStatusLabel = isFlowWorkspace
                  ? flowEditEnabled
                    ? "Timed to sound"
                    : mediaUrl
                      ? "Ready for sound"
                      : "Needs visual"
                  : isAvailable
                    ? "In sync"
                    : "Off timeline";
                const syncUsesCleanAudio = !isFlowWorkspace && hasExternalCleanAudio;
                const syncButtonDisabled = isFlowWorkspace
                  ? !mediaUrl ||
                    isGeneratingFlowEdit ||
                    syncingCameraId === source.id ||
                    (!flowAudioUrl && !masterAudioSource)
                  : !mediaUrl ||
                    !isVideoSource(source) ||
                    syncingCameraId === source.id ||
                    (syncUsesCleanAudio ? !externalAudioUrl : source.id === masterAudioCameraId);
                const syncButtonTitle = isFlowWorkspace
                  ? !mediaUrl
                    ? "Load an image or video first"
                    : !flowAudioUrl && !masterAudioSource
                      ? "Upload a Flow soundtrack or choose master audio first"
                      : "Time this visual against the uploaded Flow soundtrack"
                  : !mediaUrl
                    ? "Load a video source before syncing by audio"
                    : !isVideoSource(source)
                      ? "Images do not contain audio to sync in Cam Combiner mode"
                      : syncUsesCleanAudio
                        ? externalAudioUrl
                          ? "Check this camera against the clean audio timing"
                          : "Upload external clean audio first"
                        : source.id === masterAudioCameraId
                          ? "This source is already the selected audio source"
                          : "Match this camera to the selected audio source automatically";
                const syncButtonLabel = syncingCameraId === source.id
                  ? "Syncing..."
                  : isFlowWorkspace
                    ? "Sync to Sound"
                    : syncUsesCleanAudio
                      ? "Check Sync"
                      : "Sync by Audio";
                return (
                  <article
                    key={source.id}
                    className={`nle-camera-card ${source.id === activeCameraId ? "is-active" : ""}`}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (
                        droppedFile?.type?.startsWith("video/") ||
                        droppedFile?.type?.startsWith("image/")
                      ) {
                        handleLoadFileForCamera(source.id, droppedFile);
                      }
                    }}
                  >
                    <div className="nle-camera-header">
                      <div>
                        <strong>
                          <span
                            className="nle-camera-color-dot"
                            style={{ background: getCameraColor(source.id, sources) }}
                          />
                          {sourceDisplayLabel}
                        </strong>
                        <span>{source.name || sourceDisplayLabel}</span>
                      </div>
                      <span className={`nle-camera-badge ${isAvailable ? "is-live" : ""}`}>
                        {sourceStatusLabel}
                      </span>
                    </div>
                    <div className="nle-thumbnail-shell" style={getCameraMonitorFrameStyle(source)}>
                      {mediaUrl ? (
                        isImageSource(source) ? (
                          <img
                            ref={node => {
                              thumbnailVideoRefs.current[source.id] = node;
                              if (node) {
                                applySafeMediaSource(node, mediaUrl);
                              }
                            }}
                            className="nle-thumbnail-video"
                            alt={source.label || source.name || "Source visual"}
                            draggable="false"
                          />
                        ) : (
                          <video
                            ref={node => {
                              thumbnailVideoRefs.current[source.id] = node;
                              if (node) {
                                applySafeMediaSource(node, mediaUrl);
                              }
                            }}
                            className="nle-thumbnail-video"
                            playsInline
                            muted
                          />
                        )
                      ) : (
                        <button
                          type="button"
                          className="nle-thumbnail-placeholder nle-drop-target"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "video/*,image/*";
                            input.onchange = evt => {
                              if (evt.target.files?.[0])
                                handleLoadFileForCamera(source.id, evt.target.files[0]);
                            };
                            input.click();
                          }}
                        >
                          Click or drop image/video here
                        </button>
                      )}
                    </div>
                    {isFlowWorkspace ? (
                      <div className="nle-camera-quick-controls">
                        <div className="nle-field-block">
                          <span>Flow Role</span>
                          <strong>{isImageSource(source) ? "Story image" : "Motion visual"}</strong>
                        </div>
                        <div className="nle-field-block">
                          <span>Soundtrack</span>
                          <strong>{flowAudioUrl ? "Uploaded sound" : masterAudioSource?.label || "Choose sound"}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="nle-camera-quick-controls">
                        <label className="nle-field-block">
                          <span>Offset Seconds</span>
                          <input
                            className="nle-input"
                            type="number"
                            step="0.05"
                            value={Number(source.offsetSeconds) || 0}
                            onChange={event => handleOffsetChange(source.id, event.target.value)}
                          />
                        </label>
                        <label className="nle-field-block nle-radio-block">
                          <span>Use Audio</span>
                          <input
                            type="radio"
                            checked={masterAudioCameraId === source.id}
                            onChange={() => setMasterAudioCameraId(source.id)}
                            disabled={!mediaUrl || !isVideoSource(source)}
                          />
                        </label>
                      </div>
                    )}
                    {isExpanded && (
                      <div className="nle-camera-advanced-controls">
                        <div className="nle-waveform-strip">
                          {audioAnalysisByCameraId[source.id]?.bars?.length ? (
                            audioAnalysisByCameraId[source.id].bars.map((barHeight, barIndex) => (
                              <span
                                key={`${source.id}-wave-${barIndex}`}
                                className="nle-waveform-bar"
                                style={{ height: `${Math.round(barHeight * 100)}%` }}
                              />
                            ))
                          ) : mediaUrl ? (
                            <span className="nle-waveform-placeholder">
                              {isImageSource(source)
                                ? "Image slide ready"
                                : audioAnalysisByCameraId[source.id]?.error
                                  ? "Waveform unavailable"
                                  : "Analyzing waveform..."}
                            </span>
                          ) : (
                            <span className="nle-waveform-placeholder">
                              Load a visual to see sync hints
                            </span>
                          )}
                        </div>
                        <div className="nle-source-meta-row">
                          <span>Duration: {formatDurationLabel(source.duration || 0)}</span>
                          <span>
                            {isFlowWorkspace ? "Flow Status" : "Source Time"}:{" "}
                            {isFlowWorkspace
                              ? sourceStatusLabel
                              : isAvailable
                                ? formatDurationLabel(mappedTime)
                                : "--"}
                          </span>
                        </div>
                        {!isFlowWorkspace && (
                          <div className="nle-source-meta-row">
                            <span>
                              Sync:{" "}
                              {source.backendSyncStatus
                                ? String(source.backendSyncStatus).replace(/_/g, " ")
                                : source.manualOffsetLocked
                                  ? "manual lock"
                                  : "not solved"}
                            </span>
                            <span>
                              Confidence:{" "}
                              {Number.isFinite(Number(source.backendSyncConfidence))
                                ? `${Math.round(Number(source.backendSyncConfidence) * 100)}%`
                                : "--"}
                            </span>
                          </div>
                        )}
                        {!isFlowWorkspace && (source.backendSyncMethod || source.backendSyncWarning) && (
                          <div className="nle-source-meta-row">
                            <span>
                              Method: {source.backendSyncMethod || "manual"}
                            </span>
                            <span>
                              {source.backendSyncWarning || "Locked to shared timeline"}
                            </span>
                          </div>
                        )}
                        {isImageSource(source) && (
                          <label className="nle-field-block">
                            <span>Slide Duration</span>
                            <input
                              className="nle-input"
                              type="number"
                              step="0.25"
                              min={IMAGE_SOURCE_DURATION_MIN}
                              max={IMAGE_SOURCE_DURATION_MAX}
                              value={Number(source.duration || DEFAULT_IMAGE_SEGMENT_DURATION)}
                              onChange={event =>
                                setSources(currentSources =>
                                  currentSources.map(currentSource =>
                                    currentSource.id === source.id
                                      ? {
                                          ...currentSource,
                                          duration: normalizeImageSourceDuration(
                                            event.target.value
                                          ),
                                        }
                                      : currentSource
                                  )
                                )
                              }
                            />
                          </label>
                        )}
                        <div className="nle-sync-actions">
                          {!isFlowWorkspace && (
                            <>
                              <button
                                className="nle-mini-btn"
                                type="button"
                                onClick={() => handleNudgeOffset(source.id, -0.1)}
                                disabled={!mediaUrl}
                              >
                                -0.1s
                              </button>
                              <button
                                className="nle-mini-btn"
                                type="button"
                                onClick={() => handleNudgeOffset(source.id, 0.1)}
                                disabled={!mediaUrl}
                              >
                                +0.1s
                              </button>
                              <button
                                className="nle-mini-btn nle-mini-btn-accent"
                                type="button"
                                onClick={() => handleAlignSourceStartToPlayhead(source.id)}
                                disabled={!mediaUrl}
                                title="Align this source so its start begins at the current playhead"
                              >
                                Start Here
                              </button>
                            </>
                          )}
                          <button
                            className="nle-mini-btn nle-mini-btn-accent"
                            type="button"
                            onClick={() =>
                              isFlowWorkspace
                                ? handleSyncSourceToFlowSound(source.id)
                                : syncUsesCleanAudio
                                  ? handleSyncCameraToExternalAudio(source.id)
                                  : handleAutoSyncToMasterAudio(source.id)
                            }
                            disabled={syncButtonDisabled}
                            title={syncButtonTitle}
                          >
                            {syncButtonLabel}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="nle-camera-actions">
                      {!isFlowWorkspace && (
                        <button
                          className="nle-btn secondary"
                          type="button"
                          onClick={() => handleRecordSwitch(source.id)}
                          disabled={!timelineDuration || !mediaUrl || !isAvailable}
                          title={
                            isAvailable
                              ? "Show this visual from the current playhead"
                              : "This visual is off timeline at the current playhead"
                          }
                        >
                          Show {sourceDisplayLabel}
                          <kbd className="nle-hotkey-hint">{index + 1}</kbd>
                        </button>
                      )}
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() =>
                          isFlowWorkspace
                            ? handleSyncSourceToFlowSound(source.id)
                            : syncUsesCleanAudio
                              ? handleSyncCameraToExternalAudio(source.id)
                              : handleAutoSyncToMasterAudio(source.id)
                        }
                        disabled={syncButtonDisabled}
                        title={syncButtonTitle}
                      >
                        {syncButtonLabel}
                      </button>
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() =>
                          setExpandedCameraId(currentId =>
                            currentId === source.id ? null : source.id
                          )
                        }
                      >
                        {isExpanded ? "Hide Tune" : "Tune"}
                      </button>
                      {index > 0 && (
                        <button
                          className="nle-btn danger"
                          type="button"
                          onClick={() => handleRemoveSource(source.id)}
                          disabled={
                            isExporting ||
                            (!!mediaUrl && readySources.length <= 1) ||
                            sources.length <= 1
                          }
                          title="Remove this camera source"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
              </div>
            )}

            <div className="nle-panel nle-switch-panel">
            <div className="nle-panel-header">
              <div>
                <h4>{timelinePanelTitle}</h4>
                <p>{timelinePanelDescription}</p>
              </div>
              <div className="nle-panel-actions nle-switch-buttons">
                {isSingleSourceWorkflow && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,image/*"
                      multiple
                      onChange={event => {
                        appendFiles(event.target.files);
                        event.target.value = "";
                      }}
                      className="nle-hidden-input"
                    />
                    <button
                      className="nle-btn"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add Visual Files
                    </button>
                  </>
                )}
                {!isSingleSourceWorkflow && !flowEditEnabled && readySources.length > 1 && (
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleResetManualSwitchPlan}
                    disabled={!timelineDuration}
                    title="Clear the auto cut list and hold one camera until you place your own switches."
                  >
                    Reset Cuts
                  </button>
                )}
                {readySources.map((source, index) => (
                  <button
                    key={`switch-btn-${source.id}`}
                    className={`nle-btn ${source.id === activeCameraId ? "secondary" : ""}`}
                    type="button"
                      onClick={() => handleRecordSwitch(source.id)}
                      disabled={
                      !timelineDuration || !getSourceMediaUrl(source)
                    }
                  >
                    Show {normalizeSourceLabel(source.label, index)}
                    <kbd className="nle-hotkey-hint">
                      {sources.findIndex(s => s.id === source.id) + 1}
                    </kbd>
                  </button>
                ))}
              </div>
            </div>
            {readySources.length > 1 ? (
              <>
                <div
                  className="nle-switch-track"
                  onClick={event => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const nextPlayhead =
                      ((event.clientX - rect.left) / rect.width) * (timelineDuration || 0);
                    handleSeek(nextPlayhead);
                  }}
                >
                  {flowEditEnabled &&
                    flowEditPlan?.energyZones?.map(zone => (
                      <div
                        key={zone.id}
                        className={`nle-energy-zone nle-energy-zone-${zone.zone}`}
                        style={{
                          left: `${timelineDuration ? (zone.startTime / timelineDuration) * 100 : 0}%`,
                          width: `${timelineDuration ? ((zone.endTime - zone.startTime) / timelineDuration) * 100 : 0}%`,
                        }}
                      />
                    ))}
                  {flowEditEnabled &&
                    flowEditPlan?.beatMarkers?.map(marker => (
                      <span
                        key={marker.id}
                        className="nle-beat-marker"
                        style={{
                          left: `${timelineDuration ? (marker.time / timelineDuration) * 100 : 0}%`,
                          opacity: clampNumber(marker.strength, 0.32, 1, 0.62),
                        }}
                      />
                    ))}
                  {displaySegments.map(segment => (
                    <button
                      key={segment.id}
                      type="button"
                      className={`nle-switch-segment ${
                        (flowEditEnabled ? selectedFlowSegmentId : selectedSwitchId) === segment.id
                          ? "is-selected"
                          : ""
                      } ${flowEditEnabled ? "is-flow-segment" : ""}`}
                      style={{
                        left: `${segment.startPercent}%`,
                        width: `${segment.widthPercent}%`,
                        background: `${getCameraColor(segment.cameraId, readySources.length ? readySources : sources)}cc`,
                      }}
                      onClick={event => {
                        event.stopPropagation();
                        if (flowEditEnabled) {
                          setSelectedFlowSegmentId(segment.id);
                        } else {
                          setSelectedSwitchId(segment.id);
                        }
                        handleSeek(segment.startTime || segment.timelineStart);
                      }}
                    >
                      <span>
                        {segment.label}
                        {flowEditEnabled && segment.playbackRate
                          ? ` · ${Number(segment.playbackRate).toFixed(2)}x`
                          : ""}
                      </span>
                    </button>
                  ))}
                  <div
                    className="nle-playhead-marker-inline"
                    style={{
                      left: `${timelineDuration ? (playhead / timelineDuration) * 100 : 0}%`,
                    }}
                  />
                </div>

                <div className="nle-timeline-markers">
                  <span>{formatDurationLabel(0)}</span>
                  {timelineDuration > 2 && <span>{formatDurationLabel(timelineDuration / 2)}</span>}
                  <span>{formatDurationLabel(timelineDuration || 0)}</span>
                </div>

                {!isSingleSourceWorkflow && !flowEditEnabled && (
                  <>
                    <div className="nle-render-safety-toggle">
                      <button
                        type="button"
                        className={`nle-mini-btn ${manualRenderEditsEnabled ? "nle-mini-btn-accent" : ""}`}
                        onClick={() => {
                          setManualRenderEditsEnabled(value => !value);
                          setPreviewProgramOverride(null);
                          setStatusMessage(
                            manualRenderEditsEnabled
                              ? "Manual render edits off. Camera/layout buttons are preview-only again."
                              : "Manual render edits on. Camera/layout buttons will change the final render plan."
                          );
                        }}
                      >
                        {manualRenderEditsEnabled ? "Manual edits affect render" : "Preview only"}
                      </button>
                      <span>
                        {manualRenderEditsEnabled
                          ? "Careful: these cuts will render."
                          : "Safe sync check: camera/layout buttons do not render."}
                      </span>
                      {previewProgramOverride ? (
                        <button
                          type="button"
                          className="nle-mini-btn"
                          onClick={() => {
                            setPreviewProgramOverride(null);
                            setStatusMessage("Preview override cleared. Program Output follows the render plan again.");
                          }}
                        >
                          Follow render plan
                        </button>
                      ) : null}
                    </div>
                    <div className="nle-live-switch-deck">
                      {readySources.map((source, index) => (
                        <button
                          key={`deck-${source.id}`}
                          type="button"
                          className={`nle-live-switch-btn ${source.id === activeCameraId ? "is-live" : ""}`}
                          onClick={() => handleRecordSwitch(source.id)}
                          disabled={!timelineDuration || !getSourceMediaUrl(source)}
                        >
                          <strong>{normalizeSourceLabel(source.label, index)}</strong>
                          <span>{index + 1}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`nle-live-switch-btn ${multicamLayoutMode === "scene-grid" ? "is-live" : ""}`}
                        onClick={() => activateManualLayoutMode("scene-grid", "Wide view is live in Program Output.")}
                      >
                        <strong>Wide</strong>
                        <span>W</span>
                      </button>
                      <button
                        type="button"
                        className={`nle-live-switch-btn ${multicamLayoutMode === "pip" ? "is-live" : ""}`}
                        onClick={() =>
                          activateManualLayoutMode(
                            "pip",
                            "Reaction window is now manual. Auto Director is paused until you re-arm it."
                          )
                        }
                      >
                        <strong>Reaction</strong>
                        <span>R</span>
                      </button>
                      <button
                        type="button"
                        className={`nle-live-switch-btn ${multicamLayoutMode === "scene-grid" ? "is-live" : ""}`}
                        onClick={() =>
                          activateManualLayoutMode(
                            "scene-grid",
                            "Show Everyone is now manual. Auto Director is paused until you re-arm it."
                          )
                        }
                      >
                        <strong>Show Everyone</strong>
                        <span>Grid</span>
                      </button>
                      <button
                        type="button"
                        className={`nle-live-switch-btn ${multicamLayoutMode === "split-vertical" ? "is-live" : ""}`}
                        onClick={() =>
                          activateManualLayoutMode(
                            "split-vertical",
                            "Shared-moment split is now manual. Auto Director is paused until you re-arm it."
                          )
                        }
                      >
                        <strong>Shared Moment</strong>
                        <span>Dual</span>
                      </button>
                      <button
                        type="button"
                        className={`nle-live-switch-btn is-accent ${autoDirectorEnabled ? "is-live" : ""}`}
                        onClick={() => handleRunQuickAction("multi-smart")}
                      >
                        <strong>Auto Direct</strong>
                        <span>AI</span>
                      </button>
                    </div>

                    {selectedManualSwitch && manualRenderEditsEnabled && (
                      <div className="nle-manual-cut-panel">
                        <div className="nle-manual-cut-header">
                          <div>
                            <strong>
                              Selected cut:{" "}
                              {readySources.find(source => source.id === selectedManualSwitch.cameraId)?.label ||
                                selectedManualSwitch.cameraId}
                            </strong>
                            <span>
                              Starts at {formatDurationLabel(Number(selectedManualSwitch.startTime || 0))}
                            </span>
                          </div>
                          <div className="nle-sync-actions">
                            <button
                              className="nle-mini-btn"
                              type="button"
                              onClick={() => handleNudgeSelectedSwitch(-0.1)}
                              disabled={Number(selectedManualSwitch.startTime || 0) <= 0.001}
                            >
                              -0.1s
                            </button>
                            <button
                              className="nle-mini-btn"
                              type="button"
                              onClick={() => handleNudgeSelectedSwitch(0.1)}
                              disabled={Number(selectedManualSwitch.startTime || 0) <= 0.001}
                            >
                              +0.1s
                            </button>
                            <button
                              className="nle-mini-btn nle-mini-btn-accent"
                              type="button"
                              onClick={() => handleRemoveSwitch(selectedManualSwitch.id)}
                              disabled={Number(selectedManualSwitch.startTime || 0) <= 0.001}
                            >
                              Delete Cut
                            </button>
                          </div>
                        </div>
                        <div className="nle-manual-cut-camera-row">
                          {readySources.map((source, index) => (
                            <button
                              key={`selected-cut-camera-${source.id}`}
                              type="button"
                              className={`nle-mini-btn ${
                                selectedManualSwitch.cameraId === source.id ? "nle-mini-btn-accent" : ""
                              }`}
                              onClick={() => handleAssignSelectedSwitchCamera(source.id)}
                            >
                              {normalizeSourceLabel(source.label, index)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {flowEditEnabled && selectedFlowSegment && (
                  <div className="nle-flow-manual-panel">
                    <div className="nle-single-cam-note">
                      <strong>
                        {selectedFlowSegment.label || selectedFlowSegment.cameraId} ·{" "}
                        {selectedFlowSegment.energyZone} ·{" "}
                        {Number(selectedFlowSegment.playbackRate || 1).toFixed(2)}x
                        {selectedFlowSegment.heroLabel ? ` · ${selectedFlowSegment.heroLabel}` : ""}
                      </strong>
                      <span>{selectedFlowSegment.reason}</span>
                    </div>
                    <div className="nle-flow-manual-grid">
                      <div className="nle-single-cam-tool-group">
                        <span>Move Cut Point</span>
                        <div className="nle-sync-actions">
                          <button
                            className="nle-mini-btn"
                            type="button"
                            onClick={() => handleMoveFlowCut(-0.1)}
                            disabled={!selectedFlowSegment}
                          >
                            -0.1s
                          </button>
                          <button
                            className="nle-mini-btn"
                            type="button"
                            onClick={() => handleMoveFlowCut(0.1)}
                            disabled={!selectedFlowSegment}
                          >
                            +0.1s
                          </button>
                        </div>
                      </div>
                      <div className="nle-single-cam-tool-group">
                        <span>Switch Camera</span>
                        <div className="nle-sync-actions">
                          {readySources.map(source => (
                            <button
                              key={`flow-segment-camera-${source.id}`}
                              className={`nle-mini-btn ${
                                selectedFlowSegment.cameraId === source.id
                                  ? "nle-mini-btn-accent"
                                  : ""
                              }`}
                              type="button"
                              onClick={() => handleApplyCameraToFlowSegment(source.id)}
                            >
                              {source.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="nle-single-cam-tool-group">
                        <span>Segment Actions</span>
                        <div className="nle-sync-actions">
                          <button className="nle-mini-btn" type="button" onClick={handleSplitFlowAtPlayhead}>
                            Add Cut
                          </button>
                          <button
                            className="nle-mini-btn nle-mini-btn-accent"
                            type="button"
                            onClick={() => handleDeleteFlowSegment(selectedFlowSegment.id)}
                            disabled={!selectedFlowSegment}
                          >
                            Delete Cut
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="nle-switch-list">
                  {(flowEditEnabled ? activeFlowSegments : normalizedSwitches).map((switchItem, index) => {
                    const label = readySources.find(source => source.id === switchItem.cameraId)?.label ||
                      switchItem.cameraId;
                    const isLocked =
                      !flowEditEnabled && Number(switchItem.startTime) <= 0.001;
                    return (
                      <div
                        key={switchItem.id}
                        className={`nle-switch-row ${
                          (flowEditEnabled ? selectedFlowSegmentId : selectedSwitchId) === switchItem.id
                            ? "is-selected"
                            : ""
                        }`}
                      >
                        <button
                          className="nle-text-btn"
                          type="button"
                          onClick={() => {
                            if (flowEditEnabled) {
                              setSelectedFlowSegmentId(switchItem.id);
                            } else {
                              setSelectedSwitchId(switchItem.id);
                            }
                            handleSeek(switchItem.startTime);
                          }}
                        >
                          {index + 1}. {label} at {formatDurationLabel(switchItem.startTime)}
                          {flowEditEnabled && switchItem.endTime
                            ? ` · ${formatDurationLabel(switchItem.endTime - switchItem.startTime)} · ${Number(switchItem.playbackRate || 1).toFixed(2)}x`
                            : ""}
                        </button>
                        <button
                          className="nle-btn secondary"
                          type="button"
                          onClick={() => handleRemoveSwitch(switchItem.id)}
                          disabled={isLocked}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div
                  className="nle-switch-track"
                  onClick={event => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const nextPlayhead =
                      ((event.clientX - rect.left) / rect.width) * (timelineDuration || 0);
                    handleSeek(nextPlayhead);
                  }}
                >
                  {displaySegments.map(segment => (
                    <button
                      key={segment.id}
                      type="button"
                      className={`nle-switch-segment ${selectedSingleCamSegmentId === segment.id ? "is-selected" : ""}`}
                      style={{
                        left: `${segment.startPercent}%`,
                        width: `${segment.widthPercent}%`,
                        background:
                          "linear-gradient(135deg, rgba(249, 115, 22, 0.62), rgba(56, 189, 248, 0.35))",
                      }}
                      onClick={event => {
                        event.stopPropagation();
                        setSelectedSingleCamSegmentId(segment.id);
                        handleSeek(segment.timelineStart);
                      }}
                    >
                      <span>{segment.label}</span>
                    </button>
                  ))}
                  <div
                    className="nle-playhead-marker-inline"
                    style={{
                      left: `${timelineDuration ? (playhead / timelineDuration) * 100 : 0}%`,
                    }}
                  />
                </div>

                <div className="nle-timeline-markers">
                  <span>{formatDurationLabel(0)}</span>
                  {timelineDuration > 2 && <span>{formatDurationLabel(timelineDuration / 2)}</span>}
                  <span>{formatDurationLabel(timelineDuration || 0)}</span>
                </div>

                <div className="nle-single-cam-note">
                  <strong>Selected segment</strong>
                  <span>
                    {selectedSingleCamSegment
                      ? `${formatDurationLabel(selectedSingleCamSegment.timelineStart)} to ${formatDurationLabel(selectedSingleCamSegment.timelineEnd)}${selectedSingleCamSegment.role ? ` · ${selectedSingleCamSegment.role.replace(/_/g, " ")}` : ""}`
                      : "Move the playhead or click a part to edit it."}
                  </span>
                  {selectedSingleCamSegment?.reason ? (
                    <small className="nle-single-cam-reason">{selectedSingleCamSegment.reason}</small>
                  ) : null}
                </div>

                <div className="nle-single-cam-tools">
                  <button
                    className="nle-btn secondary"
                    type="button"
                    onClick={handleSplitSingleCamSegment}
                    disabled={!selectedSingleCamSegment}
                  >
                    Split at Playhead
                  </button>
                  <button
                    className="nle-btn danger"
                    type="button"
                    onClick={handleDeleteSingleCamSegment}
                    disabled={!selectedSingleCamSegment || normalizedSingleCamSegments.length <= 1}
                  >
                    Delete Segment
                  </button>
                </div>

                <div className="nle-single-cam-trim-grid">
                  <div className="nle-single-cam-tool-group">
                    <span>Trim In</span>
                    <div className="nle-sync-actions">
                      <button
                        className="nle-mini-btn"
                        type="button"
                        onClick={() => handleTrimSingleCamSegment("start", -FRAME_STEP_SECONDS)}
                        disabled={!selectedSingleCamSegment}
                      >
                        -1f
                      </button>
                      <button
                        className="nle-mini-btn"
                        type="button"
                        onClick={() => handleTrimSingleCamSegment("start", FRAME_STEP_SECONDS)}
                        disabled={!selectedSingleCamSegment}
                      >
                        +1f
                      </button>
                    </div>
                  </div>
                  <div className="nle-single-cam-tool-group">
                    <span>Trim Out</span>
                    <div className="nle-sync-actions">
                      <button
                        className="nle-mini-btn"
                        type="button"
                        onClick={() => handleTrimSingleCamSegment("end", -FRAME_STEP_SECONDS)}
                        disabled={!selectedSingleCamSegment}
                      >
                        -1f
                      </button>
                      <button
                        className="nle-mini-btn"
                        type="button"
                        onClick={() => handleTrimSingleCamSegment("end", FRAME_STEP_SECONDS)}
                        disabled={!selectedSingleCamSegment}
                      >
                        +1f
                      </button>
                    </div>
                  </div>
                </div>

                <div className="nle-single-cam-trim-grid">
                  <div className="nle-single-cam-tool-group">
                    <span>Punch In</span>
                    <div className="nle-sync-actions">
                      {[1, 1.12, 1.28, 1.45].map(zoomLevel => (
                        <button
                          key={`zoom-${zoomLevel}`}
                          className={`nle-mini-btn ${Math.abs(selectedSingleCamFraming.zoom - zoomLevel) < 0.01 ? "nle-mini-btn-accent" : ""}`}
                          type="button"
                          onClick={() => handleUpdateSingleCamFraming({ zoom: zoomLevel })}
                          disabled={!selectedSingleCamSegment}
                        >
                          {zoomLevel.toFixed(2)}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="nle-single-cam-tool-group">
                    <span>Reframe</span>
                    <div className="nle-sync-actions">
                      {[
                        { id: "left", label: "Left" },
                        { id: "center", label: "Center" },
                        { id: "right", label: "Right" },
                      ].map(anchor => (
                        <button
                          key={anchor.id}
                          className={`nle-mini-btn ${selectedSingleCamFraming.zoomAnchor === anchor.id ? "nle-mini-btn-accent" : ""}`}
                          type="button"
                          onClick={() => handleUpdateSingleCamFraming({ zoomAnchor: anchor.id })}
                          disabled={!selectedSingleCamSegment}
                        >
                          {anchor.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="nle-single-cam-trim-grid">
                  <div className="nle-single-cam-tool-group">
                    <span>Subject Focus</span>
                    <div className="nle-sync-actions">
                      {SINGLE_CAM_FOCUS_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          className={`nle-mini-btn ${
                            (preset.id === "two-shot" && selectedSingleCamFraming.zoom <= 1.01) ||
                            (preset.id !== "two-shot" &&
                              Math.abs(selectedSingleCamFraming.zoom - preset.zoom) < 0.03)
                              ? "nle-mini-btn-accent"
                              : ""
                          }`}
                          type="button"
                          onClick={() => handleApplySingleCamFocusPreset(preset)}
                          disabled={!selectedSingleCamSegment}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        className={`nle-mini-btn ${focusPickerActive ? "nle-mini-btn-accent" : ""}`}
                        type="button"
                        onClick={() => setFocusPickerActive(current => !current)}
                        disabled={!selectedSingleCamSegment}
                      >
                        {focusPickerActive ? "Cancel Pick" : "Pick in Preview"}
                      </button>
                    </div>
                  </div>
                  <div className="nle-single-cam-tool-group">
                    <span>Focus Notes</span>
                    <div className="nle-single-cam-help">
                      Split each speaker turn, then click the preview on the person you want this
                      segment to frame. Use Body for upper-body coverage and Face for a tighter
                      reaction shot.
                    </div>
                  </div>
                </div>
              </>
            )}

            {renderCloudRenderWindowPanel()}

            <div className="nle-footer-grid">
              <div className="nle-footer-note">
                <strong>{footerNoteTitle}</strong>
                <span>{footerNoteCopy}</span>
              </div>
              <div className="nle-footer-actions">
                <button
                  className="nle-btn secondary"
                  type="button"
                  onClick={onCancel}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                {isExporting && (
                  <button className="nle-btn danger" type="button" onClick={handleCancelExport}>
                    Stop Export
                  </button>
                )}
                <button
                  className="nle-btn"
                  type="button"
                  onClick={handleServerExport}
	                  disabled={
	                    isExporting ||
	                    !canExportProject ||
	                    isSingleSourceWorkflow ||
	                    flowEditEnabled
	                  }
	                  title={
	                    flowEditEnabled
	                      ? "Flow Edit uses local soundtrack analysis and speed ramps, so export it in-browser."
	                      : isSingleSourceWorkflow
	                      ? "Server render is disabled for single-camera segment edits. Use browser export."
	                      : hasExternalCleanAudio
                          ? `Server render produces MP4 with external clean audio as the master track (${multicamRenderCreditEstimate} credits).`
                          : `Server render produces MP4 (${multicamRenderCreditEstimate} credits).`
	                  }
	                >
	                  {serverExportPending
	                    ? "Server Rendering..."
	                    : flowEditEnabled
	                      ? "Server MP4 Disabled for Flow Edit"
	                      : isSingleSourceWorkflow
	                      ? "MP4 Server Export Unavailable"
	                      : hasExternalCleanAudio
                        ? `Render Clean Audio MP4 (${multicamRenderCreditEstimate} cr)`
                        : `Render MP4 on Server (${multicamRenderCreditEstimate} cr)`}
                </button>
                <button
                  className="nle-btn secondary"
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || !canExportProject}
                  title={
                    isSingleSourceWorkflow
                      ? "Browser render exports your single recording as WebM"
                      : "Browser render runs in real-time and produces WebM"
                  }
                >
                  {isExporting && !serverExportPending
                    ? "Rendering..."
                    : isSingleSourceWorkflow
                      ? "Export WebM in Browser"
                      : "Render WebM in Browser"}
                </button>
              </div>
            </div>

            {isExporting ? (
              <div className="nle-export-progress">
                <div
                  className="nle-export-progress-bar"
                  style={{ width: `${Math.round(exportProgress * 100)}%` }}
                />
                <span className="nle-export-progress-label">
                  {Math.round(exportProgress * 100)}%
                </span>
              </div>
            ) : null}

            {exportResult ? (
              <div className="nle-export-result">
                <strong>Multicam master ready</strong>
                <span>
                  {exportResult.isServerRender
                    ? "Server render is available as MP4. Preview below, then download or continue into the editor."
                    : "The browser render is available as WebM. Preview below, then download or continue into the editor."}
                </span>
                {exportResult.url ? (
                  <video
                    src={exportResult.url}
                    controls
                    playsInline
                    preload="metadata"
                    style={{
                      width: "100%",
                      maxWidth: "480px",
                      borderRadius: "12px",
                      background: "#000",
                      marginTop: "12px",
                    }}
                  >
                    <source src={exportResult.url} type="video/mp4" />
                  </video>
                ) : null}
                <div className="nle-export-actions">
                  <a
                    className="nle-btn secondary"
                    href={exportResult.url}
                    download={exportResult.file?.name || exportResult.file}
                    target={exportResult.isServerRender ? "_blank" : undefined}
                    rel={exportResult.isServerRender ? "noopener noreferrer" : undefined}
                  >
                    Download Master
                  </a>
                  <button className="nle-btn" type="button" onClick={handleUseExportInEditor}>
                    Use This Master
                  </button>
                </div>
              </div>
            ) : null}

            {renderRecentRendersPanel()}

            {statusMessage ? <div className="nle-status-banner">{statusMessage}</div> : null}
            </div>
          </div>
        </div>

          </>
        )}

        <div className="nle-hidden-audio-rack" aria-hidden="true">
          {readySources.filter(isVideoSource).map(source => (
            <video
              key={`audio-${source.id}`}
              ref={node => {
                audioVideoRefs.current[source.id] = node;
                if (node) {
                  applySafeMediaSource(node, getSourceMediaUrl(source));
                }
              }}
              playsInline
            />
          ))}
          {flowAudioIsVideoSoundtrack ? (
            <video
              ref={node => {
                flowAudioRef.current = node;
                forceMediaAudible(node);
              }}
              preload="auto"
              playsInline
            />
          ) : (
            <audio
              ref={node => {
                flowAudioRef.current = node;
                forceMediaAudible(node);
              }}
              preload="auto"
            />
          )}
          <audio
            ref={node => {
              externalAudioRef.current = node;
              forceMediaAudible(node);
              if (node) {
                applySafeMediaSource(node, externalAudioUrl);
              }
            }}
            preload="auto"
          />
        </div>
        {billingPanelOpen && (
          <div className="nle-billing-modal" role="dialog" aria-modal="true" aria-label="Cam Combiner billing">
            <div className="nle-billing-modal-backdrop" onClick={() => setBillingPanelOpen(false)} />
            <div className="nle-billing-modal-panel">
              <PayPalSubscriptionPanel
                onClose={() => setBillingPanelOpen(false)}
                closeLabel="Back to Cam Combiner"
                title="PayPal credits and plan access"
                subtitle="Top up credits before clean-audio sync or server rendering, or upgrade your plan from here."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MultiCamCombiner;

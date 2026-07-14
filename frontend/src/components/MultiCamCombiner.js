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
  buildFlowEditPlan,
  buildFlowTimelineDisplaySegments,
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
import { uploadMulticamSourceResumable } from "../utils/multicamResumableUpload";

const MULTICAM_MAX_SOURCES = 6;

const CAMERA_COLORS = ["#f97316", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15"];

const getCameraColor = (cameraId, sources) => {
  const idx = sources.findIndex(s => s.id === cameraId);
  return CAMERA_COLORS[idx % CAMERA_COLORS.length] || CAMERA_COLORS[0];
};

const DRIFT_THRESHOLD_SECONDS = 0.18;
const EXPORT_FRAME_RATE = 30;
const SERVER_MULTICAM_MAX_DURATION_SECONDS = 3 * 60 * 60;
const MULTICAM_RENDER_CHECKPOINT_SECONDS = 5 * 60;
const MULTICAM_PRODUCTION_PROOF_SECONDS = 60;
const MULTICAM_PRODUCTION_PROOF_DEFAULT_START_SECONDS = 120;
const MULTICAM_PRODUCTION_PROOF_CREDITS = 15;
const MULTICAM_RENDER_BILLING_UNIT_SECONDS = 20 * 60;
const MULTICAM_RENDER_SPEC_VERSION = 2;
const ACTIVE_MULTICAM_RENDER_JOB_STORAGE_KEY = "autopromote:multicam-active-render-job";
const LOCAL_MEDIA_WORKER_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export const isRecoverableMediaUrl = value => {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_error) {
    return false;
  }
};

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

export const getRenderApprovalState = render => {
  const approvalStatus = String(render?.approvalStatus || "").toLowerCase();
  if (["needs_review", "approved", "rejected"].includes(approvalStatus)) return approvalStatus;
  if (render?.canDownload && (render.outputUrl || render.output_url)) return "approved";
  const status = String(render?.status || "").toLowerCase();
  if (["needs_review", "approved", "rejected"].includes(status)) return status;
  return "unknown";
};

export const canDownloadApprovedRender = render =>
  getRenderApprovalState(render) === "approved" && Boolean(render?.outputUrl || render?.output_url);

export const getRenderApprovalCopy = render => {
  const state = getRenderApprovalState(render);
  if (state === "approved") return "Approved master";
  if (state === "rejected") return "Rejected render";
  if (state === "needs_review") return "Needs human review";
  return "Render";
};

export const getMulticamRenderBillingUnits = durationSeconds => {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  return duration > 0 ? Math.ceil(duration / MULTICAM_RENDER_BILLING_UNIT_SECONDS) : 0;
};

export const getFullTimelineRenderWindow = durationSeconds => {
  const requestedDuration = Math.max(0, Number(durationSeconds) || 0);
  const duration = Math.min(requestedDuration, SERVER_MULTICAM_MAX_DURATION_SECONDS);
  return {
    start: 0,
    end: duration,
    duration,
    exceedsServerCap: requestedDuration > SERVER_MULTICAM_MAX_DURATION_SECONDS,
    checkpointSeconds: MULTICAM_RENDER_CHECKPOINT_SECONDS,
    checkpointCount: duration > 0
      ? Math.ceil(duration / MULTICAM_RENDER_CHECKPOINT_SECONDS)
      : 0,
  };
};

export const getProductionProofRenderWindow = (durationSeconds, preferredStartSeconds = 120) => {
  const timelineDuration = Math.max(0, Number(durationSeconds) || 0);
  const duration = Math.min(MULTICAM_PRODUCTION_PROOF_SECONDS, timelineDuration);
  const latestStart = Math.max(0, timelineDuration - duration);
  const start = Math.min(latestStart, Math.max(0, Number(preferredStartSeconds) || 0));
  return {
    start,
    end: start + duration,
    duration,
    exceedsServerCap: false,
    checkpointSeconds: MULTICAM_RENDER_CHECKPOINT_SECONDS,
    checkpointCount: duration > 0 ? 1 : 0,
    renderPurpose: "production_proof",
  };
};

export const getRenderOutputUrl = render =>
  render?.output_url ||
  render?.outputUrl ||
  render?.approvedOutputUrl ||
  render?.result?.url ||
  render?.result?.output_url ||
  render?.result?.outputUrl ||
  "";

export const getRenderManifestLocation = render =>
  render?.manifestUrl ||
  render?.manifest_url ||
  render?.manifestStoragePath ||
  render?.manifest_storage_path ||
  render?.result?.manifestUrl ||
  render?.result?.manifest_url ||
  render?.result?.manifestStoragePath ||
  render?.result?.manifest_storage_path ||
  "";

export const getRenderCheckpointSummary = render => {
  const checkpoint = render?.renderCheckpoint || render?.render_checkpoint || render?.result?.renderCheckpoint || {};
  const expectedCount = Math.max(
    0,
    Number(
      checkpoint.expectedCount ??
      checkpoint.expected_count ??
      render?.expectedCheckpointCount ??
      render?.expected_checkpoint_count ??
      0
    ) || 0
  );
  const completedCount = Math.min(
    expectedCount || Number.MAX_SAFE_INTEGER,
    Math.max(0, Number(checkpoint.completedCount ?? checkpoint.completed_count ?? 0) || 0)
  );
  const rawCurrentIndex = Number(checkpoint.currentIndex ?? checkpoint.current_index);
  const currentIndex = Number.isFinite(rawCurrentIndex) && rawCurrentIndex >= 0
    ? rawCurrentIndex
    : null;
  const activeCheckpoint = expectedCount
    ? Math.min(
        expectedCount,
        Math.max(
          completedCount < expectedCount ? completedCount + 1 : completedCount,
          currentIndex === null ? 0 : currentIndex + 1
        )
      )
    : 0;
  return {
    stage: checkpoint.stage || render?.stage || "",
    status: checkpoint.status || "",
    currentIndex,
    completedCount,
    expectedCount,
    activeCheckpoint,
    completedDurationSeconds: Math.max(
      0,
      Number(checkpoint.completedDurationSeconds ?? checkpoint.completed_duration_seconds ?? 0) || 0
    ),
    totalDurationSeconds: Math.max(
      0,
      Number(
        checkpoint.totalDurationSeconds ??
        checkpoint.total_duration_seconds ??
        render?.totalDurationSeconds ??
        render?.total_duration_seconds ??
        0
      ) || 0
    ),
    label: expectedCount ? `Checkpoint ${activeCheckpoint}/${expectedCount}` : "",
  };
};

export const isAsyncRenderDeliveryReady = render => {
  if (!getRenderOutputUrl(render)) return false;
  const renderSpecVersion = Number(
    render?.renderSpecVersion ??
    render?.render_spec_version ??
    render?.result?.renderSpecVersion ??
    render?.result?.render_spec_version ??
    0
  );
  return renderSpecVersion >= MULTICAM_RENDER_SPEC_VERSION
    ? Boolean(getRenderManifestLocation(render))
    : true;
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
const CLEAN_AUDIO_SYNC_CREDITS = 18;
const MULTICAM_RENDER_CREDITS_BY_TIER = {
  simple: 75,
  premium: 150,
  studio: 300,
};

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
const UPLOAD_COMPRESSION_TARGET_BPS = 3_000_000;               // 3 Mbps video
const UPLOAD_COMPRESSION_AUDIO_BPS = 128_000;                  // 128 Kbps audio
const UPLOAD_PROXY_MAX_LONG_EDGE = 1280;
const VIDEO_SYNC_AUDIO_BPS = 96_000;
const VIDEO_SYNC_MAX_EXTRACT_SECONDS = 15 * 60;
const SYNC_AUDIO_CACHE_DB = "autopromote_multicam_sync_audio";
const SYNC_AUDIO_CACHE_STORE = "cameraSyncAudio";
const RENDER_PROXY_CACHE_STORE = "renderWindowProxies";
const RENDER_PROXY_UPLOAD_CACHE_STORE = "renderWindowProxyUploads";
const SYNC_AUDIO_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const RENDER_PROXY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RENDER_PROXY_UPLOAD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const openSyncAudioCacheDb = () =>
  new Promise(resolve => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(SYNC_AUDIO_CACHE_DB, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_AUDIO_CACHE_STORE)) {
        db.createObjectStore(SYNC_AUDIO_CACHE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(RENDER_PROXY_CACHE_STORE)) {
        db.createObjectStore(RENDER_PROXY_CACHE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(RENDER_PROXY_UPLOAD_CACHE_STORE)) {
        db.createObjectStore(RENDER_PROXY_UPLOAD_CACHE_STORE, { keyPath: "key" });
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
      const file = new File([entry.blob], entry.name || "camera_sync_audio.webm", {
          type: entry.type || entry.blob.type || "audio/webm",
          lastModified: entry.lastModified || Date.now(),
        });
      resolve({
        file,
        trimStart: Number(entry.trimStart || 0) || 0,
        trimDuration: Number(entry.trimDuration || 0) || 0,
      });
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

const writeCachedSyncAudioFile = async (cacheKey, file, metadata = {}) => {
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
      trimStart: Number(metadata.trimStart || 0) || 0,
      trimDuration: Number(metadata.trimDuration || 0) || 0,
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

const readCachedRenderProxyFile = async cacheKey => {
  if (!cacheKey) return null;
  const db = await openSyncAudioCacheDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(RENDER_PROXY_CACHE_STORE, "readwrite");
    const store = tx.objectStore(RENDER_PROXY_CACHE_STORE);
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
      const file = new File([entry.blob], entry.name || "render_window_proxy.webm", {
        type: entry.type || entry.blob.type || "video/webm",
        lastModified: entry.lastModified || Date.now(),
      });
      resolve({
        file,
        originalSize: Number(entry.originalSize || 0) || 0,
        compressedSize: Number(entry.size || file.size || 0) || 0,
        trimStart: Number(entry.trimStart || 0) || 0,
        trimDuration: Number(entry.trimDuration || 0) || 0,
      });
    };
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const writeCachedRenderProxyFile = async (cacheKey, file, metadata = {}) => {
  if (!cacheKey || !file) return;
  const db = await openSyncAudioCacheDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(RENDER_PROXY_CACHE_STORE, "readwrite");
    tx.objectStore(RENDER_PROXY_CACHE_STORE).put({
      key: cacheKey,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      originalSize: Number(metadata.originalSize || 0) || 0,
      lastModified: file.lastModified || Date.now(),
      trimStart: Number(metadata.trimStart || 0) || 0,
      trimDuration: Number(metadata.trimDuration || 0) || 0,
      expiresAt: Date.now() + RENDER_PROXY_CACHE_TTL_MS,
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

const readCachedRenderProxyUpload = async cacheKey => {
  if (!cacheKey) return null;
  const db = await openSyncAudioCacheDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(RENDER_PROXY_UPLOAD_CACHE_STORE, "readwrite");
    const store = tx.objectStore(RENDER_PROXY_UPLOAD_CACHE_STORE);
    const request = store.get(cacheKey);
    request.onsuccess = () => {
      const entry = request.result;
      if (!entry?.url || !String(entry.url).startsWith("http")) {
        resolve(null);
        return;
      }
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(cacheKey);
        resolve(null);
        return;
      }
      resolve({
        url: entry.url,
        videoUrl: entry.videoUrl || entry.url,
        trimStart: Number(entry.trimStart || 0) || 0,
        trimDuration: Number(entry.trimDuration || 0) || 0,
        size: Number(entry.size || 0) || 0,
        storagePath: entry.storagePath || "",
        cacheKey: entry.cacheKey || "",
        deleteAfter: entry.deleteAfter || null,
      });
    };
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const writeCachedRenderProxyUpload = async (cacheKey, upload = {}) => {
  const url = upload.videoUrl || upload.url;
  if (!cacheKey || !String(url || "").startsWith("http")) return;
  const db = await openSyncAudioCacheDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(RENDER_PROXY_UPLOAD_CACHE_STORE, "readwrite");
    tx.objectStore(RENDER_PROXY_UPLOAD_CACHE_STORE).put({
      key: cacheKey,
      url,
      videoUrl: upload.videoUrl || url,
      size: Number(upload.size || 0) || 0,
      trimStart: Number(upload.trimStart || 0) || 0,
      trimDuration: Number(upload.trimDuration || 0) || 0,
      storagePath: upload.storagePath || "",
      cacheKey: upload.cacheKey || "",
      deleteAfter: upload.deleteAfter || null,
      expiresAt:
        Number(upload.cacheExpiresAt || 0) || Date.now() + RENDER_PROXY_UPLOAD_CACHE_TTL_MS,
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
  { id: "scene-grid", label: "Scene Matrix" },
  { id: "cut", label: "Hero Angle / Single Speaker" },
];

const MULTICAM_LAYOUT_TITLES = {
  smart: "Pulse Director",
  "split-vertical": "Dual Pulse",
  pip: "Reaction overlay",
  "scene-grid": "Scene Matrix",
  cut: "Hero Angle",
};

const MULTICAM_REASON_TITLES = {
  single_source: "Solo presence",
  shared_energy: "Shared voltage",
  reaction_insert: "Reaction bloom",
  primary_focus: "Hero lock",
  manual_split: "Preview duet",
  manual_pip: "Preview orbit",
  ensemble_peak: "Ensemble bloom",
  manual_ensemble: "Preview matrix",
  manual_cut: "Preview hero",
};

const PREVIEW_LAYOUT_LABELS = {
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

const suppressReactionOverlayLayout = layout => {
  const safeLayout = layout || {};
  if (normalizeMulticamLayoutMode(safeLayout.layoutMode) !== "pip") return safeLayout;
  const primaryCameraId = safeLayout.primaryCameraId || safeLayout.visibleCameraIds?.[0] || null;
  return {
    ...safeLayout,
    layoutMode: "cut",
    secondaryCameraId: null,
    visibleCameraIds: [primaryCameraId].filter(Boolean),
    reason: safeLayout.reason
      ? `reaction_overlay_disabled:${safeLayout.reason}`
      : "reaction_overlay_disabled",
  };
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
const estimateCleanAudioSyncCredits = () => {
  return CLEAN_AUDIO_SYNC_CREDITS;
};

export const estimateMulticamRenderCredits = (
  renderTier,
  durationSeconds = MULTICAM_RENDER_BILLING_UNIT_SECONDS
) => {
  const tier = String(renderTier || "premium").trim().toLowerCase().replace(/-/g, "_");
  const perUnitCredits =
    MULTICAM_RENDER_CREDITS_BY_TIER[tier] || MULTICAM_RENDER_CREDITS_BY_TIER.premium;
  return perUnitCredits * getMulticamRenderBillingUnits(durationSeconds);
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

const getPreflightProxyOffsetSeconds = payload => {
  const offset = Number(payload?.offset_seconds || 0) || 0;
  const syncRate = Number(payload?.sync_rate ?? payload?.syncRate ?? 1) || 1;
  const uploadTrimStart = Number(payload?.upload_trim_start || 0) || 0;
  return Number((offset + (uploadTrimStart / Math.max(0.001, syncRate))).toFixed(6));
};

const getPreflightVerifiedSourceIds = (sourcesPayload, preflight) => {
  const cameraResults = getPreflightCameraResults(preflight);
  const verified = new Set();
  const preflightStatus = String(preflight?.status || "").toLowerCase();
  if (preflightStatus !== "good") return verified;
  cameraResults.forEach((cameraResult, index) => {
    const payload = sourcesPayload[index];
    if (!payload) return;
    const fit = cameraResult.sync_fit || {};
    const maxFitError = Number(fit.max_fit_error_seconds ?? cameraResult.max_residual_offset_seconds);
    const avgCorrelation = Number(cameraResult.avg_correlation);
    const driftSeconds = Number(cameraResult.drift_seconds);
    const requiredWindows = Array.isArray(cameraResult.required_windows) && cameraResult.required_windows.length
      ? cameraResult.required_windows
      : ["start", "middle", "end"];
    const windows = cameraResult.windows || {};
    const hasRequiredWindows = requiredWindows.every(label => windows[label]);
    const hasMissingRequiredWindows = Array.isArray(cameraResult.missing_required_windows) && cameraResult.missing_required_windows.length > 0;
    const hasStableFit =
      fit.status === "fit" &&
      hasRequiredWindows &&
      !hasMissingRequiredWindows &&
      (!Number.isFinite(maxFitError) || maxFitError <= 0.2) &&
      (!Number.isFinite(driftSeconds) || Math.abs(driftSeconds) <= 0.25) &&
      (!Number.isFinite(avgCorrelation) || avgCorrelation >= 0.25) &&
      cameraResult.confidence === "good";
    if (hasStableFit) {
      verified.add(payload.id);
    }
  });
  return verified;
};

const summarizePreflightIssue = preflight => {
  const cameraResults = getPreflightCameraResults(preflight);
  if (!cameraResults.length) return "";
  return cameraResults
    .map(cameraResult => {
      const errors = cameraResult.errors || {};
      const missing = Array.isArray(cameraResult.missing_required_windows)
        ? cameraResult.missing_required_windows
        : [];
      const errorLabels = Object.entries(errors)
        .map(([label, value]) => `${label}:${value?.status || "failed"}`)
        .filter(Boolean);
      const drift = Number(cameraResult.drift_seconds);
      const residual = Number(cameraResult.max_residual_offset_seconds);
      const detailParts = [
        cameraResult.confidence ? `confidence=${cameraResult.confidence}` : "",
        missing.length ? `missing=${missing.join(",")}` : "",
        errorLabels.length ? `errors=${errorLabels.join(",")}` : "",
        Number.isFinite(drift) ? `drift=${drift.toFixed(3)}s` : "",
        Number.isFinite(residual) ? `residual=${residual.toFixed(3)}s` : "",
      ].filter(Boolean);
      return `${cameraResult.key || "camera"} ${detailParts.join(" ")}`.trim();
    })
    .filter(Boolean)
    .join("; ");
};

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
    const nextSyncRate = Number(suggestedSyncRate.toFixed(9));
    const uploadTrimStart = Number(payload.upload_trim_start || 0) || 0;
    // Preflight runs against uploaded render proxies when present. A proxy's t=0
    // may be a trimmed point in the original camera, so convert the suggested
    // proxy offset back into the original source timeline used by preview/render.
    const nextOffset = Number((suggestedOffset - (uploadTrimStart / Math.max(0.001, nextSyncRate))).toFixed(6));
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
        proxySuggestedOffsetSeconds: Number(suggestedOffset.toFixed(6)),
        uploadTrimStart,
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

const getReactionStackPreviewViewports = (width, height, reactionCount, side = "right") => {
  const count = Math.max(1, Math.min(2, Number(reactionCount) || 1));
  const stackWidth = width * 0.31;
  const stackHeight = stackWidth * (9 / 16);
  const gap = height * 0.018;
  const x = side === "left" ? width * 0.039 : width - stackWidth - width * 0.039;
  const stackTotalHeight = stackHeight * count + gap * (count - 1);
  const startY = Math.min(height * 0.62, height - stackTotalHeight - height * 0.08);
  return Array.from({ length: count }, (_, index) => ({
    x,
    y: startY + index * (stackHeight + gap),
    width: stackWidth,
    height: stackHeight,
  }));
};

const getPreviewReactionSideForSource = (source, _sourceIndex = -1, sideOverride = null) => {
  const normalizedOverride = String(sideOverride || "").toLowerCase();
  if (normalizedOverride === "left" || normalizedOverride === "right") return normalizedOverride;
  const focusX = Number(source?.focusX ?? source?.focus_x);
  if (Number.isFinite(focusX)) return focusX > 0.58 ? "left" : "right";
  const explicitSide = String(source?.reactionSide || source?.reaction_side || "").toLowerCase();
  if (explicitSide === "left" || explicitSide === "right") return explicitSide;
  return "right";
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

const readActiveMulticamRenderJob = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_MULTICAM_RENDER_JOB_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.jobId ? parsed : null;
    } catch (_parseError) {
      return { jobId: raw };
    }
  } catch (_storageError) {
    return null;
  }
};

const persistActiveMulticamRenderJob = job => {
  if (typeof window === "undefined" || !window.localStorage || !job?.jobId) return;
  try {
    window.localStorage.setItem(
      ACTIVE_MULTICAM_RENDER_JOB_STORAGE_KEY,
      JSON.stringify({
        jobId: job.jobId,
        duration: Number(job.duration || 0),
        renderSpecVersion: Number(job.renderSpecVersion || MULTICAM_RENDER_SPEC_VERSION),
      })
    );
  } catch (_storageError) {
    // Polling still works in this tab when private storage is unavailable.
  }
};

const clearActiveMulticamRenderJob = jobId => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const activeJob = readActiveMulticamRenderJob();
    if (!jobId || !activeJob?.jobId || activeJob.jobId === jobId) {
      window.localStorage.removeItem(ACTIVE_MULTICAM_RENDER_JOB_STORAGE_KEY);
    }
  } catch (_storageError) {
    // A completed render must not fail just because local storage is blocked.
  }
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
  const [reactionSideOverridesByCameraId, setReactionSideOverridesByCameraId] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [outputAspectRatio, setOutputAspectRatio] = useState("16:9");
  const [exportResult, setExportResult] = useState(null);
  const [pendingRenderReview, setPendingRenderReview] = useState(null);
  const [recentRenders, setRecentRenders] = useState([]);
  const [recentRendersStatus, setRecentRendersStatus] = useState("");
  const [serverExportPending, setServerExportPending] = useState(false);
  const [singleCamSegments, setSingleCamSegments] = useState([]);
  const [selectedSingleCamSegmentId, setSelectedSingleCamSegmentId] = useState(null);
  const [singleCamSegmentFraming, setSingleCamSegmentFraming] = useState({});
  const [singleLensAutoSummary, setSingleLensAutoSummary] = useState("");
  const [focusPickerActive, setFocusPickerActive] = useState(false);
  const [multicamLayoutMode, setMulticamLayoutMode] = useState("cut");
  const [reactionOverlayEnabled, setReactionOverlayEnabled] = useState(false);
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
  const [externalAudioSpeakerChannelsSwapped, setExternalAudioSpeakerChannelsSwapped] = useState(false);
  const [confirmedDirectorChannelMapKey, setConfirmedDirectorChannelMapKey] = useState("");
  const [cleanAudioSyncJob, setCleanAudioSyncJob] = useState(null);
  const [multicamRenderTier, setMulticamRenderTier] = useState("premium");
  const [multicamBurnCaptions, setMulticamBurnCaptions] = useState(false);
  const [multicamBrandWatermark, setMulticamBrandWatermark] = useState(false);
  const [multicamGenerateThumbnail, setMulticamGenerateThumbnail] = useState(false);
  const [cloudRenderMode, setCloudRenderMode] = useState("proof");
  const [proofRenderStartSeconds, setProofRenderStartSeconds] = useState(
    MULTICAM_PRODUCTION_PROOF_DEFAULT_START_SECONDS
  );
  const [recoverableProjectStatus, setRecoverableProjectStatus] = useState("");
  const [activeRenderJobId, setActiveRenderJobId] = useState("");
  const [activeRenderCheckpoint, setActiveRenderCheckpoint] = useState(null);
  const [activeRenderManifest, setActiveRenderManifest] = useState("");
  const [billingPanelOpen, setBillingPanelOpen] = useState(false);

  const cancelExportRef = useRef(false);
  const exportAbortControllerRef = useRef(null);
  const renderSubmissionStartedRef = useRef(false);
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

  const recoverLatestUploadedProject = useCallback(async () => {
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Sign in before recovering uploaded originals.");
      setRecoverableProjectStatus("Finding your uploaded camera originals...");
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/media/multicam/recoverable-project`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.project) {
        throw new Error(data.message || "Could not recover the uploaded project.");
      }
      const project = data.project;
      const projectSources = Array.isArray(project.sources) ? project.sources : [];
      if (
        projectSources.length < 2 ||
        projectSources.some(source => !isRecoverableMediaUrl(source.url))
      ) {
        throw new Error("The saved project does not contain reusable cloud camera originals.");
      }
      if (project.externalAudio && !isRecoverableMediaUrl(project.externalAudio.url)) {
        throw new Error("The saved project clean audio is not available from cloud storage.");
      }
      const duration = Math.max(0, Number(project.duration) || 0);
      const restoredSources = projectSources.map((source, index) => ({
        id: source.id || `cam-${index + 1}`,
        label: normalizeSourceLabel(source.label, index),
        name: source.label || `Camera ${index + 1}`,
        file: null,
        mediaKind: "video",
        previewUrl: source.url,
        url: source.url,
        uploadedUrl: source.url,
        cloudOriginalUrl: source.url,
        cloudOriginalStoragePath: source.storagePath || "",
        cloudOriginalCacheKey: source.cacheKey || "",
        offsetSeconds: Number(source.offsetSeconds) || 0,
        syncRate: Number(source.syncRate) || 1,
        rotationDegrees: Number(source.rotationDegrees) || 0,
        reactionSide: source.reactionSide || null,
        duration,
        videoWidth: 0,
        videoHeight: 0,
      }));
      if (restoredSources.length < 2) {
        throw new Error("The saved project does not contain both uploaded cameras.");
      }
      setSources(restoredSources);
      setSwitches([{ id: "switch-1", cameraId: restoredSources[0].id, startTime: 0 }]);
      setMasterAudioCameraId(restoredSources[0].id);
      setOutputAspectRatio(project.outputAspectRatio || "16:9");
      setMulticamRenderTier(project.renderTier || "premium");
      const external = project.externalAudio;
      if (external?.url) {
        setExternalAudioTrack({
          name: "Recovered external clean audio",
          file: null,
          previewUrl: external.url,
          url: external.url,
          cloudOriginalUrl: external.url,
          cloudOriginalStoragePath: external.storagePath || "",
          cloudOriginalCacheKey: external.cacheKey || "",
          offsetSeconds: Number(external.offsetSeconds) || 0,
          duration,
        });
        setUseExternalCleanAudio(true);
        setExternalAudioMixMode(external.mixMode || "external_only");
      }
      const suggestedIds = Array.isArray(project.suggestedChannelCameraIds)
        ? project.suggestedChannelCameraIds
        : [];
      setExternalAudioSpeakerChannelsSwapped(
        suggestedIds.length >= 2 &&
          suggestedIds[0] === restoredSources[1].id &&
          suggestedIds[1] === restoredSources[0].id
      );
      setConfirmedDirectorChannelMapKey("");
      setCloudRenderMode("proof");
      setProofRenderStartSeconds(
        Math.min(MULTICAM_PRODUCTION_PROOF_DEFAULT_START_SECONDS, Math.max(0, duration - 60))
      );
      setRecoverableProjectStatus(
        "Uploaded originals restored. No upload is needed; verify the shown left/right speakers, then run the 60-second proof."
      );
      setStatusMessage("Recovered the existing Firebase originals without uploading again.");
    } catch (error) {
      setRecoverableProjectStatus(error.message || "Could not recover uploaded originals.");
      toast.error(error.message || "Could not recover uploaded originals.");
    }
  }, []);

  const startRenderStatusPolling = useCallback(
    (renderJobId, options = {}) => {
      if (!renderJobId) return;
      if (exportPollIntervalRef.current) {
        window.clearInterval(exportPollIntervalRef.current);
        exportPollIntervalRef.current = null;
      }

      const fallbackDuration = Math.max(0, Number(options.duration || 0));
      const fallbackRenderSpecVersion = Number(
        options.renderSpecVersion || MULTICAM_RENDER_SPEC_VERSION
      );
      cancelExportRef.current = false;
      renderSubmissionStartedRef.current = true;
      setActiveRenderJobId(renderJobId);
      setActiveRenderCheckpoint(null);
      setActiveRenderManifest("");
      persistActiveMulticamRenderJob({
        jobId: renderJobId,
        duration: fallbackDuration,
        renderSpecVersion: fallbackRenderSpecVersion,
      });

      const stopPolling = ({ clearPersisted = false } = {}) => {
        if (exportPollIntervalRef.current) {
          window.clearInterval(exportPollIntervalRef.current);
          exportPollIntervalRef.current = null;
        }
        if (clearPersisted) {
          clearActiveMulticamRenderJob(renderJobId);
          setActiveRenderJobId("");
        }
      };

      const pollJob = async () => {
        if (cancelExportRef.current) return;
        try {
          const currentUser = getAuth().currentUser;
          if (!currentUser) return;
          const idToken = await currentUser.getIdToken();
          const statusRes = await fetch(`${API_BASE_URL}/api/media/status/${renderJobId}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const statusData = await statusRes.json().catch(() => ({}));
          if (!statusRes.ok || !statusData.success) return;

          const normalizedStatus = {
            ...statusData,
            renderSpecVersion:
              statusData.renderSpecVersion ||
              statusData.render_spec_version ||
              fallbackRenderSpecVersion,
          };
          const checkpoint = getRenderCheckpointSummary(normalizedStatus);
          const manifestLocation = getRenderManifestLocation(normalizedStatus);
          setActiveRenderCheckpoint(checkpoint.expectedCount ? checkpoint : null);
          setActiveRenderManifest(manifestLocation);

          const serverProgress = Math.max(0, Number(statusData.progress || 0) / 100);
          const checkpointProgress = checkpoint.expectedCount
            ? checkpoint.completedCount / checkpoint.expectedCount
            : 0;
          setExportProgress(Math.min(0.99, Math.max(serverProgress, checkpointProgress)));
          const checkpointCopy = checkpoint.label
            ? `${checkpoint.label} · ${checkpoint.completedCount}/${checkpoint.expectedCount} complete`
            : "";
          setStatusMessage(
            [checkpointCopy, statusData.detail || statusData.stage || "Server rendering..."]
              .filter(Boolean)
              .join(" — ")
          );

          if (
            statusData.status === "needs_review" ||
            statusData.approvalStatus === "needs_review"
          ) {
            stopPolling({ clearPersisted: true });
            setExportProgress(1);
            setPendingRenderReview({
              ...statusData,
              jobId: renderJobId,
              previewUrl: statusData.previewUrl || statusData.heldOutputUrl,
              duration:
                statusData.result?.duration ||
                statusData.totalDurationSeconds ||
                fallbackDuration,
              manifestUrl: manifestLocation,
            });
            setExportResult(null);
            setStatusMessage("Render finished and is waiting for human review.");
            loadRecentRenders();
            setServerExportPending(false);
            setIsExporting(false);
            return;
          }

          if (statusData.status === "completed") {
            const completedUrl = getRenderOutputUrl(normalizedStatus);
            const specVersion = Number(normalizedStatus.renderSpecVersion || 0);
            if (!isAsyncRenderDeliveryReady(normalizedStatus)) {
              if (specVersion >= MULTICAM_RENDER_SPEC_VERSION) {
                const pendingParts = [
                  !completedUrl ? "master output" : null,
                  !manifestLocation ? "render manifest" : null,
                ].filter(Boolean);
                setStatusMessage(
                  `${checkpoint.label || "All checkpoints rendered"} — finalizing ${pendingParts.join(" and ")}...`
                );
                return;
              }
              stopPolling({ clearPersisted: true });
              setStatusMessage("Render completed but no output URL was returned.");
              setServerExportPending(false);
              setIsExporting(false);
              return;
            }

            stopPolling({ clearPersisted: true });
            setExportProgress(1);
            setExportResult({
              url: completedUrl,
              file: { name: `multicam-master-${Date.now()}.mp4` },
              duration:
                statusData.result?.duration ||
                statusData.totalDurationSeconds ||
                fallbackDuration,
              manifestUrl: manifestLocation,
              isServerRender: true,
            });
            setStatusMessage("Multi-camera render and manifest complete. Download ready.");
            loadRecentRenders();
            setServerExportPending(false);
            setIsExporting(false);
            return;
          }

          if (statusData.status === "failed" || statusData.status === "proof_failed") {
            stopPolling({ clearPersisted: true });
            const failureMessage =
              statusData.error ||
              statusData.workerError ||
              statusData.detail ||
              "Server render failed.";
            setStatusMessage(failureMessage);
            toast.error(failureMessage);
            setServerExportPending(false);
            setIsExporting(false);
            setExportProgress(0);
          }
        } catch (pollError) {
          console.warn("Multicam render status poll failed", pollError);
        }
      };

      pollJob();
      exportPollIntervalRef.current = window.setInterval(pollJob, 5000);
    },
    [loadRecentRenders]
  );

  useEffect(() => {
    const activeJob = readActiveMulticamRenderJob();
    if (!activeJob?.jobId) return;
    setServerExportPending(true);
    setIsExporting(true);
    setStatusMessage(`Resuming server render ${activeJob.jobId}...`);
    startRenderStatusPolling(activeJob.jobId, activeJob);
  }, [startRenderStatusPolling]);

  const handleReviewAction = useCallback(
    async (job, action) => {
      if (!job?.jobId || !["approve", "reject"].includes(action)) return;
      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error("Sign in again to review this render.");
        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/media/render-jobs/${job.jobId}/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes: "" }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Could not ${action} render.`);
        }

        const updatedJob = data.job || {};
        if (action === "approve" && canDownloadApprovedRender(updatedJob)) {
          const approvedUrl = updatedJob.outputUrl || updatedJob.output_url;
          setExportResult({
            url: approvedUrl,
            file: { name: `multicam-master-${Date.now()}.mp4` },
            duration: updatedJob.duration || job.duration || 0,
            isServerRender: true,
          });
          setPendingRenderReview(null);
          setStatusMessage("Render approved. Download is available.");
        } else if (action === "reject") {
          setExportResult(null);
          setPendingRenderReview(updatedJob);
          setStatusMessage("Render rejected. Download remains blocked.");
        }
        await loadRecentRenders();
      } catch (error) {
        console.warn(`Render ${action} failed`, error);
        toast.error(error.message || `Could not ${action} render.`);
      }
    },
    [loadRecentRenders]
  );

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
  const directorChannelMapKey = useMemo(() => {
    if (!externalAudioTrack || readySources.length < 2) return "";
    const audioIdentity = externalAudioTrack.file
      ? `${externalAudioTrack.file.name || "audio"}:${externalAudioTrack.file.size || 0}:${externalAudioTrack.file.lastModified || 0}`
      : String(externalAudioTrack.name || externalAudioTrack.url || externalAudioTrack.previewUrl || "audio");
    const channelCameraIds = externalAudioSpeakerChannelsSwapped
      ? [readySources[1]?.id, readySources[0]?.id]
      : [readySources[0]?.id, readySources[1]?.id];
    return `${audioIdentity}|${channelCameraIds.filter(Boolean).join("|")}`;
  }, [externalAudioSpeakerChannelsSwapped, externalAudioTrack, readySources]);
  const directorChannelMapConfirmed = Boolean(
    directorChannelMapKey && confirmedDirectorChannelMapKey === directorChannelMapKey
  );
  const getExportSourceLabel = useCallback((source, index) => {
    const label = String(source?.label || source?.name || "").trim();
    if (!label || /^(camera|source)\s+\d+$/i.test(label)) {
      return `Camera ${index + 1}`;
    }
    return label;
  }, []);
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
  const cloudRenderWindow = cloudRenderMode === "proof"
    ? getProductionProofRenderWindow(timelineDuration, proofRenderStartSeconds)
    : getFullTimelineRenderWindow(timelineDuration);
  const cloudRenderWindowStartSafe = cloudRenderWindow.start;
  const cloudRenderWindowDuration = cloudRenderWindow.duration;
  const cloudRenderWindowEnd = cloudRenderWindow.end;
  const multicamRenderCreditEstimate = useMemo(
    () => cloudRenderMode === "proof"
      ? MULTICAM_PRODUCTION_PROOF_CREDITS
      : estimateMulticamRenderCredits(multicamRenderTier, cloudRenderWindowDuration),
    [cloudRenderMode, multicamRenderTier, cloudRenderWindowDuration]
  );
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
    const styledLayout = applyDirectorStyleToLayout(
      baseLayout,
      directorStyleId,
      readySources.length ? readySources : sources
    );
    return reactionOverlayEnabled ? styledLayout : suppressReactionOverlayLayout(styledLayout);
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
    reactionOverlayEnabled,
    isImageStoryFlow,
  ]);
  const effectiveMulticamLayoutMode = resolvedMulticamLayout.layoutMode || "cut";
  const secondaryCameraId = resolvedMulticamLayout.secondaryCameraId || null;
  const reactionOverlayCameraId = useMemo(() => {
    if (isSingleSourceWorkflow || readySources.length < 2 || !activeCameraId) return null;
    if (secondaryCameraId && secondaryCameraId !== activeCameraId) return secondaryCameraId;
    return readySources.find(source => source.id !== activeCameraId)?.id || null;
  }, [isSingleSourceWorkflow, readySources, activeCameraId, secondaryCameraId]);
  const previewMulticamLayoutMode = effectiveMulticamLayoutMode;
  const previewSecondaryCameraId =
    previewMulticamLayoutMode === "pip" && reactionOverlayCameraId
      ? reactionOverlayCameraId
      : secondaryCameraId;
  const previewSecondaryCamera =
    readySources.find(source => source.id === previewSecondaryCameraId) || null;
  const previewReactionCameraIds = useMemo(() => {
    if (isSingleSourceWorkflow || previewMulticamLayoutMode !== "pip" || readySources.length < 2) {
      return [];
    }
    return readySources
      .map(source => source.id)
      .filter(cameraId => cameraId && cameraId !== activeCameraId)
      .slice(0, 2);
  }, [isSingleSourceWorkflow, previewMulticamLayoutMode, readySources, activeCameraId]);
  const previewReactionSide = useMemo(() => {
    const activeIndex = readySources.findIndex(source => source.id === activeCameraId);
    return getPreviewReactionSideForSource(
      readySources[activeIndex],
      activeIndex,
      reactionSideOverridesByCameraId[activeCameraId]
    );
  }, [readySources, activeCameraId, reactionSideOverridesByCameraId]);
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
  const previewVisibleLayoutCameraIds = useMemo(() => {
    const candidateIds =
      previewMulticamLayoutMode === "scene-grid" && Array.isArray(resolvedMulticamLayout.visibleCameraIds)
        ? resolvedMulticamLayout.visibleCameraIds
        : previewMulticamLayoutMode === "pip"
          ? [activeCameraId, ...previewReactionCameraIds]
        : [activeCameraId, previewSecondaryCameraId].filter(Boolean);
    const maxVisible =
      previewMulticamLayoutMode === "scene-grid"
        ? 3
        : previewMulticamLayoutMode === "split-vertical" || previewMulticamLayoutMode === "pip"
          ? 3
          : 6;
    return candidateIds.filter(Boolean).slice(0, maxVisible);
  }, [
    previewMulticamLayoutMode,
    resolvedMulticamLayout.visibleCameraIds,
    activeCameraId,
    previewSecondaryCameraId,
    previewReactionCameraIds,
  ]);
  const previewVisibleLayoutCameras = useMemo(
    () =>
      previewVisibleLayoutCameraIds
        .map(cameraId => readySources.find(source => source.id === cameraId))
        .filter(Boolean),
    [previewVisibleLayoutCameraIds, readySources]
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

    if (previewMulticamLayoutMode === "scene-grid") {
      const viewports = getSceneGridViewports(100, 100, previewVisibleLayoutCameraIds.length);
      previewVisibleLayoutCameraIds.forEach((cameraId, index) => {
        const viewport = viewports[index];
        assignCardStyle(cameraId, viewport, {
          padding: "0",
          objectFit: "cover",
          borderColor: "rgba(255, 255, 255, 0.12)",
          ...(cameraId === activeCameraId ? previewActiveVideoStyle : {}),
        });
      });
      return styles;
    }

    if (previewMulticamLayoutMode === "cut") {
      return styles;
    }

    if (!previewSecondaryCameraId) {
      return styles;
    }

    if (previewMulticamLayoutMode === "split-vertical") {
      const [primaryViewport, secondaryViewport] = getSharedMomentPreviewViewports(100, 100);
      assignCardStyle(activeCameraId, primaryViewport, {
        padding: "0",
        objectFit: "cover",
        objectPosition: "center center",
        borderColor: "rgba(255, 255, 255, 0.12)",
        ...previewActiveVideoStyle,
      });
      assignCardStyle(previewSecondaryCameraId, secondaryViewport, {
        padding: "0",
        objectFit: "cover",
        objectPosition: "center center",
        borderColor: "rgba(255, 255, 255, 0.12)",
      });
      return styles;
    }

    const reactionCameraIds = previewReactionCameraIds.length
      ? previewReactionCameraIds
      : [previewSecondaryCameraId].filter(Boolean);
    const reactionViewports = getReactionStackPreviewViewports(
      100,
      100,
      reactionCameraIds.length,
      previewReactionSide
    );
    reactionCameraIds.forEach((cameraId, index) => {
      assignCardStyle(cameraId, reactionViewports[index], {
        zIndex: 3 + index,
        padding: "0",
        objectFit: "cover",
        borderRadius: "16px",
        border: "2px solid rgba(56, 189, 248, 0.72)",
        boxShadow:
          "0 18px 34px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(56, 189, 248, 0.18)",
      });
    });
    return styles;
  }, [
    readySources,
    activeCameraId,
    previewSecondaryCameraId,
    previewReactionCameraIds,
    previewReactionSide,
    previewVisibleLayoutCameraIds,
    previewMulticamLayoutMode,
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
    if (previewMulticamLayoutMode === "scene-grid") return "is-mood-ensemble";
    if (previewMulticamLayoutMode === "split-vertical") return "is-mood-dual";
    if (previewMulticamLayoutMode === "pip") return "is-mood-orbit";
    return "is-mood-focus";
  }, [isSingleSourceWorkflow, previewMulticamLayoutMode]);
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

    if (previewSecondaryCamera && previewMulticamLayoutMode !== "cut") {
      return `${activeCamera?.label || "Lead"} with ${previewSecondaryCamera.label || "companion"}`;
    }

    return `${activeCamera?.label || "Lead"} owns the frame`;
  }, [
    isSingleSourceWorkflow,
    focusPickerActive,
    singleLensAutoSummary,
    selectedSingleCamSegment,
    selectedSingleCamFraming.zoom,
    previewSecondaryCamera,
    previewMulticamLayoutMode,
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

    if (previewMulticamLayoutMode === "scene-grid") return "Conversation matrix live";
    if (previewMulticamLayoutMode === "split-vertical") return "Shared reaction moment";
    if (previewMulticamLayoutMode === "pip") return "Reaction overlay";
    return "Hero angle locked";
  }, [isSingleSourceWorkflow, flowEditEnabled, currentFlowSegment, previewMulticamLayoutMode, selectedSingleCamSegment]);
  const directorHeroNarrative = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return selectedSingleCamSegment?.reason || "Solo lens edit with guided reframing.";
    }
    if (autoDirectorEnabled && autoDirectorSummary?.momentCount) {
      return `Auto Director is staging ${autoDirectorSummary.magicSummary} right now instead of just switching angles mechanically.`;
    }
    if (previewMulticamLayoutMode === "split-vertical") {
      return "Two angles stay open because both are active.";
    }
    if (previewMulticamLayoutMode === "scene-grid") {
      return "The whole conversation stays open in a living vertical matrix.";
    }
    if (previewMulticamLayoutMode === "pip") {
      return "The lead holds frame while the chosen reaction overlay stays visible.";
    }
    return "The director is holding one hero angle.";
  }, [isSingleSourceWorkflow, previewMulticamLayoutMode, autoDirectorEnabled, autoDirectorSummary, selectedSingleCamSegment]);
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
      aspectRatio: aspectRatioMap[outputAspectRatio] || "16 / 9",
      height: heightMap[outputAspectRatio] || "clamp(220px, 38vh, 420px)",
      width: "auto",
      maxWidth: "100%",
    };
  }, [outputAspectRatio]);
  const studioProgramStageStyle = useMemo(
    () => ({
      ...previewStageStyle,
      height: "100%",
      width: "auto",
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
      : "Load camera angles and clean audio, then let AutoPromote prove sync and direct the MP4 automatically before paid render.";
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
  const cleanAudioSyncTerminalStatuses = useMemo(
    () => new Set(["ready_for_review", "completed", "failed", "cancelled", "sync_complete", "sync_low_confidence"]),
    []
  );
  const cleanAudioSyncIsRunning = Boolean(
    cleanAudioSyncJob?.status && !cleanAudioSyncTerminalStatuses.has(cleanAudioSyncJob.status)
  );
  const studioMasterWaveformBars = useMemo(() => {
    const bars =
      audioAnalysisByCameraId[hasExternalCleanAudio ? "external-clean-audio" : masterAudioCameraId]
        ?.bars || [];
    return bars.slice(0, 72);
  }, [audioAnalysisByCameraId, hasExternalCleanAudio, masterAudioCameraId]);
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
      const isActivePreview =
        source.id === activeCameraId ||
        source.id === previewSecondaryCameraId ||
        previewReactionCameraIds.includes(source.id);
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
    previewSecondaryCameraId,
    previewReactionCameraIds,
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
    if (!jobId || cleanAudioSyncTerminalStatuses.has(status)) {
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

        const exportStatusActive = isExporting || serverExportPending;
        if (!exportStatusActive && (data.detail || data.stage)) {
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
            if (!exportStatusActive) {
              setStatusMessage("Auto Director paused until sync needs stronger automatic proof.");
            }
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
              if (!exportStatusActive) {
                setStatusMessage(
                  `Director timeline loaded: ${directorTimeline.length} segments, ${directorSwitches.length} camera switches.`
                );
              }
            }
          } else if (directorTimeline.length > 0) {
            setAutoDirectorSummary(null);
          }

          setUseExternalCleanAudio(true);

          if (rejected.length > 0) {
            const names = rejected.map(o => o.label).join(", ");
            if (!exportStatusActive) {
              setStatusMessage(
                `Bad offsets rejected for ${names} — automatic sync proof is still required.`
              );
            }
            toast(`Offsets rejected for ${names}. Export will stay blocked until automatic sync is proven.`, { icon: "⚠️", duration: 10000 });
          } else if (needsReview.length > 0) {
            if (!exportStatusActive) {
              setStatusMessage(
                `${needsReview.length} camera(s) need stronger automatic sync proof — Auto Director is paused.`
              );
            }
            toast(`${needsReview.length} camera(s) need stronger automatic sync proof before export.`, { icon: "⚠️", duration: 8000 });
          } else if (hasDrift) {
            if (!exportStatusActive) {
              setStatusMessage("Sync complete, but possible audio drift detected. Export preflight will verify before render.");
            }
            toast("Possible audio drift — verify sync", { icon: "⚠️", duration: 6000 });
          } else if (shouldUseBackendCleanAudioSync) {
            setAutoDirectorEnabled(false);
            if (!exportStatusActive) {
              setStatusMessage(
                "Machine sync calculated. Export will automatically verify start/middle/end sync before any render starts."
              );
            }
            toast("Automatic start/middle/end sync verification will run before export.", { icon: "✅", duration: 8000 });
          } else {
            if (!exportStatusActive) {
              setStatusMessage("Sync window matched with high confidence. Export will still prove start/middle/end sync before rendering.");
            }
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
  }, [
    cleanAudioSyncJob?.jobId,
    cleanAudioSyncJob?.status,
    cleanAudioSyncTerminalStatuses,
    isExporting,
    serverExportPending,
    shouldUseBackendCleanAudioSync,
    autoDirectorEnabled,
  ]);

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
    if (!renderSubmissionStartedRef.current) {
      exportAbortControllerRef.current?.abort();
    }
    if (exportPollIntervalRef.current) {
      window.clearInterval(exportPollIntervalRef.current);
      exportPollIntervalRef.current = null;
    }
    setServerExportPending(false);
    setIsExporting(false);
    setExportProgress(0);
    setStatusMessage(
      renderSubmissionStartedRef.current
        ? "Stopped monitoring. The server render was already submitted and may still finish."
        : "Export cancelled before the paid render was submitted."
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
    handlePreviewProgramSwitch(
      activeCameraId || readySources[0]?.id || sources[0]?.id,
      normalizedLayoutMode,
      reason ||
        `${PREVIEW_LAYOUT_LABELS[normalizedLayoutMode] || "Layout"} preview only. Paid render stays automatic.`
    );
  };

  const handleRecordSwitch = (cameraId, layoutModeOverride = "cut") => {
    if (!cameraId || !timelineDuration) return;
    const normalizedLayoutMode = normalizeMulticamLayoutMode(layoutModeOverride);
    handlePreviewProgramSwitch(
      cameraId,
      normalizedLayoutMode,
      "Preview-only camera check. Paid render stays automatic."
    );
  };

  const handleSetActiveReactionSide = side => {
    if (!activeCameraId) return;
    setReactionSideOverridesByCameraId(current => ({
      ...current,
      [activeCameraId]: side,
    }));
    setStatusMessage(`Reaction preview moved ${side}. This side will be sent with the render request.`);
  };

  const handleResetManualSwitchPlan = () => {
    setPreviewProgramOverride(null);
    setStatusMessage("Preview reset. Paid render stays automatic.");
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
      setStatusMessage("Auto Director armed. Paid render stays automatic.");
      applyAutoDirectorPlan(true);
      return;
    }
    if (actionId === "multi-grid") {
      activateManualLayoutMode(
        "scene-grid",
        "Show Everyone preview only. Paid render stays automatic."
      );
      return;
    }
    if (actionId === "multi-duet") {
      activateManualLayoutMode(
        "split-vertical",
        "Shared Moment preview only. Paid render stays automatic."
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
    setConfirmedDirectorChannelMapKey("");
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
        "Clean audio is ready. Export will prove sync against the camera scratch audio before rendering."
      );
    } catch (error) {
      setStatusMessage(
        "Clean audio loaded, but waveform analysis failed. Export will still require automatic sync proof."
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
    setExternalAudioSpeakerChannelsSwapped(false);
    setConfirmedDirectorChannelMapKey("");
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
          const maxExtractDuration = Math.max(0.2, Number(options.maxDurationSeconds) || VIDEO_SYNC_MAX_EXTRACT_SECONDS);
          const cappedDuration = Math.min(requestedDuration, maxExtractDuration);
          const duration = clampNumber(
            cappedDuration,
            0.2,
            Math.max(0.2, rawDuration - trimStart),
            Math.min(rawDuration, maxExtractDuration)
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
          const maxExtractDuration = Math.max(0.2, Number(options.maxDurationSeconds) || VIDEO_SYNC_MAX_EXTRACT_SECONDS);
          const duration = clampNumber(
            Math.min(requestedDuration, maxExtractDuration),
            0.2,
            Math.max(0.2, rawDuration - trimStart),
            Math.min(rawDuration, maxExtractDuration)
          );
          let captureStartTime = trimStart;
          let captureDuration = duration;
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
              duration: captureDuration,
              trimStart: captureStartTime,
              trimDuration: captureDuration,
            });
          };

          let lastPct = 0;
          const estimatedBytes = Math.round((VIDEO_SYNC_AUDIO_BPS / 8) * duration * 1.1);
          let captureStarted = false;
          video.ontimeupdate = () => {
            const pct = Math.min(1, Math.max(0, (video.currentTime - captureStartTime) / captureDuration));
            if (pct - lastPct > 0.02) {
              lastPct = pct;
              setStatusMessage(
                `Extracting camera sync audio for ${label} (${Math.round(pct * 100)}%) — upload target ~${formatMediaBytes(estimatedBytes)}...`
              );
            }
            if (captureStarted && video.currentTime >= captureStartTime + captureDuration - 0.05 && recorder.state !== "inactive") {
              recorder.stop();
            }
          };
          video.onended = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };

          const startCapture = () => {
            if (captureStarted || resolved) return;
            captureStarted = true;
            captureStartTime = clampNumber(
              Number(video.currentTime) || trimStart,
              trimStart,
              Math.max(trimStart, rawDuration - 0.2),
              trimStart
            );
            captureDuration = clampNumber(
              Math.min(duration, Math.max(0.2, rawDuration - captureStartTime)),
              0.2,
              Math.max(0.2, rawDuration - captureStartTime),
              duration
            );
            recorder.start(1000);
          };
          video.onplaying = () => startCapture();
          if (trimStart > 0.05) {
            video.onseeked = () => {
              video.play().catch(() => fail());
            };
            video.currentTime = trimStart;
          } else {
            video.play().catch(() => fail());
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
      // Hidden proxy generation should never leak audio over Program Output.
      // The verified external clean audio is provided separately during render.
      video.muted = options.mutePlayback !== false;
      video.volume = options.mutePlayback === false ? 1 : 0;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(file);
      if (!applySafeMediaSource(video, objectUrl)) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }

      let resolved = false;
      let metadataLoaded = false;
      let recordingStarted = false;
      let stopRequested = false;
      let progressWatchdogId = null;
      let finalizingTimeoutId = null;
      const cleanup = () => {
        if (progressWatchdogId) {
          window.clearInterval(progressWatchdogId);
          progressWatchdogId = null;
        }
        if (finalizingTimeoutId) {
          window.clearTimeout(finalizingTimeoutId);
          finalizingTimeoutId = null;
        }
        try {
          video.pause();
        } catch (_) {
          // Ignore cleanup failures from detached media elements.
        }
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
          const sourceWidth = Math.max(1, Number(video.videoWidth) || 1280);
          const sourceHeight = Math.max(1, Number(video.videoHeight) || 720);
          const scale = Math.min(1, UPLOAD_PROXY_MAX_LONG_EDGE / Math.max(sourceWidth, sourceHeight));
          const proxyWidth = Math.max(2, Math.round(sourceWidth * scale / 2) * 2);
          const proxyHeight = Math.max(2, Math.round(sourceHeight * scale / 2) * 2);
          const canvas = document.createElement("canvas");
          canvas.width = proxyWidth;
          canvas.height = proxyHeight;
          const context = canvas.getContext("2d");
          if (!context || typeof canvas.captureStream !== "function") { fail(); return; }
          const canvasStream = canvas.captureStream(EXPORT_FRAME_RATE);
          const mediaStream = typeof video.captureStream === "function" ? video.captureStream() : null;
          const stream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...((mediaStream && mediaStream.getAudioTracks()) || []),
          ]);
          if (!stream.getVideoTracks().length) { fail(); return; }

          const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: UPLOAD_COMPRESSION_TARGET_BPS,
            audioBitsPerSecond: UPLOAD_COMPRESSION_AUDIO_BPS,
          });

          const chunks = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

          recorder.onstop = () => {
            if (resolved) return;
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

          let drawFrameId = null;
          const drawFrame = () => {
            if (resolved || stopRequested) return;
            try {
              context.drawImage(video, 0, 0, proxyWidth, proxyHeight);
            } catch (_) {
              // A decode hiccup should not kill the whole export; the next frame can recover.
            }
            drawFrameId = window.requestAnimationFrame(drawFrame);
          };

          const stopRecording = () => {
            if (stopRequested || recorder.state === "inactive") return;
            stopRequested = true;
            setStatusMessage(`Finalizing local upload proxy for ${label}. This should only take a moment...`);
            if (drawFrameId) {
              window.cancelAnimationFrame(drawFrameId);
              drawFrameId = null;
            }
            video.pause();
            recorder.stop();
            finalizingTimeoutId = window.setTimeout(() => {
              if (!resolved) {
                console.warn("Browser video proxy finalization timed out.");
                fail();
              }
            }, 120000);
          };

          recorder.start(1000);
          recordingStarted = true;
          drawFrame();
          let lastPct = 0;
          let lastProgressAt = Date.now();
          let lastVideoTime = Number(video.currentTime) || trimStart;
          // Accurate estimate: target bitrate × duration (plus audio overhead)
          const estimatedBytes = Math.round(
            ((UPLOAD_COMPRESSION_TARGET_BPS + UPLOAD_COMPRESSION_AUDIO_BPS) / 8) * recordingDuration * 1.05
          );
          const updateProgress = () => {
            if (video.currentTime >= trimEnd - 0.05) {
              stopRecording();
              return;
            }
            const pct = Math.min(1, Math.max(0, (video.currentTime - trimStart) / recordingDuration));
            if (Math.abs(video.currentTime - lastVideoTime) > 0.05) {
              lastVideoTime = video.currentTime;
              lastProgressAt = Date.now();
            }
            if (pct - lastPct > 0.02) {
              lastPct = pct;
              onProgress(pct);
              setStatusMessage(
                `${options.trimDuration ? "Preparing local upload proxy" : "Compressing"} ${label} (${Math.round(pct * 100)}%) — target ~${formatMediaBytes(estimatedBytes)} at 3 Mbps...`
              );
            }
          };
          video.ontimeupdate = updateProgress;
          progressWatchdogId = window.setInterval(() => {
            if (resolved || stopRequested) return;
            updateProgress();
            if (Date.now() - lastProgressAt > 90000) {
              console.warn("Browser video proxy preparation stalled.");
              setStatusMessage(`Local upload proxy for ${label} stalled before finishing. Please retry.`);
              fail();
            }
          }, 1000);

          video.onended = () => {
            stopRecording();
          };
          video.play().catch(() => fail());
        } catch (_) { fail(); }
      };

      video.onloadedmetadata = () => {
        metadataLoaded = true;
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
      setTimeout(() => { if (!resolved && !metadataLoaded && !recordingStarted) fail(); }, 25000);
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

    let uploadFile = file;
    let actualTrimStart = Number(trimWindow?.start || 0) || 0;
    let actualTrimDuration = Number(trimWindow?.duration || 0) || 0;

    // --- FALLBACK: direct browser upload to Firebase ---
    // Compress large audio files for sync (WAV → 16kHz mono WAV, ~90% smaller)
    if (mode === "audio_only" && !isAudioOnly) {
      const syncCacheKey = buildSyncAudioCacheKey(file, trimWindow);
      const cachedSyncAudio = await readCachedSyncAudioFile(syncCacheKey);
      if (cachedSyncAudio?.file) {
        const cachedSyncAudioFile = cachedSyncAudio.file;
        const cachedStats = await getAudioFileSignalStats(cachedSyncAudioFile);
        if (hasUsableAudioSignal(cachedStats)) {
          actualTrimStart = Number(cachedSyncAudio.trimStart ?? actualTrimStart) || 0;
          actualTrimDuration = Number(cachedSyncAudio.trimDuration ?? actualTrimDuration) || 0;
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
          maxDurationSeconds: trimWindow?.duration || VIDEO_SYNC_MAX_EXTRACT_SECONDS,
        });
        if (!videoAudio?.file) {
          throw new Error(
            `${label} camera audio could not be extracted in the browser. Please try Chrome/Edge or use a shorter camera file.`
          );
        }
        await writeCachedSyncAudioFile(syncCacheKey, videoAudio.file, {
          trimStart: videoAudio.trimStart,
          trimDuration: videoAudio.trimDuration,
        });
        actualTrimStart = Number(videoAudio.trimStart ?? actualTrimStart) || 0;
        actualTrimDuration = Number(videoAudio.trimDuration ?? actualTrimDuration) || 0;
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
        maxDurationSeconds: trimWindow?.duration || VIDEO_SYNC_MAX_EXTRACT_SECONDS,
      });
      if (audioCompressed) {
        actualTrimStart = Number(audioCompressed.trimStart ?? actualTrimStart) || 0;
        actualTrimDuration = Number(audioCompressed.trimDuration ?? actualTrimDuration) || 0;
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
    let renderProxyCacheKey = "";
    if (shouldCreateVideoProxy) {
      renderProxyCacheKey = buildRenderProxyCacheKey(file, trimWindow);
      const cachedRenderProxyUpload = renderProxyCacheKey
        ? await readCachedRenderProxyUpload(renderProxyCacheKey)
        : null;
      if (cachedRenderProxyUpload?.url) {
        actualTrimStart = Number(cachedRenderProxyUpload.trimStart ?? actualTrimStart) || 0;
        actualTrimDuration = Number(cachedRenderProxyUpload.trimDuration ?? actualTrimDuration) || 0;
        setStatusMessage(
          `Reusing uploaded render-window proxy for ${label}. No repeat upload needed.`
        );
        return {
          url: cachedRenderProxyUpload.url,
          videoUrl: cachedRenderProxyUpload.videoUrl || cachedRenderProxyUpload.url,
          syncAudioUrl: "",
          trimStart: actualTrimStart,
          trimDuration: actualTrimDuration,
        };
      }
      const cachedRenderProxy = renderProxyCacheKey
        ? await readCachedRenderProxyFile(renderProxyCacheKey)
        : null;

      if (cachedRenderProxy?.file) {
        actualTrimStart = Number(cachedRenderProxy.trimStart ?? actualTrimStart) || 0;
        actualTrimDuration = Number(cachedRenderProxy.trimDuration ?? actualTrimDuration) || 0;
        uploadFile = cachedRenderProxy.file;
        const summary = `${label} local proxy cache reused: ${formatDurationLabel(actualTrimDuration)} · ${formatMediaBytes(uploadFile.size)}`;
        toast.success(summary, { duration: 5000 });
        setStatusMessage(`${summary}. Uploading now...`);
      } else {
        setStatusMessage(
          trimWindow
            ? `Creating local upload proxy for ${label} (${formatDurationLabel(trimWindow.duration)})...`
            : `Checking if ${label} can be compressed to save upload time...`
        );
        const compressed = await compressVideoFile(file, label, () => {}, {
          trimStart: trimWindow?.start || 0,
          trimDuration: trimWindow?.duration || 0,
        });
        if (compressed) {
          actualTrimStart = Number(compressed.trimStart ?? actualTrimStart) || 0;
          actualTrimDuration = Number(compressed.trimDuration ?? actualTrimDuration) || 0;
          if (renderProxyCacheKey) {
            await writeCachedRenderProxyFile(renderProxyCacheKey, compressed.file, {
              originalSize: compressed.originalSize,
              trimStart: actualTrimStart,
              trimDuration: actualTrimDuration,
            });
          }
          const pctSaved = Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100);
          const summary = trimWindow
            ? `${label} local proxy: ${formatDurationLabel(compressed.trimDuration)} · ${formatMediaBytes(compressed.compressedSize)} (${pctSaved}% smaller than original)`
            : `${label} compressed: ${formatMediaBytes(compressed.originalSize)} → ${formatMediaBytes(compressed.compressedSize)} (${pctSaved}% smaller)`;
          toast.success(summary, { duration: 6000 });
          setStatusMessage(`${summary}. Uploading now...`);
          uploadFile = compressed.file;
        } else {
          setStatusMessage(
            `Cannot create a local upload proxy for ${label} in this browser. Full original upload is blocked.`
          );
        }
      }
    }

    if (mode === "audio_only" && !isAudioOnly && uploadFile === file) {
      throw new Error(
        `${label || "Camera"} sync needs a small extracted audio proxy, but the browser could not create one. Refusing to upload the full ${formatMediaBytes(file.size)} camera file for sync.`
      );
    }
    if (mode === "audio_only" && isAudioOnly && uploadFile === file && file.size > AUDIO_SYNC_COMPRESSION_THRESHOLD) {
      throw new Error(
        `${label || "Clean audio"} sync needs a compressed audio proxy, but the browser could not create one. Refusing to upload the full ${formatMediaBytes(file.size)} audio file for sync.`
      );
    }
    if (shouldCreateVideoProxy && uploadFile === file) {
      throw new Error(
        `${label || "Camera"} render needs a trimmed/compressed video proxy, but the browser could not create one. Refusing to upload the full ${formatMediaBytes(file.size)} camera file.`
      );
    }

    const safeName = (uploadFile.name || `${label || "media"}.bin`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const mediaRef = ref(storage, `${folder}/${user.uid}/${Date.now()}_${safeName}`);
    const startTime = Date.now();
    const uploadPurpose =
      mode === "audio_only"
        ? "sync proxy"
        : trimWindow
          ? "render-window proxy"
          : "media";
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
            `Uploading ${label || file.name || "media"} ${uploadPurpose} — ${formatMediaBytes(transferred)} / ${formatMediaBytes(total)} (${pct.toFixed(1)}%, ${speedStr}${eta ? `, ${eta}` : ""})...`
          );
        },
        reject,
        resolve
      );
    });
    const directUrl = await getDownloadURL(mediaRef);
    if (shouldCreateVideoProxy && renderProxyCacheKey) {
      await writeCachedRenderProxyUpload(renderProxyCacheKey, {
        url: directUrl,
        videoUrl: directUrl,
        size: uploadFile.size,
        trimStart: actualTrimStart,
        trimDuration: actualTrimDuration,
      });
    }
    return {
      url: directUrl,
      videoUrl: mode === "audio_only" ? "" : directUrl,
      syncAudioUrl: mode === "audio_only" ? directUrl : "",
      trimStart: actualTrimStart,
      trimDuration: actualTrimDuration,
    };
  };

  const buildBackendMediaCacheKey = file =>
    file
      ? `${file.name || "media"}:${file.size || 0}:${file.lastModified || 0}`
      : "";

  const buildOriginalIngestCacheKey = file =>
    file ? `cloud-original:v1:${buildBackendMediaCacheKey(file)}` : "";

  const uploadOriginalForCloudRender = async ({ user, file, label, purpose, signal }) => {
    if (!file) throw new Error(`${label || "Media"} is missing its original file.`);
    const cacheKey = buildOriginalIngestCacheKey(file);
    const cached = await readCachedRenderProxyUpload(cacheKey);
    if (cached?.url) {
      setStatusMessage(`${label}: reusing the original cloud upload.`);
      return cached;
    }

    const startedAt = Date.now();
    const uploaded = await uploadMulticamSourceResumable({
      apiBaseUrl: API_BASE_URL,
      getToken: forceRefresh => user.getIdToken(forceRefresh === true),
      file,
      purpose,
      signal,
      onProgress: (loaded, total) => {
        const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
        const speed = loaded / elapsedSeconds;
        const remainingSeconds = speed > 0 ? Math.max(0, total - loaded) / speed : 0;
        const eta = remainingSeconds > 90
          ? ` · ~${Math.ceil(remainingSeconds / 60)} min left`
          : remainingSeconds > 10
            ? ` · ~${Math.ceil(remainingSeconds)} sec left`
            : "";
        setStatusMessage(
          `Uploading ${label} once — ${formatMediaBytes(loaded)} / ${formatMediaBytes(total)}${eta}`
        );
      },
    });
    const cacheExpiresAt = uploaded.deleteAfter
      ? Math.max(Date.now(), Date.parse(uploaded.deleteAfter) - 30 * 60 * 1000)
      : Date.now() + 70 * 60 * 60 * 1000;
    const cachedUpload = {
      ...uploaded,
      videoUrl: uploaded.url,
      cacheExpiresAt,
    };
    await writeCachedRenderProxyUpload(cacheKey, cachedUpload);
    return cachedUpload;
  };

  const buildSyncAudioCacheKey = (file, trimWindow = null) => {
    if (!file) return "";
    const extractorVersion = "v3-full-preflight-window";
    const trimStart = Math.max(0, Number(trimWindow?.start || 0) || 0);
    const trimDuration = Math.max(0, Number(trimWindow?.duration || 0) || 0);
    const trimSuffix = trimDuration > 0.05
      ? `:trim:${trimStart.toFixed(3)}:${trimDuration.toFixed(3)}`
      : "";
    return `sync-audio:${extractorVersion}:${buildBackendMediaCacheKey(file)}${trimSuffix}`;
  };

  const buildRenderProxyCacheKey = (file, trimWindow = null) => {
    if (!file || !trimWindow) return "";
    const proxyVersion = `v1-webm-${UPLOAD_COMPRESSION_TARGET_BPS}-${UPLOAD_COMPRESSION_AUDIO_BPS}`;
    const trimStart = Math.max(0, Number(trimWindow?.start || 0) || 0);
    const trimDuration = Math.max(0, Number(trimWindow?.duration || 0) || 0);
    if (trimDuration <= 0.05) return "";
    return `render-proxy:${proxyVersion}:${buildBackendMediaCacheKey(file)}:trim:${trimStart.toFixed(3)}:${trimDuration.toFixed(3)}`;
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
          sync_trim_start: Number(uploadResult.trimStart ?? sourceSyncTrimStart) || 0,
          sync_trim_duration: Number(uploadResult.trimDuration ?? sourceSyncTrimDuration) || 0,
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
            sync_trim_start: Number(externalAudioUpload.trimStart ?? externalSyncTrimStart) || 0,
            sync_trim_duration: Number(externalAudioUpload.trimDuration ?? externalSyncTrimDuration) || 0,
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
        "We could not prove automatic sync. Export will stay blocked until sync is rerun and verified."
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
        `${syncedCount} camera${syncedCount === 1 ? "" : "s"} synced to clean audio. Export will still prove start/middle/end sync before rendering.`
      );
    } else {
      setStatusMessage(
        "We could not prove automatic sync. Export will stay blocked until sync is rerun and verified."
      );
    }
  };

  const sourceHasMachineCleanAudioSyncResult = source =>
    Boolean(
      source?.backendSyncMethod ||
        source?.backendSyncStatus ||
        Number(source?.backendSyncConfidence || 0) > 0 ||
        source?.backendSyncDebug ||
        source?.backendSyncDrift
    );

  const sourceHasPreviewSyncCorrection = source => {
    if (!isVideoSource(source)) return true;
    const offsetSeconds = Number(source.offsetSeconds || 0);
    const syncRate = getSourceSyncRate(source);
    const backendStatus = String(source.backendSyncStatus || "").toLowerCase();
    const hasWorkerCleanAudioResult = sourceHasMachineCleanAudioSyncResult(source);
    if (source.autoSyncApplied || source.manualOffsetLocked) {
      return true;
    }
    if (hasExternalCleanAudio && shouldUseBackendCleanAudioSync && hasWorkerCleanAudioResult) {
      return false;
    }
    return Boolean(
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
        tone: "processing",
        title: "Automatic export proof pending",
        detail: `${unsyncedSources.length} camera${unsyncedSources.length === 1 ? "" : "s"} have provisional machine offsets. Export will prove start/middle/end sync automatically before rendering.`,
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
    shouldUseBackendCleanAudioSync,
  ]);

  const ensureProgramOutputCleanAudioSync = async () => {
    if (!hasExternalCleanAudio) return true;

    const candidates = readySources.filter(isVideoSource);
    if (!candidates.length) return true;

    if (candidates.every(sourceHasPreviewSyncCorrection)) {
      return true;
    }

    if (
      shouldUseBackendCleanAudioSync &&
      candidates.every(source => source.manualOffsetLocked || sourceHasMachineCleanAudioSyncResult(source))
    ) {
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
      setStatusMessage(
        "Program Output is preview-only with provisional timing. Export will upload bounded proxies and prove start/middle/end sync before any paid render."
      );
      return true;
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
    setFlowEditInsight("Flow Edit is off. Cam Combiner stays in automatic preview mode.");
  };

  handleRecordSwitchRef.current = handleRecordSwitch;

  const handleRemoveSwitch = switchId => {
    if (!switchId) return;
    if (!isSingleSourceWorkflow && flowEditEnabled) {
      setStatusMessage("Flow cut removal is disabled for Cam Combiner export. Paid render stays automatic.");
      return;
    }
    if (!isSingleSourceWorkflow) {
      setStatusMessage("Timeline editing is disabled. Paid render stays automatic.");
      return;
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

  // Keyboard shortcuts: 1-6 switch cameras, W wide, Space play/pause
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
            const effectiveExportLayout = reactionOverlayEnabled
              ? exportLayout
              : suppressReactionOverlayLayout(exportLayout);
            const visibleFeeds = (effectiveExportLayout.visibleCameraIds || [currentSegment?.cameraId])
              .filter(Boolean)
              .slice(0, 6)
              .map((cameraId, index) => ({
                video: exportVisuals.get(cameraId),
                label: readySources.find(source => source.id === cameraId)?.label || cameraId,
                framing: index === 0 ? activeSingleCamFraming : {},
              }))
              .filter(feed => feed.video);
            drawCompositeVisualToCanvas(context, canvas, {
              layoutMode: effectiveExportLayout.layoutMode,
              primaryVideo: exportVisuals.get(currentSegment?.cameraId),
              secondaryVideo: exportVisuals.get(effectiveExportLayout.secondaryCameraId),
              primaryLabel: currentCameraLabel,
              primaryFraming:
                flowEditEnabled && currentSegment?.id
                  ? normalizeSegmentFraming(flowSegmentFraming[currentSegment?.id])
                  : activeSingleCamFraming,
              secondaryLabel: readySources.find(
                source => source.id === effectiveExportLayout.secondaryCameraId
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
    if (hasExternalCleanAudio) {
      if (cleanAudioSyncIsRunning || syncingCameraId === "external-clean-audio") {
        const message =
          "Server render blocked: clean-audio sync is still uploading or processing. Export preflight will run only after automatic sync finishes.";
        setStatusMessage(message);
        toast.error(message);
        return;
      }
    }

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
    if (
      hasExternalCleanAudio &&
      readySources.length >= 2 &&
      !directorChannelMapConfirmed
    ) {
      const leftCamera = getExportSourceLabel(
        externalAudioSpeakerChannelsSwapped ? readySources[1] : readySources[0],
        externalAudioSpeakerChannelsSwapped ? 1 : 0
      );
      const rightCamera = getExportSourceLabel(
        externalAudioSpeakerChannelsSwapped ? readySources[0] : readySources[1],
        externalAudioSpeakerChannelsSwapped ? 0 : 1
      );
      const message =
        `Confirm the clean-audio speaker mapping before any upload or charge: ` +
        `left channel = ${leftCamera}, right channel = ${rightCamera}.`;
      setStatusMessage(message);
      toast.error(message);
      return;
    }
    if (cloudRenderWindow.exceedsServerCap) {
      const message = "Server MP4 render supports a maximum total timeline of 3 hours.";
      setStatusMessage(message);
      toast.error(message);
      return;
    }
    if (cloudRenderWindowDuration <= 0.5) {
      setStatusMessage("The full timeline must be longer than half a second before export.");
      toast.error("Set a valid timeline before export.");
      return;
    }
    const plannedRenderWindowStart = cloudRenderWindowStartSafe;
    const plannedRenderWindowEnd = cloudRenderWindowEnd;
    const plannedRenderWindowDuration = cloudRenderWindowDuration;
    const plannedProxyItems = await Promise.all(readySources.filter(isVideoSource).map(async source => {
      const cachedUpload = source.file
        ? await readCachedRenderProxyUpload(buildOriginalIngestCacheKey(source.file))
        : null;
      const existingRemoteOriginal = String(source.cloudOriginalUrl || "").startsWith("http");
      const canReuseOriginal = existingRemoteOriginal || Boolean(cachedUpload?.url);
      return {
        label: getExportSourceLabel(source, readySources.findIndex(item => item.id === source.id)),
        estimatedBytes: canReuseOriginal ? 0 : Number(source.file?.size || 0),
        hasMatchingRenderProxy: canReuseOriginal,
      };
    }));
    const estimatedVideoUploadBytes = plannedProxyItems.reduce(
      (sum, item) => sum + item.estimatedBytes,
      0
    );
    const cachedExternalOriginal = hasExternalCleanAudio && externalAudioTrack?.file
      ? await readCachedRenderProxyUpload(buildOriginalIngestCacheKey(externalAudioTrack.file))
      : null;
    const estimatedCleanAudioUploadBytes = hasExternalCleanAudio && !cachedExternalOriginal?.url
      ? Number(externalAudioTrack?.file?.size || 0)
      : 0;
    const estimatedTotalUploadBytes = estimatedVideoUploadBytes + estimatedCleanAudioUploadBytes;
    const proxyLines = plannedProxyItems.map(
      item =>
        `${item.label}: ${
          item.hasMatchingRenderProxy
            ? "existing original upload reused"
            : `${formatMediaBytes(item.estimatedBytes)} original`
        }`
    );
    const approvedRender = window.confirm(
      [
        cloudRenderMode === "proof"
          ? "Start the 60-second production proof?"
          : "Start the full verified MP4 render?",
        "",
        `${cloudRenderMode === "proof" ? "Proof range" : "Full timeline"}: ${formatDurationLabel(plannedRenderWindowStart)} to ${formatDurationLabel(plannedRenderWindowEnd)} (${formatDurationLabel(plannedRenderWindowDuration)})`,
        `Internal checkpoints: ${cloudRenderWindow.checkpointCount} × up to ${formatDurationLabel(MULTICAM_RENDER_CHECKPOINT_SECONDS)}`,
        cloudRenderMode === "proof"
          ? `Proof render credits: ${MULTICAM_PRODUCTION_PROOF_CREDITS}`
          : `Render credits: ${multicamRenderCreditEstimate} credits (${getMulticamRenderBillingUnits(plannedRenderWindowDuration)} started 20-minute billing units)`,
        "One-time resumable source upload + automatic preflight: 0 credits",
        hasExternalCleanAudio ? "Separate clean-audio sync charge: 0 credits in this export flow" : null,
        "",
        "Estimated upload before render:",
        ...proxyLines,
        hasExternalCleanAudio
          ? `Clean audio original: ${formatMediaBytes(estimatedCleanAudioUploadBytes)}`
          : null,
        `Estimated total upload: ~${formatMediaBytes(estimatedTotalUploadBytes)}`,
        "",
        "Credits are charged only if automatic start/middle/end preflight passes and the server render starts.",
        "If preflight cannot prove sync, render blocks before credits are charged.",
      ]
        .filter(Boolean)
        .join("\n")
    );
    if (!approvedRender) {
      setStatusMessage("MP4 render cancelled before source upload or credits.");
      return;
    }
    cancelExportRef.current = false;
    renderSubmissionStartedRef.current = false;
    exportAbortControllerRef.current?.abort();
    const exportAbortController = new AbortController();
    exportAbortControllerRef.current = exportAbortController;
    const exportSignal = exportAbortController.signal;
    const assertExportActive = () => {
      if (cancelExportRef.current || exportSignal.aborted) {
        const cancelledError = new Error("Export cancelled before the paid render was submitted.");
        cancelledError.name = "AbortError";
        throw cancelledError;
      }
    };
    setServerExportPending(true);
    setIsExporting(true);
    setExportProgress(0);
    setStatusMessage("Preparing verified MP4 export. Automatic preflight will run before render starts...");

    let asyncRenderStarted = false;
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in to use server rendering.");
      const renderWindowStart = cloudRenderWindowStartSafe;
      const renderWindowEnd = cloudRenderWindowEnd;
      const renderWindowDuration = cloudRenderWindowDuration;
      const renderTimelineStart = renderWindowStart;

      let externalAudioPayload = null;
      const verifiedSyncBySourceId = new Map();
      const originalUploadsBySourceId = new Map();

      setStatusMessage("Uploading original sources once. Uploads are resumable and retained for 72 hours...");
      const sourceUploadResults = await Promise.all(
        readySources.map(async (source, index) => {
          const existingUrl = String(source.cloudOriginalUrl || "").startsWith("http")
            ? source.cloudOriginalUrl
            : "";
          if (existingUrl) {
            return [source.id, {
              url: existingUrl,
              cacheKey: source.cloudOriginalCacheKey || buildBackendMediaCacheKey(source.file),
              storagePath: source.cloudOriginalStoragePath || "",
            }];
          }
          const uploaded = await uploadOriginalForCloudRender({
            user,
            file: source.file,
            label: getExportSourceLabel(source, index),
            purpose: "camera_original",
            signal: exportSignal,
          });
          return [source.id, uploaded];
        })
      );
      assertExportActive();
      sourceUploadResults.forEach(([sourceId, uploaded]) => {
        originalUploadsBySourceId.set(sourceId, uploaded);
      });
      setSources(currentSources =>
        currentSources.map(source => {
          const uploaded = originalUploadsBySourceId.get(source.id);
          return uploaded
            ? {
                ...source,
                cloudOriginalUrl: uploaded.url,
                cloudOriginalStoragePath: uploaded.storagePath || "",
                cloudOriginalCacheKey: uploaded.cacheKey || buildBackendMediaCacheKey(source.file),
              }
            : source;
        })
      );

      let externalOriginalUpload = null;
      if (hasExternalCleanAudio && externalAudioTrack) {
        const existingExternalUrl = String(externalAudioTrack.cloudOriginalUrl || "").startsWith("http")
          ? externalAudioTrack.cloudOriginalUrl
          : "";
        externalOriginalUpload = existingExternalUrl
          ? {
              url: existingExternalUrl,
              cacheKey:
                externalAudioTrack.cloudOriginalCacheKey ||
                buildBackendMediaCacheKey(externalAudioTrack.file),
              storagePath: externalAudioTrack.cloudOriginalStoragePath || "",
            }
          : await uploadOriginalForCloudRender({
              user,
              file: externalAudioTrack.file,
              label: "External clean audio",
              purpose: "external_audio",
              signal: exportSignal,
            });
      }
      assertExportActive();

      const runExportPreflight = async (preflightSourcesPayload, preflightExternalAudioPayload) => {
        assertExportActive();
        setStatusMessage("Preflight: proving start/middle/end sync from the uploaded originals...");
        try {
          const preflightBody = {
            sources: preflightSourcesPayload.map(source => ({
              id: source.id,
              label: source.label || "",
              url: source.url,
              storage_path: source.storage_path || source.storagePath || "",
              storagePath: source.storagePath || source.storage_path || "",
              offset_seconds: getPreflightProxyOffsetSeconds(source),
              sync_rate: source.sync_rate,
              syncRate: source.syncRate,
              sync_trim_start: Number(source.upload_trim_start || 0) || 0,
              sync_trim_duration: Number(source.upload_trim_duration || 0) || 0,
              upload_trim_start: Number(source.upload_trim_start || 0) || 0,
              upload_trim_duration: Number(source.upload_trim_duration || 0) || 0,
            })),
            external_audio_url: preflightExternalAudioPayload.url,
            external_audio_offset_seconds: preflightExternalAudioPayload.offset_seconds,
            externalAudio: {
              url: preflightExternalAudioPayload.url,
              offset_seconds: preflightExternalAudioPayload.offset_seconds,
              mix_mode: preflightExternalAudioPayload.mix_mode,
              cache_key: preflightExternalAudioPayload.cache_key,
              storage_path:
                preflightExternalAudioPayload.storage_path ||
                preflightExternalAudioPayload.storagePath ||
                "",
              storagePath:
                preflightExternalAudioPayload.storagePath ||
                preflightExternalAudioPayload.storage_path ||
                "",
              sync_trim_start: Number(preflightExternalAudioPayload.upload_trim_start || 0) || 0,
              sync_trim_duration: Number(preflightExternalAudioPayload.upload_trim_duration || 0) || 0,
              upload_trim_start: Number(preflightExternalAudioPayload.upload_trim_start || 0) || 0,
              upload_trim_duration: Number(preflightExternalAudioPayload.upload_trim_duration || 0) || 0,
            },
            external_audio_sync_trim_start: Number(preflightExternalAudioPayload.upload_trim_start || 0) || 0,
            external_audio_sync_trim_duration: Number(preflightExternalAudioPayload.upload_trim_duration || 0) || 0,
            timelineStart: renderTimelineStart,
            timeline_start: renderTimelineStart,
            overlapStart: renderTimelineStart,
            overlap_start: renderTimelineStart,
            overlapDuration: renderWindowDuration,
            overlap_duration: renderWindowDuration,
          };
          const preflightToken = await user.getIdToken(true);
          const preflightRes = await fetch(`${API_BASE_URL}/api/media/multicam/preflight-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${preflightToken}`,
            },
            body: JSON.stringify(preflightBody),
            signal: exportSignal,
          });
          assertExportActive();
          const preflight = await preflightRes.json();
          console.log("PREFLIGHT AUTO-ALIGN RESULT:", preflight);
          if (!preflightRes.ok || preflight?.error) {
            const preflightErrorMessage =
              preflight?.error ||
              preflight?.message ||
              preflight?.detail ||
              `Preflight returned ${preflightRes.status}`;
            throw new Error(preflightErrorMessage);
          }

          const preflightStatus = String(preflight.status || "");
          const adjustments = applyPreflightSyncSuggestions(preflightSourcesPayload, preflight);
          const verifiedIds = getPreflightVerifiedSourceIds(preflightSourcesPayload, preflight);
          preflightSourcesPayload.forEach(source => {
            if (verifiedIds.has(source.id)) {
              verifiedSyncBySourceId.set(source.id, {
                offsetSeconds: Number(source.offset_seconds) || 0,
                syncRate: getSourceSyncRate(source),
              });
            }
          });
          if (preflightStatus !== "good") {
            setStatusMessage("Sync preflight was not proven safe. Render cancelled before credits are spent.");
          } else if (adjustments.length) {
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
                      autoSyncVerifiedAt: new Date().toISOString(),
                      manualOffsetLocked: false,
                    }
                  : source;
              })
            );
            setStatusMessage(
              `Preflight corrected and verified ${adjustments.length} camera${adjustments.length === 1 ? "" : "s"}. Starting the original-quality render.`
            );
          } else if (verifiedIds.size) {
            setSources(currentSources =>
              currentSources.map(source =>
                verifiedIds.has(source.id)
                  ? {
                      ...source,
                      autoSyncApplied: true,
                      autoSyncVerifiedAt: new Date().toISOString(),
                    }
                  : source
              )
            );
            setStatusMessage("Preflight proved start/middle/end sync. Starting the original-quality render.");
          } else if (preflight.status === "unsafe") {
            setStatusMessage("Warning: Sync preflight could not find a safe automatic correction.");
          }

          const missingVerified = preflightSourcesPayload.filter(source => !verifiedIds.has(source.id));
          if (preflightStatus !== "good" || missingVerified.length) {
            const preflightSummary = summarizePreflightIssue(preflight);
            throw new Error(
              `Automatic start/middle/end sync returned ${preflightStatus || "unknown"} and could not prove ${missingVerified.length || preflightSourcesPayload.length} camera${(missingVerified.length || preflightSourcesPayload.length) === 1 ? "" : "s"}. ${preflightSummary ? `${preflightSummary}. ` : ""}Render cancelled before credits are spent.`
            );
          }
        } catch (preflightErr) {
          console.warn("Preflight auto-align failed before render:", preflightErr);
          const preflightErrorText = String(preflightErr?.message || "");
          if (/token expired|auth|session/i.test(preflightErrorText)) {
            throw new Error(
              "Session refreshed too late during sync preflight. Render cancelled before credits are spent. Retry now; the original uploads will be reused."
            );
          }
          throw preflightErr instanceof Error
            ? preflightErr
            : new Error("Automatic start/middle/end sync preflight failed. Render cancelled before credits are spent.");
        }
      };

      if (hasExternalCleanAudio && externalAudioTrack) {
        setStatusMessage("Originals uploaded. Proving start/middle/end sync on the server...");
        const preflightSourcesPayload = readySources.map((source, i) => {
          const sourceLabel = getExportSourceLabel(source, i);
          const originalUpload = originalUploadsBySourceId.get(source.id);
          return {
            id: source.id,
            url: originalUpload?.url,
            label: sourceLabel,
            offset_seconds: Number(source.offsetSeconds) || 0,
            sync_rate: getSourceSyncRate(source),
            syncRate: getSourceSyncRate(source),
            cache_key: originalUpload?.cacheKey || buildBackendMediaCacheKey(source.file),
            storage_path: originalUpload?.storagePath || "",
            storagePath: originalUpload?.storagePath || "",
            upload_trim_start: 0,
            upload_trim_duration: 0,
          };
        });

        const externalOriginalOffset = Number(externalAudioTrack.offsetSeconds || 0) || 0;
        const externalAudioRemoteUrl = externalOriginalUpload?.url;
        externalAudioPayload = {
          url: externalAudioRemoteUrl,
          offset_seconds: externalOriginalOffset,
          mix_mode: externalAudioMixMode,
          cache_key:
            externalOriginalUpload?.cacheKey ||
            buildBackendMediaCacheKey(externalAudioTrack.file) ||
            externalAudioTrack.name,
          storage_path: externalOriginalUpload?.storagePath || "",
          storagePath: externalOriginalUpload?.storagePath || "",
          upload_trim_start: 0,
          upload_trim_duration: 0,
        };
        setExternalAudioTrack(current =>
          current
            ? {
                ...current,
                url: externalAudioRemoteUrl,
                cacheKey: externalAudioPayload.cache_key,
                cloudOriginalUrl: externalAudioRemoteUrl,
                cloudOriginalStoragePath: externalOriginalUpload?.storagePath || "",
                cloudOriginalCacheKey: externalAudioPayload.cache_key,
              }
            : current
        );
        await runExportPreflight(preflightSourcesPayload, externalAudioPayload);
        assertExportActive();
      }

      const sourcesPayload = [];
      for (let i = 0; i < readySources.length; i++) {
        const source = readySources[i];
        const verifiedSync = verifiedSyncBySourceId.get(source.id);
        const sourceForRender = verifiedSync
          ? {
              ...source,
              offsetSeconds: verifiedSync.offsetSeconds,
              syncRate: verifiedSync.syncRate,
              sync_rate: verifiedSync.syncRate,
            }
          : source;
        setExportProgress((i / readySources.length) * 0.5);
        const sourceLabel = getExportSourceLabel(source, i);
        setStatusMessage(
          `Preparing ${sourceLabel} for cloud render (${i + 1}/${readySources.length})...`
        );
        const originalUpload = originalUploadsBySourceId.get(source.id);
        const remoteUrl = originalUpload?.url || "";
        if (!remoteUrl) throw new Error(`No video file for ${source.label}.`);

        const renderSyncRate = getSourceSyncRate(sourceForRender);
        const renderOffsetSeconds = Number(sourceForRender.offsetSeconds) || 0;
        sourcesPayload.push({
          id: source.id,
          url: remoteUrl,
          label: sourceLabel,
          offset_seconds: renderOffsetSeconds,
          sync_rate: renderSyncRate,
          syncRate: renderSyncRate,
          cache_key: originalUpload?.cacheKey || buildBackendMediaCacheKey(source.file),
          storage_path: originalUpload?.storagePath || "",
          storagePath: originalUpload?.storagePath || "",
          reaction_side: getPreviewReactionSideForSource(
            source,
            i,
            reactionSideOverridesByCameraId[source.id]
          ),
          reactionSide: getPreviewReactionSideForSource(
            source,
            i,
            reactionSideOverridesByCameraId[source.id]
          ),
          upload_trim_start: 0,
          upload_trim_duration: 0,
        });
      }
      setSources(currentSources =>
        currentSources.map(source => {
          const uploaded = sourcesPayload.find(item => item.id === source.id);
          return uploaded && String(uploaded.url || "").startsWith("/")
            ? { ...source, serverRenderLocalPath: uploaded.url, localRenderPath: uploaded.url }
            : uploaded
              ? {
                  ...source,
                  cloudOriginalUrl: uploaded.url,
                  cloudOriginalCacheKey: uploaded.cache_key || source.cloudOriginalCacheKey || "",
                }
              : source;
        })
      );

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
          "No valid camera segments were found across the full synced timeline. Check source offsets and duration coverage."
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

      const useServerAutoDirector = readySources.length >= 2;
      const directorChannelCameraIds =
        useServerAutoDirector && externalAudioPayload && sourcesPayload.length >= 2
          ? externalAudioSpeakerChannelsSwapped
            ? [sourcesPayload[1].id, sourcesPayload[0].id]
            : [sourcesPayload[0].id, sourcesPayload[1].id]
          : null;
      const trustedDirectorChannelMap = directorChannelCameraIds
        ? {
            status: "approved",
            proof_kind: "human_confirmed_ui_v1",
            channel_camera_ids: directorChannelCameraIds,
            contract_id: `human-channel-map:${directorChannelMapKey}`,
          }
        : null;
      assertExportActive();
      renderSubmissionStartedRef.current = true;
      const renderToken = await user.getIdToken(true);
      const response = await fetch(`${API_BASE_URL}/api/media/render-multicam`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${renderToken}`,
        },
        body: JSON.stringify({
          sources: sourcesPayload,
          segments: useServerAutoDirector ? [] : renderSegmentsPayload,
          switches: useServerAutoDirector ? [] : switchesPayload,
          primaryAudioCameraId: masterAudioCameraId,
          primary_audio_camera_id: masterAudioCameraId,
          directorChannelCameraIds,
          director_channel_camera_ids: directorChannelCameraIds,
          trustedDirectorChannelMap,
          trusted_director_channel_map: trustedDirectorChannelMap,
          timelineStart: renderTimelineStart,
          timeline_start: renderTimelineStart,
          overlapStart: renderTimelineStart,
          overlap_start: renderTimelineStart,
          overlapDuration: renderWindowDuration,
          overlap_duration: renderWindowDuration,
          renderSpecVersion: MULTICAM_RENDER_SPEC_VERSION,
          render_spec_version: MULTICAM_RENDER_SPEC_VERSION,
          totalDurationSeconds: renderWindowDuration,
          total_duration_seconds: renderWindowDuration,
          checkpointSeconds: MULTICAM_RENDER_CHECKPOINT_SECONDS,
          checkpoint_seconds: MULTICAM_RENDER_CHECKPOINT_SECONDS,
          checkpointedRender: cloudRenderWindow.checkpointCount > 1,
          checkpointed_render: cloudRenderWindow.checkpointCount > 1,
          expectedCheckpointCount: cloudRenderWindow.checkpointCount,
          expected_checkpoint_count: cloudRenderWindow.checkpointCount,
          renderPurpose: cloudRenderWindow.renderPurpose || "full_master",
          render_purpose: cloudRenderWindow.renderPurpose || "full_master",
          outputAspectRatio: outputAspectRatio,
          output_aspect_ratio: outputAspectRatio,
          renderTier: multicamRenderTier,
          render_tier: multicamRenderTier,
          autoSwitch: useServerAutoDirector,
          auto_switch: useServerAutoDirector,
          audioBasedAutoSwitch: true,
          audio_based_auto_switch: true,
          autoSwitchInterval: 2,
          auto_switch_interval: 2,
          autoSwitchAggressiveness: flowIntensityMode === "harder" ? "aggressive" : "balanced",
          auto_switch_aggressiveness: flowIntensityMode === "harder" ? "aggressive" : "balanced",
          reactionOverlays: reactionOverlayEnabled,
          reaction_overlays: reactionOverlayEnabled,
          burnCaptions: multicamBurnCaptions,
          burn_captions: multicamBurnCaptions,
          captionStyle: "podcast_clean",
          caption_style: "podcast_clean",
          brandWatermark: multicamBrandWatermark,
          brand_watermark: multicamBrandWatermark,
          generateThumbnail: multicamGenerateThumbnail,
          generate_thumbnail: multicamGenerateThumbnail,
          externalAudio: externalAudioPayload,
          external_audio_url: externalAudioPayload?.url || null,
          external_audio_offset_seconds: Number(externalAudioPayload?.offset_seconds || 0),
          external_audio_mix_mode: externalAudioPayload?.mix_mode || "external_only",
          external_audio_cache_key: externalAudioPayload?.cache_key || null,
        }),
        signal: exportSignal,
      });

      if (cancelExportRef.current) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detailText =
          errorData.error ||
          errorData.message ||
          errorData.details ||
          errorData.detail ||
          `Server returned ${response.status}`;
        throw new Error(detailText);
      }

      const data = await response.json();
      if (!data.success && !getRenderOutputUrl(data)) {
        throw new Error(data.error || "Server render did not return a result.");
      }

      const immediateManifest = getRenderManifestLocation(data);
      const outputUrl = getRenderOutputUrl(data);
      if (data.approvalStatus === "needs_review" || data.status === "needs_review") {
        clearActiveMulticamRenderJob(data.jobId);
        setPendingRenderReview({
          ...data,
          jobId: data.jobId,
          previewUrl: data.previewUrl || data.heldOutputUrl,
          duration: data.duration || renderWindowDuration,
          manifestUrl: immediateManifest,
        });
        setExportResult(null);
        setStatusMessage("Render finished and is waiting for human review.");
        loadRecentRenders();
      } else if (isAsyncRenderDeliveryReady(data)) {
        clearActiveMulticamRenderJob(data.jobId);
        setExportProgress(1);
        setExportResult({
          url: outputUrl,
          file: { name: `multicam-master-${Date.now()}.mp4` },
          duration: data.duration || renderWindowDuration,
          manifestUrl: immediateManifest,
          isServerRender: true,
        });
        setStatusMessage("Multi-camera render and manifest complete. Download ready.");
      } else {
        const renderJobId = data.jobId;
        if (!renderJobId) {
          throw new Error(
            outputUrl && Number(data.renderSpecVersion || 0) >= MULTICAM_RENDER_SPEC_VERSION
              ? "Server returned a master without its required render manifest or job ID."
              : "Server did not return a job ID"
          );
        }
        const checkpoint = getRenderCheckpointSummary(data);
        setActiveRenderCheckpoint(checkpoint.expectedCount ? checkpoint : null);
        setActiveRenderManifest(immediateManifest);
        setStatusMessage(
          `Server render started (Job: ${renderJobId}). ${checkpoint.expectedCount || cloudRenderWindow.checkpointCount} internal checkpoints queued.`
        );
        asyncRenderStarted = true;
        startRenderStatusPolling(renderJobId, {
          duration: renderWindowDuration,
          renderSpecVersion: data.renderSpecVersion || MULTICAM_RENDER_SPEC_VERSION,
        });
      }
    } catch (error) {
      console.error(error);
      if (!exportSignal.aborted && !renderSubmissionStartedRef.current) {
        exportAbortController.abort();
      }
      if (error?.name === "AbortError" || cancelExportRef.current) {
        setStatusMessage(
          renderSubmissionStartedRef.current
            ? "Stopped monitoring. The server render was already submitted and may still finish."
            : "Export cancelled before the paid render was submitted."
        );
      } else {
        setStatusMessage(error.message || "Server export failed.");
        toast.error(error.message || "Server export failed.");
      }
    } finally {
      if (exportAbortControllerRef.current === exportAbortController) {
        exportAbortControllerRef.current = null;
      }
      if (!asyncRenderStarted) {
        setServerExportPending(false);
        setIsExporting(false);
        setExportProgress(0);
      }
    }
  };

  const renderExportStageTracker = () => {
    if (!isExporting && !serverExportPending) return null;
    const progressPct = Math.round((Number(exportProgress) || 0) * 100);
    const detail = String(statusMessage || "").toLowerCase();
    const stages = [
      {
        id: "sync",
        label: "Prove sync",
        hint: "Clean audio, channel owner, start/middle/end",
        doneAt: 35,
        active: /preflight|sync|channel|audio owner|verified/.test(detail) || progressPct < 35,
      },
      {
        id: "visuals",
        label: "Prepare visuals",
        hint: "Trimmed proxies, HDR to SDR, color match",
        doneAt: 55,
        active: /visual|proxy|color|source|face|motion|speech/.test(detail),
      },
      {
        id: "render",
        label: "Render edit",
        hint: "Active speaker, earned reaction, layouts",
        doneAt: 88,
        active: /rendering switched|segments|concatenating|master/.test(detail),
      },
      {
        id: "polish",
        label: "Polish",
        hint: "Clean audio bed, captions, branding",
        doneAt: 93,
        active: /external clean audio|caption|branding|word-level/.test(detail),
      },
      {
        id: "thumbnail",
        label: "Thumbnail",
        hint: "Content-aware poster frame",
        doneAt: 98,
        active: /thumbnail|uploading|local master|download/.test(detail),
      },
    ];

    return (
      <div className="nle-export-stage-tracker" aria-label="Render stages">
        {stages.map(stage => {
          const complete = progressPct >= stage.doneAt;
          const active = !complete && stage.active;
          return (
            <div
              key={stage.id}
              className={`nle-export-stage ${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`}
            >
              <span>{complete ? "OK" : active ? "..." : ""}</span>
              <strong>{stage.label}</strong>
              <small>{stage.hint}</small>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCloudRenderWindowPanel = () => {
    if (Number(timelineDuration || 0) <= MULTICAM_PRODUCTION_PROOF_SECONDS) {
      if (readySources.length >= 2) return null;
      return (
        <div className="nle-cloud-render-window is-recovery-entry">
          <div className="nle-cloud-render-window-copy">
            <strong>Already uploaded your podcast cameras?</strong>
            <span>
              Restore the latest Cam Combiner originals from Firebase and continue without
              uploading those files again.
            </span>
          </div>
          <div className="nle-cloud-render-window-actions">
            <button
              type="button"
              className="nle-mini-btn is-active"
              onClick={recoverLatestUploadedProject}
              disabled={isExporting || serverExportPending}
            >
              Reuse my uploaded originals
            </button>
          </div>
          {recoverableProjectStatus ? <span>{recoverableProjectStatus}</span> : null}
        </div>
      );
    }
    const checkpointSummary = activeRenderCheckpoint?.expectedCount
      ? activeRenderCheckpoint
      : {
          expectedCount: cloudRenderWindow.checkpointCount,
          completedCount: 0,
          label: "",
        };
    return (
      <div className="nle-cloud-render-window">
        <div className="nle-cloud-render-window-copy">
          <strong>
            {cloudRenderWindow.exceedsServerCap
              ? "Timeline exceeds the 3-hour server limit"
              : cloudRenderMode === "proof"
                ? "60-second production proof"
                : "Full-episode checkpoint render"}
          </strong>
          <span>
            {cloudRenderMode === "proof"
              ? "Uses the existing Firebase originals and the real production renderer. It does not upload the cameras again."
              : `Originals upload once, then the full timeline is submitted once. The server resumes internally in ${formatDurationLabel(MULTICAM_RENDER_CHECKPOINT_SECONDS)} checkpoints.`}
          </span>
        </div>
        <div className="nle-cloud-render-window-actions">
          <button
            type="button"
            className={`nle-mini-btn ${cloudRenderMode === "proof" ? "is-active" : ""}`}
            onClick={() => setCloudRenderMode("proof")}
          >
            60-second proof · {MULTICAM_PRODUCTION_PROOF_CREDITS} credits
          </button>
          <button
            type="button"
            className={`nle-mini-btn ${cloudRenderMode === "full" ? "is-active" : ""}`}
            onClick={() => setCloudRenderMode("full")}
          >
            Full episode
          </button>
          <button
            type="button"
            className="nle-mini-btn"
            onClick={recoverLatestUploadedProject}
            disabled={isExporting || serverExportPending}
          >
            Reuse my uploaded originals
          </button>
        </div>
        {recoverableProjectStatus ? <span>{recoverableProjectStatus}</span> : null}
        <div className="nle-cloud-render-window-range">
          <div className="nle-cloud-render-window-times">
            <span>
              {cloudRenderMode === "proof" ? "Proof range" : "Full timeline"}{" "}
              {formatDurationLabel(cloudRenderWindowStartSafe)} to{" "}
              {formatDurationLabel(cloudRenderWindowEnd)}
            </span>
            <strong>
              {cloudRenderWindow.exceedsServerCap
                ? "Shorten the project before server export"
                : cloudRenderMode === "proof"
                  ? `${MULTICAM_PRODUCTION_PROOF_CREDITS} credits · no re-upload`
                  : `${checkpointSummary.expectedCount} internal checkpoints`}
            </strong>
          </div>
          {cloudRenderMode === "proof" ? (
            <label className="nle-field-block">
              <span>Proof start (seconds)</span>
              <input
                className="nle-input"
                type="number"
                min="0"
                max={Math.max(0, Number(timelineDuration || 0) - MULTICAM_PRODUCTION_PROOF_SECONDS)}
                step="1"
                value={proofRenderStartSeconds}
                onChange={event => setProofRenderStartSeconds(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
          ) : null}
        </div>
        {activeRenderJobId ? (
          <div className="nle-cloud-render-window-actions">
            <span>
              {checkpointSummary.label || `Checkpoint 0/${checkpointSummary.expectedCount}`} ·{" "}
              {checkpointSummary.completedCount} complete
            </span>
            <strong>{activeRenderManifest ? "Manifest ready" : `Job ${activeRenderJobId}`}</strong>
          </div>
        ) : null}
      </div>
    );
  };

  const renderRecentRendersPanel = () => {
    const savedMasters = recentRenders.filter(render => {
      const state = getRenderApprovalState(render);
      return ["needs_review", "approved", "rejected"].includes(state);
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
          const previewUrl = render.previewUrl || render.heldOutputUrl || downloadUrl;
          const approvalState = getRenderApprovalState(render);
          const canDownload = canDownloadApprovedRender(render);
          return (
            <div className={`nle-saved-render-card is-${approvalState}`} key={render.jobId}>
              {render.thumbnailUrl ? (
                <img src={render.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <div className="nle-saved-render-thumb">MP4</div>
              )}
              <div>
                <strong>{getRenderApprovalCopy(render)}</strong>
                <span>
                  {formatDurationLabel(Number(render.duration || 0))} ·{" "}
                  {formatRenderExpiry(render.expiresAt)}
                </span>
              </div>
              {approvalState === "needs_review" ? (
                <div className="nle-saved-render-actions">
                  {previewUrl ? (
                    <a
                      className="nle-mini-btn"
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="nle-mini-btn"
                    onClick={() => handleReviewAction(render, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="nle-mini-btn is-danger"
                    onClick={() => handleReviewAction(render, "reject")}
                  >
                    Reject
                  </button>
                </div>
              ) : canDownload ? (
                <a
                  className="nle-mini-btn"
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderApprovalReviewPanel = () => {
    if (!pendingRenderReview) return null;
    const previewUrl = pendingRenderReview.previewUrl || pendingRenderReview.heldOutputUrl;
    const qaWarnings = Array.isArray(pendingRenderReview.qaWarnings)
      ? pendingRenderReview.qaWarnings
      : [];

    return (
      <div className="nle-render-review-card">
        <div>
          <strong>Human review required</strong>
          <span>Download is locked until this master is approved.</span>
        </div>
        {qaWarnings.length ? (
          <ul>
            {qaWarnings.slice(0, 4).map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <div className="nle-export-actions">
          {previewUrl ? (
            <a
              className="nle-btn secondary"
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview Render
            </a>
          ) : null}
          <button
            className="nle-btn"
            type="button"
            onClick={() => handleReviewAction(pendingRenderReview, "approve")}
          >
            Approve Render
          </button>
          <button
            className="nle-btn secondary is-danger"
            type="button"
            onClick={() => handleReviewAction(pendingRenderReview, "reject")}
          >
            Reject Render
          </button>
        </div>
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
          <div className="nle-studio-shell is-simplified" ref={scrollContainerRef}>
            <section className="nle-studio-main is-simplified" ref={previewPanelRef}>
              <div className="nle-studio-steps" aria-label="Cam Combiner workflow">
                {[
                  { id: "sources", number: 1, label: "Sources", done: readySources.length >= 2 },
                  { id: "audio", number: 2, label: "Clean Audio", done: hasExternalCleanAudio },
                  { id: "proof", number: 3, label: "Auto sync proof", done: previewSyncState.tone === "good" },
                  { id: "render", number: 4, label: "Render", done: Boolean(exportResult) },
                ].map(step => (
                  <div key={step.id} className={`nle-studio-step ${step.done ? "is-done" : ""}`}>
                    <span>{step.number}</span>
                    <strong>{step.label}</strong>
                  </div>
                ))}
              </div>

              <div className="nle-studio-topbar is-simple">
                <div className={`nle-studio-topbar-pill is-sync-${previewSyncState.tone}`}>
                  <span>Auto sync proof</span>
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

              <div className="nle-studio-hero-grid">
                <article className="nle-studio-program-card is-hero">
                  <div className="nle-studio-monitor-head">
                    <span className="nle-studio-monitor-label">Program Output</span>
                    <span className="nle-studio-preview-pill">Preview only</span>
                  </div>
                  <div className="nle-preview-shell nle-studio-program-shell">
                    <div
                      ref={previewStageRef}
                      className={`nle-preview-stage is-layout-${previewMulticamLayoutMode} is-reaction-${previewReactionSide} ${focusPickerActive ? "is-focus-picking" : ""} ${previewStageMoodClass}`}
                      style={studioProgramStageStyle}
                    >
                      {readySources.map(source => {
                        const previewClassName = `nle-preview-video ${source.id === activeCameraId ? "is-active" : ""} ${
                          source.id === previewSecondaryCameraId || previewReactionCameraIds.includes(source.id)
                            ? "is-secondary"
                            : ""
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
                          <strong>Load your first visual to start.</strong>
                          <span>Program Output appears here once cameras are ready.</span>
                        </div>
                      ) : null}
                      {!isSingleSourceWorkflow &&
                        previewMulticamLayoutMode === "split-vertical" &&
                        previewSecondaryCamera && <div className="nle-preview-split-divider" />}
                    </div>
                  </div>
                  <div className="nle-layout-preview-strip">
                    <button
                      type="button"
                      className={`nle-live-switch-btn is-accent ${autoDirectorEnabled ? "is-live" : ""}`}
                      onClick={() => handleRunQuickAction("multi-smart")}
                    >
                      <strong>Auto Direct</strong>
                      <span>Preview only</span>
                    </button>
                    <button
                      type="button"
                      className={`nle-live-switch-btn ${multicamLayoutMode === "cut" ? "is-live" : ""}`}
                      onClick={() => handleRecordSwitch(activeCameraId || readySources[0]?.id)}
                      disabled={!timelineDuration || !readySources.length}
                    >
                      <strong>Speaker</strong>
                      <span>Preview only</span>
                    </button>
                    {readySources.map((source, index) => (
                      <button
                        key={`show-${source.id}`}
                        type="button"
                        className={`nle-live-switch-btn nle-camera-switch-btn ${
                          activeCameraId === source.id ? "is-live" : ""
                        }`}
                        onClick={() => handleRecordSwitch(source.id, "cut")}
                        disabled={!timelineDuration}
                      >
                        <strong>Show {source.label || `Cam ${index + 1}`}</strong>
                        <span>{activeCameraId === source.id ? "Full screen" : "Switch preview"}</span>
                      </button>
                    ))}
                    <div className="nle-reaction-overlay-chip nle-reaction-side-control">
                      <button
                        type="button"
                        className={`nle-reaction-toggle ${reactionOverlayEnabled ? "is-active" : ""}`}
                        onClick={() => {
                          setReactionOverlayEnabled(value => !value);
                          setStatusMessage(
                            reactionOverlayEnabled
                              ? "Reaction windows are off. The backend will render no reaction PiP."
                              : "Reaction windows are allowed. The director may use one only for an earned reaction."
                          );
                        }}
                        disabled={readySources.length < 2}
                      >
                        <strong>Reaction windows (optional)</strong>
                        <span>{reactionOverlayEnabled ? "On — earned reactions only" : readySources.length >= 2 ? "Off — no reaction" : "Needs 2 cams"}</span>
                      </button>
                      <div className="nle-reaction-side-buttons">
                        <button
                          type="button"
                          className={previewReactionSide === "left" ? "is-active" : ""}
                          onClick={() => handleSetActiveReactionSide("left")}
                          disabled={!reactionOverlayEnabled || !activeCameraId || readySources.length < 2}
                        >
                          Left
                        </button>
                        <button
                          type="button"
                          className={previewReactionSide === "right" ? "is-active" : ""}
                          onClick={() => handleSetActiveReactionSide("right")}
                          disabled={!reactionOverlayEnabled || !activeCameraId || readySources.length < 2}
                        >
                          Right
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`nle-live-switch-btn ${multicamLayoutMode === "split-vertical" ? "is-live" : ""}`}
                      onClick={() =>
                        activateManualLayoutMode(
                          "split-vertical",
                          "Split preview only. Paid render stays automatic."
                        )
                      }
                    >
                      <strong>Split</strong>
                      <span>Preview only</span>
                    </button>
                    <button
                      type="button"
                      className={`nle-live-switch-btn ${multicamLayoutMode === "scene-grid" ? "is-live" : ""}`}
                      onClick={() =>
                        activateManualLayoutMode(
                          "scene-grid",
                          "Grid preview only. Paid render stays automatic."
                        )
                      }
                    >
                      <strong>Grid</strong>
                      <span>Preview only</span>
                    </button>
                    {previewProgramOverride ? (
                      <button
                        type="button"
                        className="nle-live-switch-btn"
                        onClick={() => {
                          setPreviewProgramOverride(null);
                          setStatusMessage("Preview override cleared. Program Output follows automatic director preview again.");
                        }}
                      >
                        <strong>Clear</strong>
                        <span>Preview</span>
                      </button>
                    ) : null}
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
                  </div>
                </article>

                <aside className="nle-render-ready-card">
                  <span className="nle-eyebrow">Render Ready</span>
                  <strong>{multicamRenderCreditEstimate} cr</strong>
                  <div className="nle-render-tier-group is-compact" aria-label="Cam Combiner render pricing">
                    {MULTICAM_RENDER_TIERS.map(tier => (
                      <button
                        key={tier.id}
                        type="button"
                        className={`nle-render-tier ${multicamRenderTier === tier.id ? "is-active" : ""}`}
                        onClick={() => setMulticamRenderTier(tier.id)}
                      >
                        <span>{tier.eyebrow}</span>
                        <strong>{tier.label}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="nle-render-finishing" aria-label="Final finishing passes">
                    <label className="nle-render-finish-toggle">
                      <input
                        type="checkbox"
                        checked={multicamBurnCaptions}
                        onChange={event => setMulticamBurnCaptions(event.target.checked)}
                      />
                      <span>
                        <strong>Burn captions</strong>
                        <small>Full Whisper + video pass</small>
                      </span>
                    </label>
                    <label className="nle-render-finish-toggle">
                      <input
                        type="checkbox"
                        checked={multicamBrandWatermark}
                        onChange={event => setMulticamBrandWatermark(event.target.checked)}
                      />
                      <span>
                        <strong>Brand watermark</strong>
                        <small>Final overlay pass</small>
                      </span>
                    </label>
                    <label className="nle-render-finish-toggle">
                      <input
                        type="checkbox"
                        checked={multicamGenerateThumbnail}
                        onChange={event => setMulticamGenerateThumbnail(event.target.checked)}
                      />
                      <span>
                        <strong>Thumbnail</strong>
                        <small>Poster frame only</small>
                      </span>
                    </label>
                  </div>
                  <button
                    className="nle-btn nle-render-primary-btn"
                    type="button"
                    onClick={handleServerExport}
                    disabled={
                      isExporting ||
                      cleanAudioSyncIsRunning ||
                      syncingCameraId === "external-clean-audio" ||
                      !canExportProject ||
                      isSingleSourceWorkflow
                    }
                  >
                    {cleanAudioSyncIsRunning || syncingCameraId === "external-clean-audio"
                      ? "Sync Check Running..."
                      : serverExportPending
                        ? "Preparing Verified MP4..."
                        : "Render Polished MP4"}
                  </button>
                  <div className="nle-render-proof-list">
                    <div className={`nle-proof-item ${hasExternalCleanAudio ? "is-done" : ""}`}>
                      <span>{hasExternalCleanAudio ? "✓" : "1"}</span>
                      <strong>{hasExternalCleanAudio ? "External clean audio locked" : "Upload external clean audio"}</strong>
                    </div>
                    <div className={`nle-proof-item ${previewSyncState.tone === "good" ? "is-done" : ""}`}>
                      <span>{previewSyncState.tone === "good" ? "✓" : "2"}</span>
                      <strong>Auto sync proof</strong>
                    </div>
                    <div className={`nle-proof-item ${previewSyncState.tone === "good" ? "is-done" : ""}`}>
                      <span>{previewSyncState.tone === "good" ? "✓" : "3"}</span>
                      <strong>Start · Middle · End verified</strong>
                    </div>
                    <div className={`nle-proof-item ${readySources.length >= 2 ? "is-done" : ""}`}>
                      <span>{readySources.length >= 2 ? "✓" : "4"}</span>
                      <strong>Reaction overlay optional</strong>
                    </div>
                  </div>
                  <div className="nle-studio-credit-note is-simple">
                    <span>
                      Balance: {Number(credits?.remaining ?? 0).toFixed(0)} cr. Preview included.
                      Clean-audio sync is {cleanAudioSyncCreditEstimate} cr when needed.
                    </span>
                    <button
                      className="nle-mini-paypal-btn"
                      type="button"
                      onClick={() => setBillingPanelOpen(true)}
                    >
                      Buy credits
                    </button>
                  </div>
                </aside>
              </div>

              {renderCloudRenderWindowPanel()}

              <div className="nle-source-card-grid">
                {studioMonitorSlots.map((source, index) => {
                  if (!source) {
                    return (
                      <article key={`studio-source-empty-${index}`} className="nle-studio-monitor-card is-empty">
                        <div className="nle-studio-monitor-head">
                          <span className="nle-studio-monitor-label">Camera {index + 1}</span>
                          <span className="nle-studio-monitor-badge">Empty</span>
                        </div>
                        <button
                          type="button"
                          className="nle-studio-monitor-frame nle-drop-target"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Add Camera
                        </button>
                        <div className="nle-studio-monitor-meta">
                          <span>Up to 3 cameras</span>
                        </div>
                      </article>
                    );
                  }
                  const mediaUrl = getSourceMediaUrl(source);
                  const confidence = studioSpeakerRows.find(row => row.id === source.id)?.confidence || 0;
                  const isLive = source.id === activeCameraId;
                  return (
                    <article key={`studio-source-${source.id}`} className={`nle-studio-monitor-card ${isLive ? "is-live" : ""}`}>
                      <div className="nle-studio-monitor-head">
                        <span className="nle-studio-monitor-label">{getStudioSlotLabel(index)}</span>
                        <span className={`nle-studio-monitor-badge ${isLive ? "is-live" : ""}`}>
                          {isLive ? "Ready" : `${Math.round(confidence * 100)}%`}
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
                        <span>{source.backendSyncStatus ? "Machine sync ready" : "Needs sync proof"}</span>
                        <span>{source.name || source.label}</span>
                      </div>
                    </article>
                  );
                })}

                <article className={`nle-studio-monitor-card nle-clean-audio-card ${hasExternalCleanAudio ? "is-live" : "is-empty"}`}>
                  <div className="nle-studio-monitor-head">
                    <span className="nle-studio-monitor-label">External clean audio</span>
                    <span className={`nle-studio-monitor-badge ${hasExternalCleanAudio ? "is-live" : ""}`}>
                      {hasExternalCleanAudio ? "Locked" : "Missing"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="nle-studio-audio-wave-card"
                    onClick={() => externalAudioInputRef.current?.click()}
                  >
                    {studioMasterWaveformBars.length ? (
                      studioMasterWaveformBars.map((barHeight, index) => (
                        <span
                          key={`simple-master-wave-${index}`}
                          style={{ height: `${Math.max(12, barHeight)}%` }}
                        />
                      ))
                    ) : (
                      <strong>{externalAudioTrack ? "Analyzing waveform" : "Upload Clean Audio"}</strong>
                    )}
                  </button>
                  <div className="nle-studio-monitor-meta">
                    <span>{externalAudioTrack?.name || "WAV, MP3, M4A, or video audio"}</span>
                    <span>{hasExternalCleanAudio ? "External clean audio locked" : "Required for automatic proof"}</span>
                  </div>
                </article>
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
              {renderExportStageTracker()}

              {renderApprovalReviewPanel()}

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
            </section>
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
                  {autoDirectorEnabled ? "Auto Director armed" : "Automatic render"}
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
              <strong>
                {outputAspectRatio === "16:9"
                  ? "Full Podcast / YouTube"
                  : outputAspectRatio === "9:16"
                    ? "Reels / Shorts"
                    : "Square Feed"}
              </strong>
              <div className="nle-aspect-buttons">
                {[
                  { ratio: "16:9", label: "Podcast / YouTube" },
                  { ratio: "9:16", label: "Reels / Shorts" },
                  { ratio: "1:1", label: "Square Feed" },
                ].map(({ ratio, label }) => (
                  <button
                    key={ratio}
                    type="button"
                    className={`nle-aspect-btn ${outputAspectRatio === ratio ? "is-active" : ""}`}
                    onClick={() => setOutputAspectRatio(ratio)}
                  >
                    <strong>{ratio}</strong>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <small>
                {outputAspectRatio === "16:9"
                  ? "Full-screen landscape podcast video"
                  : outputAspectRatio === "9:16"
                    ? "Vertical social clip for Reels and Shorts"
                  : outputAspectRatio === "1:1"
                    ? "Square social-feed video"
                    : "Full-screen landscape podcast video"}
              </small>
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
                        "Automatic segments are previewed here; paid render stays automatic."}
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
                        activateManualLayoutMode(
                          option.id,
                          `${option.label} preview only. Paid render stays automatic.`
                        );
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
                className={`nle-preview-stage is-layout-${previewMulticamLayoutMode} is-reaction-${previewReactionSide} ${focusPickerActive ? "is-focus-picking" : ""} ${previewStageMoodClass}`}
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
                    source.id === previewSecondaryCameraId || previewReactionCameraIds.includes(source.id)
                      ? "is-secondary"
                      : ""
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
                  previewMulticamLayoutMode === "split-vertical" &&
                  previewSecondaryCamera && <div className="nle-preview-split-divider" />}
                {!isSingleSourceWorkflow &&
                  previewMulticamLayoutMode === "scene-grid" &&
                  previewVisibleLayoutCameras.length > 0 && (
                    <>
                      {previewVisibleLayoutCameras.map((camera, index) => {
                        const viewport = getSceneGridViewports(
                          100,
                          100,
                          previewVisibleLayoutCameras.length
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
                  previewMulticamLayoutMode !== "scene-grid" &&
                  activeCamera && (
                    <>
                      <div className="nle-preview-label nle-preview-label-primary">
                        {activeCamera.label || "Primary"}
                      </div>
                      {previewSecondaryCamera && previewMulticamLayoutMode !== "cut" && (
                        <div
                          className={`nle-preview-label nle-preview-label-secondary ${previewMulticamLayoutMode === "pip" ? "is-pip" : "is-split"}`}
                        >
                          {previewSecondaryCamera.label || "Secondary"}
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
                          ? "Clean audio is now the main audio bed. Export will prove camera sync before rendering."
                          : "Clean audio is parked. Camera audio is back in control."
                      );
                    }}
                  />
                  <span>Use external clean audio</span>
                </label>

                <p className="nle-clean-audio-tip">
                  AutoPromote proves sync by matching the camera scratch audio against the clean audio.
                  Export still runs a safety preflight before rendering.
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
                            Waveform loading or automatic sync pending
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

                    {readySources.length >= 2 && (
                      <div className="nle-clean-audio-channel-map">
                        <label className="nle-clean-audio-toggle is-studio-toggle">
                          <input
                            type="checkbox"
                            checked={externalAudioSpeakerChannelsSwapped}
                            onChange={event => setExternalAudioSpeakerChannelsSwapped(event.target.checked)}
                          />
                          <span>Swap left/right clean-audio channels</span>
                        </label>
                        <p>
                          Left channel: {getExportSourceLabel(
                            externalAudioSpeakerChannelsSwapped ? readySources[1] : readySources[0],
                            externalAudioSpeakerChannelsSwapped ? 1 : 0
                          )}
                          {" · "}
                          Right channel: {getExportSourceLabel(
                            externalAudioSpeakerChannelsSwapped ? readySources[0] : readySources[1],
                            externalAudioSpeakerChannelsSwapped ? 0 : 1
                          )}
                        </p>
                        <label className="nle-clean-audio-toggle is-studio-toggle">
                          <input
                            type="checkbox"
                            checked={directorChannelMapConfirmed}
                            onChange={event =>
                              setConfirmedDirectorChannelMapKey(
                                event.target.checked ? directorChannelMapKey : ""
                              )
                            }
                          />
                          <span>I verified which speaker belongs to each channel</span>
                        </label>
                      </div>
                    )}

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
                      Upload WAV, MP3, M4A, or a video file with the clean sound. If automatic sync
                      cannot prove timing, paid render stays blocked.
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
                        <div className="nle-field-block">
                          <span>Computed Sync</span>
                          <strong>
                            {source.backendSyncStatus
                              ? `${Number(source.offsetSeconds || 0).toFixed(2)}s`
                              : "Needs proof"}
                          </strong>
                        </div>
                        <div className="nle-field-block">
                          <span>Audio Role</span>
                          <strong>
                            {hasExternalCleanAudio
                              ? "External clean master"
                              : masterAudioCameraId === source.id
                                ? "Camera master"
                                : "Camera reference"}
                          </strong>
                        </div>
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
                              {source.backendSyncStatus ? "machine sync" : "not solved"}
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
                              Method: {source.backendSyncMethod || "automatic"}
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
                    title="Clear the preview override. Paid render stays automatic."
                  >
                    Clear Preview
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
                      <span>Safe preview: camera/layout buttons do not render. Paid MP4 is automatic.</span>
                      {previewProgramOverride ? (
                        <button
                          type="button"
                          className="nle-mini-btn"
                          onClick={() => {
                            setPreviewProgramOverride(null);
                            setStatusMessage("Preview override cleared. Program Output follows automatic director preview again.");
                          }}
                        >
                          Clear preview
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
                      <div className="nle-reaction-overlay-chip">
                        <button
                          type="button"
                          className={`nle-reaction-toggle ${reactionOverlayEnabled ? "is-active" : ""}`}
                          onClick={() => {
                            setReactionOverlayEnabled(value => !value);
                            setStatusMessage(
                              reactionOverlayEnabled
                                ? "Reaction windows are off. The backend will render no reaction PiP."
                                : "Reaction windows are allowed. The director may use one only for an earned reaction."
                            );
                          }}
                          disabled={readySources.length < 2}
                        >
                          <strong>Reaction windows (optional)</strong>
                          <span>{reactionOverlayEnabled ? "On — earned reactions only" : readySources.length >= 2 ? "Off — no reaction" : "Needs 2 cams"}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className={`nle-live-switch-btn ${multicamLayoutMode === "scene-grid" ? "is-live" : ""}`}
                        onClick={() =>
                          activateManualLayoutMode(
                            "scene-grid",
                            "Show Everyone preview only. Paid render stays automatic."
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
                            "Shared Moment preview only. Paid render stays automatic."
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

                  </>
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
	                    cleanAudioSyncIsRunning ||
	                    syncingCameraId === "external-clean-audio" ||
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
	                  {cleanAudioSyncIsRunning || syncingCameraId === "external-clean-audio"
	                    ? "Sync Check Running..."
	                    : serverExportPending
	                    ? "Preparing Verified MP4..."
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
            {renderExportStageTracker()}

            {renderApprovalReviewPanel()}

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
              <button
                type="button"
                onClick={() => setBillingPanelOpen(false)}
                style={{
                  marginBottom: "12px",
                  border: "1px solid #4f46e5",
                  background: "#4f46e5",
                  color: "#ffffff",
                  padding: "10px 18px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: 700,
                  lineHeight: 1,
                  fontSize: "0.95rem",
                  boxShadow: "0 2px 10px rgba(79, 70, 229, 0.35)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#4338ca";
                  e.currentTarget.style.borderColor = "#4338ca";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#4f46e5";
                  e.currentTarget.style.borderColor = "#4f46e5";
                }}
                onMouseDown={e => {
                  e.currentTarget.style.transform = "translateY(1px)";
                }}
                onMouseUp={e => {
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Back to Cam Combiner
              </button>
              <PayPalSubscriptionPanel
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

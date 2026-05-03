import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAutoDirectorPlan,
  clampNumber,
  DEFAULT_SEGMENT_FRAMING,
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
  normalizeSegments,
  normalizeSwitches,
  splitSegmentAtTimelineTime,
  resolveSmartMulticamLayoutAtTime,
} from "./multicamUtils";
import {
  FLOW_EDIT_STYLE_PRESETS,
  buildFlowEditPlan,
  buildFlowTimelineDisplaySegments,
  buildSingleLensAutoPlan,
  getFlowSegmentAtTime,
  getFlowSourceTimeAtPlayhead,
} from "./flowEditUtils";
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { API_BASE_URL } from "../config";
import { applySafeMediaSource, getSafeMediaSource } from "../utils/security";
import toast from "react-hot-toast";
import "./MultiCamCombiner.css";
import useCinematicEffects from "../hooks/useCinematicEffects";
import CinematicEffectsPanel from "./CinematicEffectsPanel";
import { useSubscription } from "../hooks/useSubscription";

const MULTICAM_MAX_SOURCES = 6;

const CAMERA_COLORS = ["#f97316", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15"];

const getCameraColor = (cameraId, sources) => {
  const idx = sources.findIndex(s => s.id === cameraId);
  return CAMERA_COLORS[idx % CAMERA_COLORS.length] || CAMERA_COLORS[0];
};

const DRIFT_THRESHOLD_SECONDS = 0.18;
const EXPORT_FRAME_RATE = 30;
const FRAME_STEP_SECONDS = 1 / 30;
const AUDIO_SYNC_BINS_PER_SECOND = 20;
const WAVEFORM_BAR_COUNT = 24;

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
  { id: "cut", label: "Mono Focus" },
];

const MULTICAM_LAYOUT_TITLES = {
  smart: "Pulse Director",
  "split-vertical": "Dual Pulse",
  pip: "Orbit Echo",
  "scene-grid": "Scene Matrix",
  cut: "Mono Focus",
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

  switch (directorStyleId) {
    case "podcast":
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
    case "interview":
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

const getSourceTimelineTime = (source, playhead, timelineStart) =>
  getSourceTimelineTimeAtPlayhead(source, playhead, timelineStart);

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
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
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

  const {
    muted = true,
    volume = 0,
    driftThreshold = DRIFT_THRESHOLD_SECONDS,
    playbackRate = 1,
  } = options;

  element.muted = muted;
  element.volume = volume;
  element.playbackRate = playbackRate;

  const safeTime = Math.max(0, Number(desiredTime) || 0);
  if (Math.abs((Number(element.currentTime) || 0) - safeTime) > driftThreshold) {
    try {
      element.currentTime = safeTime;
    } catch {
      return;
    }
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
  context.fillRect(x, y, width, height);
  context.strokeStyle = "rgba(255, 255, 255, 0.14)";
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  context.fillStyle = "rgba(255, 248, 236, 0.96)";
  context.fillText(text, x + paddingX, y + height - paddingY);
  context.restore();
};

const paintVideoToViewport = (context, viewport, activeVideo, label, framing = {}) => {
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

  if (activeVideo && activeVideo.readyState >= 2) {
    const sourceWidth = activeVideo.videoWidth || safeViewport.width;
    const sourceHeight = activeVideo.videoHeight || safeViewport.height;
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
    context.drawImage(activeVideo, offsetX, offsetY, drawWidth, drawHeight);
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

const getSceneGridViewports = (width, height, visibleCount) => {
  const gap = Math.max(4, Math.round(Math.min(width, height) * 0.012));
  const count = Math.max(1, Math.min(6, Number(visibleCount) || 1));

  if (count <= 1) {
    return [{ x: 0, y: 0, width, height }];
  }

  if (count === 2) {
    const halfHeight = Math.round((height - gap) / 2);
    return [
      { x: 0, y: 0, width, height: halfHeight },
      { x: 0, y: halfHeight + gap, width, height: height - halfHeight - gap },
    ];
  }

  if (count === 3) {
    const topHeight = Math.round(height * 0.56);
    const bottomHeight = height - topHeight - gap;
    const lowerWidth = Math.round((width - gap) / 2);
    return [
      { x: 0, y: 0, width, height: topHeight },
      { x: 0, y: topHeight + gap, width: lowerWidth, height: bottomHeight },
      {
        x: lowerWidth + gap,
        y: topHeight + gap,
        width: width - lowerWidth - gap,
        height: bottomHeight,
      },
    ];
  }

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

const drawVideoToCanvas = (context, canvas, activeVideo, label, framing = {}) => {
  context.fillStyle = "#04070d";
  context.fillRect(0, 0, canvas.width, canvas.height);

  paintVideoToViewport(
    context,
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    activeVideo,
    label,
    framing
  );
};

const drawCompositeVideoToCanvas = (
  context,
  canvas,
  {
    layoutMode = "cut",
    primaryVideo,
    secondaryVideo,
    primaryLabel,
    secondaryLabel,
    primaryFraming = {},
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
      paintVideoToViewport(
        context,
        viewport,
        feed.video,
        feed.label,
        index === 0 ? feed.framing || primaryFraming : feed.framing || {}
      );
      if (feed.label) {
        drawCanvasBadge(context, feed.label, viewport.x + 12, viewport.y + 12);
      }
    });
    return;
  }

  if (!secondaryVideo || layoutMode === "cut") {
    drawVideoToCanvas(context, canvas, primaryVideo, primaryLabel, primaryFraming);
    if (primaryLabel) {
      drawCanvasBadge(context, primaryLabel, 18, 18);
    }
    return;
  }

  if (layoutMode === "split-vertical") {
    const halfHeight = canvas.height / 2;
    context.fillStyle = "#04070d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    paintVideoToViewport(
      context,
      { x: 0, y: 0, width: canvas.width, height: halfHeight },
      primaryVideo,
      primaryLabel,
      primaryFraming
    );
    paintVideoToViewport(
      context,
      { x: 0, y: halfHeight, width: canvas.width, height: halfHeight },
      secondaryVideo,
      secondaryLabel,
      {}
    );
    context.fillStyle = "rgba(255, 255, 255, 0.14)";
    context.fillRect(0, halfHeight - 1, canvas.width, 2);
    drawCanvasBadge(context, primaryLabel, 18, 18);
    drawCanvasBadge(context, secondaryLabel, 18, halfHeight + 18);
    return;
  }

  drawVideoToCanvas(context, canvas, primaryVideo, primaryLabel, primaryFraming);
  const pipWidth = Math.round(canvas.width * 0.34);
  const pipHeight = Math.round(canvas.height * 0.28);
  const pipX = canvas.width - pipWidth - 26;
  const pipY = 26;
  paintVideoToViewport(
    context,
    { x: pipX, y: pipY, width: pipWidth, height: pipHeight },
    secondaryVideo,
    secondaryLabel,
    {}
  );
  context.strokeStyle = "rgba(255, 255, 255, 0.88)";
  context.lineWidth = 3;
  context.strokeRect(pipX + 1.5, pipY + 1.5, pipWidth - 3, pipHeight - 3);
  drawCanvasBadge(context, primaryLabel, 18, 18);
  drawCanvasBadge(context, secondaryLabel, pipX + 12, pipY + pipHeight - 48);
};

const pickExportMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) || "";
};

function MultiCamCombiner({ primaryFile, onCancel, onComplete, onStatusChange }) {
  const { canUseFeature } = useSubscription();
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
  const [switches, setSwitches] = useState([{ id: "switch-1", cameraId: "cam-1", startTime: 0 }]);
  const [masterAudioCameraId, setMasterAudioCameraId] = useState("cam-1");
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSwitchId, setSelectedSwitchId] = useState("switch-1");
  const [statusMessage, setStatusMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [outputAspectRatio, setOutputAspectRatio] = useState("9:16");
  const [exportResult, setExportResult] = useState(null);
  const [serverExportPending, setServerExportPending] = useState(false);
  const [singleCamSegments, setSingleCamSegments] = useState([]);
  const [selectedSingleCamSegmentId, setSelectedSingleCamSegmentId] = useState(null);
  const [singleCamSegmentFraming, setSingleCamSegmentFraming] = useState({});
  const [singleLensAutoSummary, setSingleLensAutoSummary] = useState("");
  const [focusPickerActive, setFocusPickerActive] = useState(false);
  const [multicamLayoutMode, setMulticamLayoutMode] = useState("smart");
  const [directorStyleId, setDirectorStyleId] = useState(DIRECTOR_STYLE_PRESETS[0].id);
  const [autoDirectorEnabled, setAutoDirectorEnabled] = useState(true);
  const [autoDirectorSummary, setAutoDirectorSummary] = useState(null);
  const [studioMode, setStudioMode] = useState("combine");
  const [flowEditStyleId, setFlowEditStyleId] = useState(FLOW_EDIT_STYLE_PRESETS[1].id);
  const [flowAudioTrack, setFlowAudioTrack] = useState(null);
  const [flowEditPlan, setFlowEditPlan] = useState(null);
  const [flowEditEnabled, setFlowEditEnabled] = useState(false);
  const [isGeneratingFlowEdit, setIsGeneratingFlowEdit] = useState(false);
  const [flowEditStatusStep, setFlowEditStatusStep] = useState("");
  const [selectedFlowSegmentId, setSelectedFlowSegmentId] = useState(null);
  const [flowEditVariants, setFlowEditVariants] = useState([]);
  const [flowEditInsight, setFlowEditInsight] = useState("");
  const [flowEditWarning, setFlowEditWarning] = useState("");

  const cancelExportRef = useRef(false);
  const fileInputRef = useRef(null);
  const flowAudioInputRef = useRef(null);
  const nextCameraIndexRef = useRef(3);
  const objectUrlsRef = useRef(new Set());
  const animationFrameRef = useRef(null);
  const playheadRef = useRef(0);
  const scrollContainerRef = useRef(null);
  const previewStageRef = useRef(null);
  const autoDirectorSignatureRef = useRef("");
  const audioAnalysisCacheRef = useRef(new Map());
  const previewVideoRefs = useRef({});
  const thumbnailVideoRefs = useRef({});
  const audioVideoRefs = useRef({});
  const flowAudioRef = useRef(null);
  const handleRecordSwitchRef = useRef(null);
  const singleCamSignatureRef = useRef("");
  const [audioAnalysisByCameraId, setAudioAnalysisByCameraId] = useState({});
  const [syncingCameraId, setSyncingCameraId] = useState(null);

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
  const isSingleSourceWorkflow = readySources.length <= 1;
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
  const timelineDuration =
    !isSingleSourceWorkflow && flowEditEnabled && flowEditPlan?.duration
      ? Math.min(baseTimelineDuration, Number(flowEditPlan.duration) || baseTimelineDuration)
      : baseTimelineDuration;
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
      !isSingleSourceWorkflow && flowEditEnabled && Array.isArray(flowEditPlan?.segments)
        ? flowEditPlan.segments.filter(
            segment => Number(segment.endTime) > Number(segment.startTime)
          )
        : [],
    [isSingleSourceWorkflow, flowEditEnabled, flowEditPlan]
  );
  const currentFlowSegment = useMemo(
    () => getFlowSegmentAtTime(activeFlowSegments, playhead),
    [activeFlowSegments, playhead]
  );
  const displaySegments = useMemo(() => {
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

    if (activeFlowSegments.length) {
      return buildFlowTimelineDisplaySegments(
        activeFlowSegments,
        readySources.length ? readySources : sources,
        timelineDuration || 0.01
      );
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
    if (isSingleSourceWorkflow) {
      return getActiveSegmentAtTime(normalizedSingleCamSegments, playhead);
    }

    if (currentFlowSegment) {
      return currentFlowSegment;
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
  ]);

  const activeCameraId = activeSegment?.cameraId || readySources[0]?.id || sources[0]?.id || null;
  const activeCamera = readySources.find(source => source.id === activeCameraId) || null;
  const masterAudioSource = readySources.find(source => source.id === masterAudioCameraId) || null;
  const activeDirectorStyle = useMemo(
    () => getDirectorStylePreset(directorStyleId),
    [directorStyleId]
  );
  const resolvedMulticamLayout = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return {
        layoutMode: "cut",
        primaryCameraId: activeCameraId,
        secondaryCameraId: null,
        reason: "single_source",
      };
    }

    const baseLayout = resolveSmartMulticamLayoutAtTime(
      readySources.length ? readySources : sources,
      activeCameraId,
      playhead,
      timelineBounds.timelineStart,
      audioAnalysisByCameraId,
      multicamLayoutMode
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
    directorStyleId,
  ]);
  const effectiveMulticamLayoutMode = resolvedMulticamLayout.layoutMode || "cut";
  const secondaryCameraId = resolvedMulticamLayout.secondaryCameraId || null;
  const secondaryCamera = readySources.find(source => source.id === secondaryCameraId) || null;
  const visibleLayoutCameraIds = useMemo(() => {
    const candidateIds = Array.isArray(resolvedMulticamLayout.visibleCameraIds)
      ? resolvedMulticamLayout.visibleCameraIds
      : [activeCameraId, secondaryCameraId].filter(Boolean);
    return candidateIds.filter(Boolean).slice(0, 6);
  }, [resolvedMulticamLayout.visibleCameraIds, activeCameraId, secondaryCameraId]);
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
    return normalizeSegmentFraming(singleCamSegmentFraming[activeSegment.id]);
  }, [isSingleSourceWorkflow, activeSegment, singleCamSegmentFraming]);
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
  const previewActiveVideoStyle = useMemo(() => {
    const style = {};
    if (effectsMediaStyle.filter) {
      style.filter = effectsMediaStyle.filter;
    }

    const cinematicZoom = Math.max(1, Number(fx.zoom) || 1);
    const segmentZoom = isSingleSourceWorkflow
      ? Math.max(1, Number(activeSingleCamFraming.zoom) || 1)
      : 1;
    const combinedZoom = cinematicZoom * segmentZoom;
    if (combinedZoom !== 1) {
      style.transform = `scale(${combinedZoom})`;
    }

    if (style.transform) {
      style.transformOrigin = isSingleSourceWorkflow
        ? getSegmentTransformOrigin(activeSingleCamFraming)
        : getSegmentTransformOrigin({ zoomAnchor: fx.zoomAnchor || "center" });
    }

    if (style.transform || style.filter) {
      style.transition = "transform 0.2s ease, filter 0.25s ease";
    }

    return style;
  }, [
    effectsMediaStyle.filter,
    fx.zoom,
    fx.zoomAnchor,
    isSingleSourceWorkflow,
    activeSingleCamFraming,
  ]);
  const previewVideoStylesByCameraId = useMemo(() => {
    const styles = {};
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
        if (!viewport) return;
        styles[cameraId] = {
          opacity: 1,
          zIndex: 2,
          left: `${viewport.x}%`,
          top: `${viewport.y}%`,
          width: `${viewport.width}%`,
          height: `${viewport.height}%`,
          borderRadius: index === 0 ? "18px" : "16px",
          ...(cameraId === activeCameraId ? previewActiveVideoStyle : {}),
        };
      });
      return styles;
    }

    if (!secondaryCameraId || effectiveMulticamLayoutMode === "cut") {
      return styles;
    }

    if (effectiveMulticamLayoutMode === "split-vertical") {
      styles[activeCameraId] = {
        opacity: 1,
        zIndex: 2,
        top: "0%",
        left: 0,
        width: "100%",
        height: "50%",
        ...previewActiveVideoStyle,
      };
      styles[secondaryCameraId] = {
        opacity: 1,
        zIndex: 2,
        top: "50%",
        left: 0,
        width: "100%",
        height: "50%",
      };
      return styles;
    }

    styles[secondaryCameraId] = {
      opacity: 1,
      zIndex: 3,
      top: "4%",
      right: "4%",
      left: "auto",
      width: "34%",
      height: "30%",
      borderRadius: "18px",
      border: "2px solid rgba(255, 255, 255, 0.86)",
      boxShadow: "0 18px 32px rgba(0, 0, 0, 0.35)",
    };
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
    selectedSingleCamFraming.zoom,
    secondaryCamera,
    effectiveMulticamLayoutMode,
    activeCamera,
  ]);
  const liveMomentLabel = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return "Solo lens edit";
    }

    if (effectiveMulticamLayoutMode === "scene-grid") return "Conversation matrix live";
    if (effectiveMulticamLayoutMode === "split-vertical") return "Shared reaction moment";
    if (effectiveMulticamLayoutMode === "pip") return "Reaction orbit live";
    return "Hero angle locked";
  }, [isSingleSourceWorkflow, effectiveMulticamLayoutMode]);
  const directorHeroNarrative = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return "Solo lens edit with guided reframing.";
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
  }, [isSingleSourceWorkflow, effectiveMulticamLayoutMode]);
  const stageCommandSummary = useMemo(() => {
    if (isSingleSourceWorkflow) {
      return "Split, trim, and reframe this one recording.";
    }
    if (flowEditEnabled && flowEditPlan?.segments?.length) {
      return flowEditInsight || "Flow Edit is driving cut timing, motion, and pace from the selected audio.";
    }
    return multicamLayoutInsight;
  }, [isSingleSourceWorkflow, flowEditEnabled, flowEditPlan, flowEditInsight, multicamLayoutInsight]);
  const workflowModeLabel = isSingleSourceWorkflow ? "Single-Cam Edit" : "Multicam Director";
  const workflowTitle = isSingleSourceWorkflow ? "Single-Camera Workflow" : "Angle Timeline";
  const workflowDescription = isSingleSourceWorkflow
    ? "Split, trim, delete, and reframe sections of one recording. Add more camera angles later if you want multicam switching."
    : "Angle buttons write cut events. Audio stays on the selected audio source throughout, while AI layouts can surface shared moments and reactions.";
  const cameraPanelTitle = isSingleSourceWorkflow ? "Primary Recording" : "Camera Sources";
  const cameraPanelDescription = isSingleSourceWorkflow
    ? "This recording is your source canvas. Split it into beats, trim dead air, and punch into the speaker without leaving the single-cam workflow."
    : "Every recording lines up against the same timeline. Offsets move the source start, not your edit points.";
  const deckPrimaryLabel = isSingleSourceWorkflow ? "Edit Mode" : "Sources Live";
  const deckPrimaryValue = isSingleSourceWorkflow
    ? "Single Lens"
    : `${inSyncSourceCount} / ${readySources.length || 0}`;
  const deckPrimaryNote = isSingleSourceWorkflow
    ? "Guided split, trim, and reframe workflow"
    : "Angles aligned at current playhead";
  const deckAudioLabel = isSingleSourceWorkflow ? "Primary Audio" : "Voice Bed";
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
  const flowBeatCount = flowEditPlan?.beatMarkers?.length || 0;
  const flowEnergyZoneCount = flowEditPlan?.energyZones?.length || 0;
  const isFlowWorkspace = !isSingleSourceWorkflow && studioMode === "flow";
  const headerTitle = isSingleSourceWorkflow
    ? "Combine Multi-Camera Angles"
    : isFlowWorkspace
      ? "Flow Edit / Sync to Sound"
      : "Combine Multi-Camera Angles";
  const headerDescription = isSingleSourceWorkflow
    ? "Load one full recording to edit it on a shared timeline, or add extra camera angles and switch between them while keeping one audio source locked in."
    : isFlowWorkspace
      ? "Use Cam Combiner footage as your visual pool, then optionally drive pacing, camera switches, and speed ramps from uploaded audio or a master source."
      : "Stay in manual Cam Combiner mode to sync cameras, switch angles, and build the edit yourself. Flow Edit is optional and can be opened only when you want rhythm-driven automation.";
  const billingMessage = !canUseFeature("multicam")
    ? "Upgrade to a paid plan to unlock Cam Combiner, Auto Director, and Flow Edit."
    : isFlowWorkspace
      ? "Included on paid plans. Flow Edit preview, Auto Director, and local rhythm shaping do not spend generation credits."
      : "Included on paid plans. Manual combine, Auto Director, and camera switching stay available without spending generation credits.";

  // Attach the active camera's video for timed effects
  useEffect(() => {
    const el = previewVideoRefs.current[activeCameraId];
    if (el) attachVideo(el);
  }, [activeCameraId, attachVideo]);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    if (!readySources.length) return;
    if (!readySources.some(source => source.id === masterAudioCameraId)) {
      setMasterAudioCameraId(readySources[0].id);
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
    if (!isSingleSourceWorkflow) return;
    const activeId = activeSegment?.id || normalizedSingleCamSegments[0]?.id || null;
    setSelectedSingleCamSegmentId(current => {
      if (current && normalizedSingleCamSegments.some(segment => segment.id === current)) {
        return current;
      }
      return activeId;
    });
  }, [isSingleSourceWorkflow, activeSegment, normalizedSingleCamSegments]);

  useEffect(() => {
    if (isSingleSourceWorkflow || !flowEditEnabled || !activeFlowSegments.length) {
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
    isSingleSourceWorkflow,
    flowEditEnabled,
    activeFlowSegments,
    currentFlowSegment,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const warmAudioAnalysis = async source => {
      const mediaUrl = getSourceMediaUrl(source);
      if (!mediaUrl) return;

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
      source => getSourceMediaUrl(source) && Number(source.duration) <= 0.05
    );
    if (!unresolvedSources.length) return;

    let isCancelled = false;
    unresolvedSources.forEach(source => {
      loadVideoMetadata(getSourceMediaUrl(source))
        .then(metadata => {
          if (isCancelled) return;
          setSources(currentSources =>
            currentSources.map(currentSource =>
              currentSource.id === source.id
                ? {
                    ...currentSource,
                    duration: metadata.duration,
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
        setPlayhead(audioTime);
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
  }, [isPlaying, timelineDuration, flowEditEnabled, flowAudioUrl]);

  useEffect(() => {
    readySources.forEach(source => {
      const mappedTime = isSingleSourceWorkflow
        ? source.id === activeCameraId
          ? mapTimelineTimeToSourceTime(activeSegment, playhead)
          : null
        : currentFlowSegment
          ? getFlowSourceTimeAtPlayhead(source, currentFlowSegment, playhead, timelineBounds.timelineStart)
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
        !flowAudioUrl && isPlaying && isInRange && source.id === masterAudioCameraId,
        {
          muted: !!flowAudioUrl || source.id !== masterAudioCameraId,
          volume: !!flowAudioUrl ? 0 : source.id === masterAudioCameraId ? 1 : 0,
          playbackRate,
        }
      );
    });

    if (flowAudioRef.current) {
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

  const appendFiles = files => {
    const available = MULTICAM_MAX_SOURCES - sources.length;
    if (available <= 0) {
      toast.error(`Maximum ${MULTICAM_MAX_SOURCES} camera sources allowed.`);
      return;
    }
    const filesToAdd = Array.from(files || []).slice(0, available);
    const nextSources = filesToAdd.map(file => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      const cameraNumber = nextCameraIndexRef.current;
      nextCameraIndexRef.current += 1;
      return {
        id: `cam-${cameraNumber}`,
        label: `Camera ${cameraNumber}`,
        name: file.name,
        file,
        previewUrl,
        url: "",
        uploadedUrl: "",
        offsetSeconds: 0,
        duration: 0,
        videoWidth: 0,
        videoHeight: 0,
      };
    });

    setSources(currentSources => [...currentSources, ...nextSources]);
    if (nextSources.length) {
      setStatusMessage(
        `${nextSources.length} camera source${nextSources.length > 1 ? "s" : ""} added.`
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
      toast.error("Keep at least one loaded video source in the project.");
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
    setStatusMessage("Cancelling export...");
  };

  const handleOffsetChange = (cameraId, nextValue) => {
    const numericOffset = Number(nextValue);
    setSources(currentSources =>
      currentSources.map(source =>
        source.id === cameraId
          ? { ...source, offsetSeconds: Number.isFinite(numericOffset) ? numericOffset : 0 }
          : source
        )
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
          )}% confidence.`
        );
      }
    } else if (forceStatus) {
      setStatusMessage(
        `Auto Director is active in ${nextPlan.summary.modeLabel.toLowerCase()}.`
      );
    }
  };

  const disableAutoDirectorForManualControl = reason => {
    setAutoDirectorEnabled(false);
    if (reason) {
      setStatusMessage(reason);
    }
  };

  const handleRecordSwitch = cameraId => {
    if (!cameraId || !timelineDuration) return;

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
      toast.error("Load a video into this camera slot before switching to it.");
      return;
    }

    const mappedTime = getSourceTimelineTime(targetSource, playhead, timelineBounds.timelineStart);
    const isInRange = mappedTime >= 0 && mappedTime <= Number(targetSource.duration || 0) - 0.01;
    if (!isInRange) {
      toast.error(
        `${targetSource.label} has no frame at this playhead. Align its start or move the playhead.`
      );
      return;
    }

    const switchTime = Number(playhead.toFixed(3));
    setSwitches(currentSwitches => {
      const nextSwitches = [...currentSwitches];
      const existingIndex = nextSwitches.findIndex(
        item => Math.abs(Number(item.startTime) - switchTime) < 0.08
      );
      const nextSwitch = {
        id: existingIndex >= 0 ? nextSwitches[existingIndex].id : `switch-${Date.now()}`,
        cameraId,
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
  };

  const handleAlignSourceStartToPlayhead = cameraId => {
    const source = sources.find(item => item.id === cameraId);
    if (!source || !getSourceMediaUrl(source)) return;

    const nextOffset = Number((playhead + timelineBounds.timelineStart).toFixed(3));
    setSources(currentSources =>
      currentSources.map(currentSource =>
        currentSource.id === cameraId
          ? { ...currentSource, offsetSeconds: nextOffset }
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
          ? { ...currentSource, offsetSeconds: nextOffset }
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
      applyAutoDirectorPlan(true);
      return;
    }
    if (actionId === "multi-grid") {
      setMulticamLayoutMode("scene-grid");
      setStatusMessage("Conversation matrix opened.");
      return;
    }
    if (actionId === "multi-reaction") {
      setMulticamLayoutMode("pip");
      setStatusMessage("Reaction window mode enabled.");
      return;
    }
    if (actionId === "multi-duet") {
      setMulticamLayoutMode("split-vertical");
      setStatusMessage("Shared-moment split is active.");
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

  const handleAutoShapeSingleLens = async () => {
    if (!isSingleSourceWorkflow || !singleCamSource) return;

    try {
      setStatusMessage("Auto Shape is reading the mood of your single-lens take...");
      const analysis = await getOrCreateAudioAnalysis(singleCamSource);
      const plan = buildSingleLensAutoPlan({
        source: singleCamSource,
        audioAnalysis: analysis,
        timelineDuration: Number(singleCamSource.duration) || timelineDuration,
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
            ? { ...currentSource, offsetSeconds: nextOffset }
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

  const persistFlowPlan = nextPlan => {
    setFlowEditPlan(nextPlan);
    setFlowEditEnabled(Boolean(nextPlan?.segments?.length));
    setSelectedFlowSegmentId(nextPlan?.segments?.[0]?.id || null);
    if (nextPlan?.switches?.length) {
      setSwitches(nextPlan.switches);
      setSelectedSwitchId(nextPlan.switches[0]?.id || null);
    }
  };

  const handleUseMasterAudioForFlow = () => {
    if (!masterAudioSource) {
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
      setSwitches(nextPlan.switches);
      return nextPlan;
    });
  };

  const handleGenerateFlowEdit = async (styleOverride = null) => {
    const analysisUrl = flowAudioUrl || getSourceMediaUrl(masterAudioSource);
    if (isSingleSourceWorkflow || readySources.length < 2) {
      toast.error("Flow Edit needs at least two synced camera sources.");
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
      setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[1]);
      const variants = FLOW_EDIT_STYLE_PRESETS.map(style => ({
        ...style,
        plan: buildFlowEditPlan({
          sources: readySources,
          timelineDuration: baseTimelineDuration,
          timelineStart: timelineBounds.timelineStart,
          audioAnalysis: analysis,
          sourceActivityByCameraId: audioAnalysisByCameraId,
          styleId: style.id,
          frameQualityByCameraId: flowFrameQualityByCameraId,
        }),
      }));
      setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[2]);
      const preferred =
        variants.find(variant => variant.id === (styleOverride || flowEditStyleId)) || variants[0];
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
          warning: variant.plan.warning,
        }))
      );
      setSelectedFlowSegmentId(preferred.plan.segments[0]?.id || null);
      setFlowEditWarning(preferred.plan.warning || "");
      setFlowEditInsight(preferred.plan.rescueSummary || preferred.plan.audioExplanation || "");
      setFlowEditStatusStep(FLOW_EDIT_STATUS_STEPS[3]);
      setStatusMessage("Flow Edit preview is ready.");
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
    handleGenerateFlowEdit(styleId);
  };

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

  const handlePlayPause = () => {
    if (!timelineDuration) return;
    if (playhead >= timelineDuration) {
      setPlayhead(0);
      if (flowAudioRef.current) {
        try {
          flowAudioRef.current.currentTime = 0;
        } catch {}
      }
    }
    setIsPlaying(currentValue => !currentValue);
  };

  const handleSeek = nextValue => {
    const numericValue = Number(nextValue);
    setPlayhead(Number.isFinite(numericValue) ? numericValue : 0);
  };

  const handleUseExportInEditor = () => {
    if (!exportResult || !onComplete) return;
    onComplete({
      file: exportResult.file,
      url: exportResult.url,
      duration: exportResult.duration,
      workflowAction: "refine-full-video",
    });
  };

  const handleLoadFileForCamera = (cameraId, file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    setSources(current =>
      current.map(s =>
        s.id === cameraId
          ? { ...s, file, name: file.name, previewUrl, url: "", uploadedUrl: "", duration: 0 }
          : s
      )
    );
    setStatusMessage(`Loaded ${file.name} into ${cameraId}.`);
  };

  // Keyboard shortcuts: 1-6 switch cameras, Space play/pause
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
  }, [sources, timelineDuration]);

  const handleExport = async () => {
    if (!readySources.length) {
      setStatusMessage("Load at least one video source before exporting.");
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

    const exportVideos = new Map();
    let recorder;
    let recorderStream;
    let audioContext;
    let audioDestination;
    let externalFlowAudio;

    try {
      await Promise.all(
        readySources.map(async source => {
          const video = document.createElement("video");
          video.src = getSourceMediaUrl(source);
          video.preload = "auto";
          video.muted = true;
          video.playsInline = true;
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(new Error(`Unable to load ${source.label} for export.`));
          });
          exportVideos.set(source.id, video);
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
      const masterVideo = exportVideos.get(masterAudioCameraId);
      audioContext = new AudioContext();
      await audioContext.resume();
      audioDestination = audioContext.createMediaStreamDestination();

      if (flowAudioUrl) {
        externalFlowAudio = document.createElement("audio");
        externalFlowAudio.preload = "auto";
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
            syncMediaElement(externalFlowAudio, exportPlayhead, true, {
              muted: false,
              volume: 1,
              playbackRate: 1,
              driftThreshold: 0.24,
            });
          }

          if (isSingleSourceWorkflow) {
            const currentSegment = getActiveSegmentAtTime(
              normalizedSingleCamSegments,
              exportPlayhead
            );
            const sourceTime = mapTimelineTimeToSourceTime(currentSegment, exportPlayhead);
            const sourceVideo = exportVideos.get(currentSegment?.cameraId || singleCamSource?.id);
            const isInRange = Number.isFinite(sourceTime);
            syncMediaElement(sourceVideo, sourceTime, isInRange, {
              muted: true,
              volume: 0,
              driftThreshold: 0.24,
            });
            drawVideoToCanvas(
              context,
              canvas,
              sourceVideo,
              singleCamSource?.label,
              singleCamSegmentFraming[currentSegment?.id] || { zoom: 1, zoomAnchor: "center" }
            );
          } else {
            readySources.forEach(source => {
              const video = exportVideos.get(source.id);
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
                multicamLayoutMode
              ),
              directorStyleId,
              readySources
            );
            const visibleFeeds = (exportLayout.visibleCameraIds || [currentSegment?.cameraId])
              .filter(Boolean)
              .slice(0, 6)
              .map((cameraId, index) => ({
                video: exportVideos.get(cameraId),
                label: readySources.find(source => source.id === cameraId)?.label || cameraId,
                framing: index === 0 ? activeSingleCamFraming : {},
              }))
              .filter(feed => feed.video);
            drawCompositeVideoToCanvas(context, canvas, {
              layoutMode: exportLayout.layoutMode,
              primaryVideo: exportVideos.get(currentSegment?.cameraId),
              secondaryVideo: exportVideos.get(exportLayout.secondaryCameraId),
              primaryLabel: currentCameraLabel,
              secondaryLabel: readySources.find(
                source => source.id === exportLayout.secondaryCameraId
              )?.label,
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
      exportVideos.forEach(video => {
        video.pause();
        video.removeAttribute("src");
        video.load();
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
    }
  };

  const handleServerExport = async () => {
    if (flowEditEnabled) {
      setStatusMessage(
        "Flow Edit currently exports in-browser so your local soundtrack and speed ramps stay intact."
      );
      return;
    }
    if (!readySources.length) {
      setStatusMessage("Load at least one video source before exporting.");
      return;
    }
    if (!timelineDuration) {
      setStatusMessage("Set up synced sources before exporting.");
      return;
    }

    setServerExportPending(true);
    setIsExporting(true);
    setExportProgress(0);
    setStatusMessage("Uploading sources for server-side render (MP4)...");

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in to use server rendering.");
      const token = await user.getIdToken();

      const storage = getStorage();
      const sourcesPayload = [];
      for (let i = 0; i < readySources.length; i++) {
        const source = readySources[i];
        setExportProgress((i / readySources.length) * 0.5);
        setStatusMessage(`Uploading ${source.label || `source ${i + 1}`}...`);

        let remoteUrl = source.url || source.uploadedUrl;
        if (!remoteUrl && source.file) {
          const safeName = source.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const tempRef = ref(storage, `temp/multicam/${user.uid}/${Date.now()}_${safeName}`);
          await uploadBytes(tempRef, source.file);
          remoteUrl = await getDownloadURL(tempRef);
        }
        if (!remoteUrl) throw new Error(`No video file for ${source.label}.`);

        sourcesPayload.push({
          id: source.id,
          url: remoteUrl,
          label: source.label || `Camera ${i + 1}`,
          offset_seconds: Number(source.offsetSeconds) || 0,
        });
      }

      setExportProgress(0.6);
      setStatusMessage("Sources uploaded. Rendering on server...");

      const switchesPayload = normalizedSwitches.map(sw => ({
        camera_id: sw.cameraId,
        start_time: Number(sw.startTime) || 0,
      }));

      const response = await fetch(`${API_BASE_URL}/api/media/render-multicam`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sources: sourcesPayload,
          switches: switchesPayload,
          primaryAudioCameraId: masterAudioCameraId,
          overlapStart: readySources.length > 1 ? overlapBounds.overlapStart || 0 : 0,
          overlapDuration:
            readySources.length > 1 ? overlapBounds.overlapDuration || 0 : timelineDuration,
          outputAspectRatio: outputAspectRatio,
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
          duration: data.duration || timelineDuration,
          isServerRender: true,
        });
        setStatusMessage("Server render complete (MP4). Download or continue into the editor.");
      } else {
        setStatusMessage(
          `Server render started (Job: ${data.jobId || "unknown"}). Check back in a few minutes.`
        );
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

  return (
    <div
      className="nle-overlay"
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
            {!isSingleSourceWorkflow && (
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
            )}
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
              <strong>{masterAudioSource?.label || "Not set"}</strong>
              <small>Audio anchor for the whole render</small>
            </div>
            <div className="nle-director-stat-card">
              <span>{deckTimelineLabel}</span>
              <strong>{formatDurationLabel(timelineDuration || 0)}</strong>
              <small>
                {autoDirectorSummary?.switchesCount
                  ? `${autoDirectorSummary.switchesCount} auto cuts · ${autoDirectorSummary.averageHold.toFixed(
                      1
                    )}s avg hold`
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

        {!isSingleSourceWorkflow && isFlowWorkspace && (
          <div className="nle-flow-shell">
            <div className="nle-flow-topline">
              <div className="nle-flow-copy">
                <span className="nle-eyebrow">Flow Edit / Sync to Sound</span>
                <strong>Auto-switch cameras and shape motion to the rhythm, energy, and emotion of audio.</strong>
                <p>
                  Everything stays local during preview. Bring your boring audio if you want to.
                  We will still shape the mood, pace, and contrast so the edit feels smarter than
                  the source material had any right to feel.
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
                  <button className="nle-btn secondary" type="button" onClick={handleUseMasterAudioForFlow}>
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
                <div className="nle-flow-source-note">
                  {flowEditInsight ||
                    "Music, speech, choir, and ambient beds each trigger different pacing logic."}
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
                {flowEditVariants.length > 0 && (
                  <div className="nle-flow-variant-row">
                    {flowEditVariants.map(variant => (
                      <div key={variant.id} className="nle-flow-variant-chip">
                        <strong>{variant.label}</strong>
                        <span>
                          {variant.clipCount} cuts · {variant.audioType}
                          {variant.rescueMode ? " · rescue" : ""}
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
                    disabled={isGeneratingFlowEdit || readySources.length < 2}
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
                    <span className="nle-chip nle-chip-secondary">Mismatch rescue</span>
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
                      {flowEditPlan?.rescueSummary ||
                        "Every segment keeps manual override available after generation."}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="nle-container" ref={scrollContainerRef}>
          <div className="nle-preview-panel">
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
                      onClick={() => setMulticamLayoutMode(option.id)}
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
                className={`nle-preview-stage ${focusPickerActive ? "is-focus-picking" : ""} ${previewStageMoodClass}`}
                style={previewStageStyle}
                onClick={handlePreviewStageFocusPick}
              >
                <div className="nle-stage-live-overlay">
                  <div className="nle-stage-overlay-cluster">
                    <span className="nle-stage-live-pill">LIVE</span>
                    <span className="nle-stage-overlay-text">{directorSnapshot.modeTitle}</span>
                    {flowEditEnabled && flowEditPlan?.audioType && (
                      <span className="nle-stage-overlay-text">
                        Flow {flowEditPlan.audioType} · {flowEditStyleId}
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
                {readySources.map(source => (
                  <video
                    key={`preview-${source.id}`}
                    ref={node => {
                      previewVideoRefs.current[source.id] = node;
                    }}
                    className={`nle-preview-video ${source.id === activeCameraId ? "is-active" : ""} ${source.id === secondaryCameraId ? "is-secondary" : ""}`}
                    src={getSourceMediaUrl(source)}
                    playsInline
                    muted
                    style={previewVideoStylesByCameraId[source.id]}
                  />
                ))}
                {!readySources.length ? (
                  <div className="nle-empty-state">
                    <strong>Load your first recording to start editing.</strong>
                    <span>
                      You can keep this as a single-camera edit, or add more angles below when you
                      want multicam switching.
                    </span>
                  </div>
                ) : null}
                {edgeBlurStyle && <div style={edgeBlurStyle} />}
                {vignetteStyle && <div style={vignetteStyle} />}
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
          </div>

          <div className="nle-panel nle-camera-panel">
            <div className="nle-panel-header">
              <div>
                <h4>{cameraPanelTitle}</h4>
                <p>{cameraPanelDescription}</p>
              </div>
              <div className="nle-panel-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
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
                  Add Camera Files
                </button>
              </div>
            </div>

            <div className="nle-camera-grid">
              {sources.map((source, index) => {
                const mediaUrl = getSourceMediaUrl(source);
                const mappedTime = getSourceTimelineTime(
                  source,
                  playhead,
                  timelineBounds.timelineStart
                );
                const isAvailable =
                  mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;
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
                      if (droppedFile?.type?.startsWith("video/")) {
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
                          {normalizeSourceLabel(source.label, index)}
                        </strong>
                        <span>{source.name || normalizeSourceLabel(source.label, index)}</span>
                      </div>
                      <span className={`nle-camera-badge ${isAvailable ? "is-live" : ""}`}>
                        {isAvailable ? "In sync" : "Off timeline"}
                      </span>
                    </div>
                    <div className="nle-thumbnail-shell">
                      {mediaUrl ? (
                        <video
                          ref={node => {
                            thumbnailVideoRefs.current[source.id] = node;
                          }}
                          className="nle-thumbnail-video"
                          src={mediaUrl}
                          playsInline
                          muted
                        />
                      ) : (
                        <button
                          type="button"
                          className="nle-thumbnail-placeholder nle-drop-target"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "video/*";
                            input.onchange = evt => {
                              if (evt.target.files?.[0])
                                handleLoadFileForCamera(source.id, evt.target.files[0]);
                            };
                            input.click();
                          }}
                        >
                          Click or drop video here
                        </button>
                      )}
                    </div>
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
                          {audioAnalysisByCameraId[source.id]?.error
                            ? "Waveform unavailable"
                            : "Analyzing waveform..."}
                        </span>
                      ) : (
                        <span className="nle-waveform-placeholder">
                          Load a source to see sync hints
                        </span>
                      )}
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
                          disabled={!mediaUrl}
                        />
                      </label>
                    </div>
                    <div className="nle-source-meta-row">
                      <span>Duration: {formatDurationLabel(source.duration || 0)}</span>
                      <span>
                        Source Time: {isAvailable ? formatDurationLabel(mappedTime) : "--"}
                      </span>
                    </div>
                    <div className="nle-sync-actions">
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
                      <button
                        className="nle-mini-btn nle-mini-btn-accent"
                        type="button"
                        onClick={() => handleAutoSyncToMasterAudio(source.id)}
                        disabled={
                          !mediaUrl ||
                          source.id === masterAudioCameraId ||
                          syncingCameraId === source.id
                        }
                        title="Match this source to the selected audio source automatically"
                      >
                        {syncingCameraId === source.id ? "Syncing..." : "Sync by Audio"}
                      </button>
                    </div>
                    <div className="nle-camera-actions">
                      <button
                        className="nle-btn secondary"
                        type="button"
                        onClick={() => handleRecordSwitch(source.id)}
                        disabled={!timelineDuration || !mediaUrl || !isAvailable}
                        title={
                          isAvailable
                            ? "Show this angle from the current playhead"
                            : "This angle is off timeline at the current playhead"
                        }
                      >
                        Show {normalizeSourceLabel(source.label, index)}
                        <kbd className="nle-hotkey-hint">{index + 1}</kbd>
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

          <div className="nle-panel nle-switch-panel">
            <div className="nle-panel-header">
              <div>
                <h4>{timelinePanelTitle}</h4>
                <p>{timelinePanelDescription}</p>
              </div>
              <div className="nle-panel-actions nle-switch-buttons">
                {readySources.map((source, index) => (
                  <button
                    key={`switch-btn-${source.id}`}
                    className={`nle-btn ${source.id === activeCameraId ? "secondary" : ""}`}
                    type="button"
                    onClick={() => handleRecordSwitch(source.id)}
                    disabled={
                      !timelineDuration ||
                      getSourceTimelineTime(source, playhead, timelineBounds.timelineStart) < 0 ||
                      getSourceTimelineTime(source, playhead, timelineBounds.timelineStart) >
                        Number(source.duration || 0) - 0.01
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

                {flowEditEnabled && selectedFlowSegment && (
                  <div className="nle-flow-manual-panel">
                    <div className="nle-single-cam-note">
                      <strong>
                        {selectedFlowSegment.label || selectedFlowSegment.cameraId} ·{" "}
                        {selectedFlowSegment.energyZone} ·{" "}
                        {Number(selectedFlowSegment.playbackRate || 1).toFixed(2)}x
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
                      ? `${formatDurationLabel(selectedSingleCamSegment.timelineStart)} to ${formatDurationLabel(selectedSingleCamSegment.timelineEnd)}`
                      : "Move the playhead or click a part to edit it."}
                  </span>
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
                  disabled={isExporting || !canExportProject || isSingleSourceWorkflow || flowEditEnabled}
                  title={
                    flowEditEnabled
                      ? "Flow Edit uses local soundtrack analysis and speed ramps, so export it in-browser."
                      : isSingleSourceWorkflow
                      ? "Server render is disabled for single-camera segment edits. Use browser export."
                      : "Server render produces MP4 (15 credits)"
                  }
                >
                  {serverExportPending
                    ? "Server Rendering..."
                    : flowEditEnabled
                      ? "Server MP4 Disabled for Flow Edit"
                      : isSingleSourceWorkflow
                      ? "MP4 Server Export Unavailable"
                      : "Render MP4 on Server (15 cr)"}
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

            {statusMessage ? <div className="nle-status-banner">{statusMessage}</div> : null}
          </div>
        </div>

        <div className="nle-hidden-audio-rack" aria-hidden="true">
          {readySources.map(source => (
            <video
              key={`audio-${source.id}`}
              ref={node => {
                audioVideoRefs.current[source.id] = node;
              }}
              src={getSafeMediaSource(getSourceMediaUrl(source))}
              playsInline
            />
          ))}
          <audio ref={flowAudioRef} src={getSafeMediaSource(flowAudioUrl)} preload="auto" />
        </div>
      </div>
    </div>
  );
}

export default MultiCamCombiner;

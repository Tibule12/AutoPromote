import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDefaultSegments,
  buildSegmentDisplaySegments,
  buildInitialSources,
  buildSwitchDisplaySegments,
  formatDurationLabel,
  getActiveCameraAtTime,
  getActiveSegmentAtTime,
  getMasterTimelineBounds,
  getSourceDurationBounds,
  mapTimelineTimeToSourceTime,
  normalizeSourceLabel,
  normalizeSegments,
  normalizeSwitches,
  splitSegmentAtTimelineTime,
} from "./multicamUtils";
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./MultiCamCombiner.css";
import useCinematicEffects from "../hooks/useCinematicEffects";
import CinematicEffectsPanel from "./CinematicEffectsPanel";

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

const getSourceMediaUrl = source => source?.previewUrl || source?.url || source?.uploadedUrl || "";

const getSourceTimelineTime = (source, playhead, timelineStart) => {
  const offsetSeconds = Number(source?.offsetSeconds) || 0;
  return playhead + timelineStart - offsetSeconds;
};

const loadVideoMetadata = mediaUrl =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = mediaUrl;
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

const drawVideoToCanvas = (context, canvas, activeVideo, label, framing = {}) => {
  context.fillStyle = "#04070d";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (activeVideo && activeVideo.readyState >= 2) {
    const sourceWidth = activeVideo.videoWidth || canvas.width;
    const sourceHeight = activeVideo.videoHeight || canvas.height;
    const baseScale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const zoom = Math.max(1, Number(framing.zoom) || 1);
    const scale = baseScale * zoom;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const anchor = framing.zoomAnchor || "center";
    const anchorX = anchor === "left" ? 0.32 : anchor === "right" ? 0.68 : 0.5;
    const offsetX = canvas.width * anchorX - drawWidth * anchorX;
    const offsetY = (canvas.height - drawHeight) / 2;
    context.drawImage(activeVideo, offsetX, offsetY, drawWidth, drawHeight);
    return;
  }

  context.fillStyle = "rgba(255, 255, 255, 0.75)";
  context.font = `${Math.max(24, Math.round(canvas.width * 0.028))}px sans-serif`;
  context.textAlign = "center";
  context.fillText(label || "No active camera frame", canvas.width / 2, canvas.height / 2);
};

const pickExportMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) || "";
};

function MultiCamCombiner({ primaryFile, onCancel, onComplete, onStatusChange }) {
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

  const cancelExportRef = useRef(false);
  const fileInputRef = useRef(null);
  const nextCameraIndexRef = useRef(3);
  const objectUrlsRef = useRef(new Set());
  const animationFrameRef = useRef(null);
  const playheadRef = useRef(0);
  const scrollContainerRef = useRef(null);
  const audioAnalysisCacheRef = useRef(new Map());
  const previewVideoRefs = useRef({});
  const thumbnailVideoRefs = useRef({});
  const audioVideoRefs = useRef({});
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
  const timelineDuration = isSingleSourceWorkflow
    ? singleCamTimelineDuration
    : timelineBounds.timelineDuration;
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
    normalizedSwitches,
    readySources,
    sources,
  ]);
  const activeSegment = useMemo(() => {
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
    normalizedSwitches,
    readySources,
    sources,
    timelineDuration,
  ]);

  const activeCameraId = activeSegment?.cameraId || readySources[0]?.id || sources[0]?.id || null;
  const activeCamera = readySources.find(source => source.id === activeCameraId) || null;
  const masterAudioSource = readySources.find(source => source.id === masterAudioCameraId) || null;
  const activeSingleCamFraming = useMemo(() => {
    if (!isSingleSourceWorkflow || !activeSegment?.id) {
      return { zoom: 1, zoomAnchor: "center" };
    }
    return singleCamSegmentFraming[activeSegment.id] || { zoom: 1, zoomAnchor: "center" };
  }, [isSingleSourceWorkflow, activeSegment, singleCamSegmentFraming]);
  const selectedSingleCamSegment = useMemo(
    () =>
      normalizedSingleCamSegments.find(segment => segment.id === selectedSingleCamSegmentId) ||
      null,
    [normalizedSingleCamSegments, selectedSingleCamSegmentId]
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

    const preferredAnchor = isSingleSourceWorkflow
      ? activeSingleCamFraming.zoomAnchor || fx.zoomAnchor || "center"
      : fx.zoomAnchor || "center";
    if (style.transform) {
      style.transformOrigin =
        preferredAnchor === "left"
          ? "18% 50%"
          : preferredAnchor === "right"
            ? "82% 50%"
            : "50% 50%";
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
  const workflowTitle = isSingleSourceWorkflow ? "Single-Camera Workflow" : "Angle Timeline";
  const workflowDescription = isSingleSourceWorkflow
    ? "Split, trim, delete, and reframe sections of one recording. Add more camera angles later if you want multicam switching."
    : "Angle buttons write cut events. Audio stays on the selected audio source throughout.";
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
      nextSegments[0]?.id ? { [nextSegments[0].id]: { zoom: 1, zoomAnchor: "center" } } : {}
    );
  }, [isSingleSourceWorkflow, singleCamSource, singleCamSegments.length]);

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
  }, [isPlaying, timelineDuration]);

  useEffect(() => {
    readySources.forEach(source => {
      const mappedTime = isSingleSourceWorkflow
        ? source.id === activeCameraId
          ? mapTimelineTimeToSourceTime(activeSegment, playhead)
          : null
        : getSourceTimelineTime(source, playhead, timelineBounds.timelineStart);
      const isInRange =
        Number.isFinite(mappedTime) &&
        mappedTime >= 0 &&
        mappedTime <= Number(source.duration || 0) - 0.01;
      const isActivePreview = source.id === activeCameraId;

      syncMediaElement(
        previewVideoRefs.current[source.id],
        mappedTime,
        isPlaying && isInRange && isActivePreview,
        {
          muted: true,
          volume: 0,
        }
      );
      syncMediaElement(thumbnailVideoRefs.current[source.id], mappedTime, false, {
        muted: true,
        volume: 0,
      });
      syncMediaElement(
        audioVideoRefs.current[source.id],
        mappedTime,
        isPlaying && isInRange && source.id === masterAudioCameraId,
        {
          muted: source.id !== masterAudioCameraId,
          volume: source.id === masterAudioCameraId ? 1 : 0,
        }
      );
    });
  }, [
    readySources,
    playhead,
    isPlaying,
    timelineBounds.timelineStart,
    masterAudioCameraId,
    activeCameraId,
    isSingleSourceWorkflow,
    activeSegment,
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

  const handleRecordSwitch = cameraId => {
    if (!cameraId || !timelineDuration) return;

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
    const sourceFraming = singleCamSegmentFraming[selectedSingleCamSegmentId] || {
      zoom: 1,
      zoomAnchor: "center",
    };
    const splitIndex = nextSegments.findIndex(
      segment => segment.id === `${selectedSingleCamSegmentId}-a`
    );
    if (splitIndex >= 0) {
      const leftId = nextSegments[splitIndex]?.id;
      const rightId = nextSegments[splitIndex + 1]?.id;
      setSelectedSingleCamSegmentId(rightId || leftId || selectedSingleCamSegmentId);
      setSingleCamSegmentFraming(current => ({
        ...current,
        [leftId]: sourceFraming,
        [rightId]: sourceFraming,
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
      [selectedSingleCamSegmentId]: {
        zoom: 1,
        zoomAnchor: "center",
        ...(current[selectedSingleCamSegmentId] || {}),
        ...patch,
      },
    }));
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

  handleRecordSwitchRef.current = handleRecordSwitch;

  const handleRemoveSwitch = switchId => {
    if (!switchId) return;
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
    if (!timelineDuration || !activeCameraId || !masterAudioSource) {
      setStatusMessage("Set up synced sources and a master audio camera before exporting.");
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

      if (masterVideo) {
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
              const mappedTime = getSourceTimelineTime(
                source,
                exportPlayhead,
                timelineBounds.timelineStart
              );
              const isInRange =
                mappedTime >= 0 && mappedTime <= Number(source.duration || 0) - 0.01;
              syncMediaElement(video, mappedTime, isInRange, {
                muted: true,
                volume: 0,
                driftThreshold: 0.24,
              });
            });

            const currentSegment = getActiveCameraAtTime(
              normalizedSwitches,
              readySources,
              exportPlayhead,
              timelineDuration
            );
            const currentCameraLabel = readySources.find(
              source => source.id === currentSegment?.cameraId
            )?.label;
            drawVideoToCanvas(
              context,
              canvas,
              exportVideos.get(currentSegment?.cameraId),
              currentCameraLabel
            );
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
    }
  };

  const handleServerExport = async () => {
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
      <div className="nle-shell">
        <div className="nle-header">
          <div className="nle-header-copy">
            <span className="nle-eyebrow">Multicam Studio</span>
            <h3>Combine Multi-Camera Angles</h3>
            <p>
              Load one full recording to edit it on a shared timeline, or add extra camera angles
              and switch between them while keeping one audio source locked in.
            </p>
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

        <div className="nle-summary-row">
          <div className="nle-summary-card">
            <span>Sources</span>
            <strong>
              {readySources.length} / {MULTICAM_MAX_SOURCES}
            </strong>
          </div>
          <div className="nle-summary-card">
            <span>Audio Source</span>
            <strong>{masterAudioSource?.label || "Not set"}</strong>
          </div>
          <div className="nle-summary-card">
            <span>Shared Timeline</span>
            <strong>{formatDurationLabel(timelineDuration || 0)}</strong>
          </div>
          <div className="nle-summary-card">
            <span>Output</span>
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

        <div className="nle-container" ref={scrollContainerRef}>
          <div className="nle-preview-panel">
            <div className="nle-preview-shell">
              <div className="nle-preview-stage" style={previewStageStyle}>
                {readySources.map(source => (
                  <video
                    key={`preview-${source.id}`}
                    ref={node => {
                      previewVideoRefs.current[source.id] = node;
                    }}
                    className={`nle-preview-video ${source.id === activeCameraId ? "is-active" : ""}`}
                    src={getSourceMediaUrl(source)}
                    playsInline
                    muted
                    style={source.id === activeCameraId ? previewActiveVideoStyle : undefined}
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
                <span className="nle-chip">Active video: {activeCamera?.label || "None"}</span>
                <span className="nle-chip nle-chip-secondary">
                  Audio source: {masterAudioSource?.label || "None"}
                </span>
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
                <h4>Camera Sources</h4>
                <p>
                  Every recording lines up against the same timeline. Offsets move the source start,
                  not your edit points.
                </p>
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
                <h4>{workflowTitle}</h4>
                <p>{workflowDescription}</p>
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
                  {displaySegments.map(segment => (
                    <button
                      key={segment.id}
                      type="button"
                      className={`nle-switch-segment ${selectedSwitchId === segment.id ? "is-selected" : ""}`}
                      style={{
                        left: `${segment.startPercent}%`,
                        width: `${segment.widthPercent}%`,
                        background: `${getCameraColor(segment.cameraId, readySources.length ? readySources : sources)}cc`,
                      }}
                      onClick={event => {
                        event.stopPropagation();
                        setSelectedSwitchId(segment.id);
                        handleSeek(segment.startTime);
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

                <div className="nle-switch-list">
                  {normalizedSwitches.map((switchItem, index) => {
                    const label =
                      readySources.find(source => source.id === switchItem.cameraId)?.label ||
                      switchItem.cameraId;
                    const isLocked = Number(switchItem.startTime) <= 0.001;
                    return (
                      <div
                        key={switchItem.id}
                        className={`nle-switch-row ${selectedSwitchId === switchItem.id ? "is-selected" : ""}`}
                      >
                        <button
                          className="nle-text-btn"
                          type="button"
                          onClick={() => {
                            setSelectedSwitchId(switchItem.id);
                            handleSeek(switchItem.startTime);
                          }}
                        >
                          {index + 1}. {label} at {formatDurationLabel(switchItem.startTime)}
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
                          className={`nle-mini-btn ${Math.abs((selectedSingleCamSegment ? singleCamSegmentFraming[selectedSingleCamSegment.id]?.zoom || 1 : 1) - zoomLevel) < 0.01 ? "nle-mini-btn-accent" : ""}`}
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
                          className={`nle-mini-btn ${(selectedSingleCamSegment ? singleCamSegmentFraming[selectedSingleCamSegment.id]?.zoomAnchor || "center" : "center") === anchor.id ? "nle-mini-btn-accent" : ""}`}
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
              </>
            )}

            <div className="nle-footer-grid">
              <div className="nle-footer-note">
                <strong>Sync window</strong>
                <span>
                  {readySources.length > 1
                    ? `Overlap start ${formatDurationLabel(overlapBounds.overlapStart || 0)} | overlap duration ${formatDurationLabel(overlapBounds.overlapDuration || 0)}`
                    : "One source loaded. Add more angles only when you want cutaways or alternate views."}
                </span>
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
                  disabled={isExporting || !canExportProject || isSingleSourceWorkflow}
                  title={
                    isSingleSourceWorkflow
                      ? "Server render is disabled for single-camera segment edits. Use browser export."
                      : "Server render produces MP4 (15 credits)"
                  }
                >
                  {serverExportPending
                    ? "Server Rendering..."
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
              src={getSourceMediaUrl(source)}
              playsInline
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default MultiCamCombiner;

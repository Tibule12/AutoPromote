import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { API_ENDPOINTS } from "../config";
import { SafeImage } from "./SafeMedia";
import "./SmartPromoSummaryPanel.css";

const STORY_EDIT_DURATIONS = [60, 120, 180, 300];
const PROMO_OUTPUT_MODES = [
  {
    id: "visual_edit",
    label: "Dynamic Visual Edit",
    summary:
      "One continuous visual edit with original audio preserved, plus three preview cuts from the same timeline.",
    pill: "Visual Master",
  },
];
const PROMO_STYLES = [
  {
    id: "clean",
    label: "Clean",
    summary: "Balanced reframing, confident pacing, and steady visual polish.",
  },
  {
    id: "hype",
    label: "Hype",
    summary: "Faster shot changes, tighter punch-ins, and more aggressive visual energy.",
  },
  {
    id: "minimal",
    label: "Minimal",
    summary: "Longer holds and gentler movement when the performance should stay in control.",
  },
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const getSelectedPreset = (items, id) => items.find(item => item.id === id) || items[0];

// Client-side compression before upload — turns raw 4K/ProRes into web-friendly bitrates
const BYTES_PER_MB = 1024 * 1024;
const UPLOAD_COMPRESSION_THRESHOLD_BYTES = 80 * BYTES_PER_MB; // Compress files > 80 MB
const UPLOAD_COMPRESSION_TARGET_BPS = 6_000_000;              // 6 Mbps video
const UPLOAD_COMPRESSION_AUDIO_BPS = 128_000;                 // 128 Kbps audio

const formatMediaBytes = bytes => {
  if (!bytes || bytes < 1024) return "0 KB";
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
};

const compressVideoBeforeUpload = async (file, onProgress) => {
  const isVideo = String(file?.type || "").startsWith("video/") || /\.(mov|mp4|avi|mkv|webm|m4v|3gp)$/i.test(file.name || "");
  if (!isVideo || file.size <= UPLOAD_COMPRESSION_THRESHOLD_BYTES) return null;
  if (typeof MediaRecorder === "undefined") return null;

  const mimeTypes = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8", "video/webm"];
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
    video.src = objectUrl;

    let resolved = false;
    const cleanup = () => { if (!resolved) { resolved = true; URL.revokeObjectURL(objectUrl); } };
    const fail = () => { cleanup(); resolve(null); };

    video.onloadedmetadata = () => {
      try {
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
          if (typeof onProgress === "function") onProgress(1);
          resolve({ file: compressedFile, originalSize: file.size, compressedSize: blob.size });
        };

        recorder.onerror = () => { fail(); };
        recorder.start(1000);
        let lastPct = 0;
        const duration = video.duration || 1;
        video.ontimeupdate = () => {
          const pct = Math.min(1, video.currentTime / duration);
          if (pct - lastPct > 0.03) {
            lastPct = pct;
            if (typeof onProgress === "function") onProgress(pct);
          }
        };
        video.onended = () => { recorder.stop(); };
        video.play().catch(() => fail());
      } catch (_) { fail(); }
    };

    video.onerror = () => fail();
    setTimeout(() => { if (!resolved) fail(); }, 30000);
  });
};

const readLocalVideoDuration = file =>
  new Promise(resolve => {
    if (!(file instanceof File || file instanceof Blob) || !String(file.type || "").startsWith("video/")) {
      resolve(0);
      return;
    }
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const finish = value => {
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(value) ? value : 0);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Number(video.duration || 0));
    video.onerror = () => finish(0);
    video.src = objectUrl;
  });

const buildPromoDirectorBrief = ({ durationSeconds, style }) => {
  const durationIntent =
    durationSeconds >= 180
      ? "longer-form visual treatment"
      : durationSeconds >= 120
        ? "balanced visual edit"
        : "faster attention-retention edit";
  const styleIntent = {
    clean: "balanced reframes, polished movement, and measured pacing",
    hype: "harder punch-ins, faster switches, and more visual pressure",
    minimal: "longer holds, quieter movement, and cleaner presentation",
  }[style.id] || style.summary;

  return {
    title: `${durationSeconds}s ${style.label} Visual Edit`,
    summary: `Director is aiming for a ${durationIntent}: ${styleIntent}.`,
    bullets: [
      "The uploaded audio stays in its original continuous order with no dialogue rewriting or rearrangement.",
      "The system only changes the visual presentation through reframing, punch-ins, and pacing changes.",
      "You get one master visual edit first, then three preview cuts derived from the same continuous timeline.",
    ],
  };
};

const getFreshAuthToken = async forceRefresh => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Please log in to use Smart Promo.");
  return user.getIdToken(Boolean(forceRefresh));
};

const buildStatusLabel = analysis => {
  const progress = Number(analysis?.progress || 0);
  const status = String(analysis?.status || "").toLowerCase();

  if (status === "queued") return "Queued for promo generation...";
  if (status === "failed") return analysis?.error || "Promo generation failed.";
  if (status === "completed") return "Smart Promo edit is ready.";

  if (progress < 25) return "Analyzing audio, motion, and framing...";
  if (progress < 50) return "Planning visual pacing...";
  if (progress < 75) return "Rendering dynamic reframes...";
  return "Packaging edit outputs...";
};

const VISUAL_PROGRESS_STEPS = [
  {
    id: "analyzing_original_video",
    label: "Analyzing Original Video",
    summary: "Reading video, audio, and motion",
  },
  {
    id: "detecting_subjects",
    label: "Detecting Subjects",
    summary: "Finding faces, speaker focus, and subjects",
  },
  {
    id: "reading_audio_energy",
    label: "Reading Audio Energy",
    summary: "Tracking energy peaks and movement changes",
  },
  {
    id: "building_virtual_camera_moves",
    label: "Building Virtual Camera Moves",
    summary: "Creating punch-ins, crop shifts, and returns to wide",
  },
  {
    id: "creating_visual_edit_timeline",
    label: "Creating Edit Timeline",
    summary: "Planning the final visual pacing",
  },
  {
    id: "rendering_final_output",
    label: "Rendering Final Output",
    summary: "Rendering the final visual edit",
  },
];

const formatTimelineTime = seconds => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const inferVisualStageFromProgress = analysis => {
  const explicitStage = String(analysis?.stage || "").trim();
  if (explicitStage) return explicitStage;
  const progress = Number(analysis?.progress || 0);
  if (progress < 20) return "analyzing_original_video";
  if (progress < 30) return "detecting_subjects";
  if (progress < 40) return "reading_audio_energy";
  if (progress < 50) return "building_virtual_camera_moves";
  if (progress < 60) return "creating_visual_edit_timeline";
  return "rendering_final_output";
};

const extractPlannedTimeline = analysis => {
  const rawTimeline =
    (Array.isArray(analysis?.plannedEditTimeline) && analysis.plannedEditTimeline) ||
    (Array.isArray(analysis?.storyMasterClip?.segments) && analysis.storyMasterClip.segments) ||
    (Array.isArray(analysis?.clipSuggestions?.[0]?.segments) && analysis.clipSuggestions[0].segments) ||
    [];

  return rawTimeline
    .filter(segment => Number(segment?.end) > Number(segment?.start))
    .map((segment, index) => ({
      id: segment.id || `${segment.editLabel || segment.visualMode || "edit"}-${index}`,
      start: Number(segment.start || 0),
      end: Number(segment.end || 0),
      duration: Number(segment.duration || Math.max(0.2, Number(segment.end || 0) - Number(segment.start || 0))),
      editLabel:
        segment.editLabel ||
        {
          wide: "Wide Shot",
          tight: "Punch-In",
          focus: "Subject Focus",
        }[segment.visualMode] ||
        "Visual Reframe",
      reason: segment.reason || "Visual pacing adjustment",
      visualMode: segment.visualMode || "focus",
      audioEnergyDb: Number(segment.audioEnergyDb ?? -34),
      motionScore: Number(segment.motionScore ?? 0.18),
      focusX: Number(segment.focusX ?? 0.5),
      focusY: Number(segment.focusY ?? 0.5),
      startFocusX: Number(segment.startFocusX ?? segment.focusX ?? 0.5),
      startFocusY: Number(segment.startFocusY ?? segment.focusY ?? 0.5),
      endFocusX: Number(segment.endFocusX ?? segment.focusX ?? 0.5),
      endFocusY: Number(segment.endFocusY ?? segment.focusY ?? 0.5),
      zoom: Number(segment.zoom ?? 1),
      zoomStart: Number(segment.zoomStart ?? segment.zoom ?? 1),
      zoomEnd: Number(segment.zoomEnd ?? segment.zoom ?? 1),
      faceCount: Number(segment.faceCount ?? 0),
      framingVariant: segment.framingVariant || "center",
    }));
};

const buildVisualProgressSteps = analysis => {
  const activeStage = inferVisualStageFromProgress(analysis);
  const activeIndex = Math.max(
    0,
    VISUAL_PROGRESS_STEPS.findIndex(step => step.id === activeStage)
  );
  return VISUAL_PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state:
      index < activeIndex
        ? "complete"
        : index === activeIndex
          ? "active"
          : "pending",
  }));
};

const buildWaveformBars = timeline => {
  const segments = Array.isArray(timeline) ? timeline : [];
  if (!segments.length) {
    return Array.from({ length: 24 }, (_, index) => ({
      id: `idle-${index}`,
      height: 0.24 + ((index % 5) * 0.08),
      segmentId: null,
    }));
  }

  const bars = [];
  segments.forEach((segment, segmentIndex) => {
    const energy = Number(segment.audioEnergyDb ?? -34);
    const motion = Number(segment.motionScore ?? 0.18);
    const duration = Number(segment.duration || Math.max(0.5, Number(segment.end || 0) - Number(segment.start || 0)));
    const sampleCount = Math.max(1, Math.min(4, Math.round(duration / 1.6)));
    const baseHeight = Math.max(0.16, Math.min(1, (energy + 50) / 28));
    const motionLift = Math.max(0, Math.min(0.18, motion * 0.35));
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      bars.push({
        id: `${segment.id || `segment-${segmentIndex}`}-${sampleIndex}`,
        height: Math.max(0.16, Math.min(1, baseHeight + motionLift - (sampleIndex % 2 === 0 ? 0.03 : -0.02))),
        segmentId: segment.id || `segment-${segmentIndex}`,
      });
    }
  });
  return bars.slice(0, 72);
};

const getPreviewViewportMeta = segment => {
  if (!segment) {
    return {
      focusX: 0.5,
      focusY: 0.5,
      scale: 1,
      translateX: 0,
      visualMode: "focus",
      framingVariant: "center",
    };
  }

  const focusX = Math.max(0.18, Math.min(0.82, Number(segment.endFocusX ?? segment.focusX ?? 0.5)));
  const focusY = Math.max(0.22, Math.min(0.78, Number(segment.endFocusY ?? segment.focusY ?? 0.5)));
  const zoomEnd = Math.max(0.82, Math.min(1, Number(segment.zoomEnd ?? segment.zoom ?? 1)));
  const visualMode = String(segment.visualMode || "focus").toLowerCase();
  const framingVariant = String(segment.framingVariant || "center").toLowerCase();

  let scale = 1;
  if (visualMode === "tight") scale = Math.min(1.34, 1 + (1 - zoomEnd) * 2.15);
  else if (visualMode === "focus") scale = Math.min(1.22, 1 + (1 - zoomEnd) * 1.55);
  else scale = framingVariant === "slow_movement" ? 1.03 : 1.01;

  let translateX = 0;
  if (framingVariant === "asymmetric") translateX = focusX < 0.5 ? 2.5 : -2.5;
  if (framingVariant === "slow_movement") translateX += focusX < 0.5 ? 1.3 : -1.3;

  return {
    focusX,
    focusY,
    scale,
    translateX,
    visualMode,
    framingVariant,
  };
};

const buildPreviewViewportStyle = segment => {
  const meta = getPreviewViewportMeta(segment);
  return {
    transform: `translateX(${meta.translateX}%) scale(${meta.scale.toFixed(3)})`,
    transformOrigin: `${Math.round(meta.focusX * 100)}% ${Math.round(meta.focusY * 100)}%`,
  };
};

const buildPreviewFocusBoxStyle = segment => {
  const meta = getPreviewViewportMeta(segment);
  const width = Math.max(52, Math.min(100, 100 / meta.scale));
  const height = Math.max(52, Math.min(100, 100 / meta.scale));
  const left = Math.max(0, Math.min(100 - width, meta.focusX * 100 - width / 2));
  const top = Math.max(0, Math.min(100 - height, meta.focusY * 100 - height / 2));
  return {
    width: `${width}%`,
    height: `${height}%`,
    left: `${left}%`,
    top: `${top}%`,
  };
};

const describePreviewSegment = segment => {
  const meta = getPreviewViewportMeta(segment);
  const shotLabel =
    {
      wide: "Wide Shot",
      tight: "Punch In",
      focus: "Close Focus",
    }[meta.visualMode] || "Visual Reframe";
  const focusHorizontal =
    meta.focusX < 0.38 ? "left" : meta.focusX > 0.62 ? "right" : "center";
  const focusVertical =
    meta.focusY < 0.38 ? "upper frame" : meta.focusY > 0.62 ? "lower frame" : "mid frame";
  const movementLabel =
    meta.framingVariant === "slow_movement"
      ? "Drifting camera move"
      : meta.framingVariant === "asymmetric"
        ? "Off-center reframing"
        : "Locked camera move";
  return {
    shotLabel,
    zoomLabel: `${Math.max(0, Math.round((meta.scale - 1) * 100))}% zoom`,
    focusLabel: `Targeting ${focusHorizontal} ${focusVertical}`,
    movementLabel,
  };
};

const normalizePromoAssets = clip => {
  const visualAssets = Array.isArray(clip?.visualAssets) ? clip.visualAssets.filter(asset => asset?.url) : [];
  return {
    hookText: clip?.hookText || clip?.titleSuggestion || clip?.promoCaption || clip?.title || "Watch This Moment",
    titleSuggestion: clip?.titleSuggestion || clip?.hookText || clip?.title || "Watch This Moment",
    subtitleText: clip?.subtitleText || clip?.promoCaption || clip?.title || "Full Clip Inside",
    captions: Array.isArray(clip?.captions) ? clip.captions : [],
    visualAssets,
    thumbnailOptions: Array.isArray(clip?.thumbnailOptions)
      ? clip.thumbnailOptions.filter(asset => asset?.url)
      : visualAssets.filter(asset => asset.type === "thumbnail"),
    posterOptions: Array.isArray(clip?.posterOptions)
      ? clip.posterOptions.filter(asset => asset?.url)
      : visualAssets.filter(asset => asset.type === "poster" || asset.type === "story"),
  };
};

const getClipIdentity = (clip, index = 0) => clip?.id || clip?.url || `clip-${index}`;

const getDefaultVisualAsset = clip =>
  clip?.thumbnailOptions?.[0] ||
  clip?.posterOptions?.[0] ||
  clip?.visualAssets?.[0] ||
  null;

const buildSourceFingerprint = ({ sourceFile, sourceUrl }) => {
  if (sourceFile instanceof File || sourceFile instanceof Blob) {
    const safeName = typeof sourceFile.name === "string" ? sourceFile.name : "blob";
    const lastModified =
      typeof sourceFile.lastModified === "number" ? sourceFile.lastModified : "na";
    return `${safeName}:${sourceFile.size || 0}:${lastModified}`;
  }
  if (sourceFile?.url) return String(sourceFile.url);
  if (typeof sourceUrl === "string" && sourceUrl) return sourceUrl;
  return "unknown-source";
};

const fallbackPromoClips = analysis =>
  (Array.isArray(analysis?.clips) ? analysis.clips : [])
    .filter(clip => clip?.url)
    .map((clip, index) => ({
      id: `fallback-${index + 1}`,
      url: clip.url,
      title: clip.titleSuggestion || clip.hookText || clip.text || `Promo Cut ${index + 1}`,
      promoCaption: clip.promoCaption || clip.text || `Promo Cut ${index + 1}`,
      campaignRoleLabel: clip.campaignRoleLabel || null,
      bestFor: clip.bestFor || null,
      hookReason: clip.hookReason || null,
      travelReason: clip.travelReason || null,
      duration: clip.duration,
      viralScore: clip.viralScore,
      expiresAt: analysis?.expiresAt || null,
      ...normalizePromoAssets(clip),
    }));

const normalizePromoLibraryClip = clip => ({
  id: clip.id || clip.url,
  url: clip.url,
  title: clip.titleSuggestion || clip.hookText || clip.title || clip.promoCaption || "Smart Promo Clip",
  promoCaption: clip.promoCaption || clip.title || "Smart Promo Clip",
  campaignRoleLabel: clip.campaignRoleLabel || null,
  storyMaster: Boolean(clip.storyMaster),
  bestFor: clip.bestFor || null,
  hookReason: clip.hookReason || null,
  travelReason: clip.travelReason || null,
  selectionWhy: clip.selectionWhy || null,
  confidenceLabel: clip.confidenceLabel || null,
  duration: clip.duration,
  viralScore: clip.viralScore,
  expiresAt: clip.expiresAt || null,
  sourceAnalysisId: clip.sourceAnalysisId || null,
  ...normalizePromoAssets(clip),
});

const normalizePromoAnalysisResults = analysis => {
  const normalizeAnalysisClip = (clip, fallbackId) => ({
    id: clip.id || clip.url || fallbackId,
    url: clip.url,
    title: clip.titleSuggestion || clip.hookText || clip.title || clip.promoCaption || "Smart Promo Clip",
    promoCaption: clip.promoCaption || clip.title || "Smart Promo Clip",
    campaignRoleLabel: clip.campaignRoleLabel || (clip.storyMaster ? "Master Visual Edit" : null),
    storyMaster: Boolean(clip.storyMaster),
    bestFor: clip.bestFor || null,
    hookReason: clip.hookReason || null,
    travelReason: clip.travelReason || null,
    selectionWhy: clip.selectionWhy || null,
    confidenceLabel: clip.confidenceLabel || null,
    duration: clip.duration,
    viralScore: clip.viralScore,
    expiresAt: analysis?.expiresAt || clip.expiresAt || null,
    ...normalizePromoAssets(clip),
  });

  const storyMasterClip =
    analysis?.storyMasterClip?.url ? normalizeAnalysisClip(analysis.storyMasterClip, "story-master") : null;
  const derivedShorts = Array.isArray(analysis?.derivedShorts)
    ? analysis.derivedShorts.filter(clip => clip?.url).map((clip, index) => normalizeAnalysisClip(clip, `derived-${index + 1}`))
    : [];

  if (storyMasterClip || derivedShorts.length) {
    return [storyMasterClip, ...derivedShorts].filter(Boolean);
  }

  if (Array.isArray(analysis?.promoClips) && analysis.promoClips.length) {
    return analysis.promoClips
      .filter(clip => clip?.url)
      .map((clip, index) => normalizeAnalysisClip(clip, `promo-${index + 1}`));
  }

  return fallbackPromoClips(analysis);
};

function SmartPromoSummaryPanel({
  sourceFile,
  sourceUrl,
  creditBalance,
  creditCosts,
  onClose,
  onUseClip,
  onStatusChange,
}) {
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [styleId, setStyleId] = useState("clean");
  const [outputMode, setOutputMode] = useState("visual_edit");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [jobId, setJobId] = useState("");
  const [promoClips, setPromoClips] = useState([]);
  const [analysisDetails, setAnalysisDetails] = useState(null);
  const [errorText, setErrorText] = useState("");
  const [restoringClips, setRestoringClips] = useState(false);
  const [pendingEstimate, setPendingEstimate] = useState(null);
  const [segmentFrames, setSegmentFrames] = useState({});
  const [activeSegmentFrameIndex, setActiveSegmentFrameIndex] = useState(0);
  const captureVideoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isEstimating, setIsEstimating] = useState(false);
  const [selectedVisualByClipId, setSelectedVisualByClipId] = useState({});
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const pollingActiveRef = useRef(true);

  const promoCost = Number(creditCosts?.["promo-summary"] || 18);
  const displayedPromoCost = pendingEstimate?.credits || promoCost;

  useEffect(() => {
    pollingActiveRef.current = true;
    return () => {
      pollingActiveRef.current = false;
    };
  }, []);

  const canAfford = creditBalance === null || Number(creditBalance) >= displayedPromoCost;
  const activeDurations = STORY_EDIT_DURATIONS;
  const selectedOutputMode = useMemo(
    () => getSelectedPreset(PROMO_OUTPUT_MODES, outputMode),
    [outputMode]
  );
  const waitEstimate =
    durationSeconds >= 180 ? "about 20-40 minutes" : "about 12-25 minutes";
  const selectedStyle = useMemo(() => getSelectedPreset(PROMO_STYLES, styleId), [styleId]);
  const promoDirectorBrief = useMemo(
    () =>
      buildPromoDirectorBrief({
        durationSeconds,
        style: selectedStyle,
      }),
    [durationSeconds, selectedStyle]
  );

  useEffect(() => {
    const nextDurations = STORY_EDIT_DURATIONS;
    if (!nextDurations.includes(durationSeconds)) {
      setDurationSeconds(120);
    }
  }, [durationSeconds]);

  const sourceSummary = useMemo(() => {
    if (sourceFile?.name) return sourceFile.name;
    if (typeof sourceUrl === "string" && sourceUrl) return "Current editor video";
    return "Current source";
  }, [sourceFile, sourceUrl]);

  useEffect(() => {
    if (sourceFile instanceof File || sourceFile instanceof Blob) {
      const objectUrl = URL.createObjectURL(sourceFile);
      setSourcePreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    if (sourceFile?.url) {
      setSourcePreviewUrl(String(sourceFile.url));
      return undefined;
    }
    if (typeof sourceUrl === "string" && sourceUrl) {
      setSourcePreviewUrl(sourceUrl);
      return undefined;
    }
    setSourcePreviewUrl("");
    return undefined;
  }, [sourceFile, sourceUrl]);

  const resolveVideoSource = async () => {
    if (sourceFile instanceof File || sourceFile instanceof Blob) {
      setStatusText("Preparing source file...");

      // Compress large files before upload
      let uploadFile = sourceFile;
      const compressResult = await compressVideoBeforeUpload(sourceFile, pct => {
        if (pct < 1) setStatusText(`Compressing source (${Math.round(pct * 100)}%)...`);
      });
      if (compressResult) {
        uploadFile = compressResult.file;
        setStatusText(
          `Compressed ${formatMediaBytes(compressResult.originalSize)} → ${formatMediaBytes(compressResult.compressedSize)}`
        );
        await wait(800);
      }

      // Upload directly to Python media worker — no Firebase roundtrip
      setStatusText("Uploading to media worker...");
      const formData = new FormData();
      formData.append("file", uploadFile, uploadFile.name || "source.mp4");

      let response;
      try {
        response = await fetch("http://127.0.0.1:8000/api/media/upload-source", {
          method: "POST",
          body: formData,
        });
      } catch {
        throw new Error("Cannot reach media worker. Make sure python_media_worker is running on port 8000.");
      }

      const uploadResult = await response.json().catch(() => ({}));
      if (!response.ok || !uploadResult?.localPath) {
        throw new Error(uploadResult?.detail || "Failed to upload source to media worker");
      }

      setStatusText(
        `Source ready (${formatMediaBytes(uploadResult.size || 0)}, ${(uploadResult.duration || 0).toFixed(1)}s)`
      );
      await wait(500);

      return {
        videoUrl: uploadResult.localPath,   // local filesystem path — worker reads directly
        localPath: uploadResult.localPath,
        sourceStoragePath: null,
      };
    }

    if (sourceFile?.url) {
      return { videoUrl: sourceFile.url, sourceStoragePath: null };
    }

    if (typeof sourceUrl === "string" && sourceUrl) {
      return { videoUrl: sourceUrl, sourceStoragePath: null };
    }

    throw new Error("No source video is available for promo generation.");
  };

  useEffect(() => {
    let cancelled = false;

    const loadExistingPromoClips = async () => {
      setRestoringClips(true);
      try {
        const token = await getFreshAuthToken(false);
        const response = await fetch(API_ENDPOINTS.CLIPS_USER, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const payload = await response.json();
        const clips = (Array.isArray(payload.clips) ? payload.clips : [])
          .filter(clip => clip?.sourceType === "promo_summary_clip" && clip?.url)
          .filter(clip => !clip.expiresAt || new Date(clip.expiresAt).getTime() > Date.now())
          .slice(0, 8)
          .map(normalizePromoLibraryClip);
        if (!cancelled && clips.length) {
          setPromoClips(clips);
          setStatusText("Restored your available Smart Promo outputs.");
        }
      } catch (error) {
        console.warn("Could not restore promo clips.", error);
      } finally {
        if (!cancelled) setRestoringClips(false);
      }
    };

    loadExistingPromoClips();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAnalysis = async (token, analysisJobId) => {
    let activeToken = token;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(API_ENDPOINTS.CLIPS_ANALYSIS(analysisJobId), {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (response.ok) {
        const payload = await response.json();
        return { analysis: payload.analysis || payload, token: activeToken };
      }
      if (response.status === 401 && attempt === 0) {
        activeToken = await getFreshAuthToken(true);
        continue;
      }
      throw new Error(`Status check failed with ${response.status}`);
    }
    throw new Error("Status check failed.");
  };

  const startPolling = async (token, analysisJobId) => {
    let activeToken = token;
    while (pollingActiveRef.current) {
      const result = await fetchAnalysis(activeToken, analysisJobId);
      const analysis = result.analysis;
      activeToken = result.token;
      const nextStatus = buildStatusLabel(analysis);
      setStatusText(nextStatus);
      setAnalysisDetails({
        analysisReused: Boolean(analysis.analysisReused),
        workflowType: analysis.workflowType || null,
        confidenceSummary: analysis.confidenceSummary || null,
        progress: Number(analysis.progress || 0),
        status: analysis.status || "",
        detail: analysis.detail || "",
        stage: inferVisualStageFromProgress(analysis),
        plannedTimeline: extractPlannedTimeline(analysis),
      });
      if (onStatusChange) onStatusChange(nextStatus);

      if (analysis.status === "completed") {
        const clips = normalizePromoAnalysisResults(analysis);
        setPromoClips(clips);
        if (analysis.analysisReused) {
          setStatusText("Smart Promo edit is ready. Reused saved analysis.");
        }
        return;
      }

      if (analysis.status === "failed") {
        throw new Error(analysis.error || "Promo generation failed.");
      }

      await wait(4000);
    }
  };

  const fetchCreditEstimate = async token => {
    const videoDurationSeconds = await readLocalVideoDuration(sourceFile);
    const response = await fetch(API_ENDPOINTS.CLIPS_PROMO_SUMMARY_ESTIMATE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoDurationSeconds,
        clipCount: 4,
        outputMode,
        includeCaptions: false,
        includeVisuals: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Unable to estimate promo credits.");
    }
    return payload.estimate || payload;
  };

  const startGeneration = async estimate => {
    setErrorText("");
    setPromoClips([]);
    setIsGenerating(true);
    setJobId("");
    setPendingEstimate(null);
    setAnalysisDetails(null);
    setStatusText("Uploading and preparing Smart Promo...");

    try {
      let token = await getFreshAuthToken(true);
      setStatusText("Uploading source video...");
      const { videoUrl, localPath, sourceStoragePath } = await resolveVideoSource();
      const sourceFingerprint = buildSourceFingerprint({ sourceFile, sourceUrl });
      setStatusText("Creating Smart Promo job...");

      let response;
      let payload = {};
      for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetch(API_ENDPOINTS.CLIPS_PROMO_SUMMARY, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            videoUrl,
            localPath: localPath || null,
            durationSeconds,
            style: styleId,
            outputMode,
            sourceStoragePath,
            sourceFingerprint,
            videoDurationSeconds: estimate?.videoDurationSeconds || 0,
          }),
        });

        payload = await response.json().catch(() => ({}));
        if (response.ok) break;
        if (response.status === 401 && attempt === 0) {
          token = await getFreshAuthToken(true);
          continue;
        }
        throw new Error(payload.message || payload.error || "Unable to start promo generation.");
      }

      const nextJobId = payload.jobId || "";
      setJobId(nextJobId);
      setStatusText("Analyzing video...");
      if (onStatusChange) {
        onStatusChange(
          `Smart Promo started. ${payload.creditsRemaining ?? "?"} credits remaining.`
        );
      }

      if (nextJobId) {
        await startPolling(token, nextJobId);
      }
    } catch (error) {
      setErrorText(error.message || "Promo generation failed.");
      setStatusText(error.message || "Promo generation failed.");
      if (onStatusChange) onStatusChange(error.message || "Promo generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setErrorText("");
    setIsEstimating(true);
    setStatusText("Estimating processing cost...");
    try {
      const token = await getFreshAuthToken(true);
      const estimate = await fetchCreditEstimate(token);
      if (creditBalance !== null && Number(creditBalance) < Number(estimate.credits || 0)) {
        throw new Error(`You need ${estimate.credits} credits for this package. Current balance: ${creditBalance}.`);
      }
      setPendingEstimate(estimate);
      setStatusText("Confirm the promo package estimate to start.");
    } catch (error) {
      setErrorText(error.message || "Unable to estimate promo generation.");
      setStatusText(error.message || "Unable to estimate promo generation.");
    } finally {
      setIsEstimating(false);
    }
  };

  const formatExpiry = expiresAt => {
    if (!expiresAt) return "24h access window";
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
    return `Expires in ${minutes}m`;
  };

  const visualProgressSteps = useMemo(
    () => buildVisualProgressSteps(analysisDetails),
    [analysisDetails]
  );
  const plannedTimeline = useMemo(
    () => analysisDetails?.plannedTimeline || [],
    [analysisDetails]
  );
  const progressPercent = Math.max(0, Math.min(100, Number(analysisDetails?.progress || 0)));
  const activePreviewSegment = plannedTimeline[activePreviewIndex] || plannedTimeline[0] || null;
  const waveformBars = useMemo(() => buildWaveformBars(plannedTimeline), [plannedTimeline]);
  const previewViewportStyle = useMemo(
    () => buildPreviewViewportStyle(activePreviewSegment),
    [activePreviewSegment]
  );
  const previewFocusBoxStyle = useMemo(
    () => buildPreviewFocusBoxStyle(activePreviewSegment),
    [activePreviewSegment]
  );
  const activePreviewMeta = useMemo(
    () => (activePreviewSegment ? describePreviewSegment(activePreviewSegment) : null),
    [activePreviewSegment]
  );

  useEffect(() => {
    if (!plannedTimeline.length) {
      setActivePreviewIndex(0);
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    let cursor = 0;

    const cycle = () => {
      if (cancelled) return;
      setActivePreviewIndex(cursor);
      const activeSegment = plannedTimeline[cursor] || plannedTimeline[0];
      cursor = (cursor + 1) % plannedTimeline.length;
      const nextDelay = Math.max(1200, Math.min(3600, Number(activeSegment?.duration || 3) * 480));
      timeoutId = window.setTimeout(cycle, nextDelay);
    };

    cycle();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [plannedTimeline]);

  // Capture video frames for each timeline segment
  useEffect(() => {
    if (!plannedTimeline.length || !sourcePreviewUrl) {
      setSegmentFrames({});
      return;
    }

    const video = captureVideoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    const frames = {};
    const ctx = canvas.getContext("2d");

    const captureSegments = async () => {
      // Ensure video is ready
      if (video.readyState < 2) {
        await new Promise((resolve, reject) => {
          const onReady = () => {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
            resolve();
          };
          const onError = () => {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
            reject(new Error("Video failed to load"));
          };
          video.addEventListener("loadeddata", onReady);
          video.addEventListener("error", onError);
          if (video.readyState >= 2) {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
            resolve();
          }
        }).catch(() => {});
      }

      if (cancelled) return;

      canvas.width = 320;
      canvas.height = 180;

      for (const segment of plannedTimeline) {
        if (cancelled) break;
        const seekTime = segment.start + Math.min(0.5, Number(segment.duration || 0) * 0.3);
        try {
          video.currentTime = seekTime;
          await new Promise(resolve => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              resolve();
            };
            video.addEventListener("seeked", onSeeked);
            // Timeout safety
            setTimeout(() => {
              video.removeEventListener("seeked", onSeeked);
              resolve();
            }, 3000);
          });
          if (!cancelled) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames[segment.id] = canvas.toDataURL("image/jpeg", 0.8);
          }
        } catch {
          frames[segment.id] = null;
        }
      }

      if (!cancelled) {
        setSegmentFrames(frames);
        setActiveSegmentFrameIndex(0);
      }
    };

    captureSegments().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [plannedTimeline, sourcePreviewUrl]);

  const handleDownload = async clip => {
    if (!clip?.url) return;
    try {
      const response = await fetch(clip.url);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const safeName = (clip.titleSuggestion || clip.hookText || clip.promoCaption || "smart-promo-clip")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "smart-promo-clip";
      link.download = `${safeName}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch {
      // Fallback: open in new tab if fetch fails (CORS, etc.)
      window.open(clip.url, "_blank", "noopener,noreferrer");
    }
  };

  const getSelectedVisualForClip = (clip, index = 0) =>
    selectedVisualByClipId[getClipIdentity(clip, index)] || getDefaultVisualAsset(clip);

  const handleSelectVisual = (clip, index, asset) => {
    setSelectedVisualByClipId(current => ({
      ...current,
      [getClipIdentity(clip, index)]: asset,
    }));
  };

  const handleDownloadVisuals = async clip => {
    const assets = Array.isArray(clip?.visualAssets) ? clip.visualAssets.filter(asset => asset?.url) : [];
    if (!assets.length) return;

    const safeBaseName =
      (clip.titleSuggestion || clip.hookText || "promo-visual")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "promo-visual";

    for (const [index, asset] of assets.entries()) {
      try {
        const response = await fetch(asset.url, { mode: "cors" });
        if (!response.ok) throw new Error(`Visual fetch failed with ${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${safeBaseName}-${asset.type || index + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
        await wait(250);
      } catch (error) {
        const link = document.createElement("a");
        link.href = asset.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.download = `${safeBaseName}-${asset.type || index + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        await wait(250);
      }
    }
  };

  return (
    <div className="promo-summary-overlay" role="dialog" aria-modal="true" aria-label="Smart Promo">
      <div className="promo-summary-shell">
        <div className="promo-summary-header">
          <div>
            <span className="promo-summary-eyebrow">Visual Editing Engine</span>
            <h3>Smart Promo</h3>
            <p>
              Turn one static recording into a dynamic visual edit with original audio preserved,
              then generate three preview cuts from that same continuous timeline.
            </p>
          </div>
          <button type="button" className="promo-summary-close" onClick={onClose} aria-label="Close promo summary">
            &times;
          </button>
        </div>

        <div className="promo-summary-meta">
          <div className="promo-summary-pill">Source: {sourceSummary}</div>
          <div className="promo-summary-pill">Estimate: {displayedPromoCost} credits</div>
          <div className="promo-summary-pill">Balance: {creditBalance ?? "..."}</div>
          <div className="promo-summary-pill">
            Output: 1 master edit + 3 previews
          </div>
          <div className="promo-summary-pill">Mode: {selectedOutputMode.pill}</div>
        </div>
        <div className="promo-summary-billing-note">
          Smart Promo is a credit-based generation. Your monthly editing credits are used
          first, and you can top up anytime if you want more promo runs before renewal.
        </div>
        <div className="promo-summary-billing-note promo-summary-time-note">
          Smart Promo rendering can take {waitEstimate} depending on source length, visual complexity, and upload speed.
          Keep this tab open while the job is running.
        </div>
        <div className="promo-summary-director-brief">
          <div>
            <span className="promo-summary-card-label">Creative Director Brief</span>
            <strong>{promoDirectorBrief.title}</strong>
            <p>{promoDirectorBrief.summary}</p>
          </div>
          <ul>
            {promoDirectorBrief.bullets.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {(isGenerating || jobId || plannedTimeline.length > 0) && (
          <div className="promo-summary-live-shell">
            <div className="promo-summary-live-sidebar">
              <span className="promo-summary-card-label">Processing Steps</span>
              <div className="promo-summary-live-steps">
                {visualProgressSteps.map(step => (
                  <div
                    key={step.id}
                    className={`promo-summary-live-step is-${step.state}`}
                  >
                    <div className="promo-summary-live-step-marker" />
                    <div>
                      <strong>{step.label}</strong>
                      <span>{step.summary}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="promo-summary-live-progress">
                <div className="promo-summary-live-progress-head">
                  <strong>Overall Progress</strong>
                  <span>{progressPercent}%</span>
                </div>
                <div className="promo-summary-live-progress-bar">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <small>{analysisDetails?.detail || statusText || "Preparing Smart Promo..."}</small>
              </div>
              <div className="promo-summary-live-audio">
                <strong>Audio Status</strong>
                <span>Original audio preserved</span>
                <small>Audio will remain untouched and continuous.</small>
              </div>
            </div>

            <div className="promo-summary-live-main">
              <div className="promo-summary-live-head">
                <div>
                  <span className="promo-summary-card-label">Planned Edit Timeline</span>
                  <strong>Smart Promo is acting like a visual director while the audio stays intact.</strong>
                </div>
                <small>{analysisDetails?.detail || "Waiting for the edit timeline..."}</small>
              </div>

              <div className="promo-summary-live-preview-grid">
                <article className="promo-summary-live-preview-card">
                  <span className="promo-summary-card-label">Original Video</span>
                  <strong>Uploaded Source</strong>
                  <div className="promo-summary-live-preview-stage is-original">
                    {sourcePreviewUrl ? (
                      <>
                        <video src={sourcePreviewUrl} muted autoPlay loop playsInline preload="metadata" />
                        {activePreviewSegment ? (
                          <>
                            <div className="promo-summary-live-focus-box" style={previewFocusBoxStyle} />
                            <div className="promo-summary-live-original-overlay">
                              <strong>{activePreviewMeta.shotLabel}</strong>
                              <span>{activePreviewMeta.focusLabel}</span>
                            </div>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <div className="promo-summary-live-preview-empty">Waiting for source preview...</div>
                    )}
                  </div>
                </article>

                <article className="promo-summary-live-preview-card">
                  <span className="promo-summary-card-label">Smart Promo Preview</span>
                  <strong>{activePreviewSegment?.editLabel || "Building virtual camera moves"}</strong>
                  <div className="promo-summary-live-preview-stage is-smart-promo">
                    {sourcePreviewUrl ? (
                      <div className="promo-summary-live-preview-viewport">
                        <video
                          src={sourcePreviewUrl}
                          muted
                          autoPlay
                          loop
                          playsInline
                          preload="metadata"
                          style={previewViewportStyle}
                        />
                      </div>
                    ) : (
                      <div className="promo-summary-live-preview-empty">Preview camera moves will appear here.</div>
                    )}
                    <div className="promo-summary-live-preview-overlay">
                      <div className="promo-summary-live-preview-overlay-copy">
                        <strong>{activePreviewMeta?.shotLabel || "Smart Promo Preview"}</strong>
                        <span>{activePreviewSegment?.reason || "Animated low-res preview while the final render completes."}</span>
                      </div>
                      {activePreviewMeta ? (
                        <div className="promo-summary-live-preview-overlay-metrics">
                          <span>{activePreviewMeta.zoomLabel}</span>
                          <span>{activePreviewMeta.movementLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              </div>

              <div className="promo-summary-live-waveform">
                <div className="promo-summary-live-waveform-head">
                  <span className="promo-summary-card-label">Waveform</span>
                  <small>Temporary low-res visual preview while the full render finishes.</small>
                </div>
                <div className="promo-summary-live-waveform-bars">
                  {waveformBars.map(bar => (
                    <span
                      key={bar.id}
                      className={bar.segmentId && bar.segmentId === activePreviewSegment?.id ? "is-active" : ""}
                      style={{ "--wave-height": String(bar.height) }}
                    />
                  ))}
                </div>
              </div>

              {plannedTimeline.length ? (
                <div className="promo-summary-live-timeline">
                  {plannedTimeline.map((segment, segIdx) => (
                    <article key={segment.id} className={`promo-summary-live-segment is-${segment.visualMode}${segIdx === activeSegmentFrameIndex ? " is-active" : ""}`}>
                      <div className="promo-summary-live-segment-frame">
                        {segmentFrames[segment.id] ? (
                          <img
                            src={segmentFrames[segment.id]}
                            alt={`Frame at ${formatTimelineTime(segment.start)}`}
                            loading="lazy"
                          />
                        ) : (
                          <div className="promo-summary-live-segment-frame-empty">
                            <span>{formatTimelineTime(segment.start)}</span>
                          </div>
                        )}
                      </div>
                      <div className="promo-summary-live-segment-meta">
                        <span className="promo-summary-live-segment-time">
                          {formatTimelineTime(segment.start)} &rarr; {formatTimelineTime(segment.end)}
                        </span>
                        <strong>{segment.editLabel}</strong>
                        <small>{segment.reason}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="promo-summary-live-placeholder">
                  Planned edits will appear here as soon as Smart Promo finishes analyzing motion, subjects, and audio energy.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="promo-summary-grid">
          <section className="promo-summary-card promo-summary-card-wide">
            <span className="promo-summary-card-label">Output Goal</span>
            <div className="promo-summary-mode-grid">
              {PROMO_OUTPUT_MODES.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  className={`promo-summary-style-card ${outputMode === mode.id ? "is-active" : ""}`}
                  onClick={() => setOutputMode(mode.id)}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.summary}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="promo-summary-card">
            <span className="promo-summary-card-label">Duration</span>
            <div className="promo-summary-choice-row">
              {activeDurations.map(value => (
                <button
                  key={value}
                  type="button"
                  className={`promo-summary-choice ${durationSeconds === value ? "is-active" : ""}`}
                  onClick={() => setDurationSeconds(value)}
                >
                  {value}s
                </button>
              ))}
            </div>
          </section>

          <section className="promo-summary-card">
            <span className="promo-summary-card-label">Style</span>
            <div className="promo-summary-style-grid">
              {PROMO_STYLES.map(style => (
                <button
                  key={style.id}
                  type="button"
                  className={`promo-summary-style-card ${styleId === style.id ? "is-active" : ""}`}
                  onClick={() => setStyleId(style.id)}
                >
                  <strong>{style.label}</strong>
                  <span>{style.summary}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="promo-summary-card">
            <span className="promo-summary-card-label">Status</span>
            <div className="promo-summary-status">
              <strong>{statusText || "Ready to generate."}</strong>
              <span>
                Credits are deducted before processing. Early platform failures are refunded; completed Smart Promo outputs stay available until they expire.
              </span>
            </div>
            {errorText && <div className="promo-summary-error">{errorText}</div>}
            {!canAfford && (
              <div className="promo-summary-error">
                You need {displayedPromoCost} credits for this feature.
              </div>
            )}
            <div className="promo-summary-action-row">
              <button
                type="button"
                className="promo-summary-primary"
                onClick={handleGenerate}
                disabled={isGenerating || isEstimating || !canAfford}
              >
                {isGenerating ? "Generating Edit..." : isEstimating ? "Estimating..." : "Generate Smart Promo"}
              </button>
              <button type="button" className="promo-summary-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </section>
        </div>

        {pendingEstimate && (
          <div className="promo-summary-confirm-backdrop" role="presentation">
            <div className="promo-summary-confirm" role="dialog" aria-modal="true" aria-label="Confirm Smart Promo credits">
              <span className="promo-summary-card-label">Confirm Smart Promo Package</span>
              <strong>{pendingEstimate.credits} credits required</strong>
              <p>
                Credits cover video analysis, visual edit planning, output rendering, thumbnail/poster rendering,
                and temporary processing/storage.
              </p>
              <div className="promo-summary-confirm-grid">
                <span>Video Duration</span>
                <strong>
                  {pendingEstimate.videoDurationSeconds
                    ? `${Math.floor(pendingEstimate.videoDurationSeconds / 60)}m ${Math.round(pendingEstimate.videoDurationSeconds % 60)}s`
                    : "Detected after upload"}
                </strong>
                <span>Clips to Generate</span>
                <strong>{pendingEstimate.clipCount}</strong>
                <span>Visual Assets</span>
                <strong>{pendingEstimate.visualCount}</strong>
                <span>Estimated Credits</span>
                <strong>{pendingEstimate.credits}</strong>
              </div>
              <div className="promo-summary-action-row">
                <button
                  type="button"
                  className="promo-summary-primary"
                  disabled={isGenerating}
                  onClick={() => startGeneration(pendingEstimate)}
                >
                  {isGenerating ? "Starting..." : "Continue"}
                </button>
                <button
                  type="button"
                  className="promo-summary-secondary"
                  disabled={isGenerating}
                  onClick={() => {
                    setPendingEstimate(null);
                    setStatusText("Ready to generate.");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="promo-summary-results">
          <div className="promo-summary-results-head">
            <strong>Smart Promo Results</strong>
            <span>
              {jobId
                ? `Job ${jobId}`
                : "You will get one continuous visual master edit first, then three previews cut from that same timeline."}
            </span>
          </div>
          {promoClips.length > 0 && (
            <div className="promo-summary-campaign-map">
              <span>Visual edit map</span>
              <strong>
                Master visual edit &rarr; opening preview &rarr; middle preview &rarr; closing preview
              </strong>
            </div>
          )}
          {analysisDetails?.confidenceSummary ? (
            <div className="promo-summary-campaign-map">
              <span>Edit confidence</span>
              <strong>
                {analysisDetails.confidenceSummary.confidenceLabel || "Confidence pending"}
                {analysisDetails.analysisReused ? " · Reused analysis" : " · Fresh analysis"}
              </strong>
              <small>
                {analysisDetails.confidenceSummary.summary ||
                  "Confidence is based on stable visual pacing, reframing coverage, and preserved audio continuity."}
              </small>
            </div>
          ) : null}
          {promoClips.length === 0 ? (
            <div className="promo-summary-empty">
              {restoringClips
                ? "Checking for available Smart Promo outputs..."
                : "We will generate one continuous visual edit first, then three previews from the same untouched audio timeline."}
            </div>
          ) : (
            <div className="promo-summary-results-grid">
              {promoClips.map((clip, index) => {
                const selectedVisual = getSelectedVisualForClip(clip, index);
                return (
                <article
                  key={clip.id || clip.url || index}
                  className={`promo-summary-result-card ${clip.storyMaster ? "is-story-master" : ""}`}
                >
                  {selectedVisual?.url ? (
                    <div className="promo-summary-selected-package">
                      <div className="promo-summary-selected-package-copy">
                        <span>Selected visual package</span>
                        <strong>{selectedVisual.hookText || clip.titleSuggestion || clip.hookText || "Ready to publish"}</strong>
                        <small>
                          This is the visual that will travel with the clip when you use it in the editor.
                        </small>
                      </div>
                      <div className="promo-summary-selected-package-frame">
                        <SafeImage src={selectedVisual.url} alt="Selected promo visual preview" />
                      </div>
                    </div>
                  ) : null}
                  <div className="promo-summary-video-shell">
                    <video src={clip.url} controls preload="metadata" />
                  </div>
                  <div className="promo-summary-result-copy">
                    {clip.campaignRoleLabel ? (
                      <div className="promo-summary-role-badge">{clip.campaignRoleLabel}</div>
                    ) : null}
                    <strong>{clip.promoCaption || clip.title || `Smart Promo Output ${index + 1}`}</strong>
                    <span>
                      {(clip.duration || durationSeconds) ? `${Math.round(Number(clip.duration || durationSeconds))}s` : ""}
                      {clip.confidenceLabel ? ` · ${clip.confidenceLabel}` : ""}
                    </span>
                    {clip.hookReason ? <small>{clip.hookReason}</small> : null}
                    {clip.bestFor ? <small>Best for: {clip.bestFor}</small> : null}
                    {clip.travelReason ? <small>{clip.travelReason}</small> : null}
                    {clip.selectionWhy ? <small>{clip.selectionWhy}</small> : null}
                    {clip.titleSuggestion || clip.hookText ? (
                      <small>Hook: {clip.titleSuggestion || clip.hookText}</small>
                    ) : null}
                    <small>{formatExpiry(clip.expiresAt)}</small>
                  </div>
                  {clip.visualAssets?.length ? (
                    <div className="promo-summary-assets">
                      <div className="promo-summary-assets-head">
                        <strong>Promo visuals</strong>
                        <span>{clip.visualAssets.length} ready-made assets</span>
                      </div>
                      <div className="promo-summary-asset-grid">
                        {clip.visualAssets.slice(0, 3).map(asset => (
                          <button
                            key={asset.id || asset.url}
                            type="button"
                            className={`promo-summary-asset-card ${
                              selectedVisual?.url === asset.url ? "is-selected" : ""
                            }`}
                            onClick={() => handleSelectVisual(clip, index, asset)}
                          >
                            <SafeImage src={asset.url} alt={asset.label || asset.type || "Promo visual"} />
                            <span>{selectedVisual?.url === asset.url ? "Selected" : asset.label || asset.type || "Visual"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="promo-summary-result-actions">
                    <button type="button" className="promo-summary-secondary" onClick={() => handleDownload(clip)}>
                      Download
                    </button>
                    {clip.visualAssets?.[0]?.url ? (
                      <button
                        type="button"
                        className="promo-summary-secondary"
                        onClick={() => handleDownloadVisuals(clip)}
                      >
                        Download Visuals
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="promo-summary-primary"
                      onClick={() =>
                        onUseClip &&
                        onUseClip({
                          ...clip,
                          selectedVisual,
                          selectedThumbnailUrl: selectedVisual?.url || null,
                        })
                      }
                    >
                      Use Clip + Visual
                    </button>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {/* Hidden elements for frame capture */}
      <video
        ref={captureVideoRef}
        src={sourcePreviewUrl}
        crossOrigin="anonymous"
        preload="auto"
        muted
        style={{ display: "none" }}
      />
      <canvas
        ref={captureCanvasRef}
        style={{ display: "none" }}
      />
    </div>
  );
}

export default SmartPromoSummaryPanel;

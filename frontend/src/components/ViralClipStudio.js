import {
  applySafeMediaSource,
  createSecureId,
  getSafeMediaSource,
  sanitizeUrl,
} from "../utils/security";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import React, { useState, useRef, useEffect } from "react";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import html2canvas from "html2canvas"; // For rendering styled captions
import { trackClipWorkflowEvent } from "../utils/clipWorkflowAnalytics";
import "./ViralClipStudio.css"; // We'll create this CSS next

const RAINBOW_COLORS = [
  "#FF9AA2", // Soft Red
  "#FFB7B2", // Salmon
  "#FFDAC1", // Peach
  "#E2F0CB", // Lime Green
  "#B5EAD7", // Mint
  "#C7CEEA", // Lavender
  "#F4C2C2", // Baby Pink
  "#89CFF0", // Baby Blue
];

const normalizePlainText = value =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim();

const normalizeHookText = value =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const DEFAULT_HOOK_TEXT = "THIS CHANGES FAST";

const HOOK_MIN_SEGMENT_DURATION = 2;
const HOOK_MAX_SEGMENT_DURATION = 5;

const GENERIC_HOOK_TEXTS = new Set([
  "WAIT FOR IT...",
  "WAIT FOR IT",
  "THIS CHANGES FAST",
  "WATCH THIS PART",
  "DON'T MISS THIS",
]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const clampAudioControl = (value, minimum, maximum, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
};

const clampNumber = (value, minimum, maximum, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
};

const normalizeAudioMode = value => {
  const normalized = String(value || "mix")
    .trim()
    .toLowerCase();
  if (["mix", "replace", "duck_original"].includes(normalized)) return normalized;
  return "mix";
};

const isPresetMusicSelection = value => /\.mp3$/i.test(String(value || "").trim());

const HOOK_TEMPLATES = {
  blur_reveal: {
    label: "Blur Reveal",
    description: "Blurred backdrop, strong contrast, and a clean reveal into the main shot.",
    duration: 3,
    blurBackground: true,
    darkOverlay: true,
    freezeFrame: false,
    zoomScale: 1.08,
    textAnimation: "slide-up",
  },
  zoom_focus: {
    label: "Zoom Focus",
    description: "Push the frame forward fast when the opening already has motion.",
    duration: 3,
    blurBackground: false,
    darkOverlay: true,
    freezeFrame: false,
    zoomScale: 1.1,
    textAnimation: "fade-in",
  },
  freeze_text: {
    label: "Freeze + Text",
    description: "Hold the opening frame, hit the viewer with the message, then release.",
    duration: 3.2,
    blurBackground: true,
    darkOverlay: true,
    freezeFrame: true,
    zoomScale: 1.04,
    textAnimation: "fade-in",
  },
};

const DEFAULT_HOOK_FOCUS_POINT = Object.freeze({ x: 50, y: 42 });

const normalizeHookFocusPoint = point => ({
  x: clampNumber(point?.x, 0, 100, DEFAULT_HOOK_FOCUS_POINT.x),
  y: clampNumber(point?.y, 0, 100, DEFAULT_HOOK_FOCUS_POINT.y),
});

const getHookTemplateConfig = templateKey =>
  HOOK_TEMPLATES[templateKey] || HOOK_TEMPLATES.blur_reveal;

const getHookSuggestion = clip => {
  const reason = normalizePlainText(clip?.reason || "");
  const clipStart = clampNumber(clip?.start, 0, 1.5, 0.8);
  const motionHint = /(movement|motion|energy|laugh|spike|action|impact|fast|reveal)/i.test(reason);
  const staticHint = /(intro|setup|calm|question|talking|story|explains|static)/i.test(reason);

  if (motionHint) {
    return {
      suggestedStart: Math.max(0.5, Math.min(1.1, clipStart || 0.5)),
      templateKey: "zoom_focus",
      message: "Early motion detected in the selected moment. Start quickly and push the frame in.",
    };
  }

  if (clipStart >= 0.5 && clipStart <= 1.5) {
    return {
      suggestedStart: clipStart,
      templateKey: "freeze_text",
      message:
        "There is an early beat change near the opening. Freeze briefly and land the message on it.",
    };
  }

  return {
    suggestedStart: staticHint ? 0.9 : 0.7,
    templateKey: "blur_reveal",
    message: "The opening looks calmer, so add blur and contrast before the reveal.",
  };
};

const getHookCopySuggestions = clip => {
  const reason = normalizePlainText(clip?.reason || "");
  const hasQuestion = /\?/.test(reason) || /(why|how|what|when)/i.test(reason);
  const hasAction =
    /(movement|motion|energy|laugh|spike|action|impact|fast|reveal|switch|flip)/i.test(reason);
  const hasStory = /(story|talking|explains|setup|intro|lesson|mistake|truth|secret)/i.test(reason);

  const suggestions = [];

  if (hasQuestion) {
    suggestions.push("THE ANSWER HITS HERE");
    suggestions.push("WAIT UNTIL THIS PART");
  }

  if (hasAction) {
    suggestions.push("THIS IS WHERE IT FLIPS");
    suggestions.push("DON'T BLINK HERE");
  }

  if (hasStory) {
    suggestions.push("THIS PART CHANGES THE STORY");
    suggestions.push("HERE'S THE PART THAT MATTERS");
  }

  suggestions.push("WATCH WHAT HAPPENS NEXT");
  suggestions.push("THIS CHANGES FAST");
  suggestions.push("THE NEXT 3 SECONDS MATTER");

  return [...new Set(suggestions)].slice(0, 4).map(text => normalizeHookText(text));
};

const getClipDescriptorText = clip =>
  normalizePlainText(
    [clip?.reason, clip?.label, clip?.transcript, clip?.text, clip?.title].filter(Boolean).join(" ")
  );

const getClipDurationSeconds = clip => {
  const explicitDuration = Number(clip?.duration);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) return explicitDuration;

  const start = Number(clip?.start || 0);
  const end = Number(clip?.end || 0);
  return Math.max(0, end - start);
};

const CATEGORY_TAG_RULES = [
  {
    label: "High Energy",
    icon: "🔥",
    pattern:
      /(motion|movement|fast|energy|action|impact|laugh|dance|switch|cut|dynamic|spike|reveal)/i,
  },
  {
    label: "Emotional",
    icon: "😳",
    pattern: /(emotional|cry|reaction|heart|shock|confession|surprise|love|angry|fear|dramatic)/i,
  },
  {
    label: "Educational",
    icon: "🎓",
    pattern: /(how|why|lesson|learn|tutorial|guide|tip|explains|education|mistake|truth|secret)/i,
  },
  {
    label: "Funny",
    icon: "😂",
    pattern: /(funny|laugh|joke|prank|comedy|hilarious|meme)/i,
  },
  {
    label: "Promotional",
    icon: "💰",
    pattern: /(promo|promotional|offer|sale|product|launch|brand|ad|subscribe|buy|deal)/i,
  },
];

const buildClipGuidance = clip => {
  const descriptorText = getClipDescriptorText(clip);
  const duration = getClipDurationSeconds(clip);
  const transcriptText = normalizePlainText(clip?.transcript || clip?.text || "");
  const transcriptWordCount = transcriptText
    ? transcriptText.split(/\s+/).filter(Boolean).length
    : 0;
  const backendScore = clampNumber(clip?.viralScore ?? clip?.viral_score ?? clip?.score, 0, 100, 0);

  const signals = {
    speech:
      transcriptWordCount >= 4 ||
      /(question|asks|says|voice|speaks|talks|explains|dialogue|quote|story|lesson|statement|answer)/i.test(
        descriptorText
      ),
    subject:
      /(face|speaker|person|host|reaction|close[- ]?up|portrait|eye contact|subject|center|centered|framed)/i.test(
        descriptorText
      ),
    motion:
      /(motion|movement|fast|scene|cut|switch|laugh|energy|action|impact|reveal|pace|pacing|dynamic|spike|transition|surprise)/i.test(
        descriptorText
      ),
    idealLength: duration >= 10 && duration <= 25,
    hook:
      /(\?|why|how|what|wait|watch|stop|secret|mistake|truth|never|before|after|until|confession|shocking|emotional|reveal)/i.test(
        descriptorText
      ) ||
      /!/.test(descriptorText) ||
      transcriptWordCount >= 8,
  };

  const reasons = [];
  if (signals.speech) reasons.push("Strong speech or a spoken setup lands in the opening seconds");
  if (signals.subject)
    reasons.push("Clear face or centered subject gives viewers something to lock onto");
  if (signals.motion) reasons.push("Fast pacing or a scene change adds momentum early");
  if (signals.idealLength) reasons.push("Length sits in the 10-25 second sweet spot for shorts");
  if (signals.hook) reasons.push("The first beats carry curiosity or hook potential");

  const normalizedReason = normalizePlainText(clip?.reason || "");
  if (normalizedReason && reasons.length < 5) {
    reasons.push(normalizedReason);
  }

  while (reasons.length < 3) {
    reasons.push(
      reasons.length === 0
        ? "The moment is already isolated enough to move into editing quickly"
        : "The segment has clean timing boundaries for short-form packaging"
    );
  }

  const improvements = [];
  if (!signals.speech || !signals.hook) {
    improvements.push("Cut the first 2 seconds so the first spoken beat lands faster");
  }
  if (!signals.hook) {
    improvements.push("Add a bold hook to sharpen the opening promise");
  }
  if (!signals.speech) {
    improvements.push("Add captions so the opening still lands on mute");
  }
  if (!signals.subject) {
    improvements.push("Use zoom or smart crop to center the main subject");
  }
  if (!signals.motion) {
    improvements.push("Trim into a faster beat or start after the setup");
  }
  if (!signals.idealLength) {
    improvements.push(
      duration < 10
        ? "Extend the clip toward the payoff if a stronger ending is nearby"
        : "Trim the clip closer to the 10-25 second sweet spot"
    );
  }

  const categories = CATEGORY_TAG_RULES.filter(rule => rule.pattern.test(descriptorText)).slice(
    0,
    3
  );
  if (categories.length === 0) {
    categories.push({
      label: signals.motion ? "High Energy" : "Educational",
      icon: signals.motion ? "🔥" : "🎓",
    });
  }

  const heuristicScore =
    (signals.speech ? 20 : 0) +
    (signals.subject ? 20 : 0) +
    (signals.motion ? 20 : 0) +
    (signals.idealLength ? 20 : 0) +
    (signals.hook ? 20 : 0);

  return {
    descriptorText,
    duration,
    backendScore,
    score: clampNumber(heuristicScore, 0, 100, 0),
    reasons: reasons.slice(0, 5),
    improvements: [...new Set(improvements)].slice(0, 3),
    categories,
    signals,
    hookText: getHookCopySuggestions(clip)[0] || DEFAULT_HOOK_TEXT,
  };
};

const isGenericHookText = value => GENERIC_HOOK_TEXTS.has(normalizeHookText(value).toUpperCase());

const formatPreviewTime = value => {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatPreviewTimePrecise = value => {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(totalSeconds >= 10 ? 1 : 2).padStart(4, "0");
  return `${minutes}:${seconds}`;
};

const waitForVideoEvent = (video, successEvent, failureEvent = "error") =>
  new Promise((resolve, reject) => {
    const handleSuccess = () => {
      video.removeEventListener(successEvent, handleSuccess);
      video.removeEventListener(failureEvent, handleFailure);
      resolve();
    };

    const handleFailure = () => {
      video.removeEventListener(successEvent, handleSuccess);
      video.removeEventListener(failureEvent, handleFailure);
      reject(new Error("Video analysis could not read the selected clip."));
    };

    video.addEventListener(successEvent, handleSuccess, { once: true });
    video.addEventListener(failureEvent, handleFailure, { once: true });
  });

const seekAnalysisVideo = async (video, targetTime) => {
  const boundedTime = Math.max(0, Number(targetTime) || 0);

  if (Math.abs((video.currentTime || 0) - boundedTime) < 0.025) {
    return;
  }

  await new Promise((resolve, reject) => {
    const handleSeeked = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      resolve();
    };

    const handleError = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      reject(new Error("Video analysis could not seek to the requested moment."));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = boundedTime;
  });
};

const captureHookAnalysisFrame = (context, video, width, height, previousFrame) => {
  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height).data;
  const grayscale = new Uint8Array(width * height);

  const centerStartX = Math.floor(width * 0.25);
  const centerEndX = Math.ceil(width * 0.75);
  const centerStartY = Math.floor(height * 0.18);
  const centerEndY = Math.ceil(height * 0.82);

  let luminanceTotal = 0;
  let luminanceSquareTotal = 0;
  let frameDeltaTotal = 0;
  let centerDeltaTotal = 0;
  let centerPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const dataIndex = pixelIndex * 4;
      const luminance =
        (imageData[dataIndex] * 77 +
          imageData[dataIndex + 1] * 150 +
          imageData[dataIndex + 2] * 29) >>
        8;

      grayscale[pixelIndex] = luminance;
      luminanceTotal += luminance;
      luminanceSquareTotal += luminance * luminance;

      if (previousFrame) {
        const delta = Math.abs(luminance - previousFrame[pixelIndex]);
        frameDeltaTotal += delta;

        if (x >= centerStartX && x <= centerEndX && y >= centerStartY && y <= centerEndY) {
          centerDeltaTotal += delta;
          centerPixels += 1;
        }
      }
    }
  }

  const pixelCount = width * height;
  const averageLuminance = luminanceTotal / pixelCount;
  const variance = Math.max(
    0,
    luminanceSquareTotal / pixelCount - averageLuminance * averageLuminance
  );
  const contrast = Math.min(1, Math.sqrt(variance) / 72);
  const motion = previousFrame ? frameDeltaTotal / (pixelCount * 255) : 0;
  const centerMotion =
    previousFrame && centerPixels > 0 ? centerDeltaTotal / (centerPixels * 255) : motion;

  return {
    grayscale,
    brightness: averageLuminance / 255,
    contrast,
    motion,
    centerMotion,
  };
};

const buildFallbackHookRange = (clip, clipDuration = 0) => {
  const baseSuggestion = getHookSuggestion(clip);
  const template = getHookTemplateConfig(baseSuggestion.templateKey);
  const minimumDuration = Math.min(
    HOOK_MIN_SEGMENT_DURATION,
    Math.max(0.25, Number(clipDuration) || HOOK_MIN_SEGMENT_DURATION)
  );
  const maximumDuration = Math.min(
    HOOK_MAX_SEGMENT_DURATION,
    Math.max(minimumDuration, Number(clipDuration) || HOOK_MAX_SEGMENT_DURATION)
  );
  const boundedStart = clampNumber(
    baseSuggestion.suggestedStart,
    0,
    Math.max(0, Number(clipDuration || 0) - minimumDuration),
    0.7
  );
  const duration = clampNumber(template.duration, minimumDuration, maximumDuration, 3);
  const endTime =
    Number(clipDuration) > 0
      ? Math.min(Number(clipDuration), boundedStart + duration)
      : boundedStart + duration;

  return {
    ...baseSuggestion,
    startTime: boundedStart,
    endTime: Math.max(boundedStart + minimumDuration, endTime),
    duration: Math.max(minimumDuration, endTime - boundedStart),
    confidenceLabel: "Quick read",
    analysisSource: "metadata",
    score: 0,
  };
};

const getWatermarkPreviewRegions = mode => {
  switch (
    String(mode || "adaptive")
      .trim()
      .toLowerCase()
  ) {
    case "top_right":
      return [{ top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 }];
    case "bottom_left":
      return [
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
      ];
    case "all":
      return [
        { top: "4%", left: "4%", width: "24%", height: "8%", rotation: 1, opacity: 0.84 },
        { top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 },
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
        { bottom: "6%", right: "4%", width: "28%", height: "8%", rotation: -1.5, opacity: 0.86 },
      ];
    case "corners":
      return [
        { top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 },
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
      ];
    case "adaptive":
    default:
      return [
        { top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 },
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
      ];
  }
};

const getCaptionPreviewSourceText = clip =>
  normalizePlainText(clip?.text || clip?.transcript || clip?.reason || "");

const buildCaptionPreviewChunks = text => {
  const words = normalizePlainText(text).split(/\s+/).filter(Boolean).slice(0, 24);

  if (!words.length) return [];

  const wordsPerChunk = words.length >= 16 ? 4 : words.length >= 9 ? 3 : 2;
  const chunks = [];

  for (let index = 0; index < words.length; index += wordsPerChunk) {
    const chunkWords = words.slice(index, index + wordsPerChunk);
    chunks.push({
      id: `caption-chunk-${index}`,
      text: chunkWords.join(" "),
      words: chunkWords,
    });
  }

  return chunks;
};

const getCaptionPreviewState = ({ text, localTime, duration }) => {
  const chunks = buildCaptionPreviewChunks(text);
  if (!chunks.length)
    return { chunks: [], currentChunk: null, nextChunk: null, activeWordIndex: 0 };

  const safeDuration = Math.max(Number(duration) || 0, chunks.length * 0.85, 1.8);
  const clampedTime = clampNumber(localTime, 0, safeDuration, 0);
  const chunkProgress = clampNumber(clampedTime / safeDuration, 0, 0.999, 0);
  const currentChunkIndex = Math.min(chunks.length - 1, Math.floor(chunkProgress * chunks.length));
  const currentChunk = chunks[currentChunkIndex];
  const nextChunk = chunks[currentChunkIndex + 1] || null;
  const chunkStart = (safeDuration / chunks.length) * currentChunkIndex;
  const chunkDuration = safeDuration / chunks.length;
  const intraChunkProgress = clampNumber(
    (clampedTime - chunkStart) / Math.max(chunkDuration, 0.01),
    0,
    0.999,
    0
  );
  const activeWordIndex = Math.min(
    currentChunk.words.length - 1,
    Math.floor(intraChunkProgress * currentChunk.words.length)
  );

  return { chunks, currentChunk, nextChunk, activeWordIndex };
};

const clampManualWatermarkRegion = region => {
  const width = clampNumber(region?.width, 8, 58, 24);
  const height = clampNumber(region?.height, 4, 24, 8);
  const left = clampNumber(region?.left, 0, 100 - width, 4);
  const top = clampNumber(region?.top, 0, 100 - height, 4);

  return {
    id: region?.id || `watermark-${Date.now()}`,
    left,
    top,
    width,
    height,
    rotation: clampNumber(region?.rotation, -12, 12, 0),
    opacity: clampNumber(region?.opacity, 0.45, 1, 0.88),
    track: region?.track !== false,
    seedTime: clampNumber(region?.seedTime, 0, 36000, 0),
  };
};

const createManualWatermarkRegion = () =>
  clampManualWatermarkRegion({
    id: createSecureId("watermark"),
    left: 4,
    top: 4,
    width: 26,
    height: 8,
    rotation: 0,
    opacity: 0.88,
    track: true,
    seedTime: 0,
  });

const toWatermarkPreviewStyle = region => ({
  left: `${Number(region.left || 0)}%`,
  top: `${Number(region.top || 0)}%`,
  width: `${Number(region.width || 0)}%`,
  height: `${Number(region.height || 0)}%`,
  "--cleanup-rotation": `${Number(region.rotation || 0)}deg`,
  "--cleanup-opacity": Number(region.opacity || 0.88),
});

const serializeManualWatermarkRegions = regions =>
  (Array.isArray(regions) ? regions : []).map(region => ({
    left: clampNumber(region?.left, 0, 100, 0),
    top: clampNumber(region?.top, 0, 100, 0),
    width: clampNumber(region?.width, 0, 100, 0),
    height: clampNumber(region?.height, 0, 100, 0),
    track: region?.track !== false,
    seed_time: clampNumber(region?.seedTime, 0, 36000, 0),
  }));

const getAudioExtractionStageLabel = (stage, progress) => {
  const normalizedStage = String(stage || "")
    .trim()
    .toLowerCase();
  switch (normalizedStage) {
    case "queued_for_dispatch":
      return "Preparing extraction job...";
    case "queued_for_worker":
      return "Waiting for extraction worker...";
    case "downloading_source":
      return `Downloading donor video... ${Math.round(progress)}%`;
    case "extracting_audio":
      return `Extracting audio... ${Math.round(progress)}%`;
    case "uploading_audio":
      return `Uploading extracted audio... ${Math.round(progress)}%`;
    case "completed":
      return "Background audio added to the timeline.";
    default:
      return `Extracting audio... ${Math.round(progress)}%`;
  }
};

const RainbowText = ({ text, offset = 0 }) => {
  const safeText = normalizePlainText(text);
  if (!safeText) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontWeight: "900",
        textShadow: "3px 3px 0 #000", // Thicker outline
        WebkitTextStroke: "1.5px black", // Crisp outline
        fontFamily: '"Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif',
        fontSize: "24px", // Bigger by default
      }}
    >
      {safeText.split("").map((char, index) => (
        <span
          key={index}
          style={{ color: RAINBOW_COLORS[(index + offset) % RAINBOW_COLORS.length] }}
        >
          {char}
        </span>
      ))}
    </span>
  );
};

const sidebarSectionTitleStyle = {
  margin: "0 0 10px 0",
  color: "#fff8ec",
  fontWeight: 800,
};

const sidebarCheckboxLabelStyle = {
  display: "block",
  cursor: "pointer",
  color: "#f8fafc",
  fontWeight: 700,
};

const sidebarBodyTextStyle = {
  fontSize: "13px",
  color: "rgba(247, 248, 251, 0.74)",
  fontWeight: 600,
  lineHeight: 1.45,
};

const ViralClipStudio = ({
  videoUrl,
  clips,
  images = [],
  onSave,
  onCancel,
  onStatusChange,
  currentMusic,
  onMusicChange,
}) => {
  const [orderedClips, setOrderedClips] = useState(clips || []);
  const [selectedClip, setSelectedClip] = useState((clips || [])[0]);
  const [overlays, setOverlays] = useState([]);
  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoFit, setVideoFit] = useState("contain"); // 'contain', 'cover' (fill), 'fill' (stretch)

  // New AI Options for users
  const [autoCaptions, setAutoCaptions] = useState(false);
  const [smartCrop, setSmartCrop] = useState(false);
  const [enhanceQuality, setEnhanceQuality] = useState(false);
  const [silenceRemoval, setSilenceRemoval] = useState(false);
  const [silenceThreshold, setSilenceThreshold] = useState(-35);
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.75);
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const [watermarkMode, setWatermarkMode] = useState("adaptive");
  const [manualWatermarkRegions, setManualWatermarkRegions] = useState([]);
  const [activeWatermarkRegionId, setActiveWatermarkRegionId] = useState(null);
  const [watermarkCleanupPreview, setWatermarkCleanupPreview] = useState(null);
  const [isWatermarkCleanupPreviewLoading, setIsWatermarkCleanupPreviewLoading] = useState(false);
  const [watermarkCleanupPreviewError, setWatermarkCleanupPreviewError] = useState("");
  const [showWatermarkCleanupOnVideo, setShowWatermarkCleanupOnVideo] = useState(true);
  const [addHook, setAddHook] = useState(false);
  const [hookText, setHookText] = useState(DEFAULT_HOOK_TEXT);
  const [hookTemplate, setHookTemplate] = useState("blur_reveal");
  const [hookIntroSeconds, setHookIntroSeconds] = useState(3);
  const [hookStartTime, setHookStartTime] = useState(0.8);
  const [hookEndTime, setHookEndTime] = useState(3.8);
  const [hookBlurBackground, setHookBlurBackground] = useState(true);
  const [hookDarkOverlay, setHookDarkOverlay] = useState(true);
  const [hookFreezeFrame, setHookFreezeFrame] = useState(false);
  const [hookZoomScale, setHookZoomScale] = useState(1.08);
  const [hookTextAnimation, setHookTextAnimation] = useState("slide-up");
  const [hookPreviewLoop, setHookPreviewLoop] = useState(false);
  const [hookSelectionMode, setHookSelectionMode] = useState(false);
  const [hookPickMode, setHookPickMode] = useState(false);
  const [hookFocusMode, setHookFocusMode] = useState(false);
  const [hookFocusPoint, setHookFocusPoint] = useState(DEFAULT_HOOK_FOCUS_POINT);
  const [hookAnalysisStatus, setHookAnalysisStatus] = useState("idle");
  const [hookAnalysisMessage, setHookAnalysisMessage] = useState("");
  const [hookSuggestedRange, setHookSuggestedRange] = useState(null);
  const [trimPreviewLoop, setTrimPreviewLoop] = useState(false);
  const [isPreviewPaused, setIsPreviewPaused] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(1);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [addMusic, setAddMusic] = useState(false);
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(false);
  const [musicSelection, setMusicSelection] = useState(currentMusic || "upbeat_pop.mp3");
  const [musicSearchMode, setMusicSearchMode] = useState(() =>
    currentMusic ? !isPresetMusicSelection(currentMusic) : false
  );
  const [safeSearch, setSafeSearch] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.15);
  const [musicDucking, setMusicDucking] = useState(true);
  const [musicDuckingStrength, setMusicDuckingStrength] = useState(0.35);
  const [silencePreview, setSilencePreview] = useState(null);
  const [musicPreviewUrl, setMusicPreviewUrl] = useState("");
  const [musicPreviewStatus, setMusicPreviewStatus] = useState("idle");
  const [musicPreviewStatusMessage, setMusicPreviewStatusMessage] = useState("");
  const [musicPreviewNeedsGesture, setMusicPreviewNeedsGesture] = useState(false);
  const [extractedAudio, setExtractedAudio] = useState(null);
  const [audioExtractionStatus, setAudioExtractionStatus] = useState("");
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusLabel, setExportStatusLabel] = useState("Render Final Clip");
  const loggedScannerEntryRef = useRef(new Set());

  const [timeline, setTimeline] = useState(() => {
    // Initial timeline is just the main video URL, effectively one clip
    return [{ id: "main", url: videoUrl, duration: 0, startRequest: null, endRequest: null }];
  });
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);
  const [draggedOverlayId, setDraggedOverlayId] = useState(null);
  const [draggedTimelineClipId, setDraggedTimelineClipId] = useState(null);
  const [draggedDetectedClipId, setDraggedDetectedClipId] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const smartCropForegroundVideoRef = useRef(null);
  const hookBackdropVideoRef = useRef(null);
  const hookFreezeVideoRef = useRef(null);
  const musicPreviewRef = useRef(null);
  const musicPreviewObjectUrlRef = useRef(null);
  const musicPreviewAudioContextRef = useRef(null);
  const musicPreviewGainNodeRef = useRef(null);
  const musicPreviewBufferRef = useRef(null);
  const musicPreviewSourceRef = useRef(null);
  const musicPreviewSourceStateRef = useRef({ offset: 0, playbackRate: 1 });
  const fileInputRef = useRef(null); // Hidden file input
  const imageInputRef = useRef(null);
  const audioSourceInputRef = useRef(null);
  const previewSourceCacheRef = useRef(new Map());
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastSnapshotRef = useRef(null);
  const isRestoringHistoryRef = useRef(false);
  const previewPlaybackIntentRef = useRef(true);
  const phoneFrameRef = useRef(null);
  const watermarkDragRef = useRef(null);
  const hookSegmentTrackRef = useRef(null);
  const hookSelectionDragRef = useRef(null);
  const hookPlayheadDragRef = useRef(null);
  const hookPreviewSequenceRef = useRef({ active: false });
  const hookAnalysisRequestRef = useRef(0);
  const pendingClipActionRef = useRef(null);

  const normalizeAssetUrl = asset => {
    if (!asset) return "";
    if (typeof asset === "string") return asset;
    return asset.url || asset.src || asset.downloadURL || asset.mediaUrl || asset.thumbnail || "";
  };

  const cloneSnapshot = snapshot => JSON.parse(JSON.stringify(snapshot));

  const releaseMusicPreviewObjectUrl = () => {
    if (musicPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(musicPreviewObjectUrlRef.current);
      musicPreviewObjectUrlRef.current = null;
    }
  };

  const materializeMusicPreviewUrl = async sourceUrl => {
    const normalizedUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
    if (!normalizedUrl) return "";

    releaseMusicPreviewObjectUrl();

    if (!normalizedUrl.startsWith("data:")) {
      return normalizedUrl;
    }

    const response = await fetch(normalizedUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    musicPreviewObjectUrlRef.current = objectUrl;
    return objectUrl;
  };

  const stopMusicPreviewBufferPlayback = () => {
    if (!musicPreviewSourceRef.current) return;

    try {
      musicPreviewSourceRef.current.stop();
    } catch (error) {
      console.log("Music preview buffer stop skipped", error);
    }

    try {
      musicPreviewSourceRef.current.disconnect();
    } catch (error) {
      console.log("Music preview buffer disconnect skipped", error);
    }

    musicPreviewSourceRef.current = null;
  };

  const ensureMusicPreviewAudioContext = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("This browser does not support Web Audio preview");
    }

    if (!musicPreviewAudioContextRef.current) {
      const audioContext = new AudioContextCtor();
      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      musicPreviewAudioContextRef.current = audioContext;
      musicPreviewGainNodeRef.current = gainNode;
    }

    return musicPreviewAudioContextRef.current;
  };

  const syncMusicPreviewGain = () => {
    const gainNode = musicPreviewGainNodeRef.current;
    if (!gainNode) return;

    const previewGain = previewMuted ? 0 : clampAudioControl(previewVolume, 0, 1, 1);
    gainNode.gain.value = clampAudioControl(musicVolume, 0.05, 0.6, 0.15) * previewGain;
  };

  const startMusicPreviewBufferPlayback = async (targetOffset, playbackRate = 1) => {
    const audioBuffer = musicPreviewBufferRef.current;
    if (!audioBuffer) return;

    const audioContext = ensureMusicPreviewAudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    stopMusicPreviewBufferPlayback();
    syncMusicPreviewGain();

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.playbackRate.value = Number.isFinite(Number(playbackRate)) ? Number(playbackRate) : 1;
    source.connect(musicPreviewGainNodeRef.current);
    source.start(0, targetOffset % Math.max(audioBuffer.duration, 0.001));

    musicPreviewSourceRef.current = source;
    musicPreviewSourceStateRef.current = {
      offset: targetOffset,
      playbackRate: source.playbackRate.value,
    };
    setMusicPreviewNeedsGesture(false);
    setMusicPreviewStatus("ready");
    setMusicPreviewStatusMessage(`Preview audio is playing for ${currentMusicLabel}.`);
  };

  const ensurePreviewableClipUrl = async clip => {
    if (!clip) return "";

    const cacheKey = clip.id || clip.url || "main";
    if (previewSourceCacheRef.current.has(cacheKey)) {
      return previewSourceCacheRef.current.get(cacheKey);
    }

    if (typeof clip.url === "string" && /^https?:/i.test(clip.url)) {
      previewSourceCacheRef.current.set(cacheKey, clip.url);
      return clip.url;
    }

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Please log in.");
    const token = await user.getIdToken();

    let sourceBlob = null;
    let fileName = `${cacheKey}.mp4`;

    if (clip.file instanceof Blob) {
      sourceBlob = clip.file;
      fileName = clip.file.name || fileName;
    } else if (typeof clip.url === "string" && clip.url.startsWith("blob:")) {
      const response = await fetch(clip.url);
      sourceBlob = await response.blob();
    }

    if (!(sourceBlob instanceof Blob)) {
      return typeof clip.url === "string" ? clip.url : "";
    }

    const uploadResult = await uploadSourceFileViaBackend({
      file: sourceBlob,
      token,
      mediaType: "video",
      fileName,
    });

    previewSourceCacheRef.current.set(cacheKey, uploadResult.url);
    return uploadResult.url;
  };

  const getEditorSnapshot = () => ({
    orderedClips,
    selectedClipId: selectedClip?.id || null,
    overlays,
    activeOverlayId,
    videoFit,
    autoCaptions,
    smartCrop,
    enhanceQuality,
    silenceRemoval,
    silenceThreshold,
    minSilenceDuration,
    removeWatermark,
    watermarkMode,
    manualWatermarkRegions,
    activeWatermarkRegionId,
    addHook,
    hookText,
    hookTemplate,
    hookIntroSeconds,
    hookStartTime,
    hookEndTime,
    hookBlurBackground,
    hookDarkOverlay,
    hookFreezeFrame,
    hookZoomScale,
    hookTextAnimation,
    hookPreviewLoop,
    hookFocusPoint,
    addMusic,
    muteOriginalAudio,
    musicSelection,
    musicSearchMode,
    safeSearch,
    musicVolume,
    musicDucking,
    musicDuckingStrength,
    extractedAudio,
    timeline,
    activeTimelineIndex,
  });

  const syncHistoryAvailability = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const applyEditorSnapshot = snapshot => {
    const normalizedClips = snapshot.orderedClips || [];
    setOrderedClips(normalizedClips);
    setSelectedClip(
      normalizedClips.find(clip => clip.id === snapshot.selectedClipId) ||
        normalizedClips[0] ||
        null
    );
    setOverlays(snapshot.overlays || []);
    setActiveOverlayId(snapshot.activeOverlayId || null);
    setVideoFit(snapshot.videoFit || "contain");
    setAutoCaptions(!!snapshot.autoCaptions);
    setSmartCrop(!!snapshot.smartCrop);
    setEnhanceQuality(!!snapshot.enhanceQuality);
    setSilenceRemoval(!!snapshot.silenceRemoval);
    setSilenceThreshold(Number(snapshot.silenceThreshold ?? -35));
    setMinSilenceDuration(Number(snapshot.minSilenceDuration ?? 0.75));
    setRemoveWatermark(!!snapshot.removeWatermark);
    setWatermarkMode(snapshot.watermarkMode || "adaptive");
    setManualWatermarkRegions(
      Array.isArray(snapshot.manualWatermarkRegions)
        ? snapshot.manualWatermarkRegions.map(clampManualWatermarkRegion)
        : []
    );
    setActiveWatermarkRegionId(snapshot.activeWatermarkRegionId || null);
    setAddHook(!!snapshot.addHook);
    setHookText(snapshot.hookText ?? DEFAULT_HOOK_TEXT);
    setHookTemplate(snapshot.hookTemplate || "blur_reveal");
    setHookIntroSeconds(Number(snapshot.hookIntroSeconds ?? 3));
    setHookStartTime(Number(snapshot.hookStartTime ?? 0.8));
    setHookEndTime(
      Number(
        snapshot.hookEndTime ??
          Number(snapshot.hookStartTime ?? 0.8) + Number(snapshot.hookIntroSeconds ?? 3)
      )
    );
    setHookBlurBackground(
      snapshot.hookBlurBackground !== undefined ? !!snapshot.hookBlurBackground : true
    );
    setHookDarkOverlay(snapshot.hookDarkOverlay !== undefined ? !!snapshot.hookDarkOverlay : true);
    setHookFreezeFrame(!!snapshot.hookFreezeFrame);
    setHookZoomScale(Number(snapshot.hookZoomScale ?? 1.08));
    setHookTextAnimation(snapshot.hookTextAnimation || "slide-up");
    setHookFocusPoint(normalizeHookFocusPoint(snapshot.hookFocusPoint));
    setHookPreviewLoop(!!snapshot.hookPreviewLoop);
    setAddMusic(!!snapshot.addMusic);
    setMuteOriginalAudio(!!snapshot.muteOriginalAudio);
    setMusicSelection(snapshot.musicSelection || currentMusic || "upbeat_pop.mp3");
    setMusicSearchMode(!!snapshot.musicSearchMode);
    setSafeSearch(snapshot.safeSearch !== undefined ? !!snapshot.safeSearch : true);
    setMusicVolume(Number(snapshot.musicVolume ?? 0.15));
    setMusicDucking(snapshot.musicDucking !== undefined ? !!snapshot.musicDucking : true);
    setMusicDuckingStrength(Number(snapshot.musicDuckingStrength ?? 0.35));
    setExtractedAudio(snapshot.extractedAudio || null);
    setTimeline(snapshot.timeline || []);
    setActiveTimelineIndex(Math.max(0, Number(snapshot.activeTimelineIndex || 0)));
  };

  useEffect(() => {
    if (!currentMusic) return;
    setMusicSelection(currentMusic);
    setMusicSearchMode(!isPresetMusicSelection(currentMusic));
  }, [currentMusic]);

  useEffect(
    () => () => {
      stopMusicPreviewBufferPlayback();
      if (musicPreviewAudioContextRef.current) {
        musicPreviewAudioContextRef.current.close().catch(() => {});
      }
      releaseMusicPreviewObjectUrl();
    },
    []
  );

  const applyHookTemplate = templateKey => {
    const template = getHookTemplateConfig(templateKey);
    setHookTemplate(templateKey);
    setHookBlurBackground(template.blurBackground);
    setHookDarkOverlay(template.darkOverlay);
    setHookFreezeFrame(template.freezeFrame);
    setHookTextAnimation(template.textAnimation);
  };

  const setHookDuration = durationSeconds => {
    const nextDuration = clampNumber(
      durationSeconds,
      hookMinDuration,
      hookMaxDuration,
      hookIntroSeconds || 3
    );
    setHookSegmentRange(resolvedHookStart, resolvedHookStart + nextDuration);
  };

  const seekHookTimelineTime = targetTime => {
    const video = videoRef.current;
    const boundedTime = clampNumber(
      targetTime,
      0,
      Math.max(0, Number(currentTimelineWindow.duration || 0)),
      0
    );

    if (!video) return;

    video.currentTime = Number(currentTimelineWindow.start || 0) + boundedTime;
    setVideoTime(video.currentTime);
  };

  const setCurrentTimeAsHook = () => {
    const currentVideoTime = Number(videoRef.current?.currentTime || 0);
    const localHookTime = Math.max(0, currentVideoTime - Number(currentTimelineWindow.start || 0));
    const nextStart = clampNumber(localHookTime, 0, hookStartLimit, resolvedHookStart);
    setAddHook(true);
    applyHookTemplate("freeze_text");
    setHookFreezeFrame(true);
    setHookAnalysisStatus("ready");
    setHookAnalysisMessage("Selected moment saved as the frozen opening hook.");
    setHookSegmentRange(nextStart, nextStart + hookDuration, { preview: false });
    setHookFocusMode(false);
    setHookPickMode(false);
  };

  const handlePreviewFrameClick = event => {
    setActiveOverlayId(null);
    setActiveWatermarkRegionId(null);

    if (!hookFocusMode || isDragging) return;

    const frame = phoneFrameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const nextFocusPoint = normalizeHookFocusPoint({
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100,
    });

    setAddHook(true);
    setHookFocusPoint(nextFocusPoint);
    setHookFocusMode(false);
    setHookZoomScale(current => Math.max(1.12, Number(current || 0)));
    setHookAnalysisStatus("ready");
    setHookAnalysisMessage("Focus target locked for the frozen opening frame.");
    event.preventDefault();
    event.stopPropagation();
  };

  const setHookSegmentRange = (startTime, endTime, options = {}) => {
    const clipDuration = Math.max(0, Number(currentTimelineWindow.duration || 0));
    const minimumDuration = Math.min(
      HOOK_MIN_SEGMENT_DURATION,
      Math.max(0.25, clipDuration || HOOK_MIN_SEGMENT_DURATION)
    );
    const maximumDuration = Math.min(
      HOOK_MAX_SEGMENT_DURATION,
      Math.max(minimumDuration, clipDuration || HOOK_MAX_SEGMENT_DURATION)
    );
    const boundedStart = clampNumber(startTime, 0, Math.max(0, clipDuration - minimumDuration), 0);
    const fallbackDuration = clampNumber(
      endTime - startTime,
      minimumDuration,
      maximumDuration,
      hookIntroSeconds || 3
    );
    const boundedEnd =
      clipDuration > 0
        ? clampNumber(
            endTime,
            Math.min(clipDuration, boundedStart + minimumDuration),
            Math.min(clipDuration, boundedStart + maximumDuration),
            Math.min(clipDuration, boundedStart + fallbackDuration)
          )
        : boundedStart + fallbackDuration;

    setHookStartTime(Number(boundedStart.toFixed(2)));
    setHookEndTime(Number(boundedEnd.toFixed(2)));
    setHookIntroSeconds(Number(Math.max(0.25, boundedEnd - boundedStart).toFixed(2)));

    if (options.textSuggestion && isGenericHookText(hookText)) {
      setHookText(normalizeHookText(options.textSuggestion));
    }

    if (options.preview) {
      const video = videoRef.current;
      if (video) {
        video.currentTime = Number(currentTimelineWindow.start || 0) + boundedStart;
        setVideoTime(video.currentTime);
      }
    }
  };

  const beginHookSegmentDrag = (event, target) => {
    const track = hookSegmentTrackRef.current;
    if (!track || !currentTimelineWindow.duration) return;

    event.preventDefault();
    event.stopPropagation();

    hookSelectionDragRef.current = {
      target,
      startClientX: event.clientX,
      anchorStart: resolvedHookStart,
      anchorEnd: hookEnd,
      rect: track.getBoundingClientRect(),
    };
  };

  const beginHookPlayheadDrag = event => {
    const track = hookSegmentTrackRef.current;
    if (!track || !currentTimelineWindow.duration) return;

    event.preventDefault();
    event.stopPropagation();

    hookPlayheadDragRef.current = {
      startClientX: event.clientX,
      anchorTime: trimAwareCurrentTime,
      rect: track.getBoundingClientRect(),
    };
  };

  const handleHookTrackPointerDown = event => {
    if (hookPickMode) {
      const track = hookSegmentTrackRef.current;
      if (!track || !currentTimelineWindow.duration) return;

      const rect = track.getBoundingClientRect();
      const ratio = clampNumber((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1, 0);
      const clickedTime = ratio * Number(currentTimelineWindow.duration || 0);
      seekHookTimelineTime(clickedTime);
      return;
    }

    if (!hookSelectionMode) return;

    const track = hookSegmentTrackRef.current;
    if (!track || !currentTimelineWindow.duration) return;

    const rect = track.getBoundingClientRect();
    const ratio = clampNumber((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1, 0);
    const clickedTime = ratio * Number(currentTimelineWindow.duration || 0);
    const distanceToStart = Math.abs(clickedTime - resolvedHookStart);
    const distanceToEnd = Math.abs(clickedTime - hookEnd);

    if (clickedTime >= resolvedHookStart && clickedTime <= hookEnd) {
      beginHookSegmentDrag(event, "range");
      return;
    }

    setHookSegmentRange(
      distanceToStart <= distanceToEnd ? clickedTime : resolvedHookStart,
      distanceToStart <= distanceToEnd ? hookEnd : clickedTime,
      { preview: true }
    );
  };

  const runSmartHookSuggestion = async () => {
    const clip = currentTimelineClip;
    if (!clip) {
      setHookAnalysisStatus("failed");
      setHookAnalysisMessage("Select a clip before running hook analysis.");
      return;
    }

    const clipWindow = getTimelineClipWindow(clip);
    const requestId = Date.now();
    hookAnalysisRequestRef.current = requestId;
    setHookAnalysisStatus("analyzing");
    setHookAnalysisMessage(
      "Scanning motion, scene changes, and visual contrast in the selected clip..."
    );

    let analysisUrl = clip.url;
    let temporaryObjectUrl = "";

    try {
      if (clip.file instanceof Blob) {
        temporaryObjectUrl = URL.createObjectURL(clip.file);
        analysisUrl = temporaryObjectUrl;
      }

      if (!analysisUrl) {
        throw new Error("This clip does not have a previewable source yet.");
      }

      const analysisVideo = document.createElement("video");
      analysisVideo.muted = true;
      analysisVideo.playsInline = true;
      analysisVideo.preload = "auto";
      analysisVideo.crossOrigin = "anonymous";
      if (!applySafeMediaSource(analysisVideo, analysisUrl)) {
        throw new Error("This clip source uses an unsupported preview URL.");
      }

      if (Number.isNaN(analysisVideo.duration) || !analysisVideo.duration) {
        await waitForVideoEvent(analysisVideo, "loadedmetadata");
      }

      const sourceDuration = Number(analysisVideo.duration || clipWindow.end || 0);
      const analysisStart = Math.max(0, Number(clipWindow.start || 0));
      const fullWindowDuration = Math.max(0.25, Number(clipWindow.duration || sourceDuration || 0));
      const analysisDuration = Math.min(fullWindowDuration, 18);
      const analysisEnd = Math.min(
        sourceDuration || analysisStart + analysisDuration,
        analysisStart + analysisDuration
      );
      const sampleCount = Math.max(12, Math.min(34, Math.round(analysisDuration * 3.2)));
      const step = Math.max(0.18, analysisDuration / Math.max(1, sampleCount - 1));
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 54;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("The browser could not open a frame analysis context.");
      }

      const samples = [];
      let previousFrame = null;

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const targetTime = Math.min(analysisEnd, analysisStart + sampleIndex * step);
        await seekAnalysisVideo(analysisVideo, targetTime);

        const frameMetrics = captureHookAnalysisFrame(
          context,
          analysisVideo,
          canvas.width,
          canvas.height,
          previousFrame
        );

        samples.push({ time: targetTime, ...frameMetrics });
        previousFrame = frameMetrics.grayscale;
      }

      const motionValues = samples.map(sample => sample.motion || 0);
      const averageMotion =
        motionValues.reduce((sum, value) => sum + value, 0) / Math.max(1, motionValues.length);
      const motionVariance =
        motionValues.reduce((sum, value) => sum + Math.pow(value - averageMotion, 2), 0) /
        Math.max(1, motionValues.length);
      const motionDeviation = Math.sqrt(motionVariance);
      const sceneCutThreshold = averageMotion + Math.max(0.045, motionDeviation * 1.15);

      const scoredSamples = samples.map((sample, index) => {
        const nextMotion = samples[index + 1]?.motion || sample.motion || 0;
        const sceneCut = index > 0 && sample.motion > sceneCutThreshold;
        const rise = Math.max(0, nextMotion - (samples[index - 1]?.motion || 0));

        return {
          ...sample,
          sceneCut,
          rise,
          score:
            (sample.motion || 0) * 1.35 +
            (sample.centerMotion || 0) * 0.85 +
            (sample.contrast || 0) * 0.48 +
            rise * 0.8 +
            (sceneCut ? 1.8 : 0),
        };
      });

      const candidateDurations = [2, 2.4, 3, 3.6, 4.2, 5]
        .filter(duration => duration <= Math.min(HOOK_MAX_SEGMENT_DURATION, fullWindowDuration))
        .map(duration => Number(duration.toFixed(2)));

      let bestWindow = null;
      scoredSamples.forEach(sample => {
        candidateDurations.forEach(duration => {
          const windowEnd = sample.time + duration;
          if (windowEnd > analysisEnd + 0.02) return;

          const windowSamples = scoredSamples.filter(
            candidate => candidate.time >= sample.time && candidate.time <= windowEnd + 0.001
          );
          if (!windowSamples.length) return;

          const score = windowSamples.reduce((sum, candidate) => sum + candidate.score, 0);
          const motionAverage =
            windowSamples.reduce((sum, candidate) => sum + candidate.motion, 0) /
            windowSamples.length;
          const sceneCuts = windowSamples.filter(candidate => candidate.sceneCut).length;
          const focusEnergy =
            windowSamples.reduce((sum, candidate) => sum + candidate.centerMotion, 0) /
            windowSamples.length;
          const earlyBias =
            Math.max(0, 1 - (sample.time - analysisStart) / Math.max(1, analysisDuration)) * 0.35;
          const totalScore =
            score + sceneCuts * 1.2 + motionAverage * 1.4 + focusEnergy * 0.6 + earlyBias;

          if (!bestWindow || totalScore > bestWindow.score) {
            bestWindow = {
              startTime: sample.time,
              endTime: windowEnd,
              duration,
              score: totalScore,
              motionAverage,
              focusEnergy,
              sceneCuts,
            };
          }
        });
      });

      if (!bestWindow) {
        throw new Error("The clip was too short to suggest a hook segment.");
      }

      const relativeStart = Math.max(0, bestWindow.startTime - analysisStart);
      const relativeEnd = Math.min(fullWindowDuration, bestWindow.endTime - analysisStart);
      const templateKey =
        bestWindow.motionAverage > averageMotion + motionDeviation * 0.55
          ? "zoom_focus"
          : bestWindow.sceneCuts > 0
            ? "freeze_text"
            : "blur_reveal";
      const confidenceLabel =
        bestWindow.score >= 7.5
          ? "High confidence"
          : bestWindow.score >= 4.75
            ? "Good confidence"
            : "Useful lead";
      const analysisReason =
        bestWindow.sceneCuts > 0
          ? "Detected a clean beat change with a visible motion spike in this window."
          : bestWindow.motionAverage > averageMotion + 0.02
            ? "Detected the strongest sustained movement and visual contrast in this window."
            : "Detected the most visually stable attention peak near the opening of the clip.";
      const suggestedCopy =
        bestWindow.sceneCuts > 0
          ? currentHookCopySuggestions.find(copy => /flip|changes|matters/i.test(copy)) ||
            currentHookCopySuggestions[0]
          : bestWindow.motionAverage > averageMotion + 0.02
            ? currentHookCopySuggestions.find(copy => /blink|watch|fast/i.test(copy)) ||
              currentHookCopySuggestions[0]
            : currentHookCopySuggestions[0];

      if (hookAnalysisRequestRef.current !== requestId) return;

      setHookSuggestedRange({
        startTime: Number(relativeStart.toFixed(2)),
        endTime: Number(relativeEnd.toFixed(2)),
        duration: Number((relativeEnd - relativeStart).toFixed(2)),
        templateKey,
        textSuggestion: normalizeHookText(suggestedCopy || DEFAULT_HOOK_TEXT),
        confidenceLabel,
        analysisSource: "video_scan",
        score: bestWindow.score,
        message: analysisReason,
      });
      setHookAnalysisStatus("ready");
      setHookAnalysisMessage(`${confidenceLabel}. ${analysisReason}`);
    } catch (error) {
      console.error("Hook suggestion analysis failed", error);
      if (hookAnalysisRequestRef.current !== requestId) return;

      const fallbackRange = buildFallbackHookRange(selectedClip, clipWindow.duration);
      setHookSuggestedRange(fallbackRange);
      setHookAnalysisStatus("failed");
      setHookAnalysisMessage(
        `${error?.message || "Hook analysis failed."} Falling back to the existing metadata-based suggestion.`
      );
    } finally {
      if (temporaryObjectUrl) {
        URL.revokeObjectURL(temporaryObjectUrl);
      }
    }
  };

  const previewHookSegment = (shouldLoop, rangeOverride = null) => {
    const video = videoRef.current;
    if (!video) return;

    const previewStart = Number(rangeOverride?.startTime ?? resolvedHookStart);
    const previewEnd = Number(rangeOverride?.endTime ?? hookEnd);
    const absoluteHookStart = Number(currentTimelineWindow.start || 0) + previewStart;
    const absoluteHookEnd = Number(currentTimelineWindow.start || 0) + previewEnd;

    setTrimPreviewLoop(false);
    setHookPreviewLoop(!!shouldLoop);
    hookPreviewSequenceRef.current =
      shouldLoop || absoluteHookEnd <= absoluteHookStart + 0.05
        ? { active: false }
        : {
            active: true,
            mode: "manual-preview",
            timelineIndex: activeTimelineIndex,
            absoluteStart: absoluteHookStart,
            absoluteEnd: absoluteHookEnd,
          };
    video.currentTime = absoluteHookStart;
    previewPlaybackIntentRef.current = true;
    safePlayMediaElement(video);
  };

  const previewTrimWindow = shouldLoop => {
    const video = videoRef.current;
    if (!video || !currentTimelineClip) return;

    hookPreviewSequenceRef.current = { active: false };
    setHookPreviewLoop(false);
    setTrimPreviewLoop(!!shouldLoop);
    video.currentTime = Number(currentTimelineWindow.start || 0);
    previewPlaybackIntentRef.current = true;
    safePlayMediaElement(video);
  };

  const togglePreviewPlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      previewPlaybackIntentRef.current = true;
      safePlayMediaElement(video);
    } else {
      previewPlaybackIntentRef.current = false;
      video.pause();
    }
  };

  const togglePreviewMute = () => {
    setPreviewMuted(current => !current);
  };

  const handlePreviewVolumeChange = event => {
    const nextVolume = clampAudioControl(event.target.value, 0, 1, 1);
    setPreviewVolume(nextVolume);
    if (nextVolume > 0 && previewMuted) {
      setPreviewMuted(false);
    }
  };

  const togglePreviewFitMode = () => {
    if (smartCrop) return;
    setVideoFit(current => (current === "contain" ? "cover" : "contain"));
  };

  const enableMusicPreview = async () => {
    const video = videoRef.current;
    const music = musicPreviewRef.current;
    if (!effectiveMusicPreviewUrl) return;

    try {
      if (musicSearchMode && musicPreviewBufferRef.current) {
        const previewTimelineTime = video
          ? clampAudioControl(getPreviewTimelineTime(video.currentTime || 0), 0, 36000, 0)
          : 0;
        const bufferDuration = Number(musicPreviewBufferRef.current.duration || 0);
        const targetTime =
          Number.isFinite(bufferDuration) && bufferDuration > 0.25
            ? previewTimelineTime % bufferDuration
            : previewTimelineTime;

        await startMusicPreviewBufferPlayback(targetTime, video?.playbackRate || 1);
        return;
      }

      if (!music) return;
      music.muted = false;
      music.defaultMuted = false;
      music.loop = true;

      const previewTimelineTime = video
        ? clampAudioControl(getPreviewTimelineTime(video.currentTime || 0), 0, 36000, 0)
        : 0;
      const musicDuration = Number(music.duration || 0);
      const targetTime =
        Number.isFinite(musicDuration) && musicDuration > 0.25
          ? previewTimelineTime % musicDuration
          : previewTimelineTime;

      if (Number.isFinite(targetTime)) {
        try {
          music.currentTime = targetTime;
        } catch (error) {
          console.log("Music preview direct seek skipped", error);
        }
      }

      const playResult = music.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }

      setMusicPreviewNeedsGesture(false);
      setMusicPreviewStatus("ready");
      setMusicPreviewStatusMessage(`Preview audio is playing for ${currentMusicLabel}.`);
    } catch (error) {
      console.log("Music preview manual enable failed", error);
      setMusicPreviewNeedsGesture(true);
      setMusicPreviewStatus("failed");
      setMusicPreviewStatusMessage(
        error?.message || "Preview audio is ready but the browser still blocked playback."
      );
    }
  };

  const togglePreviewFullscreen = async () => {
    const frame = phoneFrameRef.current;
    if (!frame) return;

    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen();
      } else {
        await frame.requestFullscreen();
      }
    } catch (error) {
      console.log("Preview fullscreen toggle failed", error);
    }
  };

  const handleTrimAwareScrub = event => {
    const video = videoRef.current;
    if (!video || !currentTimelineClip) return;

    const relativeTime = clampNumber(
      event.target.value,
      0,
      Math.max(0, Number(currentTimelineWindow.duration || 0)),
      0
    );
    video.currentTime = Number(currentTimelineWindow.start || 0) + relativeTime;
    setVideoTime(video.currentTime);
  };

  const applyCurrentHookSuggestion = shouldLoopPreview => {
    setHookSegmentRange(currentHookSuggestion.startTime, currentHookSuggestion.endTime, {
      textSuggestion: currentHookSuggestion.textSuggestion,
    });
    previewHookSegment(shouldLoopPreview, {
      startTime: currentHookSuggestion.startTime,
      endTime: currentHookSuggestion.endTime,
    });
  };

  const updateManualWatermarkRegion = (id, updates) => {
    setManualWatermarkRegions(prev =>
      prev.map(region =>
        region.id === id ? clampManualWatermarkRegion({ ...region, ...updates }) : region
      )
    );
  };

  const addManualWatermarkRegion = preset => {
    const nextRegion = clampManualWatermarkRegion({
      ...createManualWatermarkRegion(),
      seedTime: clampNumber(videoTime, 0, 36000, 0),
      ...(preset || {}),
    });
    setManualWatermarkRegions(prev => [...prev, nextRegion]);
    setActiveWatermarkRegionId(nextRegion.id);
  };

  const deleteManualWatermarkRegion = id => {
    setManualWatermarkRegions(prev => prev.filter(region => region.id !== id));
    setActiveWatermarkRegionId(currentId => (currentId === id ? null : currentId));
  };

  const handleUndo = () => {
    if (!undoStackRef.current.length) return;

    const currentSnapshot = cloneSnapshot(getEditorSnapshot());
    const previousSnapshot = undoStackRef.current.pop();
    redoStackRef.current.push(currentSnapshot);
    isRestoringHistoryRef.current = true;
    applyEditorSnapshot(cloneSnapshot(previousSnapshot));
    syncHistoryAvailability();
  };

  const handleRedo = () => {
    if (!redoStackRef.current.length) return;

    const currentSnapshot = cloneSnapshot(getEditorSnapshot());
    const nextSnapshot = redoStackRef.current.pop();
    undoStackRef.current.push(currentSnapshot);
    isRestoringHistoryRef.current = true;
    applyEditorSnapshot(cloneSnapshot(nextSnapshot));
    syncHistoryAvailability();
  };

  const addOverlayAsset = ({
    type,
    src,
    file = null,
    isLocal = false,
    width = 40,
    height = 30,
  }) => {
    if (!src) return;
    const newOverlay = {
      id: createSecureId("overlay"),
      type,
      src,
      file,
      isLocal,
      x: 50,
      y: 50,
      width,
      height,
      aspectRatioLocked: type === "video" || type === "image",
      aspectRatio: height ? width / height : 1,
      clipId: timeline[activeTimelineIndex]?.id || "main",
    };
    setOverlays(prev => [...prev, newOverlay]);
    setActiveOverlayId(newOverlay.id);
  };

  const clampOverlayDimension = value => Math.max(10, Math.min(100, Number(value) || 10));
  const clampOverlayCoordinate = value => Math.max(0, Math.min(100, Number(value) || 0));

  const getOverlayAspectRatio = overlay => {
    const storedRatio = Number(overlay.aspectRatio);
    if (Number.isFinite(storedRatio) && storedRatio > 0) return storedRatio;

    const width = clampOverlayDimension(overlay.width ?? 40);
    const height = clampOverlayDimension(overlay.height ?? 30);
    return width / height;
  };

  const updateOverlaySize = (id, dimension, delta) => {
    setOverlays(prev =>
      prev.map(overlay => {
        if (overlay.id !== id) return overlay;
        const currentWidth = clampOverlayDimension(overlay.width ?? 40);
        const currentHeight = clampOverlayDimension(overlay.height ?? 30);
        const nextValue = clampOverlayDimension(
          Number(overlay[dimension] ?? (dimension === "width" ? currentWidth : currentHeight)) +
            delta
        );

        if (overlay.aspectRatioLocked && (overlay.type === "video" || overlay.type === "image")) {
          const ratio = getOverlayAspectRatio(overlay);
          if (dimension === "width") {
            return {
              ...overlay,
              width: nextValue,
              height: clampOverlayDimension(nextValue / ratio),
            };
          }

          return {
            ...overlay,
            height: nextValue,
            width: clampOverlayDimension(nextValue * ratio),
          };
        }

        const nextWidth = dimension === "width" ? nextValue : currentWidth;
        const nextHeight = dimension === "height" ? nextValue : currentHeight;
        return {
          ...overlay,
          [dimension]: nextValue,
          aspectRatio: nextWidth / Math.max(nextHeight, 1),
        };
      })
    );
  };

  const toggleOverlayAspectRatioLock = id => {
    setOverlays(prev =>
      prev.map(overlay => {
        if (overlay.id !== id) return overlay;
        return {
          ...overlay,
          aspectRatioLocked: !overlay.aspectRatioLocked,
          aspectRatio: getOverlayAspectRatio(overlay),
        };
      })
    );
  };

  const moveOverlay = (id, direction) => {
    setOverlays(prev => {
      const currentIndex = prev.findIndex(overlay => overlay.id === id);
      if (currentIndex === -1) return prev;

      const reordered = [...prev];
      const [overlay] = reordered.splice(currentIndex, 1);
      let nextIndex = currentIndex;

      if (direction === "forward") nextIndex = Math.min(reordered.length, currentIndex + 1);
      if (direction === "backward") nextIndex = Math.max(0, currentIndex - 1);
      if (direction === "front") nextIndex = reordered.length;
      if (direction === "back") nextIndex = 0;

      reordered.splice(nextIndex, 0, overlay);
      return reordered;
    });
  };

  const moveOverlayToIndex = (id, nextIndex) => {
    setOverlays(prev => {
      const currentIndex = prev.findIndex(overlay => overlay.id === id);
      if (currentIndex === -1) return prev;

      const boundedIndex = Math.max(0, Math.min(prev.length - 1, nextIndex));
      if (currentIndex === boundedIndex) return prev;

      const reordered = [...prev];
      const [overlay] = reordered.splice(currentIndex, 1);
      reordered.splice(boundedIndex, 0, overlay);
      return reordered;
    });
  };

  const moveTimelineClip = (clipId, direction) => {
    setTimeline(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      let nextIndex = currentIndex;

      if (direction === "forward") nextIndex = Math.min(reordered.length, currentIndex + 1);
      if (direction === "backward") nextIndex = Math.max(0, currentIndex - 1);
      if (direction === "front") nextIndex = reordered.length;
      if (direction === "back") nextIndex = 0;

      reordered.splice(nextIndex, 0, clip);

      setActiveTimelineIndex(prevActiveIndex => {
        const activeClipId = prev[prevActiveIndex]?.id;
        const resolvedIndex = reordered.findIndex(item => item.id === activeClipId);
        return resolvedIndex >= 0 ? resolvedIndex : 0;
      });

      return reordered;
    });
  };

  const moveTimelineClipToIndex = (clipId, nextIndex) => {
    setTimeline(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const boundedIndex = Math.max(0, Math.min(prev.length - 1, nextIndex));
      if (boundedIndex === currentIndex) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      reordered.splice(boundedIndex, 0, clip);

      setActiveTimelineIndex(prevActiveIndex => {
        const activeClipId = prev[prevActiveIndex]?.id;
        const resolvedIndex = reordered.findIndex(item => item.id === activeClipId);
        return resolvedIndex >= 0 ? resolvedIndex : 0;
      });

      return reordered;
    });
  };

  const reorderDetectedClips = updater => {
    setOrderedClips(prev => {
      const nextClips = updater(prev);
      setSelectedClip(prevSelected => {
        const selectedId = prevSelected?.id;
        if (!selectedId) return nextClips[0] || null;
        return nextClips.find(clip => clip.id === selectedId) || nextClips[0] || null;
      });
      return nextClips;
    });
  };

  const moveDetectedClip = (clipId, direction) => {
    reorderDetectedClips(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      let nextIndex = currentIndex;

      if (direction === "forward") nextIndex = Math.min(reordered.length, currentIndex + 1);
      if (direction === "backward") nextIndex = Math.max(0, currentIndex - 1);
      if (direction === "front") nextIndex = reordered.length;
      if (direction === "back") nextIndex = 0;

      reordered.splice(nextIndex, 0, clip);
      return reordered;
    });
  };

  const moveDetectedClipToIndex = (clipId, nextIndex) => {
    reorderDetectedClips(prev => {
      const currentIndex = prev.findIndex(clip => clip.id === clipId);
      if (currentIndex === -1) return prev;

      const boundedIndex = Math.max(0, Math.min(prev.length - 1, nextIndex));
      if (currentIndex === boundedIndex) return prev;

      const reordered = [...prev];
      const [clip] = reordered.splice(currentIndex, 1);
      reordered.splice(boundedIndex, 0, clip);
      return reordered;
    });
  };

  const safePlayMediaElement = mediaElement => {
    if (!mediaElement || typeof mediaElement.play !== "function") return;

    try {
      const playResult = mediaElement.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(error => console.log("Auto-play prevented", error));
      }
    } catch (error) {
      console.log("Auto-play prevented", error);
    }
  };

  const jumpToSourceTime = targetTime => {
    const video = videoRef.current;
    if (!video) return;

    const boundedTime = Math.max(0, Number(targetTime) || 0);
    video.currentTime = boundedTime;
    setVideoTime(boundedTime);
  };

  const focusClipInEditor = (clip, options = {}) => {
    if (!clip) return;

    setSelectedClip(clip);
    setActiveTimelineIndex(0);
    setTrimPreviewLoop(false);
    setHookPreviewLoop(false);

    const boundaryTime =
      options.boundary === "end" ? Number(clip.end || clip.start || 0) : Number(clip.start || 0);

    const video = videoRef.current;
    if (video) {
      if (!applySafeMediaSource(video, videoUrl)) return;
      video.currentTime = boundaryTime;
      setVideoTime(boundaryTime);
      if (options.play) {
        previewPlaybackIntentRef.current = true;
        safePlayMediaElement(video);
      }
    }
  };

  const applyGuidedHookToClip = (clip, options = {}) => {
    if (!clip) return;

    const clipWindowDuration = Math.max(0, getClipDurationSeconds(clip));
    const suggestion = buildFallbackHookRange(clip, clipWindowDuration);
    const guidance = clipGuidanceById.get(clip.id);

    setAddHook(true);
    applyHookTemplate(suggestion.templateKey);
    setHookSuggestedRange(suggestion);
    setHookAnalysisStatus("ready");
    setHookAnalysisMessage("Previewing this clip with a suggested hook treatment.");
    setHookSegmentRange(suggestion.startTime, suggestion.endTime, {
      textSuggestion: guidance?.hookText || suggestion.textSuggestion,
      preview: false,
    });

    if (options.preview !== false) {
      previewHookSegment(false, {
        startTime: suggestion.startTime,
        endTime: suggestion.endTime,
      });
    }
  };

  const applyClipImprovements = clip => {
    if (!clip) return;

    const guidance = clipGuidanceById.get(clip.id);
    const clipStart = Number(clip.start || 0);
    const clipEnd = Number(clip.end || clipStart);
    const clipDuration = Math.max(0, clipEnd - clipStart);
    const shouldCutOpening =
      (!guidance?.signals.speech || !guidance?.signals.hook) && clipDuration > 3.2;
    const improvedStart = shouldCutOpening ? Math.min(clipEnd - 0.5, clipStart + 2) : clipStart;
    const improvedEnd =
      guidance?.signals.idealLength || clipDuration <= 25
        ? clipEnd
        : Math.min(clipEnd, improvedStart + 22);

    setTimeline(prev =>
      prev.map((item, index) =>
        index === 0 && item.id === "main"
          ? {
              ...item,
              startRequest: improvedStart,
              endRequest: Math.max(improvedStart + 0.5, improvedEnd),
            }
          : item
      )
    );

    setAutoCaptions(true);
    if (!guidance?.signals.subject) {
      setSmartCrop(true);
    }
    applyGuidedHookToClip(clip, { preview: true });
    onStatusChange?.("Applied guided improvements to strengthen the selected clip.");
  };

  const handleClipAction = (clip, action) => {
    if (!clip || !action) return;

    if (action.type === "use") {
      focusClipInEditor(clip, { boundary: "start", play: false });
      return;
    }

    if (action.type === "jump") {
      focusClipInEditor(clip, { boundary: action.boundary, play: false });
      return;
    }

    if (selectedClip?.id !== clip.id) {
      pendingClipActionRef.current = { clipId: clip.id, ...action };
      focusClipInEditor(clip, { boundary: "start", play: false });
      return;
    }

    if (action.type === "apply-hook") {
      applyGuidedHookToClip(clip, { preview: true });
      return;
    }

    if (action.type === "improve") {
      applyClipImprovements(clip);
      return;
    }

    if (action.type === "export") {
      pendingClipActionRef.current = null;
      void handleExportRender(action.destination);
    }
  };

  const updateOverlayPosition = (id, axis, delta) => {
    setOverlays(prev =>
      prev.map(overlay =>
        overlay.id === id
          ? { ...overlay, [axis]: clampOverlayCoordinate(Number(overlay[axis] ?? 50) + delta) }
          : overlay
      )
    );
  };

  const centerOverlay = id => {
    setOverlays(prev =>
      prev.map(overlay => (overlay.id === id ? { ...overlay, x: 50, y: 50 } : overlay))
    );
  };

  const duplicateOverlay = id => {
    setOverlays(prev => {
      const overlay = prev.find(item => item.id === id);
      if (!overlay) return prev;

      const duplicate = {
        ...overlay,
        id: createSecureId("overlay"),
        x: clampOverlayCoordinate(Number(overlay.x ?? 50) + 4),
        y: clampOverlayCoordinate(Number(overlay.y ?? 50) + 4),
      };

      setActiveOverlayId(duplicate.id);
      return [...prev, duplicate];
    });
  };

  const activeOverlay = overlays.find(overlay => overlay.id === activeOverlayId) || null;

  const getTimelineClipWindow = clip => {
    if (!clip) return { start: 0, end: 0, duration: 0 };
    const isPrimaryClip = clip.id === "main" && selectedClip;
    const start =
      clip.startRequest !== null && clip.startRequest !== undefined
        ? clip.startRequest
        : isPrimaryClip
          ? selectedClip.start
          : 0;
    const end =
      clip.endRequest !== null && clip.endRequest !== undefined
        ? clip.endRequest
        : isPrimaryClip
          ? selectedClip.end
          : clip.duration || 0;
    return {
      start,
      end,
      duration: Math.max(0, end - start),
    };
  };

  const getPreviewTimelineTime = sourceTime => {
    let elapsed = 0;
    for (let index = 0; index < activeTimelineIndex; index += 1) {
      elapsed += Math.max(0, Number(getTimelineClipWindow(timeline[index]).duration || 0));
    }

    const currentClip = timeline[activeTimelineIndex];
    const currentWindow = getTimelineClipWindow(currentClip);
    const localStart = Number(currentWindow.start || 0);
    const localDuration = Math.max(0, Number(currentWindow.duration || 0));
    const localTime = Math.max(0, Number(sourceTime || 0) - localStart);

    return elapsed + Math.min(localTime, localDuration || localTime);
  };

  const normalizeBackgroundAudioForExport = audioTrack => {
    if (!audioTrack?.url || audioTrack.enabled === false) return null;

    return {
      url: audioTrack.url,
      trim_start: clampAudioControl(audioTrack.trimStart, 0, audioTrack.duration || 36000, 0),
      volume: clampAudioControl(audioTrack.volume, 0, 1.5, 0.7),
      mode: normalizeAudioMode(audioTrack.mode),
      ducking_strength: clampAudioControl(audioTrack.duckingStrength, 0.15, 0.95, 0.45),
      enabled: true,
    };
  };

  const currentTimelineClip = timeline[activeTimelineIndex] || null;
  const currentTimelineWindow = getTimelineClipWindow(currentTimelineClip);
  const currentAudioMode = normalizeAudioMode(extractedAudio?.mode);
  const previewTimelineTime = Math.max(
    0,
    Number(videoTime || 0) - Number(currentTimelineWindow.start || 0)
  );
  const normalizedHookText = normalizeHookText(hookText);
  const hasHookText = !!normalizedHookText;
  const fallbackHookSuggestion = buildFallbackHookRange(
    selectedClip,
    currentTimelineWindow.duration
  );
  const currentHookSuggestion = hookSuggestedRange || fallbackHookSuggestion;
  const currentHookCopySuggestions = getHookCopySuggestions(selectedClip);
  const clipGuidanceEntries = orderedClips.map((clip, index) => {
    const guidance = buildClipGuidance(clip);
    return {
      clip,
      index,
      ...guidance,
    };
  });
  const rankedClipGuidance = [...clipGuidanceEntries].sort(
    (left, right) =>
      right.score - left.score || right.backendScore - left.backendScore || left.index - right.index
  );
  const bestClipId = rankedClipGuidance[0]?.clip?.id || null;
  const topPickIds = new Set(rankedClipGuidance.slice(0, 2).map(entry => entry.clip.id));
  const clipGuidanceById = new Map(clipGuidanceEntries.map(entry => [entry.clip.id, entry]));
  const selectedClipGuidance = selectedClip ? clipGuidanceById.get(selectedClip.id) || null : null;
  const hookTemplateConfig = getHookTemplateConfig(hookTemplate);
  const hookMinDuration = Math.min(
    HOOK_MIN_SEGMENT_DURATION,
    Math.max(0.25, Number(currentTimelineWindow.duration || 0) || HOOK_MIN_SEGMENT_DURATION)
  );
  const hookMaxDuration = Math.min(
    HOOK_MAX_SEGMENT_DURATION,
    Math.max(
      hookMinDuration,
      Number(currentTimelineWindow.duration || 0) || HOOK_MAX_SEGMENT_DURATION
    )
  );
  const hookStartLimit = Math.max(
    0,
    Math.max(0, Number(currentTimelineWindow.duration || 0)) - hookMinDuration
  );
  const resolvedHookStart = clampNumber(
    hookStartTime,
    0,
    hookStartLimit,
    currentHookSuggestion.startTime
  );
  const hookEndMinimum = Number(currentTimelineWindow.duration || 0)
    ? Math.min(Number(currentTimelineWindow.duration || 0), resolvedHookStart + hookMinDuration)
    : resolvedHookStart + hookMinDuration;
  const hookEndMaximum = Number(currentTimelineWindow.duration || 0)
    ? Math.min(Number(currentTimelineWindow.duration || 0), resolvedHookStart + hookMaxDuration)
    : resolvedHookStart + hookMaxDuration;
  const hookEnd = clampNumber(
    hookEndTime,
    hookEndMinimum,
    Math.max(hookEndMinimum, hookEndMaximum),
    Math.min(
      hookEndMaximum,
      resolvedHookStart +
        clampNumber(
          hookIntroSeconds,
          hookMinDuration,
          hookMaxDuration,
          currentHookSuggestion.duration || 3
        )
    )
  );
  const hookDuration = Math.max(0.1, hookEnd - resolvedHookStart);
  const hookLeadOut = 0.45;
  const isHookWithinPreviewWindow =
    addHook &&
    previewTimelineTime >= resolvedHookStart &&
    previewTimelineTime <= hookEnd + hookLeadOut;
  const hookProgress = isHookWithinPreviewWindow
    ? clampNumber((previewTimelineTime - resolvedHookStart) / Math.max(hookDuration, 0.01), 0, 1, 0)
    : 0;
  const hookOutroOpacity =
    previewTimelineTime > hookEnd
      ? clampNumber(1 - (previewTimelineTime - hookEnd) / hookLeadOut, 0, 1, 0)
      : previewTimelineTime >= resolvedHookStart
        ? 1
        : 0;
  const hookTextIntroProgress = isHookWithinPreviewWindow
    ? clampNumber((previewTimelineTime - resolvedHookStart) / 0.35, 0, 1, 0)
    : 0;
  const isZoomFocusTemplate = hookTemplate === "zoom_focus";
  const isBlurRevealTemplate = hookTemplate === "blur_reveal";
  const isFreezeTextTemplate = hookTemplate === "freeze_text";
  const freezeReleaseProgress = hookFreezeFrame
    ? clampNumber((hookProgress - 0.78) / 0.22, 0, 1, 0)
    : 1;
  const resolvedHookFocusPoint = normalizeHookFocusPoint(hookFocusPoint);
  const hasCustomHookFocusPoint =
    Math.abs(resolvedHookFocusPoint.x - DEFAULT_HOOK_FOCUS_POINT.x) > 1 ||
    Math.abs(resolvedHookFocusPoint.y - DEFAULT_HOOK_FOCUS_POINT.y) > 1;
  const hookZoomTarget = Math.max(
    hookZoomScale,
    isZoomFocusTemplate ? hookZoomScale + 0.06 : hookZoomScale
  );
  const effectiveHookZoomTarget =
    hookFreezeFrame && hasCustomHookFocusPoint ? Math.max(hookZoomTarget, 1.12) : hookZoomTarget;
  const hookVisualScale = isHookWithinPreviewWindow
    ? 1 +
      Math.max(0, effectiveHookZoomTarget - 1) *
        (hookFreezeFrame ? 0 : 1 - Math.pow(1 - hookProgress, 2))
    : 1;
  const showHookPreview = !!isHookWithinPreviewWindow;
  const hookVideoBlur =
    showHookPreview && hookBlurBackground
      ? Math.max(
          0,
          (isBlurRevealTemplate ? 14 : 10) - hookProgress * (isBlurRevealTemplate ? 10.5 : 7.5)
        ) * hookOutroOpacity
      : 0;
  const hookVideoBrightness = showHookPreview && hookDarkOverlay ? 0.66 + hookProgress * 0.24 : 1;
  const hookVideoContrast = showHookPreview
    ? 1 + hookOutroOpacity * (isZoomFocusTemplate ? 0.22 : 0.12)
    : 1;
  const hookVideoSaturate = showHookPreview
    ? 1 + hookOutroOpacity * (isZoomFocusTemplate ? 0.24 : 0.14)
    : 1;
  const hookBackdropOpacity = hookBlurBackground
    ? Math.max(
        0,
        (isBlurRevealTemplate ? 0.96 : 0.82) - hookProgress * (isBlurRevealTemplate ? 0.64 : 0.52)
      ) * hookOutroOpacity
    : 0;
  const hookOverlayOpacity = hookDarkOverlay
    ? ((isZoomFocusTemplate ? 0.28 : 0.18) +
        (1 - hookProgress) * (isZoomFocusTemplate ? 0.3 : 0.24)) *
      hookOutroOpacity
    : 0;
  const hookAccentOpacity = showHookPreview
    ? (isZoomFocusTemplate ? 0.54 : isBlurRevealTemplate ? 0.46 : 0.38) * hookOutroOpacity
    : 0;
  const hookAccentTranslate = isBlurRevealTemplate
    ? `${Math.round((1 - hookProgress) * 36)}px`
    : `${Math.round((1 - hookProgress) * 16)}px`;
  const hookBannerAccentOpacity = showHookPreview
    ? (0.22 + hookTextIntroProgress * 0.48) * hookOutroOpacity
    : 0;
  const hookBannerScale = showHookPreview
    ? 0.96 +
      hookTextIntroProgress * (isFreezeTextTemplate ? 0.08 : isZoomFocusTemplate ? 0.06 : 0.04)
    : 1;
  const hookTextGlowOpacity = showHookPreview
    ? (0.22 + (1 - hookProgress) * 0.26) * hookOutroOpacity
    : 0;
  const hookPrimaryVideoOpacity = showHookPreview
    ? hookFreezeFrame
      ? 0.02 + freezeReleaseProgress * 0.98
      : hookBlurBackground
        ? 0.9
        : 1
    : 1;
  const hookFreezeOpacity =
    showHookPreview && hookFreezeFrame ? hookOutroOpacity * (1 - freezeReleaseProgress * 0.92) : 0;
  const hookVisualFocusPoint = showHookPreview ? resolvedHookFocusPoint : DEFAULT_HOOK_FOCUS_POINT;
  const hookTransformOrigin = `${hookVisualFocusPoint.x}% ${hookVisualFocusPoint.y}%`;
  const hookObjectPosition = `${hookVisualFocusPoint.x}% ${hookVisualFocusPoint.y}%`;
  const smartCropBackgroundBlur = smartCrop ? 18 : 0;
  const smartCropBackgroundBrightness = smartCrop ? 0.52 : 1;
  const smartCropBackgroundScale = smartCrop ? 1.08 : 1;
  const trimAwareDuration = Math.max(0, Number(currentTimelineWindow.duration || 0));
  const trimAwareCurrentTime = clampNumber(
    Number(videoTime || 0) - Number(currentTimelineWindow.start || 0),
    0,
    trimAwareDuration || Number(videoTime || 0),
    0
  );
  const hookSelectionLeft = currentTimelineWindow.duration
    ? (resolvedHookStart / Math.max(0.0001, currentTimelineWindow.duration)) * 100
    : 0;
  const hookSelectionWidth = currentTimelineWindow.duration
    ? ((hookEnd - resolvedHookStart) / Math.max(0.0001, currentTimelineWindow.duration)) * 100
    : 0;
  const hookSuggestionLeft = currentTimelineWindow.duration
    ? ((currentHookSuggestion.startTime || 0) / Math.max(0.0001, currentTimelineWindow.duration)) *
      100
    : 0;
  const hookSuggestionWidth = currentTimelineWindow.duration
    ? (((currentHookSuggestion.endTime || 0) - (currentHookSuggestion.startTime || 0)) /
        Math.max(0.0001, currentTimelineWindow.duration)) *
      100
    : 0;
  const hookPlayheadLeft = currentTimelineWindow.duration
    ? (trimAwareCurrentTime / Math.max(0.0001, currentTimelineWindow.duration)) * 100
    : 0;

  useEffect(() => {
    const nextDuration = Number(hookEnd - resolvedHookStart || 0);
    if (Math.abs(Number(hookIntroSeconds || 0) - nextDuration) > 0.05) {
      setHookIntroSeconds(Number(nextDuration.toFixed(2)));
    }
  }, [hookEnd, hookIntroSeconds, resolvedHookStart]);

  useEffect(() => {
    if (Math.abs(Number(hookStartTime || 0) - resolvedHookStart) > 0.05) {
      setHookStartTime(Number(resolvedHookStart.toFixed(2)));
    }

    if (Math.abs(Number(hookEndTime || 0) - hookEnd) > 0.05) {
      setHookEndTime(Number(hookEnd.toFixed(2)));
    }
  }, [hookEnd, hookEndTime, hookStartTime, resolvedHookStart]);

  useEffect(() => {
    setHookSuggestedRange(null);
    setHookAnalysisStatus("idle");
    setHookAnalysisMessage("");
    setHookSelectionMode(false);
    setHookPickMode(false);
    setHookFocusMode(false);
    setHookFocusPoint(DEFAULT_HOOK_FOCUS_POINT);
    hookPreviewSequenceRef.current = { active: false };
  }, [activeTimelineIndex]);

  useEffect(() => {
    const handlePointerMove = event => {
      const drag = hookSelectionDragRef.current;
      const playheadDrag = hookPlayheadDragRef.current;

      if (playheadDrag && currentTimelineWindow.duration) {
        const trackWidth = Math.max(1, playheadDrag.rect.width);
        const deltaRatio = (event.clientX - playheadDrag.startClientX) / trackWidth;
        const deltaTime = deltaRatio * Number(currentTimelineWindow.duration || 0);
        seekHookTimelineTime(playheadDrag.anchorTime + deltaTime);
        return;
      }

      if (!drag || !currentTimelineWindow.duration) return;

      const trackWidth = Math.max(1, drag.rect.width);
      const deltaRatio = (event.clientX - drag.startClientX) / trackWidth;
      const deltaTime = deltaRatio * Number(currentTimelineWindow.duration || 0);

      if (drag.target === "start") {
        setHookSegmentRange(drag.anchorStart + deltaTime, drag.anchorEnd);
        return;
      }

      if (drag.target === "end") {
        setHookSegmentRange(drag.anchorStart, drag.anchorEnd + deltaTime);
        return;
      }

      const rangeDuration = Math.max(hookMinDuration, drag.anchorEnd - drag.anchorStart);
      const boundedStart = clampNumber(
        drag.anchorStart + deltaTime,
        0,
        Math.max(0, Number(currentTimelineWindow.duration || 0) - rangeDuration),
        drag.anchorStart
      );
      setHookSegmentRange(boundedStart, boundedStart + rangeDuration);
    };

    const handlePointerUp = () => {
      hookSelectionDragRef.current = null;
      hookPlayheadDragRef.current = null;
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [currentTimelineWindow.duration, hookMinDuration]);

  const presetMusicPreviewUrl =
    addMusic && !musicSearchMode && musicSelection ? `/music/${musicSelection}` : "";
  const effectiveMusicPreviewUrl = musicSearchMode ? musicPreviewUrl : presetMusicPreviewUrl;
  const effectiveVideoFit = smartCrop ? "cover" : videoFit;
  const previewClarityBrightness = 1.025;
  const previewClarityContrast = 1.08;
  const previewClaritySaturate = 1.05;
  const previewClarityHalo = " drop-shadow(0 0 0.45px rgba(255, 255, 255, 0.34))";
  const currentMusicLabel = musicSearchMode
    ? musicSelection || "Search query"
    : musicSelection
      ? musicSelection.replace(/\.mp3$/i, "").replace(/_/g, " ")
      : "None";
  const musicPreviewStatusLabel =
    musicPreviewStatus === "processing"
      ? "Processing"
      : musicPreviewStatus === "ready"
        ? "Ready"
        : musicPreviewStatus === "failed"
          ? "Failed"
          : "Idle";
  const watermarkPreviewRegions = removeWatermark ? getWatermarkPreviewRegions(watermarkMode) : [];
  const resolvedWatermarkPreviewRegions =
    removeWatermark && watermarkMode === "manual"
      ? manualWatermarkRegions.map(region => ({
          ...region,
          style: toWatermarkPreviewStyle(region),
          isManual: true,
        }))
      : watermarkPreviewRegions.map(region => ({
          ...region,
          style: {
            ...region,
            "--cleanup-rotation": `${Number(region.rotation || 0)}deg`,
            "--cleanup-opacity": Number(region.opacity || 0.88),
          },
          isManual: false,
        }));
  const isWatermarkCleanupPreviewFrameAligned =
    !!watermarkCleanupPreview &&
    watermarkCleanupPreview.clipId === currentTimelineClip?.id &&
    Math.abs(Number(videoTime || 0) - Number(watermarkCleanupPreview.previewTime || 0)) <= 0.2;
  const shouldShowWatermarkCleanupOnVideo =
    !!watermarkCleanupPreview?.cleanedImageUrl &&
    showWatermarkCleanupOnVideo &&
    isPreviewPaused &&
    isWatermarkCleanupPreviewFrameAligned;
  const captionPreviewSourceText =
    getCaptionPreviewSourceText(selectedClip) ||
    normalizePlainText(hookText) ||
    "AI captions preview";
  const captionPreviewState = getCaptionPreviewState({
    text: captionPreviewSourceText,
    localTime: previewTimelineTime,
    duration: currentTimelineWindow.duration || selectedClip?.duration || 3,
  });
  const audioModeSummary =
    currentAudioMode === "replace"
      ? "Donor track replaces original audio"
      : currentAudioMode === "duck_original"
        ? "Donor track leads while original audio ducks"
        : "Donor track mixes with original audio";

  useEffect(() => {
    if (!addHook) return;
    if (!isGenericHookText(hookText)) return;

    const preferredHookText = currentHookCopySuggestions[0] || DEFAULT_HOOK_TEXT;
    if (normalizeHookText(hookText) === preferredHookText) return;
    setHookText(preferredHookText);
  }, [addHook, currentHookCopySuggestions, hookText]);

  useEffect(() => {
    if (!addHook) {
      setHookPreviewLoop(false);
      hookPreviewSequenceRef.current = { active: false };
    }
  }, [addHook]);

  useEffect(() => {
    let isCancelled = false;

    if (!silenceRemoval || !currentTimelineClip) {
      setSilencePreview(null);
      return undefined;
    }

    const loadSilencePreview = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const fileUrl = await ensurePreviewableClipUrl(currentTimelineClip);
        if (!fileUrl) return;

        const response = await fetch(`${API_BASE_URL}/api/media/preview-silence`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileUrl,
            silenceThreshold,
            minSilenceDuration,
          }),
        });

        const payload = await response.json();
        if (!isCancelled) {
          setSilencePreview({
            clipId: currentTimelineClip.id,
            silenceSegments: payload.silence_segments || [],
            keepSegments: payload.keep_segments || [],
          });
        }
      } catch (error) {
        console.error("Silence preview failed", error);
        if (!isCancelled) setSilencePreview(null);
      }
    };

    loadSilencePreview();
    return () => {
      isCancelled = true;
    };
  }, [silenceRemoval, silenceThreshold, minSilenceDuration, currentTimelineClip]);

  useEffect(() => {
    setWatermarkCleanupPreview(null);
    setWatermarkCleanupPreviewError("");
    setShowWatermarkCleanupOnVideo(true);
  }, [removeWatermark, watermarkMode, currentTimelineClip?.id, manualWatermarkRegions]);

  const handleGenerateWatermarkCleanupPreview = async () => {
    if (!currentTimelineClip || !removeWatermark) return;
    if (watermarkMode === "manual" && !manualWatermarkRegions.length) {
      setWatermarkCleanupPreview(null);
      setWatermarkCleanupPreviewError(
        "Add at least one cleanup box before requesting a real preview."
      );
      return;
    }

    setIsWatermarkCleanupPreviewLoading(true);
    setWatermarkCleanupPreviewError("");

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please login first");

      const token = await user.getIdToken();
      const fileUrl = await ensurePreviewableClipUrl(currentTimelineClip);
      if (!fileUrl) throw new Error("No previewable source clip available");

      const video = videoRef.current;
      const previewStart = Number(currentTimelineWindow.start || 0);
      const previewEnd = Number(
        currentTimelineWindow.end || currentTimelineWindow.duration || previewStart
      );
      const previewTime = clampNumber(
        Number(video?.currentTime ?? previewStart),
        previewStart,
        previewEnd || previewStart,
        previewStart
      );
      const syncedManualRegions =
        watermarkMode === "manual"
          ? manualWatermarkRegions.map(region =>
              region.track ? { ...region, seedTime: previewTime } : region
            )
          : manualWatermarkRegions;

      if (watermarkMode === "manual") {
        setManualWatermarkRegions(syncedManualRegions.map(clampManualWatermarkRegion));
      }

      const response = await fetch(`${API_BASE_URL}/api/media/preview-watermark-cleanup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl,
          watermarkMode,
          manualWatermarkRegions:
            watermarkMode === "manual" ? serializeManualWatermarkRegions(syncedManualRegions) : [],
          previewTime,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.details || payload?.message || "Failed to render watermark cleanup preview"
        );
      }

      setWatermarkCleanupPreview({
        clipId: currentTimelineClip.id,
        mode: watermarkMode,
        previewTime: Number(payload.preview_time ?? previewTime),
        originalImageUrl: payload.original_image_url || "",
        cleanedImageUrl: payload.cleaned_image_url || "",
        filters: Array.isArray(payload.filters) ? payload.filters : [],
      });
      setShowWatermarkCleanupOnVideo(true);
    } catch (error) {
      console.error("Watermark cleanup preview failed", error);
      setWatermarkCleanupPreview(null);
      setWatermarkCleanupPreviewError(
        error.message || "Failed to render watermark cleanup preview"
      );
    } finally {
      setIsWatermarkCleanupPreviewLoading(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();

    if (!addMusic || !musicSearchMode || !musicSelection.trim()) {
      stopMusicPreviewBufferPlayback();
      musicPreviewBufferRef.current = null;
      releaseMusicPreviewObjectUrl();
      setMusicPreviewUrl("");
      setMusicPreviewNeedsGesture(false);
      if (!addMusic) {
        setMusicPreviewStatus("idle");
        setMusicPreviewStatusMessage("");
      } else if (!musicSearchMode) {
        setMusicPreviewStatus("ready");
        setMusicPreviewStatusMessage(
          musicSelection ? `Preset ready: ${currentMusicLabel}` : "Choose a music preset."
        );
      } else {
        setMusicPreviewStatus("idle");
        setMusicPreviewStatusMessage("Enter a search query to load preview audio.");
      }
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        if (!isCancelled) {
          setMusicPreviewStatus("processing");
          setMusicPreviewStatusMessage(
            `Searching and preparing preview audio for ${currentMusicLabel}...`
          );
        }
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();

        const response = await fetch(`${API_BASE_URL}/api/media/preview-music`, {
          method: "POST",
          signal: abortController.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            musicFile: musicSelection,
            isSearch: true,
            safeSearch,
            previewDuration: 20,
          }),
        });

        if (!response.ok) throw new Error("Failed to load music preview");
        const payload = await response.json();
        const nextPreviewUrl = await materializeMusicPreviewUrl(payload.preview_url || "");
        if (!nextPreviewUrl) {
          throw new Error("Music search completed but no preview audio was returned");
        }
        if (!isCancelled) {
          setMusicPreviewUrl(nextPreviewUrl);
          setMusicPreviewNeedsGesture(false);
          setMusicPreviewStatus("processing");
          setMusicPreviewStatusMessage(`Preview found for ${currentMusicLabel}. Loading audio...`);
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        console.error("Music preview failed", error);
        if (!isCancelled) {
          releaseMusicPreviewObjectUrl();
          setMusicPreviewUrl("");
          setMusicPreviewStatus("failed");
          setMusicPreviewStatusMessage(error.message || "Music preview failed");
        }
      }
    }, 550);

    return () => {
      isCancelled = true;
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [addMusic, musicSearchMode, musicSelection, safeSearch]);

  useEffect(() => {
    const music = musicPreviewRef.current;
    if (!music) return;

    if (!addMusic || !effectiveMusicPreviewUrl) {
      stopMusicPreviewBufferPlayback();
      musicPreviewBufferRef.current = null;
      setMusicPreviewNeedsGesture(false);
      return;
    }

    if (musicSearchMode) {
      music.pause();
      music.removeAttribute("src");
      music.load();
      setMusicPreviewNeedsGesture(false);
      return;
    }

    music.pause();
    music.load();
    setMusicPreviewNeedsGesture(false);
  }, [addMusic, effectiveMusicPreviewUrl, musicSearchMode]);

  useEffect(() => {
    if (!musicSearchMode) {
      stopMusicPreviewBufferPlayback();
      musicPreviewBufferRef.current = null;
      return undefined;
    }

    if (!addMusic || !musicPreviewUrl) {
      stopMusicPreviewBufferPlayback();
      musicPreviewBufferRef.current = null;
      return undefined;
    }

    let isCancelled = false;
    const abortController = new AbortController();

    const decodeMusicPreview = async () => {
      try {
        const audioContext = ensureMusicPreviewAudioContext();
        const response = await fetch(musicPreviewUrl, { signal: abortController.signal });
        const arrayBuffer = await response.arrayBuffer();
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        if (isCancelled) return;

        musicPreviewBufferRef.current = decodedBuffer;
        setMusicPreviewStatus("ready");
        setMusicPreviewStatusMessage(`Preview audio ready for ${currentMusicLabel}.`);
      } catch (error) {
        if (error?.name === "AbortError") return;

        console.error("Music preview decode failed", error);
        if (!isCancelled) {
          musicPreviewBufferRef.current = null;
          setMusicPreviewStatus("failed");
          setMusicPreviewStatusMessage(error.message || "Preview audio could not be decoded.");
        }
      }
    };

    decodeMusicPreview();

    return () => {
      isCancelled = true;
      abortController.abort();
      stopMusicPreviewBufferPlayback();
    };
  }, [addMusic, musicSearchMode, musicPreviewUrl, currentMusicLabel]);

  useEffect(() => {
    const music = musicPreviewRef.current;
    if (!music || !addMusic || !musicSearchMode || !effectiveMusicPreviewUrl) return undefined;

    if (musicSearchMode) {
      return undefined;
    }

    const markReady = () => {
      setMusicPreviewStatus("ready");
      setMusicPreviewStatusMessage(`Preview audio ready for ${currentMusicLabel}.`);
    };

    const markPlaying = () => {
      setMusicPreviewNeedsGesture(false);
      setMusicPreviewStatus("ready");
      setMusicPreviewStatusMessage(`Preview audio is playing for ${currentMusicLabel}.`);
    };

    const markFailed = () => {
      setMusicPreviewStatus("failed");
      setMusicPreviewStatusMessage(`Preview audio failed to load for ${currentMusicLabel}.`);
    };

    music.addEventListener("loadeddata", markReady);
    music.addEventListener("canplay", markReady);
    music.addEventListener("canplaythrough", markReady);
    music.addEventListener("play", markPlaying);
    music.addEventListener("playing", markPlaying);
    music.addEventListener("error", markFailed);
    music.addEventListener("stalled", markFailed);
    music.addEventListener("abort", markFailed);

    if (music.readyState >= 2) {
      markReady();
    }

    return () => {
      music.removeEventListener("loadeddata", markReady);
      music.removeEventListener("canplay", markReady);
      music.removeEventListener("canplaythrough", markReady);
      music.removeEventListener("play", markPlaying);
      music.removeEventListener("playing", markPlaying);
      music.removeEventListener("error", markFailed);
      music.removeEventListener("stalled", markFailed);
      music.removeEventListener("abort", markFailed);
    };
  }, [addMusic, musicSearchMode, effectiveMusicPreviewUrl, currentMusicLabel]);

  const handleAudioSourceUpload = async event => {
    const sourceFile = event.target.files && event.target.files[0];
    if (!sourceFile) return;

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first");
      event.target.value = "";
      return;
    }

    setIsExtractingAudio(true);
    setAudioExtractionStatus("Uploading source video...");
    if (onStatusChange) onStatusChange("Uploading source video for audio extraction...");

    try {
      let token = await user.getIdToken();
      const uploadResult = await uploadSourceFileViaBackend({
        file: sourceFile,
        token,
        mediaType: "video",
        fileName: sourceFile.name,
      });

      setAudioExtractionStatus("Queueing extraction...");
      if (onStatusChange) onStatusChange("Queueing background-audio extraction...");

      let response = await fetch(API_ENDPOINTS.MEDIA_EXTRACT_AUDIO, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: uploadResult.url,
          sourceLabel: sourceFile.name,
        }),
      });

      if (response.status === 401) {
        token = await user.getIdToken(true);
        response = await fetch(API_ENDPOINTS.MEDIA_EXTRACT_AUDIO, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileUrl: uploadResult.url,
            sourceLabel: sourceFile.name,
          }),
        });
      }

      const startPayload = await response.json().catch(() => null);
      if (!response.ok || !startPayload?.jobId) {
        throw new Error(
          startPayload?.details || startPayload?.message || "Failed to start audio extraction"
        );
      }

      const jobId = startPayload.jobId;
      let attempts = 0;
      while (attempts < 180) {
        attempts += 1;
        await sleep(2000);

        let statusResponse = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (statusResponse.status === 401) {
          token = await user.getIdToken(true);
          statusResponse = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (!statusResponse.ok) continue;
        const statusPayload = await statusResponse.json();

        if (statusPayload.status === "failed") {
          throw new Error(statusPayload.error || "Audio extraction failed on the server");
        }

        if (statusPayload.status === "completed") {
          const result = statusPayload.result || {};
          const audioUrl = result.audioUrl || statusPayload.audio_url;
          if (!audioUrl) {
            throw new Error("Audio extraction completed but no audio URL was returned");
          }

          const audioDuration = clampAudioControl(result.audioDuration, 0, 36000, 0);
          setExtractedAudio({
            id: jobId,
            url: audioUrl,
            sourceVideoUrl: uploadResult.url,
            sourceVideoName: sourceFile.name,
            trimStart: 0,
            volume: 0.7,
            mode: "mix",
            duckingStrength: 0.45,
            enabled: true,
            duration: audioDuration,
            format: result.format || "mp3",
          });
          setAudioExtractionStatus("Background audio added to the timeline.");
          if (onStatusChange)
            onStatusChange("Background audio extracted and added to the timeline.");
          return;
        }

        const progress = clampAudioControl(statusPayload.progress, 0, 100, 0);
        const stageLabel = getAudioExtractionStageLabel(statusPayload.stage, progress);
        setAudioExtractionStatus(stageLabel);
        if (onStatusChange) onStatusChange(stageLabel);
      }

      throw new Error("Audio extraction timed out");
    } catch (error) {
      console.error("Audio extraction failed", error);
      setAudioExtractionStatus(error.message || "Audio extraction failed");
      if (onStatusChange)
        onStatusChange(`Audio extraction failed: ${error.message || "Unknown error"}`);
      alert(`Audio extraction failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsExtractingAudio(false);
      event.target.value = "";
    }
  };

  const buildExportTimeline = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Please login first");

    const exportSegments = await Promise.all(
      timeline.map(async clip => {
        let clipUrl = clip.url;
        let sourceFile = clip.file instanceof Blob ? clip.file : null;

        if (!sourceFile && typeof clip.url === "string" && clip.url.startsWith("blob:")) {
          const response = await fetch(clip.url);
          sourceFile = await response.blob();
        }

        if (
          sourceFile &&
          (clip.isLocal || (typeof clip.url === "string" && clip.url.startsWith("blob:")))
        ) {
          const extension =
            clip.file?.name?.split(".").pop() || sourceFile.type?.split("/").pop() || "mp4";
          const fileName = `${Date.now()}_${clip.id}.${extension}`;
          const storageRef = ref(storage, `timeline/${user.uid}/${fileName}`);
          await uploadBytes(storageRef, sourceFile);
          clipUrl = await getDownloadURL(storageRef);
        }

        const window = getTimelineClipWindow(clip);
        return {
          id: clip.id,
          source_clip_id: clip.id,
          url: clipUrl,
          start_time: window.start,
          end_time: window.end,
          duration: window.duration,
        };
      })
    );

    if (!addHook || !exportSegments[activeTimelineIndex]) {
      return exportSegments;
    }

    const activeSegment = exportSegments[activeTimelineIndex];
    const sourceWindow = getTimelineClipWindow(timeline[activeTimelineIndex]);
    const hookSourceStart = Number(sourceWindow.start || 0) + resolvedHookStart;
    const hookSourceEnd = Number(sourceWindow.start || 0) + hookEnd;
    const hookSegmentDuration = Math.max(0.1, hookSourceEnd - hookSourceStart);

    const beforeHookDuration = Math.max(0, hookSourceStart - Number(activeSegment.start_time || 0));
    const afterHookDuration = Math.max(0, Number(activeSegment.end_time || 0) - hookSourceEnd);
    const leadingSegments = exportSegments.slice(0, activeTimelineIndex);
    const trailingSegments = exportSegments.slice(activeTimelineIndex + 1);
    const hookAwareSegments = [
      ...leadingSegments,
      ...(beforeHookDuration > 0.05
        ? [
            {
              ...activeSegment,
              id: `${activeSegment.id}-before-hook`,
              end_time: hookSourceStart,
              duration: beforeHookDuration,
            },
          ]
        : []),
      ...(afterHookDuration > 0.05
        ? [
            {
              ...activeSegment,
              id: `${activeSegment.id}-after-hook`,
              start_time: hookSourceEnd,
              duration: afterHookDuration,
            },
          ]
        : []),
      ...trailingSegments,
    ];

    return [
      {
        id: `hook-intro-${activeSegment.id}`,
        source_clip_id: activeSegment.source_clip_id || activeSegment.id,
        url: activeSegment.url,
        start_time: hookSourceStart,
        end_time: hookSourceEnd,
        duration: hookSegmentDuration,
      },
      ...hookAwareSegments,
    ];
  };

  const normalizeOverlaysForExport = (exportTimeline, sourceOverlays) => {
    const offsetByClipId = new Map();
    let runningOffset = 0;
    exportTimeline.forEach(segment => {
      const sourceClipId = segment.source_clip_id || segment.id;
      const nextMeta = {
        offset: runningOffset,
        start: segment.start_time || 0,
        end: segment.end_time || 0,
      };
      const existing = offsetByClipId.get(sourceClipId) || [];
      existing.push(nextMeta);
      offsetByClipId.set(sourceClipId, existing);
      runningOffset += Math.max(0, Number(segment.duration || 0));
    });

    return sourceOverlays.map(overlay => {
      const previewStart =
        overlay.startTime !== undefined && overlay.startTime !== null
          ? overlay.startTime
          : overlay.start_time;
      const clipMetas = offsetByClipId.get(overlay.clipId || "main") || [];
      const clipMeta = clipMetas.find(meta => {
        if (previewStart === undefined || previewStart === null) return false;
        return (
          Number(previewStart) >= Number(meta.start || 0) &&
          Number(previewStart) < Number(meta.end || 0)
        );
      }) ||
        clipMetas[0] || {
          offset: 0,
          start: 0,
          end: selectedClip ? selectedClip.end : 0,
        };
      const normalizedStart =
        previewStart !== undefined && previewStart !== null
          ? clipMeta.offset + Math.max(0, Number(previewStart) - Number(clipMeta.start || 0))
          : undefined;

      return {
        ...overlay,
        start_time: normalizedStart,
        duration:
          overlay.duration !== undefined && overlay.duration !== null
            ? Number(overlay.duration)
            : overlay.duration,
      };
    });
  };

  const handleExportRender = async destination => {
    if (isExporting) return;

    const scanSessionId = selectedClip?.scanSessionId || null;
    const selectedClipId = selectedClip?.id ?? null;

    if (scanSessionId) {
      void trackClipWorkflowEvent("scanner_clip_export_started", {
        scanSessionId,
        clipId: String(selectedClipId),
        score: Number(selectedClip?.guidedScore ?? selectedClip?.score ?? 0),
        destination: destination || "general",
      });
    }

    setIsExporting(true);
    setExportStatusLabel("Rendering Captions...");

    const auth = getAuth();
    if (!auth.currentUser) {
      alert("Please login first");
      setIsExporting(false);
      setExportStatusLabel("Render Final Clip");
      return;
    }

    try {
      const exportTimeline = await buildExportTimeline();
      const newOverlays = await Promise.all(
        overlays.map(async overlay => {
          let fileToUpload = overlay.file;
          let isNewBlob = false;
          let finalOverlay = { ...overlay };

          if (overlay.type === "text" && overlay.isRainbow) {
            const tempContainer = document.createElement("div");
            tempContainer.style.position = "absolute";
            tempContainer.style.left = "-9999px";
            tempContainer.style.background = "transparent";
            tempContainer.style.padding = "20px";
            tempContainer.style.fontFamily =
              '"Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif';
            tempContainer.style.fontSize = "32px";
            tempContainer.style.fontWeight = "900";
            tempContainer.style.textShadow = "3px 3px 0 #000";
            tempContainer.style.webkitTextStroke = "1.5px black";
            tempContainer.style.whiteSpace = "pre-wrap";

            const chars = (overlay.text || "").split("");
            chars.forEach((char, idx) => {
              const span = document.createElement("span");
              span.textContent = char;
              const offset = overlay.rainbowOffset || 0;
              span.style.color = RAINBOW_COLORS[(idx + offset) % RAINBOW_COLORS.length];
              tempContainer.appendChild(span);
            });

            document.body.appendChild(tempContainer);

            try {
              const canvas = await html2canvas(tempContainer, {
                backgroundColor: null,
                scale: 2,
              });
              const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
              fileToUpload = blob;
              isNewBlob = true;
              finalOverlay.type = "image";
              finalOverlay.text = undefined;
            } catch (error) {
              console.error("Failed to render caption:", error);
            } finally {
              document.body.removeChild(tempContainer);
            }
          }

          if (fileToUpload && (isNewBlob || overlay.isLocal)) {
            const ext = isNewBlob
              ? "png"
              : fileToUpload.name
                ? fileToUpload.name.split(".").pop()
                : "bin";
            const fileName = `${createSecureId("overlay")}.${ext}`;
            const storageRef = ref(storage, `overlays/${auth.currentUser.uid}/${fileName}`);
            await uploadBytes(storageRef, fileToUpload);
            const url = await getDownloadURL(storageRef);

            finalOverlay.src = url;
            finalOverlay.isLocal = false;
            finalOverlay.file = null;
          }

          return finalOverlay;
        })
      );

      const normalizedOverlays = normalizeOverlaysForExport(exportTimeline, newOverlays);
      const persistedHookFocusPoint = addHook ? normalizeHookFocusPoint(hookFocusPoint) : null;
      const coverFrame = addHook
        ? {
            timelineTime: 0,
            sourceTime: Number(currentTimelineWindow.start || 0) + resolvedHookStart,
            clipId: currentTimelineClip?.id || selectedClip?.id || null,
            focusPoint: persistedHookFocusPoint,
            template: hookTemplate,
            freezeFrame: hookFreezeFrame,
            strategy: hookFreezeFrame ? "hook_freeze_frame" : "hook_intro_start",
          }
        : null;
      const thumbnailFrame = coverFrame ? { ...coverFrame, purpose: "thumbnail" } : null;

      setOverlays(newOverlays);
      onSave(selectedClip, normalizedOverlays, {
        autoCaptions,
        smartCrop,
        enhanceQuality,
        silenceRemoval,
        silenceThreshold,
        minSilenceDuration,
        removeWatermark,
        watermarkMode,
        manualWatermarkRegions: serializeManualWatermarkRegions(manualWatermarkRegions),
        addHook,
        hookText,
        hookIntroSeconds: hookDuration,
        hookTemplate,
        hookStartTime: 0,
        hookEndTime: hookDuration,
        hookSourceStartTime: Number(currentTimelineWindow.start || 0) + resolvedHookStart,
        hookSourceEndTime: Number(currentTimelineWindow.start || 0) + hookEnd,
        hookFocusPoint: persistedHookFocusPoint,
        coverFrame,
        coverFrameTime: coverFrame ? Number(coverFrame.timelineTime || 0) : null,
        coverFrameSourceTime: coverFrame ? Number(coverFrame.sourceTime || 0) : null,
        thumbnailFrame,
        thumbnailTime: thumbnailFrame ? Number(thumbnailFrame.timelineTime || 0) : null,
        thumbnailSourceTime: thumbnailFrame ? Number(thumbnailFrame.sourceTime || 0) : null,
        hook: {
          startTime: 0,
          endTime: hookDuration,
          duration: hookDuration,
          sourceStartTime: Number(currentTimelineWindow.start || 0) + resolvedHookStart,
          sourceEndTime: Number(currentTimelineWindow.start || 0) + hookEnd,
          template: hookTemplate,
          text: normalizedHookText,
          focusPoint: persistedHookFocusPoint,
          coverFrame,
          effects: {
            blurBackground: hookBlurBackground,
            darkOverlay: hookDarkOverlay,
            freezeFrame: hookFreezeFrame,
            zoomScale: hookZoomScale,
            textAnimation: hookTextAnimation,
          },
        },
        hookBlurBackground,
        hookDarkOverlay,
        hookFreezeFrame,
        hookZoomScale,
        hookTextAnimation,
        addMusic,
        musicFile: musicSelection,
        isSearch: musicSearchMode,
        safeSearch,
        musicVolume,
        musicDucking,
        musicDuckingStrength,
        muteAudio: muteOriginalAudio,
        timelineSegments: exportTimeline,
        backgroundAudio: normalizeBackgroundAudioForExport(extractedAudio),
        exportDestination: destination || "general",
      });
    } catch (err) {
      if (scanSessionId) {
        void trackClipWorkflowEvent("scanner_clip_export_failed", {
          scanSessionId,
          clipId: String(selectedClipId),
          destination: destination || "general",
          message: err?.message || "Export failed",
        });
      }
      alert("Export failed: " + err.message);
    } finally {
      setExportStatusLabel("Render Final Clip");
      setIsExporting(false);
    }
  };

  // Dragging State
  const [isDragging, setIsDragging] = useState(false);
  const dragItem = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const scanSessionId = selectedClip?.scanSessionId;
    if (!scanSessionId || loggedScannerEntryRef.current.has(scanSessionId)) return;

    loggedScannerEntryRef.current.add(scanSessionId);
    void trackClipWorkflowEvent("scanner_clip_opened_in_editor", {
      scanSessionId,
      clipId: String(selectedClip?.id ?? "unknown"),
      score: Number(selectedClip?.guidedScore ?? selectedClip?.score ?? 0),
      improveInEditor: Boolean(selectedClip?.improveInEditor),
    });
  }, [selectedClip]);

  // Handle video element duration load to set clip max duration
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setTimeline(prev =>
        prev.map((item, idx) =>
          idx === activeTimelineIndex
            ? {
                ...item,
                duration: dur,
                endRequest:
                  item.endRequest !== null && item.endRequest !== undefined ? item.endRequest : dur,
                startRequest:
                  item.startRequest !== null && item.startRequest !== undefined
                    ? item.startRequest
                    : 0,
              }
            : item
        )
      );
    }
  };

  useEffect(() => {
    setOrderedClips(clips || []);
  }, [clips]);

  useEffect(() => {
    if (orderedClips && orderedClips.length > 0) {
      if (!selectedClip || !orderedClips.some(clip => clip.id === selectedClip.id)) {
        setSelectedClip(orderedClips[0]);
      }
      return;
    }

    if (selectedClip) {
      setSelectedClip(null);
    }
  }, [orderedClips, selectedClip]);

  useEffect(() => {
    if (!selectedClip) return;

    const pendingAction = pendingClipActionRef.current;
    if (!pendingAction || pendingAction.clipId !== selectedClip.id) return;

    pendingClipActionRef.current = null;

    if (pendingAction.type === "apply-hook") {
      applyGuidedHookToClip(selectedClip, { preview: true });
      return;
    }

    if (pendingAction.type === "improve") {
      applyClipImprovements(selectedClip);
      return;
    }

    if (pendingAction.type === "export") {
      void handleExportRender(pendingAction.destination);
    }
  }, [selectedClip]);

  useEffect(() => {
    const snapshot = cloneSnapshot(getEditorSnapshot());
    const serializedSnapshot = JSON.stringify(snapshot);

    if (lastSnapshotRef.current === null) {
      lastSnapshotRef.current = serializedSnapshot;
      syncHistoryAvailability();
      return;
    }

    // Dragging can emit many overlay updates per second. Record a single history snapshot
    // when the drag completes instead of pushing one entry for every mouse move.
    if (isDragging) {
      return;
    }

    if (serializedSnapshot === lastSnapshotRef.current) {
      syncHistoryAvailability();
      return;
    }

    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      lastSnapshotRef.current = serializedSnapshot;
      syncHistoryAvailability();
      return;
    }

    undoStackRef.current.push(JSON.parse(lastSnapshotRef.current));
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    lastSnapshotRef.current = serializedSnapshot;
    syncHistoryAvailability();
  }, [
    orderedClips,
    selectedClip,
    overlays,
    activeOverlayId,
    videoFit,
    autoCaptions,
    smartCrop,
    silenceRemoval,
    silenceThreshold,
    minSilenceDuration,
    removeWatermark,
    watermarkMode,
    manualWatermarkRegions,
    activeWatermarkRegionId,
    addHook,
    hookText,
    hookTemplate,
    hookIntroSeconds,
    hookStartTime,
    hookEndTime,
    hookBlurBackground,
    hookDarkOverlay,
    hookFreezeFrame,
    hookZoomScale,
    hookTextAnimation,
    hookPreviewLoop,
    addMusic,
    muteOriginalAudio,
    musicSelection,
    musicSearchMode,
    safeSearch,
    musicVolume,
    musicDucking,
    musicDuckingStrength,
    extractedAudio,
    timeline,
    activeTimelineIndex,
    isDragging,
  ]);

  useEffect(() => {
    const handleHistoryKeyDown = event => {
      const targetTag = event.target?.tagName;
      const isTypingTarget =
        event.target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(targetTag);
      if (isTypingTarget) return;

      const isUndo =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      const isRedoShortcut =
        (event.metaKey || event.ctrlKey) &&
        ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y");

      if (isUndo) {
        event.preventDefault();
        handleUndo();
      } else if (isRedoShortcut) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleHistoryKeyDown);
    return () => window.removeEventListener("keydown", handleHistoryKeyDown);
  }, [
    orderedClips,
    selectedClip,
    overlays,
    activeOverlayId,
    videoFit,
    autoCaptions,
    smartCrop,
    silenceRemoval,
    silenceThreshold,
    minSilenceDuration,
    removeWatermark,
    watermarkMode,
    manualWatermarkRegions,
    activeWatermarkRegionId,
    addHook,
    hookText,
    hookTemplate,
    hookIntroSeconds,
    hookStartTime,
    hookEndTime,
    hookBlurBackground,
    hookDarkOverlay,
    hookFreezeFrame,
    hookZoomScale,
    hookTextAnimation,
    hookPreviewLoop,
    addMusic,
    muteOriginalAudio,
    musicSelection,
    musicSearchMode,
    safeSearch,
    musicVolume,
    musicDucking,
    musicDuckingStrength,
    extractedAudio,
    timeline,
    activeTimelineIndex,
  ]);

  useEffect(() => {
    if (!activeOverlayId) return undefined;

    const handleKeyDown = event => {
      const targetTag = event.target?.tagName;
      const isTypingTarget =
        event.target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(targetTag);
      if (isTypingTarget) return;

      const step = event.shiftKey ? 5 : 1;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteOverlay(activeOverlayId);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveOverlayId(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "x", -step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "x", step);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "y", -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        updateOverlayPosition(activeOverlayId, "y", step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeOverlayId]);

  // Playback Logic: Handle loop of single clip OR sequence of timeline
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      const currentClip = timeline[activeTimelineIndex];
      if (!currentClip || !addHook || hookPreviewLoop || trimPreviewLoop) return;

      const currentWindow = getTimelineClipWindow(currentClip);
      const startTime = Number(currentWindow.start || 0);
      const absoluteHookStart = startTime + resolvedHookStart;
      const absoluteHookEnd = startTime + hookEnd;

      if (absoluteHookEnd <= absoluteHookStart + 0.05) return;
      if (
        hookPreviewSequenceRef.current.active ||
        hookPreviewSequenceRef.current.phase === "skip-duplicate"
      )
        return;

      const startingFromClipStart = Math.abs(video.currentTime - startTime) <= 0.12;
      const startingFromHookStart = Math.abs(video.currentTime - absoluteHookStart) <= 0.12;

      if (!startingFromClipStart && !startingFromHookStart) return;

      hookPreviewSequenceRef.current = {
        active: true,
        mode: "opening-sequence",
        phase: "opening",
        timelineIndex: activeTimelineIndex,
        absoluteStart: absoluteHookStart,
        absoluteEnd: absoluteHookEnd,
      };

      if (startingFromClipStart) {
        video.currentTime = absoluteHookStart;
      }
    };

    const handleTimeUpdate = () => {
      setVideoTime(video.currentTime);

      const currentClip = timeline[activeTimelineIndex];
      if (!currentClip) return;

      const currentWindow = getTimelineClipWindow(currentClip);
      const startTime = Number(currentWindow.start || 0);
      const endTime = Number(currentWindow.end || video.duration || 0);
      const absoluteHookStart = startTime + resolvedHookStart;
      const absoluteHookEnd = startTime + hookEnd;
      const hookPreviewSequence = hookPreviewSequenceRef.current;

      if (hookPreviewSequence.active && hookPreviewSequence.timelineIndex === activeTimelineIndex) {
        if (video.currentTime >= hookPreviewSequence.absoluteEnd - 0.02) {
          const nextSequenceState =
            hookPreviewSequence.mode === "opening-sequence"
              ? {
                  active: false,
                  mode: "opening-sequence",
                  phase: "skip-duplicate",
                  timelineIndex: activeTimelineIndex,
                  absoluteStart: absoluteHookStart,
                  absoluteEnd: absoluteHookEnd,
                }
              : { active: false };
          hookPreviewSequenceRef.current = nextSequenceState;
          video.currentTime = startTime;
          if (previewPlaybackIntentRef.current) {
            safePlayMediaElement(video);
          }
          return;
        }
      }

      if (
        hookPreviewSequence.phase === "skip-duplicate" &&
        hookPreviewSequence.timelineIndex === activeTimelineIndex &&
        video.currentTime >= absoluteHookStart - 0.02 &&
        video.currentTime < absoluteHookEnd - 0.02
      ) {
        hookPreviewSequenceRef.current = { active: false };
        video.currentTime = absoluteHookEnd;
        if (previewPlaybackIntentRef.current) {
          safePlayMediaElement(video);
        }
        return;
      }

      if (addHook && hookPreviewLoop && absoluteHookEnd > absoluteHookStart + 0.05) {
        if (video.currentTime < absoluteHookStart || video.currentTime >= absoluteHookEnd) {
          video.currentTime = absoluteHookStart;
          if (previewPlaybackIntentRef.current) {
            safePlayMediaElement(video);
          }
          return;
        }
      }

      if (trimPreviewLoop && endTime > startTime + 0.05) {
        if (video.currentTime < startTime || video.currentTime >= endTime) {
          video.currentTime = startTime;
          if (previewPlaybackIntentRef.current) {
            safePlayMediaElement(video);
          }
          return;
        }
      }

      if (
        silenceRemoval &&
        silencePreview?.clipId === currentClip.id &&
        Array.isArray(silencePreview.silenceSegments)
      ) {
        const activeSilence = silencePreview.silenceSegments.find(segment => {
          const segmentStart = Number(segment?.start || 0);
          const segmentEnd = Number(segment?.end || 0);
          return video.currentTime >= segmentStart && video.currentTime < segmentEnd;
        });

        if (activeSilence) {
          const jumpTarget = Math.min(
            endTime,
            Math.max(startTime, Number(activeSilence.end || video.currentTime || 0))
          );
          if (jumpTarget > video.currentTime + 0.05) {
            video.currentTime = jumpTarget;
            return;
          }
        }
      }

      // If we reach the end of this clip's designated playtime
      if (video.currentTime >= endTime) {
        if (trimPreviewLoop) {
          video.currentTime = startTime;
          if (previewPlaybackIntentRef.current) {
            safePlayMediaElement(video);
          }
          return;
        }

        // If there is a NEXT clip in timeline, play it
        if (activeTimelineIndex < timeline.length - 1) {
          const nextIndex = activeTimelineIndex + 1;
          setActiveTimelineIndex(nextIndex);
        } else {
          // Sequence finished: Loop back to START of the sequence (Clip 1 / Main Video)
          setActiveTimelineIndex(0);
        }
      }
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [
    addHook,
    activeTimelineIndex,
    hookEnd,
    hookPreviewLoop,
    resolvedHookStart,
    selectedClip,
    silencePreview,
    silenceRemoval,
    timeline,
    trimPreviewLoop,
  ]);

  // Effect: Switch video Source when activeTimelineIndex changes OR Jump when selecting a viral clip
  useEffect(() => {
    if (videoRef.current && timeline[activeTimelineIndex]) {
      const clip = timeline[activeTimelineIndex];
      const clipWindow = getTimelineClipWindow(clip);
      const targetStart = Number(clipWindow.start || 0);

      // 1. Handle SRC changes
      // Use property .src for comparison as it is always absolute, just like our Firebase URLs
      const currentSrc = videoRef.current.src;
      if (currentSrc !== clip.url && clip.url) {
        videoRef.current.src = clip.url;
        // Reset to start
        videoRef.current.currentTime = targetStart;
        if (previewPlaybackIntentRef.current) {
          safePlayMediaElement(videoRef.current);
        }
      }
      // 2. Handle JUMP within the same file when the active timeline window changes
      else {
        // Only jump if we are far from the start time (prevents fighting with playback)
        if (Math.abs(videoRef.current.currentTime - targetStart) > 0.5 && !isDragging) {
          videoRef.current.currentTime = targetStart;
          // Ensure playing
          if (previewPlaybackIntentRef.current && videoRef.current.paused) {
            safePlayMediaElement(videoRef.current);
          }
        }
      }
    }
  }, [activeTimelineIndex, timeline, selectedClip, isDragging]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!audio) return;

    if (!extractedAudio?.url) {
      if (video) {
        const effectiveMuted = muteOriginalAudio || previewMuted;
        video.muted = effectiveMuted;
        video.volume = effectiveMuted ? 0 : clampAudioControl(previewVolume, 0, 1, 1);
      }
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    const syncBackgroundAudio = () => {
      if (!video || !extractedAudio?.url) return;

      const audioMode = normalizeAudioMode(extractedAudio.mode);
      const duckingStrength = clampAudioControl(extractedAudio.duckingStrength, 0.15, 0.95, 0.45);
      const previewGain = previewMuted ? 0 : clampAudioControl(previewVolume, 0, 1, 1);
      audio.volume = clampAudioControl(extractedAudio.volume, 0, 1, 0.7) * previewGain;
      audio.playbackRate = video.playbackRate || 1;
      const muteOriginal =
        previewMuted ||
        muteOriginalAudio ||
        (extractedAudio.enabled !== false && audioMode === "replace");
      video.muted = muteOriginal;
      video.volume = muteOriginal
        ? 0
        : extractedAudio.enabled === false
          ? previewGain
          : audioMode === "duck_original"
            ? clampAudioControl(1 - duckingStrength, 0.05, 1, 0.55) * previewGain
            : audioMode === "replace"
              ? 0
              : previewGain;

      if (extractedAudio.enabled === false) {
        audio.pause();
        return;
      }

      const previewTimelineTime = getPreviewTimelineTime(video.currentTime || 0);
      const targetTime = clampAudioControl(
        previewTimelineTime + Number(extractedAudio.trimStart || 0),
        0,
        (extractedAudio.duration || previewTimelineTime + Number(extractedAudio.trimStart || 0)) +
          1,
        0
      );

      if (Number.isFinite(targetTime) && Math.abs((audio.currentTime || 0) - targetTime) > 0.35) {
        try {
          audio.currentTime = targetTime;
        } catch (error) {
          console.log("Audio sync seek skipped", error);
        }
      }

      if (video.paused) {
        audio.pause();
      } else {
        safePlayMediaElement(audio);
      }
    };

    const pauseBackgroundAudio = () => audio.pause();

    if (video) {
      video.addEventListener("play", syncBackgroundAudio);
      video.addEventListener("pause", pauseBackgroundAudio);
      video.addEventListener("seeking", syncBackgroundAudio);
      video.addEventListener("seeked", syncBackgroundAudio);
      video.addEventListener("timeupdate", syncBackgroundAudio);
      video.addEventListener("loadedmetadata", syncBackgroundAudio);
      video.addEventListener("ratechange", syncBackgroundAudio);
    }

    syncBackgroundAudio();

    return () => {
      if (video) {
        video.removeEventListener("play", syncBackgroundAudio);
        video.removeEventListener("pause", pauseBackgroundAudio);
        video.removeEventListener("seeking", syncBackgroundAudio);
        video.removeEventListener("seeked", syncBackgroundAudio);
        video.removeEventListener("timeupdate", syncBackgroundAudio);
        video.removeEventListener("loadedmetadata", syncBackgroundAudio);
        video.removeEventListener("ratechange", syncBackgroundAudio);
        video.muted = false;
        video.volume = 1;
      }
      audio.pause();
    };
  }, [
    extractedAudio,
    activeTimelineIndex,
    timeline,
    selectedClip,
    muteOriginalAudio,
    previewMuted,
    previewVolume,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    const backdrop = hookBackdropVideoRef.current;
    const freezeVideo = hookFreezeVideoRef.current;
    if (!video) return;

    const absoluteHookStart = Number(currentTimelineWindow.start || 0) + resolvedHookStart;
    const absoluteHookEnd = Number(currentTimelineWindow.start || 0) + hookEnd;

    const syncHookMedia = () => {
      const isHookVisibleNow =
        addHook &&
        normalizedHookText &&
        video.currentTime >= absoluteHookStart &&
        video.currentTime <= absoluteHookEnd + hookLeadOut;

      if (backdrop) {
        backdrop.playbackRate = video.playbackRate || 1;
        if (Math.abs((backdrop.currentTime || 0) - (video.currentTime || 0)) > 0.08) {
          try {
            backdrop.currentTime = video.currentTime || 0;
          } catch (error) {
            console.log("Hook backdrop seek skipped", error);
          }
        }

        if (video.paused || !isHookVisibleNow || !hookBlurBackground) {
          backdrop.pause();
        } else {
          safePlayMediaElement(backdrop);
        }
      }

      if (freezeVideo) {
        const freezeTarget = Number(currentTimelineWindow.start || 0) + resolvedHookStart;
        if (Math.abs((freezeVideo.currentTime || 0) - freezeTarget) > 0.08) {
          try {
            freezeVideo.currentTime = freezeTarget;
          } catch (error) {
            console.log("Hook freeze seek skipped", error);
          }
        }
        freezeVideo.pause();
      }
    };

    video.addEventListener("play", syncHookMedia);
    video.addEventListener("pause", syncHookMedia);
    video.addEventListener("seeking", syncHookMedia);
    video.addEventListener("seeked", syncHookMedia);
    video.addEventListener("timeupdate", syncHookMedia);
    video.addEventListener("loadedmetadata", syncHookMedia);
    video.addEventListener("ratechange", syncHookMedia);

    syncHookMedia();

    return () => {
      video.removeEventListener("play", syncHookMedia);
      video.removeEventListener("pause", syncHookMedia);
      video.removeEventListener("seeking", syncHookMedia);
      video.removeEventListener("seeked", syncHookMedia);
      video.removeEventListener("timeupdate", syncHookMedia);
      video.removeEventListener("loadedmetadata", syncHookMedia);
      video.removeEventListener("ratechange", syncHookMedia);
      backdrop?.pause();
      freezeVideo?.pause();
    };
  }, [
    addHook,
    activeTimelineIndex,
    hookBlurBackground,
    hookEnd,
    hookFreezeFrame,
    hookLeadOut,
    normalizedHookText,
    resolvedHookStart,
    currentTimelineWindow.start,
    timeline,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    const foreground = smartCropForegroundVideoRef.current;
    if (!video || !foreground || !smartCrop) return undefined;

    const syncSmartCropPreview = () => {
      foreground.playbackRate = video.playbackRate || 1;
      if (Math.abs((foreground.currentTime || 0) - (video.currentTime || 0)) > 0.08) {
        try {
          foreground.currentTime = video.currentTime || 0;
        } catch (error) {
          console.log("Smart crop preview seek skipped", error);
        }
      }

      if (video.paused) {
        foreground.pause();
      } else {
        safePlayMediaElement(foreground);
      }
    };

    video.addEventListener("play", syncSmartCropPreview);
    video.addEventListener("pause", syncSmartCropPreview);
    video.addEventListener("seeking", syncSmartCropPreview);
    video.addEventListener("seeked", syncSmartCropPreview);
    video.addEventListener("timeupdate", syncSmartCropPreview);
    video.addEventListener("loadedmetadata", syncSmartCropPreview);
    video.addEventListener("ratechange", syncSmartCropPreview);

    syncSmartCropPreview();

    return () => {
      video.removeEventListener("play", syncSmartCropPreview);
      video.removeEventListener("pause", syncSmartCropPreview);
      video.removeEventListener("seeking", syncSmartCropPreview);
      video.removeEventListener("seeked", syncSmartCropPreview);
      video.removeEventListener("timeupdate", syncSmartCropPreview);
      video.removeEventListener("loadedmetadata", syncSmartCropPreview);
      video.removeEventListener("ratechange", syncSmartCropPreview);
      foreground.pause();
    };
  }, [smartCrop, activeTimelineIndex, timeline, currentTimelineClip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const syncPlaybackState = () => setIsPreviewPaused(video.paused);

    video.addEventListener("play", syncPlaybackState);
    video.addEventListener("pause", syncPlaybackState);
    video.addEventListener("ended", syncPlaybackState);
    syncPlaybackState();

    return () => {
      video.removeEventListener("play", syncPlaybackState);
      video.removeEventListener("pause", syncPlaybackState);
      video.removeEventListener("ended", syncPlaybackState);
    };
  }, [activeTimelineIndex, timeline]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsPreviewFullscreen(document.fullscreenElement === phoneFrameRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();

    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const music = musicPreviewRef.current;
    if (!music && !musicSearchMode) return;

    if (!addMusic || !effectiveMusicPreviewUrl) {
      stopMusicPreviewBufferPlayback();
      music?.pause();
      return;
    }

    const syncMusicPreview = () => {
      if (!video || !effectiveMusicPreviewUrl) return;

      if (musicSearchMode) {
        syncMusicPreviewGain();

        const previewTimelineTime = clampAudioControl(
          getPreviewTimelineTime(video.currentTime || 0),
          0,
          36000,
          0
        );
        const bufferDuration = Number(musicPreviewBufferRef.current?.duration || 0);
        const targetTime =
          Number.isFinite(bufferDuration) && bufferDuration > 0.25
            ? previewTimelineTime % bufferDuration
            : previewTimelineTime;

        if (video.paused || !musicPreviewBufferRef.current) {
          stopMusicPreviewBufferPlayback();
          return;
        }

        const sourceState = musicPreviewSourceStateRef.current;
        const needsResync =
          !musicPreviewSourceRef.current ||
          Math.abs(Number(sourceState.offset || 0) - targetTime) > 0.35 ||
          Math.abs(Number(sourceState.playbackRate || 1) - Number(video.playbackRate || 1)) > 0.01;

        if (needsResync) {
          startMusicPreviewBufferPlayback(targetTime, video.playbackRate || 1).catch(error => {
            console.log("Music preview buffer play prevented", error);
            setMusicPreviewNeedsGesture(true);
            setMusicPreviewStatus("failed");
            setMusicPreviewStatusMessage(
              error?.message || "Preview audio is ready but playback was blocked by the browser."
            );
          });
        }
        return;
      }

      const previewGain = previewMuted ? 0 : clampAudioControl(previewVolume, 0, 1, 1);
      music.muted = false;
      music.defaultMuted = false;
      music.loop = true;
      music.volume = clampAudioControl(musicVolume, 0.05, 0.6, 0.15) * previewGain;
      music.playbackRate = video.playbackRate || 1;

      const previewTimelineTime = clampAudioControl(
        getPreviewTimelineTime(video.currentTime || 0),
        0,
        36000,
        0
      );
      const musicDuration = Number(music.duration || 0);
      const targetTime =
        Number.isFinite(musicDuration) && musicDuration > 0.25
          ? previewTimelineTime % musicDuration
          : previewTimelineTime;
      if (Number.isFinite(targetTime) && Math.abs((music.currentTime || 0) - targetTime) > 0.35) {
        try {
          music.currentTime = targetTime;
        } catch (error) {
          console.log("Music preview seek skipped", error);
        }
      }

      if (video.paused) {
        music.pause();
      } else {
        try {
          const playResult = music.play();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch(error => {
              console.log("Music preview play prevented", error);
              setMusicPreviewNeedsGesture(true);
              setMusicPreviewStatus("failed");
              setMusicPreviewStatusMessage(
                error?.message || "Preview audio is ready but playback was blocked by the browser."
              );
            });
          }
        } catch (error) {
          console.log("Music preview play prevented", error);
          setMusicPreviewNeedsGesture(true);
          setMusicPreviewStatus("failed");
          setMusicPreviewStatusMessage(
            error?.message || "Preview audio is ready but playback was blocked by the browser."
          );
        }
      }
    };

    const pauseMusicPreview = () => {
      stopMusicPreviewBufferPlayback();
      music?.pause();
    };

    if (video) {
      video.addEventListener("play", syncMusicPreview);
      video.addEventListener("pause", pauseMusicPreview);
      video.addEventListener("seeking", syncMusicPreview);
      video.addEventListener("seeked", syncMusicPreview);
      video.addEventListener("timeupdate", syncMusicPreview);
      video.addEventListener("loadedmetadata", syncMusicPreview);
      video.addEventListener("ratechange", syncMusicPreview);
    }

    syncMusicPreview();

    return () => {
      if (video) {
        video.removeEventListener("play", syncMusicPreview);
        video.removeEventListener("pause", pauseMusicPreview);
        video.removeEventListener("seeking", syncMusicPreview);
        video.removeEventListener("seeked", syncMusicPreview);
        video.removeEventListener("timeupdate", syncMusicPreview);
        video.removeEventListener("loadedmetadata", syncMusicPreview);
        video.removeEventListener("ratechange", syncMusicPreview);
      }
      stopMusicPreviewBufferPlayback();
      music?.pause();
    };
  }, [
    addMusic,
    effectiveMusicPreviewUrl,
    musicSearchMode,
    musicVolume,
    previewMuted,
    previewVolume,
    activeTimelineIndex,
    timeline,
    selectedClip,
  ]);

  const addTextOverlay = () => {
    // START TIME: Use current video playback time
    // If paused, it's exact. If playing, it's roughly "now".
    const currentVideoTime = videoRef.current ? videoRef.current.currentTime : 0;

    // Adjust relative to the CLIP if we are in a multi-clip timeline?
    // For now, let's assume global timeline time or clip-relative.
    // The backend expects relative to the *output video* start (0.0).
    // If we are editing a single clip, 0.0 is the start of that clip.
    // If the user scrubbed to 5.0s, we want the text to appear at 5.0s.

    // However, if we trim the video (start=10, end=20), the backend trims FIRST.
    // So 0.0 in the output is 10.0 in the source.
    // We need to calculate the relative start time.
    let relativeStartTime = currentVideoTime;

    if (selectedClip && activeTimelineIndex === 0) {
      // If we are trimming, the output starts at selectedClip.start.
      // So if user is at 15s and clip starts at 10s, the text should appear at 5s in the output.
      relativeStartTime = Math.max(0, currentVideoTime - (selectedClip.start || 0));
    }

    const newOverlay = {
      id: Date.now(),
      type: "text",
      text: "Double Click to Edit ✏️",
      x: 50,
      y: 50,
      color: "#ffffff",
      bg: "rgba(0,0,0,0.5)",
      scale: 1,
      isRainbow: true,
      startTime: relativeStartTime,
      duration: 3.0, // Default 3 seconds duration
      clipId: timeline[activeTimelineIndex]?.id || "main",
    };
    setOverlays([...overlays, newOverlay]);
    setActiveOverlayId(newOverlay.id);
  };

  const addVideoLayer = event => {
    const file = event.target.files[0];
    if (!file) return;

    // Basic check for video file
    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    const url = URL.createObjectURL(file);

    // Ask user type: Overlay or Append?
    const type = window.confirm(
      "Click OK to OVERLAY heavily used for reactions (Picture-in-Picture).\nClick Cancel to APPEND to the END of the timeline (Sequencing)."
    )
      ? "overlay"
      : "append";

    if (type === "overlay") {
      const newOverlay = {
        id: Date.now(),
        type: "video",
        src: url,
        file: file,
        isLocal: true,
        x: 50,
        y: 50,
        width: 40,
        height: 30,
        aspectRatioLocked: true,
        aspectRatio: 40 / 30,
        clipId: timeline[activeTimelineIndex]?.id || "main",
      };
      setOverlays(prev => [...prev, newOverlay]);
      setActiveOverlayId(newOverlay.id);
    } else {
      // Add to Timeline (Sequencing)
      // Create temp video to get duration
      const tempId = Date.now();
      const tempVideo = document.createElement("video");
      if (!applySafeMediaSource(tempVideo, url)) {
        reject(new Error("This clip source uses an unsupported preview URL."));
        return;
      }
      tempVideo.preload = "metadata";

      tempVideo.onloadedmetadata = () => {
        const duration = tempVideo.duration;
        setTimeline(prev =>
          prev.map(item =>
            item.id === tempId ? { ...item, duration: duration, endRequest: duration } : item
          )
        );
      };

      // Add immediately with 0 duration so user sees it right away
      setTimeline(prev => [
        ...prev,
        {
          id: tempId,
          url: url,
          duration: 0,
          file: file,
          name: file.name,
          isLocal: true,
        },
      ]);
    }

    // Reset input so same file can be selected again if needed
    event.target.value = null;
  };

  const addImageLayer = event => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    addOverlayAsset({
      type: "image",
      src: URL.createObjectURL(file),
      file,
      isLocal: true,
      width: 35,
      height: 35,
    });

    event.target.value = null;
  };

  const addExistingImageOverlay = imageAsset => {
    const src = normalizeAssetUrl(imageAsset);
    if (!src) {
      alert("This image could not be added as an overlay.");
      return;
    }

    addOverlayAsset({
      type: "image",
      src,
      isLocal: false,
      width: 35,
      height: 35,
    });
  };

  const updateOverlayText = (id, newText) => {
    const safeText = normalizePlainText(newText);
    setOverlays(overlays.map(o => (o.id === id ? { ...o, text: safeText } : o)));
  };

  const deleteOverlay = id => {
    setOverlays(overlays.filter(o => o.id !== id));
  };

  // --- Dragging Logic ---
  const handleMouseMove = e => {
    if (!isDragging) return;

    // Support both mouse and touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // We must track mouse relative to the PHONE FRAME, not the window or element
    const container = phoneFrameRef.current || e.currentTarget;
    const bounds = container.getBoundingClientRect();

    // Calculate mouse position relative to container
    const relativeX = clientX - bounds.left;
    const relativeY = clientY - bounds.top;

    // Convert to percentage (0-100)
    let percentX = (relativeX / bounds.width) * 100;
    let percentY = (relativeY / bounds.height) * 100;

    // Clamp to boundaries (0-100)
    percentX = Math.max(0, Math.min(100, percentX));
    percentY = Math.max(0, Math.min(100, percentY));

    if (watermarkDragRef.current) {
      const interaction = watermarkDragRef.current;
      setManualWatermarkRegions(prev =>
        prev.map(region => {
          if (region.id !== interaction.id) return region;

          if (interaction.mode === "resize") {
            const deltaX = percentX - Number(interaction.startX || 0);
            const deltaY = percentY - Number(interaction.startY || 0);
            const direction = interaction.direction || "bottom-right";
            const nextRegion = { ...region };

            if (direction.includes("left")) {
              nextRegion.left = Number(interaction.initialLeft || region.left || 0) + deltaX;
              nextRegion.width = Number(interaction.initialWidth || region.width || 24) - deltaX;
            } else {
              nextRegion.width = Number(interaction.initialWidth || region.width || 24) + deltaX;
            }

            if (direction.includes("top")) {
              nextRegion.top = Number(interaction.initialTop || region.top || 0) + deltaY;
              nextRegion.height = Number(interaction.initialHeight || region.height || 8) - deltaY;
            } else {
              nextRegion.height = Number(interaction.initialHeight || region.height || 8) + deltaY;
            }

            return clampManualWatermarkRegion({
              ...nextRegion,
            });
          }

          return clampManualWatermarkRegion({
            ...region,
            left: percentX - Number(interaction.offsetX || 0),
            top: percentY - Number(interaction.offsetY || 0),
          });
        })
      );
      return;
    }

    if (!dragItem.current) return;

    setOverlays(prev => {
      const currentOverlay = prev.find(o => o.id === dragItem.current);
      if (!currentOverlay) return prev;

      const currentX = Number(currentOverlay.x ?? 50);
      const currentY = Number(currentOverlay.y ?? 50);
      if (Math.abs(currentX - percentX) < 0.1 && Math.abs(currentY - percentY) < 0.1) {
        return prev;
      }

      return prev.map(o => (o.id === dragItem.current ? { ...o, x: percentX, y: percentY } : o));
    });
  };

  const handleDragStart = (e, overlay) => {
    e.stopPropagation(); // Prevent video click
    e.preventDefault(); // Prevent browser native drag
    setActiveWatermarkRegionId(null);
    setActiveOverlayId(overlay.id);
    setIsDragging(true);
    dragItem.current = overlay.id;
  };

  const handleWatermarkDragStart = (e, region) => {
    e.stopPropagation();
    e.preventDefault();

    const frameBounds = phoneFrameRef.current?.getBoundingClientRect();
    if (!frameBounds) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const percentX = ((clientX - frameBounds.left) / frameBounds.width) * 100;
    const percentY = ((clientY - frameBounds.top) / frameBounds.height) * 100;

    setActiveOverlayId(null);
    setActiveWatermarkRegionId(region.id);
    setIsDragging(true);
    watermarkDragRef.current = {
      mode: "move",
      id: region.id,
      offsetX: percentX - Number(region.left || 0),
      offsetY: percentY - Number(region.top || 0),
    };
  };

  const handleWatermarkResizeStart = (e, region, direction = "bottom-right") => {
    e.stopPropagation();
    e.preventDefault();

    const frameBounds = phoneFrameRef.current?.getBoundingClientRect();
    if (!frameBounds) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const percentX = ((clientX - frameBounds.left) / frameBounds.width) * 100;
    const percentY = ((clientY - frameBounds.top) / frameBounds.height) * 100;

    setActiveOverlayId(null);
    setActiveWatermarkRegionId(region.id);
    setIsDragging(true);
    watermarkDragRef.current = {
      mode: "resize",
      direction,
      id: region.id,
      startX: percentX,
      startY: percentY,
      initialLeft: Number(region.left || 0),
      initialTop: Number(region.top || 0),
      initialWidth: Number(region.width || 24),
      initialHeight: Number(region.height || 8),
    };
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    dragItem.current = null;
    watermarkDragRef.current = null;
  };

  return (
    <div className="viral-studio-overlay">
      <div className="viral-studio-container">
        <div className="studio-header">
          <div className="studio-header-copy">
            <span className="studio-eyebrow">Short-form performance editor</span>
            <h3>Viral Clip Studio</h3>
            <p className="studio-header-subtitle">
              Build the hook, shape the frame, and lock audio, captions, and retention in one
              visible workspace.
            </p>
          </div>

          <div className="studio-header-status">
            <div className="studio-status-pill">
              <span className="studio-status-label">Moments</span>
              <strong>{orderedClips.length}</strong>
            </div>
            <div className="studio-status-pill">
              <span className="studio-status-label">Timeline</span>
              <strong>{timeline.length} clips</strong>
            </div>
            <div className="studio-status-pill">
              <span className="studio-status-label">Audio</span>
              <strong>{extractedAudio ? "Ready" : "Original only"}</strong>
            </div>
          </div>

          <div className="studio-header-actions">
            <button
              type="button"
              className="tool-btn tool-btn-compact"
              onClick={handleUndo}
              disabled={!canUndo}
              data-testid="studio-undo-button"
              title="Undo (Ctrl/Cmd+Z)"
              style={{ opacity: canUndo ? 1 : 0.5 }}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="tool-btn tool-btn-compact"
              onClick={handleRedo}
              disabled={!canRedo}
              data-testid="studio-redo-button"
              title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              style={{ opacity: canRedo ? 1 : 0.5 }}
            >
              ↷ Redo
            </button>
            <button className="close-btn" onClick={onCancel}>
              &times;
            </button>
          </div>
        </div>

        <div className="studio-layout">
          <div className="phone-preview-container">
            <section className="studio-panel preview-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">Preview</span>
                  <h4>Vertical composition</h4>
                  <p className="panel-description">
                    The preview mirrors the export contract: clip timing, overlay stack, captions,
                    and donor-audio behavior stay aligned.
                  </p>
                </div>
                <div className="panel-chip-group">
                  <span className="panel-chip">9:16 output</span>
                  <span className="panel-chip">Clip {activeTimelineIndex + 1}</span>
                  <span className="panel-chip">
                    {videoFit === "contain" ? "Full frame" : "Zoomed fill"}
                  </span>
                </div>
              </div>

              <div className="preview-device-column">
                <div className="preview-player-shell">
                  <div
                    ref={phoneFrameRef}
                    data-testid="hook-preview-frame"
                    className={`phone-frame ${hookFocusMode ? "hook-focus-enabled" : ""}`}
                    onClick={handlePreviewFrameClick}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleDragEnd}
                  >
                    <video
                      ref={videoRef}
                      className="studio-video"
                      autoPlay
                      controls
                      playsInline
                      style={{
                        objectFit: effectiveVideoFit,
                        objectPosition: hookObjectPosition,
                        width: "100%",
                        height: "100%",
                        background: "transparent",
                        position: "relative",
                        zIndex: 10,
                        transformOrigin: hookTransformOrigin,
                        transform: `scale(${(hookVisualScale * smartCropBackgroundScale).toFixed(3)})`,
                        opacity: hookPrimaryVideoOpacity,
                        filter: `blur(${(hookVideoBlur + smartCropBackgroundBlur).toFixed(2)}px) brightness(${(hookVideoBrightness * smartCropBackgroundBrightness * previewClarityBrightness).toFixed(3)}) contrast(${(hookVideoContrast * previewClarityContrast).toFixed(3)}) saturate(${(hookVideoSaturate * previewClaritySaturate).toFixed(3)})${previewClarityHalo}`,
                        transition:
                          "transform 150ms linear, opacity 160ms linear, filter 160ms linear",
                        willChange: "transform, opacity, filter",
                      }}
                    />
                    {shouldShowWatermarkCleanupOnVideo ? (
                      <img
                        src={getSafeMediaSource(watermarkCleanupPreview.cleanedImageUrl)}
                        alt="Cleaned watermark preview on video"
                        className="watermark-cleanup-video-overlay"
                      />
                    ) : null}
                    {smartCrop ? (
                      <video
                        ref={smartCropForegroundVideoRef}
                        className="smart-crop-foreground"
                        preload="auto"
                        muted
                        playsInline
                        src={getSafeMediaSource(currentTimelineClip?.url)}
                        style={{ objectPosition: hookObjectPosition }}
                      />
                    ) : null}
                    <video
                      ref={hookBackdropVideoRef}
                      className="hook-preview-backdrop"
                      preload="auto"
                      muted
                      playsInline
                      src={getSafeMediaSource(currentTimelineClip?.url)}
                      style={{ opacity: hookBackdropOpacity, objectPosition: hookObjectPosition }}
                    />
                    <video
                      ref={hookFreezeVideoRef}
                      className="hook-preview-freeze"
                      preload="auto"
                      muted
                      playsInline
                      src={getSafeMediaSource(currentTimelineClip?.url)}
                      style={{
                        opacity: hookFreezeOpacity,
                        objectPosition: hookObjectPosition,
                        transformOrigin: hookTransformOrigin,
                        transform: `scale(${effectiveHookZoomTarget.toFixed(3)})`,
                      }}
                    />
                    <audio
                      ref={audioRef}
                      preload="auto"
                      src={getSafeMediaSource(extractedAudio?.url)}
                      style={{ display: "none" }}
                    />
                    <audio
                      ref={musicPreviewRef}
                      preload="auto"
                      src={
                        !musicSearchMode ? getSafeMediaSource(effectiveMusicPreviewUrl) : undefined
                      }
                      style={{ display: "none" }}
                    />

                    <div
                      className="video-bg-layer"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        zIndex: 0,
                        overflow: "hidden",
                        background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
                      }}
                    />

                    <div className="overlays-layer">
                      {hookFocusMode ? (
                        <div
                          className={`hook-focus-target ${hookFocusMode ? "active" : ""}`}
                          data-testid="hook-focus-target"
                          style={{
                            left: `${resolvedHookFocusPoint.x}%`,
                            top: `${resolvedHookFocusPoint.y}%`,
                          }}
                        >
                          <span className="hook-focus-target-dot" />
                          <span className="hook-focus-target-label">
                            {hookFocusMode ? "Tap face or object" : "Opening focus"}
                          </span>
                        </div>
                      ) : null}
                      {showHookPreview && hookDarkOverlay ? (
                        <div
                          className={`hook-preview-shade hook-preview-shade-${hookTemplate.replace(/_/g, "-")}`}
                          style={{ opacity: hookOverlayOpacity }}
                        />
                      ) : null}
                      {showHookPreview ? (
                        <div
                          className={`hook-preview-accent hook-preview-accent-${hookTemplate.replace(/_/g, "-")}`}
                          style={{
                            opacity: hookAccentOpacity,
                            transform: `translate(-50%, ${hookAccentTranslate}) scale(${(0.94 + hookProgress * 0.08).toFixed(3)})`,
                          }}
                        />
                      ) : null}
                      {showHookPreview && isFreezeTextTemplate ? (
                        <div className="hook-preview-bars" />
                      ) : null}
                      {removeWatermark
                        ? resolvedWatermarkPreviewRegions.map((region, index) => (
                            <div
                              key={region.id || `watermark-preview-${index}`}
                              className={`watermark-preview-cleanup ${region.isManual ? "watermark-preview-cleanup-manual" : ""} ${
                                activeWatermarkRegionId === region.id ? "active" : ""
                              }`}
                              style={region.style}
                              onMouseDown={
                                region.isManual
                                  ? e => handleWatermarkDragStart(e, region)
                                  : undefined
                              }
                              onTouchStart={
                                region.isManual
                                  ? e => handleWatermarkDragStart(e, region)
                                  : undefined
                              }
                              onClick={
                                region.isManual
                                  ? e => {
                                      e.stopPropagation();
                                      setActiveWatermarkRegionId(region.id);
                                      setActiveOverlayId(null);
                                    }
                                  : undefined
                              }
                            >
                              <span className="watermark-preview-feather" />
                              <span className="watermark-preview-sheen" />
                              {region.isManual && activeWatermarkRegionId === region.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="watermark-preview-delete"
                                    onClick={event => {
                                      event.stopPropagation();
                                      deleteManualWatermarkRegion(region.id);
                                    }}
                                    title="Delete cleanup box"
                                    aria-label="Delete cleanup box"
                                  >
                                    ×
                                  </button>
                                  {[
                                    { direction: "top-left", icon: "↖" },
                                    { direction: "top-right", icon: "↗" },
                                    { direction: "bottom-left", icon: "↙" },
                                    { direction: "bottom-right", icon: "↘" },
                                  ].map(handle => (
                                    <button
                                      key={handle.direction}
                                      type="button"
                                      className={`watermark-preview-resize watermark-preview-resize-${handle.direction}`}
                                      onMouseDown={event =>
                                        handleWatermarkResizeStart(event, region, handle.direction)
                                      }
                                      onTouchStart={event =>
                                        handleWatermarkResizeStart(event, region, handle.direction)
                                      }
                                      title={`Resize cleanup box from ${handle.direction}`}
                                      aria-label={`Resize cleanup box from ${handle.direction}`}
                                    >
                                      {handle.icon}
                                    </button>
                                  ))}
                                </>
                              ) : null}
                            </div>
                          ))
                        : null}
                      {showHookPreview && hasHookText ? (
                        <div
                          className={`hook-preview-banner hook-preview-banner-${hookTemplate.replace(/_/g, "-")} hook-text-${hookTextAnimation}`}
                          style={{
                            opacity: hookOutroOpacity * Math.max(0.35, hookTextIntroProgress),
                            transform: `translate(-50%, ${Math.round((1 - hookTextIntroProgress) * 24)}px) scale(${hookBannerScale.toFixed(3)})`,
                          }}
                        >
                          <span
                            className="hook-preview-text-glow"
                            style={{ opacity: hookTextGlowOpacity }}
                          />
                          <span
                            className="hook-preview-banner-accent"
                            style={{ opacity: hookBannerAccentOpacity }}
                          />
                          <div className="hook-preview-copy">{normalizedHookText}</div>
                        </div>
                      ) : null}
                      {autoCaptions && captionPreviewState.currentChunk ? (
                        <div className="caption-preview-stack">
                          <div className="caption-preview-pill caption-preview-pill-active">
                            {captionPreviewState.currentChunk.words.map((word, index) => (
                              <span
                                key={`${captionPreviewState.currentChunk.id}-${word}-${index}`}
                                className={
                                  index === captionPreviewState.activeWordIndex
                                    ? "caption-preview-word caption-preview-word-active"
                                    : "caption-preview-word"
                                }
                              >
                                {word}
                                {index < captionPreviewState.currentChunk.words.length - 1
                                  ? " "
                                  : ""}
                              </span>
                            ))}
                          </div>
                          {captionPreviewState.nextChunk ? (
                            <div className="caption-preview-pill caption-preview-pill-next">
                              {captionPreviewState.nextChunk.text}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {silenceRemoval ? (
                        <div className="silence-preview-indicator">
                          <span />
                          <span />
                          <span />
                          <strong>Long pauses will be tightened</strong>
                        </div>
                      ) : null}
                      {addMusic ? (
                        <div
                          className={`music-preview-pill music-preview-pill-${musicPreviewStatus}`}
                        >
                          {musicSearchMode
                            ? `Music search ${musicPreviewStatusLabel.toLowerCase()}: ${currentMusicLabel}`
                            : `Music preview live: ${currentMusicLabel}`}
                        </div>
                      ) : null}
                      {overlays
                        .filter(o => {
                          const currentClipId = timeline[activeTimelineIndex]?.id;
                          const belongsToClip = !o.clipId || o.clipId === currentClipId;
                          if (!belongsToClip) return false;

                          const overlayStart =
                            o.startTime !== undefined && o.startTime !== null
                              ? o.startTime
                              : o.start_time;
                          if (overlayStart !== undefined && o.duration !== undefined) {
                            return (
                              videoTime >= overlayStart && videoTime <= overlayStart + o.duration
                            );
                          }
                          return true;
                        })
                        .map((overlay, index) => {
                          const safeOverlayText = normalizePlainText(overlay.text);
                          const safeOverlaySrc = getSafeMediaSource(overlay.src);

                          return (
                            <div
                              key={overlay.id}
                              className={`draggable-overlay ${activeOverlayId === overlay.id ? "active" : ""}`}
                              style={{
                                top: `${overlay.y}%`,
                                left: `${overlay.x}%`,
                                width:
                                  overlay.type === "video" || overlay.type === "image"
                                    ? `${overlay.width || 35}%`
                                    : "auto",
                                height:
                                  overlay.type === "video" || overlay.type === "image"
                                    ? `${overlay.height || 35}%`
                                    : "auto",
                                backgroundColor:
                                  overlay.type === "text" ? overlay.bg : "transparent",
                                color: overlay.color,
                                zIndex: 100 + index,
                              }}
                              onMouseDown={e => handleDragStart(e, overlay)}
                              onTouchStart={e => handleDragStart(e, overlay)}
                              onDoubleClick={() => {
                                if (overlay.type === "text") {
                                  const newText = prompt("Edit Text:", safeOverlayText);
                                  if (newText !== null) updateOverlayText(overlay.id, newText);
                                }
                              }}
                            >
                              {overlay.type === "text" ? (
                                overlay.isRainbow ? (
                                  <RainbowText
                                    text={safeOverlayText}
                                    offset={overlay.rainbowOffset || 0}
                                  />
                                ) : (
                                  safeOverlayText
                                )
                              ) : overlay.type === "image" && safeOverlaySrc ? (
                                <img
                                  src={safeOverlaySrc}
                                  alt="Overlay"
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                    borderRadius: "12px",
                                    pointerEvents: "none",
                                  }}
                                />
                              ) : safeOverlaySrc ? (
                                <video
                                  src={safeOverlaySrc}
                                  autoPlay
                                  loop
                                  muted
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                    borderRadius: "12px",
                                    pointerEvents: "none",
                                  }}
                                />
                              ) : null}

                              {activeOverlayId === overlay.id && (
                                <div className="overlay-controls">
                                  <button
                                    className="overlay-delete-btn"
                                    onClick={e => {
                                      e.stopPropagation();
                                      deleteOverlay(overlay.id);
                                    }}
                                  >
                                    &times;
                                  </button>
                                  {(overlay.type === "video" || overlay.type === "image") && (
                                    <div
                                      className="resize-handle"
                                      onMouseDown={e => {
                                        e.stopPropagation();
                                      }}
                                    >
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          updateOverlaySize(overlay.id, "width", -5);
                                        }}
                                      >
                                        W-
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          updateOverlaySize(overlay.id, "width", 5);
                                        }}
                                      >
                                        W+
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          updateOverlaySize(overlay.id, "height", -5);
                                        }}
                                      >
                                        H-
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          updateOverlaySize(overlay.id, "height", 5);
                                        }}
                                      >
                                        H+
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          toggleOverlayAspectRatioLock(overlay.id);
                                        }}
                                        title={
                                          overlay.aspectRatioLocked
                                            ? "Unlock aspect ratio"
                                            : "Lock aspect ratio"
                                        }
                                      >
                                        {overlay.aspectRatioLocked ? "Lock" : "Free"}
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          centerOverlay(overlay.id);
                                        }}
                                        title="Center overlay"
                                      >
                                        Center
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          duplicateOverlay(overlay.id);
                                        }}
                                        title="Duplicate overlay"
                                      >
                                        Copy
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          moveOverlay(overlay.id, "backward");
                                        }}
                                        title="Move layer backward"
                                      >
                                        Down
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          moveOverlay(overlay.id, "forward");
                                        }}
                                        title="Move layer forward"
                                      >
                                        Up
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          moveOverlay(overlay.id, "back");
                                        }}
                                        title="Send layer to back"
                                      >
                                        Back
                                      </button>
                                      <button
                                        className="resize-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          moveOverlay(overlay.id, "front");
                                        }}
                                        title="Bring layer to front"
                                      >
                                        Front
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                <div className="preview-signal-grid">
                  <div className="signal-card">
                    <span className="signal-label">Selected moment</span>
                    <strong>
                      {selectedClip ? `${Math.round(selectedClip.duration)}s hook` : "Full video"}
                    </strong>
                    <span>
                      {selectedClip
                        ? normalizePlainText(selectedClip.reason || "Primary detected moment")
                        : "Choose a detected moment to bias the first clip."}
                    </span>
                  </div>
                  <div className="signal-card">
                    <span className="signal-label">Overlay stack</span>
                    <strong>{overlays.length} active layers</strong>
                    <span>
                      {activeOverlay
                        ? `Editing ${activeOverlay.type === "text" ? "text" : activeOverlay.type} overlay`
                        : "Select a layer to fine-tune size and position."}
                    </span>
                  </div>
                  <div className="signal-card">
                    <span className="signal-label">Background audio</span>
                    <strong>{extractedAudio ? "Donor track loaded" : "Not added"}</strong>
                    <span>
                      {extractedAudio ? audioModeSummary : "Upload a donor video to extract sound."}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="studio-panel studio-timeline-container">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Sequence</span>
                  <h4>Timeline</h4>
                </div>
                <div className="panel-chip-group">
                  <span className="panel-chip">{timeline.length} clips</span>
                  <span className="panel-chip">Playing clip {activeTimelineIndex + 1}</span>
                </div>
              </div>
              <div className="timeline-info">
                <span>Drag to reorder the final sequence.</span>
                <span>Add supporting footage when the primary cut needs help.</span>
              </div>
              <div className="timeline-scroll-area">
                {timeline.map((clip, index) => (
                  <div
                    key={clip.id}
                    data-testid={`timeline-clip-${clip.id}`}
                    onClick={() => setActiveTimelineIndex(index)}
                    draggable={timeline.length > 1}
                    onDragStart={() => setDraggedTimelineClipId(clip.id)}
                    onDragEnd={() => setDraggedTimelineClipId(null)}
                    onDragOver={e => {
                      e.preventDefault();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggedTimelineClipId === null || draggedTimelineClipId === clip.id)
                        return;
                      moveTimelineClipToIndex(draggedTimelineClipId, index);
                      setDraggedTimelineClipId(null);
                    }}
                    className={`timeline-clip-thumb ${activeTimelineIndex === index ? "active" : ""}`}
                    title={clip.name || `Clip ${index + 1}`}
                    style={
                      draggedTimelineClipId === clip.id
                        ? { borderStyle: "dashed", borderColor: "#e52e71" }
                        : undefined
                    }
                  >
                    {/* If clip has a name, show first few chars, otherwise show index */}
                    <span
                      className="clip-thumb-label"
                      style={{ fontSize: clip.name ? "12px" : "16px" }}
                    >
                      {clip.name
                        ? clip.name.length > 8
                          ? clip.name.substring(0, 6) + ".."
                          : clip.name
                        : index + 1}
                    </span>

                    {/* Tiny video preview if possible? Too heavy. Use duration. */}
                    <span className="clip-dur-label">
                      {clip.duration
                        ? Math.round(clip.duration) + "s"
                        : clip.startRequest
                          ? "Trimmed"
                          : "..."}
                    </span>

                    {/* Controls Row */}
                    <div
                      className="clip-mini-controls"
                      style={{ display: "flex", gap: "4px", marginTop: "4px" }}
                    >
                      {timeline.length > 1 && (
                        <>
                          <button
                            className="clip-caption-btn"
                            title="Move clip earlier"
                            data-testid={`timeline-move-left-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              moveTimelineClip(clip.id, "backward");
                            }}
                            disabled={index === 0}
                            style={{
                              fontSize: "10px",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              border: "1px solid #ccc",
                              background: "#fff",
                              cursor: index === 0 ? "default" : "pointer",
                              opacity: index === 0 ? 0.5 : 1,
                            }}
                          >
                            ←
                          </button>
                          <button
                            className="clip-caption-btn"
                            title="Move clip later"
                            data-testid={`timeline-move-right-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              moveTimelineClip(clip.id, "forward");
                            }}
                            disabled={index === timeline.length - 1}
                            style={{
                              fontSize: "10px",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              border: "1px solid #ccc",
                              background: "#fff",
                              cursor: index === timeline.length - 1 ? "default" : "pointer",
                              opacity: index === timeline.length - 1 ? 0.5 : 1,
                            }}
                          >
                            →
                          </button>
                        </>
                      )}
                      {/* Auto-Caption Button */}
                      <button
                        className="clip-caption-btn"
                        title="Auto-Generate Captions"
                        onClick={async e => {
                          e.stopPropagation();
                          if (
                            !confirm(
                              `Generate captions for ${clip.name || "this clip"}?\n(This uses AI to detect speech and may need manual cleanup, especially for mixed South African languages. It might take 10-30s.)`
                            )
                          )
                            return;

                          // 1. Get file blob
                          if (!clip.file) {
                            alert("Can only caption freshly uploaded files. (No file data found)");
                            return;
                          }

                          // 2. Upload to /api/media/transcribe
                          const formData = new FormData();
                          formData.append("file", clip.file);

                          // Show loading state?
                          e.target.innerText = "⏳ AI Listening...";
                          e.target.disabled = true;

                          try {
                            const auth = getAuth();
                            const user = auth.currentUser;
                            const token = user ? await user.getIdToken() : null;

                            // Use configured API BASE URL
                            const res = await fetch(`${API_BASE_URL}/api/media/transcribe`, {
                              method: "POST",
                              headers: {
                                Authorization: `Bearer ${token}`,
                              },
                              body: formData,
                            });

                            if (!res.ok) {
                              const err = await res.json();
                              throw new Error(err.error || "Upload failed");
                            }

                            let data = await res.json();

                            // ASYNC POLLING (Transcription)
                            if (data.jobId) {
                              const jobId = data.jobId;
                              e.target.innerText = "⏳ Transcribing...";

                              let attempts = 0;
                              while (true) {
                                if (attempts > 120) throw new Error("Transcription timed out");
                                await new Promise(r => setTimeout(r, 2000));
                                attempts++;

                                const sRes = await fetch(
                                  `${API_BASE_URL}/api/media/status/${jobId}`,
                                  {
                                    headers: { Authorization: `Bearer ${token}` },
                                  }
                                );

                                if (!sRes.ok) continue;
                                const sData = await sRes.json();

                                if (sData.status === "failed")
                                  throw new Error(sData.error || "Transcription failed");
                                if (sData.status === "completed") {
                                  data = sData.result; // Expects { segments: [...] }
                                  break;
                                }
                              }
                            }

                            // data.segments = [{ start: 0.0, end: 2.0, text: "Hello" }]
                            if (!data.segments) throw new Error("No segments returned");

                            const filteredSegments = data.segments.filter(seg => {
                              const t = seg.text.toLowerCase().trim();

                              // 1. Filter out known Whisper hallucinations/descriptions
                              const invalidPhrases = [
                                "music outro",
                                "music intro",
                                "background music",
                                "subtitles by",
                                "captioned by",
                                "transcribed by",
                                "copyright",
                                "all rights reserved",
                                "thank you",
                              ];
                              if (invalidPhrases.some(bad => t.includes(bad))) return false;

                              // 2. Filter purely non-verbal brackets like [Music] or (Silence) or (Music Outro)
                              if (
                                (t.startsWith("[") && t.endsWith("]")) ||
                                (t.startsWith("(") && t.endsWith(")"))
                              )
                                return false;

                              // 3. Filter single junk characters or words
                              if (t === "music" || t === "." || t === "you" || t.length < 2)
                                return false;

                              return true;
                            });

                            if (filteredSegments.length === 0) {
                              alert(
                                "Audio processed but no clear speech detected (music/noise filtered)."
                              );
                              return;
                            }

                            const newCaptions = filteredSegments.map((seg, i) => ({
                              id: Date.now() + i,
                              type: "text",
                              text: seg.text.trim(),
                              x: 50,
                              y: i % 2 === 0 ? 80 : 75, // Slight vertical jitter for dynamic feel
                              color: "#ffffff",
                              bg: "rgba(0,0,0,0.6)",
                              scale: 1,
                              isRainbow: false,
                              startTime:
                                (clip.startRequest !== null && clip.startRequest !== undefined
                                  ? clip.startRequest
                                  : 0) + seg.start,
                              duration: seg.end - seg.start,
                              isCaption: true,
                              clipId: clip.id,
                              rainbowOffset: i * 3,
                            }));

                            setOverlays(prev => [...prev, ...newCaptions]);
                            alert(
                              "✨ Captions generated via AI draft! Review the text before export. (Cute Mode Enabled 🌈)"
                            );
                          } catch (err) {
                            alert("Error generating captions: " + err.message);
                          } finally {
                            e.target.innerText = "💬 CC";
                            e.target.disabled = false;
                          }
                        }}
                        style={{
                          fontSize: "10px",
                          padding: "2px 5px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        💬 CC
                      </button>

                      {/* Delete Btn */}
                      {timeline.length > 1 && (
                        <button
                          className="clip-delete-btn-mini"
                          title="Remove Clip"
                          onClick={e => {
                            e.stopPropagation();
                            const newTimeline = timeline.filter((_, i) => i !== index);
                            setTimeline(newTimeline);
                            if (activeTimelineIndex >= index)
                              setActiveTimelineIndex(Math.max(0, activeTimelineIndex - 1));
                          }}
                          style={{
                            fontSize: "10px",
                            padding: "2px 5px",
                            borderRadius: "4px",
                            border: "1px solid #ff4757",
                            color: "#ff4757",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <label className="add-clip-btn" title="Add Video to Timeline">
                  +
                  <input
                    data-testid="timeline-add-clip-input"
                    type="file"
                    accept="video/*"
                    style={{ display: "none" }}
                    onChange={addVideoLayer}
                  />
                </label>
              </div>
            </section>

            {timeline[activeTimelineIndex] && (
              <section className="studio-panel studio-trim-controls">
                <div className="panel-heading compact">
                  <div>
                    <span className="panel-kicker">Timing</span>
                    <h4>Trim active clip</h4>
                    <p className="panel-description">
                      Tighten the current clip window before it reaches render.
                    </p>
                  </div>
                  <div className="panel-chip-group">
                    <span className="panel-chip">
                      Start {currentTimelineWindow.start.toFixed(1)}s
                    </span>
                    <span className="panel-chip">End {currentTimelineWindow.end.toFixed(1)}s</span>
                    <span className="panel-chip">
                      {currentTimelineWindow.duration.toFixed(1)}s live
                    </span>
                    {trimPreviewLoop ? <span className="panel-chip">Trim loop on</span> : null}
                  </div>
                </div>
                <div className="slider-stack">
                  <label className="studio-slider-label">
                    <span>Clip start</span>
                    <input
                      type="range"
                      min={0}
                      max={(timeline[activeTimelineIndex].duration || 10) - 0.5}
                      step={0.1}
                      value={
                        timeline[activeTimelineIndex].startRequest !== null &&
                        timeline[activeTimelineIndex].startRequest !== undefined
                          ? timeline[activeTimelineIndex].startRequest
                          : 0
                      }
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setTimeline(prev =>
                          prev.map((item, i) =>
                            i === activeTimelineIndex ? { ...item, startRequest: val } : item
                          )
                        );
                        if (videoRef.current) {
                          setHookPreviewLoop(false);
                          setTrimPreviewLoop(true);
                          videoRef.current.currentTime = val;
                          safePlayMediaElement(videoRef.current);
                        }
                      }}
                    />
                  </label>
                  <label className="studio-slider-label">
                    <span>Clip end</span>
                    <input
                      type="range"
                      min={
                        (timeline[activeTimelineIndex].startRequest !== null &&
                        timeline[activeTimelineIndex].startRequest !== undefined
                          ? timeline[activeTimelineIndex].startRequest
                          : 0) + 0.5
                      }
                      max={timeline[activeTimelineIndex].duration || 100}
                      step={0.1}
                      value={
                        timeline[activeTimelineIndex].endRequest !== null &&
                        timeline[activeTimelineIndex].endRequest !== undefined
                          ? timeline[activeTimelineIndex].endRequest
                          : timeline[activeTimelineIndex].duration || 10
                      }
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setTimeline(prev =>
                          prev.map((item, i) =>
                            i === activeTimelineIndex ? { ...item, endRequest: val } : item
                          )
                        );
                        if (videoRef.current) {
                          setHookPreviewLoop(false);
                          setTrimPreviewLoop(true);
                          const previewTarget = Math.min(
                            Math.max(
                              Number(currentTimelineWindow.start || 0),
                              videoRef.current.currentTime || 0
                            ),
                            Math.max(Number(currentTimelineWindow.start || 0), val - 0.05)
                          );
                          videoRef.current.currentTime = previewTarget;
                          safePlayMediaElement(videoRef.current);
                        }
                      }}
                    />
                  </label>
                </div>
                <div className="mini-toggle-row">
                  <button
                    type="button"
                    className="mini-toggle-btn active"
                    onClick={() => previewTrimWindow(false)}
                  >
                    Preview trim once
                  </button>
                  <button
                    type="button"
                    className={`mini-toggle-btn ${trimPreviewLoop ? "active" : ""}`}
                    onClick={() => previewTrimWindow(!trimPreviewLoop)}
                  >
                    {trimPreviewLoop ? "Stop trim loop" : "Loop trimmed clip"}
                  </button>
                </div>
              </section>
            )}

            <section className="studio-panel studio-trim-controls audio-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Sound</span>
                  <h4>Background audio lane</h4>
                  <p className="panel-description">
                    Extract sound from a donor video, preview the mode live, and send the same audio
                    instructions to export.
                  </p>
                </div>
              </div>
              <div className="audio-action-row">
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => audioSourceInputRef.current?.click()}
                  disabled={isExtractingAudio}
                >
                  <span>🎵</span> {isExtractingAudio ? "Extracting..." : "Upload donor video"}
                </button>
                {extractedAudio ? (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() =>
                      setExtractedAudio(prev => (prev ? { ...prev, enabled: !prev.enabled } : prev))
                    }
                  >
                    <span>{extractedAudio.enabled === false ? "▶️" : "⏸️"}</span>{" "}
                    {extractedAudio.enabled === false ? "Play Track" : "Pause Track"}
                  </button>
                ) : null}
                {extractedAudio ? (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() => setExtractedAudio(null)}
                  >
                    <span>🗑️</span> Remove Track
                  </button>
                ) : null}
                <input
                  data-testid="background-audio-upload-input"
                  ref={audioSourceInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={handleAudioSourceUpload}
                />
              </div>

              {audioExtractionStatus ? (
                <div className="audio-status-banner">{audioExtractionStatus}</div>
              ) : null}

              {extractedAudio ? (
                <div className="audio-track-card">
                  <div className="audio-track-topline">
                    <span className="audio-track-label">Track loaded</span>
                    <span
                      className={`audio-state-pill ${
                        extractedAudio.enabled === false ? "muted" : "live"
                      }`}
                    >
                      {extractedAudio.enabled === false ? "Paused in preview" : "Live in preview"}
                    </span>
                  </div>
                  <div className="audio-track-title">
                    {extractedAudio.sourceVideoName || "Extracted audio"}
                  </div>
                  <div className="audio-track-description">
                    Added as a single background-audio lane for preview and final export.
                  </div>
                  <div className="audio-level-meter">
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background:
                          extractedAudio.enabled === false
                            ? "linear-gradient(90deg, #9ca3af 0%, #6b7280 100%)"
                            : "linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)",
                      }}
                    />
                  </div>
                  <div className="slider-stack">
                    <label className="studio-slider-label">
                      <span>
                        Trim Start:{" "}
                        {clampAudioControl(
                          extractedAudio.trimStart,
                          0,
                          extractedAudio.duration || 36000,
                          0
                        ).toFixed(1)}
                        s
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, extractedAudio.duration || 0)}
                        step={0.1}
                        value={clampAudioControl(
                          extractedAudio.trimStart,
                          0,
                          extractedAudio.duration || 36000,
                          0
                        )}
                        onChange={e =>
                          setExtractedAudio(prev =>
                            prev
                              ? {
                                  ...prev,
                                  trimStart: clampAudioControl(
                                    e.target.value,
                                    0,
                                    prev.duration || 36000,
                                    0
                                  ),
                                }
                              : prev
                          )
                        }
                        style={{ width: "100%", marginTop: "6px" }}
                      />
                    </label>
                    <label className="studio-slider-label">
                      <span>Audio mode</span>
                      <select
                        aria-label="Background audio mode"
                        value={normalizeAudioMode(extractedAudio.mode)}
                        onChange={e =>
                          setExtractedAudio(prev =>
                            prev
                              ? {
                                  ...prev,
                                  mode: normalizeAudioMode(e.target.value),
                                }
                              : prev
                          )
                        }
                        style={{
                          width: "100%",
                          marginTop: "6px",
                          padding: "8px",
                          borderRadius: "8px",
                        }}
                      >
                        <option value="mix">Mix with original audio</option>
                        <option value="replace">Replace original audio</option>
                        <option value="duck_original">Duck original audio</option>
                      </select>
                    </label>
                    {normalizeAudioMode(extractedAudio.mode) === "duck_original" ? (
                      <label className="studio-slider-label">
                        <span>
                          Ducking strength{" "}
                          {Math.round(
                            clampAudioControl(extractedAudio.duckingStrength, 0.15, 0.95, 0.45) *
                              100
                          )}
                          %
                        </span>
                        <input
                          type="range"
                          min={0.15}
                          max={0.95}
                          step={0.05}
                          value={clampAudioControl(
                            extractedAudio.duckingStrength,
                            0.15,
                            0.95,
                            0.45
                          )}
                          onChange={e =>
                            setExtractedAudio(prev =>
                              prev
                                ? {
                                    ...prev,
                                    duckingStrength: clampAudioControl(
                                      e.target.value,
                                      0.15,
                                      0.95,
                                      0.45
                                    ),
                                  }
                                : prev
                            )
                          }
                          style={{ width: "100%", marginTop: "6px" }}
                        />
                      </label>
                    ) : null}
                    <label className="studio-slider-label">
                      <span>
                        Volume:{" "}
                        {Math.round(clampAudioControl(extractedAudio.volume, 0, 1, 0.7) * 100)}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={clampAudioControl(extractedAudio.volume, 0, 1, 0.7)}
                        onChange={e =>
                          setExtractedAudio(prev =>
                            prev
                              ? {
                                  ...prev,
                                  volume: clampAudioControl(e.target.value, 0, 1, 0.7),
                                }
                              : prev
                          )
                        }
                        style={{ width: "100%", marginTop: "6px" }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className="studio-sidebar">
            <section className="studio-panel workflow-summary-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Workflow</span>
                  <h4>One pass to publish</h4>
                </div>
              </div>
              <div className="workflow-summary-grid">
                <div className="workflow-summary-item active">
                  <strong>1. Choose the moment</strong>
                  <span>Start with the clip most likely to stop the scroll.</span>
                </div>
                <div className="workflow-summary-item">
                  <strong>2. Sharpen the frame</strong>
                  <span>Add only the framing, text, and sound that make the promise clearer.</span>
                </div>
                <div className="workflow-summary-item">
                  <strong>3. Render for publish</strong>
                  <span>What you approve in Studio is what AutoPromote sends to export.</span>
                </div>
              </div>
            </section>

            <section className="studio-panel clips-list">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Hook selection</span>
                  <h4>Detected viral moments</h4>
                </div>
              </div>
              {selectedClip && selectedClipGuidance ? (
                <div
                  className={`clip-guidance-card ${selectedClip.id === bestClipId ? "is-best" : ""}`}
                  data-testid="selected-clip-guidance"
                >
                  <div className="clip-guidance-head">
                    <div>
                      <span className="clip-guidance-kicker">
                        {selectedClip.id === bestClipId
                          ? "BEST CLIP"
                          : topPickIds.has(selectedClip.id)
                            ? "TOP PICK"
                            : "Selected clip"}
                      </span>
                      <h5>
                        Viral Score: {selectedClipGuidance.score}
                        <span className="clip-guidance-score-fire">🔥</span>
                      </h5>
                    </div>
                    <div className="clip-guidance-timing-pill">
                      #
                      {rankedClipGuidance.findIndex(entry => entry.clip.id === selectedClip.id) + 1}
                    </div>
                  </div>

                  <p className="clip-guidance-summary">
                    {selectedClip.id === bestClipId
                      ? "This has the highest viral potential right now."
                      : "This moment is ready for hook tuning and export."}
                  </p>

                  <div className="clip-guidance-timing">
                    <span>Start: {Number(selectedClip.start || 0).toFixed(1)}s</span>
                    <span>End: {Number(selectedClip.end || 0).toFixed(1)}s</span>
                    <span>{selectedClipGuidance.duration.toFixed(1)}s</span>
                  </div>

                  <div className="clip-guidance-tag-row">
                    {selectedClipGuidance.categories.map((category, index) => (
                      <span
                        key={`${selectedClip.id}-${category.label}-${index}`}
                        className="clip-tag-pill"
                      >
                        {category.icon} {category.label}
                      </span>
                    ))}
                  </div>

                  <div className="clip-guidance-actions compact">
                    <button
                      type="button"
                      className="clip-action-btn"
                      onClick={() => handleClipAction(selectedClip, { type: "use" })}
                    >
                      Use in Editor
                    </button>
                    <button
                      type="button"
                      className="clip-action-btn clip-action-btn-primary"
                      onClick={() => handleClipAction(selectedClip, { type: "apply-hook" })}
                    >
                      Apply Hook
                    </button>
                  </div>

                  <div className="clip-jump-row">
                    <button
                      type="button"
                      className="clip-jump-btn"
                      onClick={() => jumpToSourceTime(Number(selectedClip.start || 0))}
                    >
                      Jump to start
                    </button>
                    <button
                      type="button"
                      className="clip-jump-btn"
                      onClick={() => jumpToSourceTime(Number(selectedClip.end || 0))}
                    >
                      Jump to end
                    </button>
                  </div>

                  <div className="clip-guidance-reasons">
                    <strong>Why this clip</strong>
                    {selectedClipGuidance.reasons.slice(0, 4).map((reason, index) => (
                      <div
                        key={`${selectedClip.id}-${reason}-${index}`}
                        className="clip-guidance-reason"
                      >
                        ✔ {reason}
                      </div>
                    ))}
                  </div>

                  {selectedClipGuidance.score < 60 ? (
                    <div className="clip-fix-card">
                      <strong>This clip can perform better</strong>
                      {selectedClipGuidance.improvements.map((item, index) => (
                        <div key={`${selectedClip.id}-${item}-${index}`} className="clip-fix-item">
                          • {item}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="clip-action-btn clip-action-btn-primary"
                        onClick={() => handleClipAction(selectedClip, { type: "improve" })}
                      >
                        Improve Clip
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="clips-scroller">
                {orderedClips.map((clip, idx) => {
                  const clipGuidance = clipGuidanceById.get(clip.id);
                  const isBestClip = clip.id === bestClipId;
                  const isTopPick = topPickIds.has(clip.id);

                  return (
                    <div
                      key={clip.id}
                      data-testid={`detected-clip-${clip.id}`}
                      className={`clip-card ${selectedClip && selectedClip.id === clip.id ? "active" : ""} ${isBestClip ? "top-pick" : ""} ${isTopPick && !isBestClip ? "runner-up" : ""}`}
                      draggable={orderedClips.length > 1}
                      onDragStart={() => setDraggedDetectedClipId(clip.id)}
                      onDragEnd={() => setDraggedDetectedClipId(null)}
                      onDragOver={e => {
                        e.preventDefault();
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggedDetectedClipId === null || draggedDetectedClipId === clip.id)
                          return;
                        moveDetectedClipToIndex(draggedDetectedClipId, idx);
                        setDraggedDetectedClipId(null);
                      }}
                      onClick={() => focusClipInEditor(clip, { boundary: "start", play: false })}
                      style={
                        draggedDetectedClipId === clip.id
                          ? { borderStyle: "dashed", borderColor: "#e52e71" }
                          : undefined
                      }
                    >
                      <div className="clip-card-main">
                        <div className="clip-card-header-row">
                          <div className="clip-card-title-group">
                            <span className="clip-badge">#{idx + 1}</span>
                            {isBestClip ? (
                              <span className="clip-priority-badge best">BEST CLIP</span>
                            ) : null}
                            {!isBestClip && isTopPick ? (
                              <span className="clip-priority-badge">TOP PICK</span>
                            ) : null}
                          </div>
                          <div className="clip-score-stack">
                            <span className="clip-score-label">Viral Score</span>
                            <strong>🔥 {clipGuidance?.score ?? 0}</strong>
                          </div>
                        </div>

                        <div className="clip-timing-row">
                          <span>Start {Number(clip.start || 0).toFixed(1)}s</span>
                          <span>End {Number(clip.end || 0).toFixed(1)}s</span>
                          <span>
                            {(clipGuidance?.duration ?? getClipDurationSeconds(clip)).toFixed(1)}s
                          </span>
                        </div>

                        <p>{normalizePlainText(clip.reason || "Primary detected moment")}</p>

                        <div className="clip-tag-row">
                          {(clipGuidance?.categories || []).map((category, index) => (
                            <span
                              key={`${clip.id}-${category.label}-${index}`}
                              className="clip-tag-pill compact"
                            >
                              {category.icon} {category.label}
                            </span>
                          ))}
                        </div>

                        <div className="clip-guidance-mini-list">
                          {(clipGuidance?.reasons || []).slice(0, 3).map((reason, index) => (
                            <div
                              key={`${clip.id}-${reason}-${index}`}
                              className="clip-guidance-mini-item"
                            >
                              ✔ {reason}
                            </div>
                          ))}
                        </div>

                        <div className="clip-guidance-actions">
                          <button
                            type="button"
                            className="clip-action-btn"
                            data-testid={`clip-action-use-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              handleClipAction(clip, { type: "use" });
                            }}
                          >
                            Use in Editor
                          </button>
                          <button
                            type="button"
                            className="clip-action-btn clip-action-btn-primary"
                            data-testid={`clip-action-hook-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              handleClipAction(clip, { type: "apply-hook" });
                            }}
                          >
                            Apply Hook
                          </button>
                        </div>

                        {clipGuidance && clipGuidance.score < 60 ? (
                          <div className="clip-card-warning">
                            <strong>This clip can perform better</strong>
                            <button
                              type="button"
                              className="clip-action-btn clip-action-btn-primary"
                              data-testid={`clip-action-improve-${clip.id}`}
                              onClick={e => {
                                e.stopPropagation();
                                handleClipAction(clip, { type: "improve" });
                              }}
                            >
                              Improve Clip
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {orderedClips.length > 1 && (
                        <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
                          <button
                            type="button"
                            className="resize-btn"
                            title="Move moment earlier"
                            data-testid={`detected-move-left-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              moveDetectedClip(clip.id, "backward");
                            }}
                            disabled={idx === 0}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="resize-btn"
                            title="Move moment later"
                            data-testid={`detected-move-right-${clip.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              moveDetectedClip(clip.id, "forward");
                            }}
                            disabled={idx === orderedClips.length - 1}
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="studio-panel editing-tools-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Build</span>
                  <h4>Essential tools</h4>
                  <p className="panel-description">
                    Keep the frame clean. Add only what earns attention or clarity.
                  </p>
                </div>
              </div>
              <div className="editing-tools">
                <button className="tool-btn" onClick={addTextOverlay}>
                  <span>📝</span> Add Text
                </button>
                <button
                  className="tool-btn"
                  onClick={() => document.getElementById("video-upload-input").click()}
                >
                  <span>📹</span> Add Video
                </button>
                <button className="tool-btn" onClick={() => imageInputRef.current?.click()}>
                  <span>🖼️</span> Add Image
                </button>
                <button
                  className="tool-btn"
                  onClick={() => setVideoFit(prev => (prev === "contain" ? "cover" : "contain"))}
                >
                  <span>📐</span> Fit: {videoFit === "contain" ? "FULL" : "ZOOM"}
                </button>
              </div>
              <input
                id="video-upload-input"
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={addVideoLayer}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={addImageLayer}
              />
              {images.length > 0 && (
                <div className="asset-library-card">
                  <h5>Image library</h5>
                  <div className="asset-library-grid">
                    {images.slice(0, 6).map((imageAsset, index) => {
                      const imageSrc = normalizeAssetUrl(imageAsset);
                      if (!imageSrc) return null;
                      return (
                        <button
                          key={imageAsset.id || imageSrc || index}
                          type="button"
                          onClick={() => addExistingImageOverlay(imageAsset)}
                          style={{
                            width: "58px",
                            height: "58px",
                            padding: 0,
                            borderRadius: "8px",
                            border: "1px solid #d0d0d0",
                            overflow: "hidden",
                            cursor: "pointer",
                            background: "#fff",
                          }}
                          title="Add image overlay"
                        >
                          <img
                            src={getSafeMediaSource(imageSrc)}
                            alt="Overlay option"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="studio-panel automation-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Intelligence</span>
                  <h4>Captions, framing, and cleanup</h4>
                  <p className="panel-description">
                    Keep the assistance honest: captions are drafts, framing is assistive, and
                    cleanup should remove friction instead of trying to rescue weak content.
                  </p>
                </div>
              </div>
              <div className="ai-settings-card">
                <h5 style={sidebarSectionTitleStyle}>🤖 AI Enhancements</h5>
                <label style={{ ...sidebarCheckboxLabelStyle, marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked={autoCaptions}
                    onChange={e => setAutoCaptions(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Auto-Captions (Burn-in)
                </label>
                <div style={{ ...sidebarBodyTextStyle, marginBottom: "10px" }}>
                  Captions are generated as an AI draft. Clean English and Afrikaans speech usually
                  performs best. Mixed South African languages and slang may need manual review.
                </div>
                <label style={sidebarCheckboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={smartCrop}
                    onChange={e => setSmartCrop(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Smart Crop (Keep face centered)
                </label>
                <label style={{ ...sidebarCheckboxLabelStyle, marginTop: "10px" }}>
                  <input
                    type="checkbox"
                    checked={enhanceQuality}
                    onChange={e => setEnhanceQuality(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Quality Enhancement (Safe clean-up)
                </label>
                {enhanceQuality ? (
                  <div style={{ ...sidebarBodyTextStyle, marginTop: "8px", marginBottom: "10px" }}>
                    Uses a conservative export pass to reduce noise and add light sharpening. It is
                    designed to improve soft footage gently, not to fake missing detail.
                  </div>
                ) : null}
                <label style={{ ...sidebarCheckboxLabelStyle, marginTop: "10px" }}>
                  <input
                    type="checkbox"
                    checked={silenceRemoval}
                    onChange={e => setSilenceRemoval(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Remove Silence
                </label>
                {silenceRemoval ? (
                  <div className="micro-settings-card">
                    <label className="studio-slider-label">
                      <span>Silence threshold {silenceThreshold} dB</span>
                      <input
                        type="range"
                        min={-55}
                        max={-20}
                        step={1}
                        value={silenceThreshold}
                        onChange={e => setSilenceThreshold(Number(e.target.value))}
                      />
                    </label>
                    <label className="studio-slider-label">
                      <span>Minimum pause {Number(minSilenceDuration).toFixed(2)}s</span>
                      <input
                        type="range"
                        min={0.25}
                        max={2.5}
                        step={0.05}
                        value={minSilenceDuration}
                        onChange={e => setMinSilenceDuration(Number(e.target.value))}
                      />
                    </label>
                  </div>
                ) : null}
                <label style={{ ...sidebarCheckboxLabelStyle, marginTop: "10px" }}>
                  <input
                    type="checkbox"
                    checked={removeWatermark}
                    onChange={e => setRemoveWatermark(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Remove Platform Watermarks
                </label>
                {removeWatermark ? (
                  <div className="micro-settings-card compact">
                    <label className="studio-slider-label">
                      <span>Watermark cleanup mode</span>
                      <select
                        value={watermarkMode}
                        onChange={e => setWatermarkMode(e.target.value)}
                      >
                        <option value="adaptive">Adaptive tracking</option>
                        <option value="manual">Manual cleanup boxes</option>
                        <option value="corners">Static opposite corners</option>
                        <option value="top_right">Top right only</option>
                        <option value="bottom_left">Bottom left only</option>
                        <option value="all">Aggressive all corners</option>
                      </select>
                    </label>
                    {watermarkMode === "manual" ? (
                      <div className="watermark-manual-tools">
                        <p style={{ ...sidebarBodyTextStyle, margin: 0 }}>
                          Add a cleanup box, drag it over the watermark in the preview, then size it
                          until it covers the badge cleanly.
                        </p>
                        <div className="watermark-manual-actions">
                          <button
                            type="button"
                            className="mini-toggle-btn"
                            onClick={() => addManualWatermarkRegion()}
                          >
                            Add cleanup box
                          </button>
                          {activeWatermarkRegionId ? (
                            <button
                              type="button"
                              className="mini-toggle-btn"
                              onClick={() => deleteManualWatermarkRegion(activeWatermarkRegionId)}
                            >
                              Delete selected box
                            </button>
                          ) : null}
                        </div>
                        <div className="watermark-region-list">
                          {manualWatermarkRegions.length ? (
                            manualWatermarkRegions.map((region, index) => (
                              <button
                                key={region.id}
                                type="button"
                                className={`mini-toggle-btn ${
                                  activeWatermarkRegionId === region.id ? "active" : ""
                                }`}
                                onClick={() => setActiveWatermarkRegionId(region.id)}
                              >
                                Box {index + 1}
                              </button>
                            ))
                          ) : (
                            <span style={sidebarBodyTextStyle}>No manual boxes yet.</span>
                          )}
                        </div>
                        {activeWatermarkRegionId
                          ? (() => {
                              const activeRegion = manualWatermarkRegions.find(
                                region => region.id === activeWatermarkRegionId
                              );
                              if (!activeRegion) return null;

                              return (
                                <div className="watermark-region-editor">
                                  <label style={{ ...sidebarCheckboxLabelStyle, marginTop: "2px" }}>
                                    <input
                                      type="checkbox"
                                      checked={activeRegion.track !== false}
                                      onChange={e =>
                                        updateManualWatermarkRegion(activeRegion.id, {
                                          track: e.target.checked,
                                        })
                                      }
                                      style={{ marginRight: "8px" }}
                                    />
                                    Track this cleanup box across the clip
                                  </label>
                                  <div className="watermark-manual-actions">
                                    <button
                                      type="button"
                                      className="mini-toggle-btn"
                                      onClick={() =>
                                        updateManualWatermarkRegion(activeRegion.id, {
                                          seedTime: clampNumber(videoTime, 0, 36000, 0),
                                        })
                                      }
                                    >
                                      Use current frame as seed
                                    </button>
                                  </div>
                                  <div className="watermark-cleanup-preview-status">
                                    Tracking seed: {Number(activeRegion.seedTime || 0).toFixed(2)}s
                                  </div>
                                  <label className="studio-slider-label">
                                    <span>Box width</span>
                                    <input
                                      type="range"
                                      min={8}
                                      max={58}
                                      step={1}
                                      value={activeRegion.width}
                                      onChange={e =>
                                        updateManualWatermarkRegion(activeRegion.id, {
                                          width: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="studio-slider-label">
                                    <span>Box height</span>
                                    <input
                                      type="range"
                                      min={4}
                                      max={24}
                                      step={1}
                                      value={activeRegion.height}
                                      onChange={e =>
                                        updateManualWatermarkRegion(activeRegion.id, {
                                          height: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                              );
                            })()
                          : null}
                      </div>
                    ) : null}
                    <div className="watermark-cleanup-preview-panel">
                      <div className="watermark-cleanup-preview-actions">
                        <p style={{ ...sidebarBodyTextStyle, margin: 0 }}>
                          Pause on the frame you want to inspect, then run a real cleanup preview to
                          verify the worker removes the watermark without damaging nearby content.
                        </p>
                        {watermarkCleanupPreview ? (
                          <label style={{ ...sidebarCheckboxLabelStyle, marginTop: "2px" }}>
                            <input
                              type="checkbox"
                              checked={showWatermarkCleanupOnVideo}
                              onChange={e => setShowWatermarkCleanupOnVideo(e.target.checked)}
                              style={{ marginRight: "8px" }}
                            />
                            Show cleaned frame on video when paused
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="mini-toggle-btn"
                          onClick={handleGenerateWatermarkCleanupPreview}
                          disabled={
                            isWatermarkCleanupPreviewLoading ||
                            !currentTimelineClip ||
                            (watermarkMode === "manual" && !manualWatermarkRegions.length)
                          }
                        >
                          {isWatermarkCleanupPreviewLoading
                            ? "Rendering real preview..."
                            : "Preview real cleanup"}
                        </button>
                      </div>
                      {watermarkCleanupPreviewError ? (
                        <div className="watermark-cleanup-preview-status error">
                          {watermarkCleanupPreviewError}
                        </div>
                      ) : null}
                      {watermarkCleanupPreview ? (
                        <div className="watermark-cleanup-preview-grid">
                          <div className="watermark-cleanup-preview-card">
                            <span className="watermark-cleanup-preview-label">Original frame</span>
                            {watermarkCleanupPreview.originalImageUrl ? (
                              <img
                                src={getSafeMediaSource(watermarkCleanupPreview.originalImageUrl)}
                                alt="Original watermark frame"
                                className="watermark-cleanup-preview-image"
                              />
                            ) : null}
                          </div>
                          <div className="watermark-cleanup-preview-card">
                            <span className="watermark-cleanup-preview-label">Cleaned frame</span>
                            {watermarkCleanupPreview.cleanedImageUrl ? (
                              <img
                                src={getSafeMediaSource(watermarkCleanupPreview.cleanedImageUrl)}
                                alt="Watermark-cleaned frame preview"
                                className="watermark-cleanup-preview-image"
                              />
                            ) : null}
                          </div>
                          <div className="watermark-cleanup-preview-status">
                            Captured at{" "}
                            {Number(watermarkCleanupPreview.previewTime || 0).toFixed(2)}s. If you
                            move the box or scrub to another moment, run the preview again.
                          </div>
                          {showWatermarkCleanupOnVideo && !isWatermarkCleanupPreviewFrameAligned ? (
                            <div className="watermark-cleanup-preview-status">
                              Pause near{" "}
                              {Number(watermarkCleanupPreview.previewTime || 0).toFixed(2)}s to see
                              the cleaned frame directly on the video preview.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <label style={{ ...sidebarCheckboxLabelStyle, marginTop: "10px" }}>
                  <input
                    type="checkbox"
                    checked={addHook}
                    onChange={e => setAddHook(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Add Viral Hook
                </label>
                {addHook ? (
                  <div className="micro-settings-card">
                    <div className="hook-suggestion-card">
                      <strong>Suggested hook opening</strong>
                      <p>{currentHookSuggestion.message}</p>
                      <p>
                        Suggested range:{" "}
                        {formatPreviewTimePrecise(currentHookSuggestion.startTime || 0)} to{" "}
                        {formatPreviewTimePrecise(currentHookSuggestion.endTime || hookEnd)}
                        {currentHookSuggestion.confidenceLabel
                          ? ` • ${currentHookSuggestion.confidenceLabel}`
                          : ""}
                      </p>
                      {hookAnalysisMessage ? (
                        <div
                          className={`hook-analysis-status hook-analysis-status-${hookAnalysisStatus}`}
                        >
                          {hookAnalysisMessage}
                        </div>
                      ) : null}
                      <div className="mini-toggle-row">
                        <button
                          type="button"
                          className="mini-toggle-btn active"
                          onClick={() => applyCurrentHookSuggestion(false)}
                        >
                          Apply suggested segment
                        </button>
                        <button
                          type="button"
                          className={`mini-toggle-btn ${hookAnalysisStatus === "analyzing" ? "active" : ""}`}
                          onClick={runSmartHookSuggestion}
                          disabled={hookAnalysisStatus === "analyzing"}
                        >
                          {hookAnalysisStatus === "analyzing" ? "Suggesting..." : "Suggest Hook"}
                        </button>
                      </div>
                    </div>
                    <label className="studio-slider-label">
                      <span>Hook text</span>
                      <textarea
                        value={hookText}
                        onChange={e => setHookText(normalizeHookText(e.target.value))}
                        placeholder="Type a curiosity hook that earns the next 3 seconds"
                        rows={3}
                      />
                    </label>
                    <div className="hook-preset-card">
                      <strong>Hook templates</strong>
                      <div className="mini-toggle-row">
                        {Object.entries(HOOK_TEMPLATES).map(([templateKey, template]) => (
                          <button
                            key={templateKey}
                            type="button"
                            className={`mini-toggle-btn ${hookTemplate === templateKey ? "active" : ""}`}
                            onClick={() => applyHookTemplate(templateKey)}
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="hook-treatment-card">
                      <div className="hook-treatment-header">
                        <strong>Hook treatment</strong>
                        <p>{hookTemplateConfig.description}</p>
                      </div>
                      <div className="hook-treatment-toggle-grid">
                        <label style={sidebarCheckboxLabelStyle}>
                          <input
                            type="checkbox"
                            checked={hookBlurBackground}
                            onChange={e => setHookBlurBackground(e.target.checked)}
                            style={{ marginRight: "8px" }}
                          />
                          Blur background
                        </label>
                        <label style={sidebarCheckboxLabelStyle}>
                          <input
                            type="checkbox"
                            checked={hookDarkOverlay}
                            onChange={e => setHookDarkOverlay(e.target.checked)}
                            style={{ marginRight: "8px" }}
                          />
                          Dark overlay
                        </label>
                        <label style={sidebarCheckboxLabelStyle}>
                          <input
                            type="checkbox"
                            checked={hookFreezeFrame}
                            onChange={e => setHookFreezeFrame(e.target.checked)}
                            style={{ marginRight: "8px" }}
                          />
                          Freeze opening frame
                        </label>
                      </div>
                      <label className="studio-slider-label">
                        <span>Text animation</span>
                        <select
                          value={hookTextAnimation}
                          onChange={e => setHookTextAnimation(e.target.value)}
                        >
                          <option value="slide-up">Slide Up</option>
                          <option value="fade-in">Fade In</option>
                        </select>
                      </label>
                      <label className="studio-slider-label">
                        <span>Zoom intensity {hookZoomScale.toFixed(2)}x</span>
                        <input
                          type="range"
                          min={1}
                          max={1.24}
                          step={0.01}
                          value={hookZoomScale}
                          onChange={e => setHookZoomScale(Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <label className="studio-slider-label">
                      <span>Hook duration {hookDuration.toFixed(2)}s</span>
                      <input
                        type="range"
                        min={hookMinDuration}
                        max={hookMaxDuration}
                        step={0.05}
                        value={hookDuration}
                        onChange={e => setHookDuration(Number(e.target.value))}
                      />
                    </label>
                    <div className="hook-preset-card">
                      <strong>Manual hook selection</strong>
                      <div className="mini-toggle-row">
                        <button
                          type="button"
                          className={`mini-toggle-btn ${hookPickMode ? "active" : ""}`}
                          onClick={() => {
                            setHookPickMode(prev => !prev);
                            setHookSelectionMode(false);
                            setHookFocusMode(false);
                          }}
                        >
                          {hookPickMode ? "Choosing hook" : "Choose Hook"}
                        </button>
                        <button
                          type="button"
                          className={`mini-toggle-btn ${hookFocusMode ? "active" : ""}`}
                          onClick={() => {
                            setAddHook(true);
                            setHookFocusMode(prev => !prev);
                            setHookSelectionMode(false);
                            setHookPickMode(false);
                          }}
                        >
                          {hookFocusMode ? "Picking focus" : "Pick Focus"}
                        </button>
                        <button
                          type="button"
                          className="mini-toggle-btn"
                          onClick={setCurrentTimeAsHook}
                        >
                          Set as Hook
                        </button>
                      </div>
                      <p className="hook-manual-copy">
                        Choose the exact opening moment on the timeline, then click the preview if
                        you want the frozen frame to zoom toward a face or object.
                      </p>
                      <div className="hook-manual-readout">
                        <span>Hook point {formatPreviewTimePrecise(trimAwareCurrentTime)}</span>
                        <span>
                          Focus target {Math.round(resolvedHookFocusPoint.x)}% x{" "}
                          {Math.round(resolvedHookFocusPoint.y)}%
                        </span>
                      </div>
                    </div>
                    <div className="hook-segment-card">
                      <div className="hook-segment-header">
                        <div>
                          <strong>Hook Source Span</strong>
                          <p>
                            This is the same opening hook, not a second one. It controls how much
                            source footage the opening uses before the clip continues without
                            replaying that hook section again.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`mini-toggle-btn ${hookSelectionMode ? "active" : ""}`}
                          onClick={() => {
                            setHookSelectionMode(prev => !prev);
                            setHookPickMode(false);
                            setHookFocusMode(false);
                          }}
                        >
                          {hookSelectionMode ? "Selection active" : "Select Hook Segment"}
                        </button>
                      </div>
                      <div
                        ref={hookSegmentTrackRef}
                        className={`hook-segment-track ${hookSelectionMode ? "selection-enabled" : ""} ${hookPickMode ? "playhead-enabled" : ""}`}
                        onMouseDown={handleHookTrackPointerDown}
                        role="presentation"
                      >
                        <span className="hook-segment-track-base" />
                        <span
                          className={`hook-segment-suggestion ${hookAnalysisStatus === "ready" ? "active" : ""}`}
                          style={{
                            left: `${hookSuggestionLeft}%`,
                            width: `${Math.max(2, hookSuggestionWidth)}%`,
                          }}
                        />
                        <span
                          className="hook-segment-playhead"
                          style={{ left: `${hookPlayheadLeft}%` }}
                        />
                        <button
                          type="button"
                          className={`hook-playhead-handle ${hookPickMode ? "active" : ""}`}
                          style={{ left: `${hookPlayheadLeft}%` }}
                          onMouseDown={hookPickMode ? beginHookPlayheadDrag : undefined}
                          aria-label="Drag hook playhead"
                        />
                        <span
                          className="hook-segment-marker"
                          style={{ left: `${hookSelectionLeft}%` }}
                        />
                        <span
                          className="hook-segment-selection"
                          style={{
                            left: `${hookSelectionLeft}%`,
                            width: `${Math.max(3, hookSelectionWidth)}%`,
                          }}
                          onMouseDown={event => beginHookSegmentDrag(event, "range")}
                          role="presentation"
                        >
                          <button
                            type="button"
                            className="hook-segment-handle hook-segment-handle-start"
                            onMouseDown={event => beginHookSegmentDrag(event, "start")}
                            aria-label="Adjust hook start"
                          />
                          <button
                            type="button"
                            className="hook-segment-handle hook-segment-handle-end"
                            onMouseDown={event => beginHookSegmentDrag(event, "end")}
                            aria-label="Adjust hook end"
                          />
                        </span>
                      </div>
                      <div className="hook-segment-readout">
                        <span>
                          Source range {formatPreviewTimePrecise(resolvedHookStart)} to{" "}
                          {formatPreviewTimePrecise(hookEnd)}
                        </span>
                        <span>{hookDuration.toFixed(2)}s</span>
                      </div>
                      <div className="hook-segment-scrubbers">
                        <label className="studio-slider-label">
                          <span>Hook start {resolvedHookStart.toFixed(2)}s</span>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0.1, hookStartLimit)}
                            step={0.01}
                            value={resolvedHookStart}
                            onChange={e =>
                              setHookSegmentRange(Number(e.target.value), hookEnd, {
                                preview: true,
                              })
                            }
                          />
                        </label>
                        <label className="studio-slider-label">
                          <span>Hook end {hookEnd.toFixed(2)}s</span>
                          <input
                            type="range"
                            min={Math.min(
                              hookEndMinimum,
                              Math.max(0.1, Number(currentTimelineWindow.duration || 0))
                            )}
                            max={Math.max(
                              hookEndMinimum,
                              Number(currentTimelineWindow.duration || hookEndMaximum || 0.1)
                            )}
                            step={0.01}
                            value={hookEnd}
                            onChange={e =>
                              setHookSegmentRange(resolvedHookStart, Number(e.target.value))
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <div className="mini-toggle-row">
                      <button
                        type="button"
                        className="mini-toggle-btn active"
                        onClick={() => previewHookSegment(false)}
                      >
                        Preview hook once
                      </button>
                      <button
                        type="button"
                        className={`mini-toggle-btn ${hookPreviewLoop ? "active" : ""}`}
                        onClick={() => previewHookSegment(!hookPreviewLoop)}
                      >
                        {hookPreviewLoop ? "Stop hook loop" : "Loop hook segment"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="ai-settings-card">
                <h5 style={sidebarSectionTitleStyle}>🎵 Music And Audio</h5>
                <label style={{ ...sidebarCheckboxLabelStyle, marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked={addMusic}
                    onChange={e => setAddMusic(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Add Background Music
                </label>
                <label
                  style={{ ...sidebarCheckboxLabelStyle, marginBottom: addMusic ? "10px" : 0 }}
                >
                  <input
                    type="checkbox"
                    checked={muteOriginalAudio}
                    onChange={e => setMuteOriginalAudio(e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  Mute Original Audio
                </label>
                <div style={{ ...sidebarBodyTextStyle, marginBottom: addMusic ? "12px" : 0 }}>
                  {addMusic
                    ? `Music source: ${currentMusicLabel}`
                    : "Keep original audio live, replace it with music, or mute it entirely from here."}
                </div>
                {addMusic ? (
                  <div className="micro-settings-card">
                    {!musicSearchMode ? (
                      <label className="studio-slider-label">
                        <span>Music preset</span>
                        <select
                          value={musicSelection}
                          onChange={e => {
                            setMusicSelection(e.target.value);
                            if (onMusicChange) onMusicChange(e.target.value, false);
                          }}
                        >
                          <option value="upbeat_pop.mp3">Upbeat Pop</option>
                          <option value="lofi_chill.mp3">Lofi Chill</option>
                          <option value="cinematic.mp3">Cinematic</option>
                          <option value="corporate.mp3">Corporate</option>
                        </select>
                      </label>
                    ) : (
                      <div className="hook-suggestion-card compact-audio-note">
                        <strong>Custom searched track active</strong>
                        <p>{currentMusicLabel}</p>
                        <button
                          type="button"
                          className="mini-toggle-btn"
                          onClick={() => {
                            setMusicSearchMode(false);
                            setMusicSelection("upbeat_pop.mp3");
                            if (onMusicChange) onMusicChange("upbeat_pop.mp3", false);
                          }}
                        >
                          Switch to presets
                        </button>
                      </div>
                    )}
                    <label className="studio-slider-label">
                      <span>Music volume {Math.round(Number(musicVolume || 0) * 100)}%</span>
                      <input
                        type="range"
                        min={0.05}
                        max={0.6}
                        step={0.01}
                        value={musicVolume}
                        onChange={e => setMusicVolume(Number(e.target.value))}
                      />
                    </label>
                    {!muteOriginalAudio ? (
                      <>
                        <label style={sidebarCheckboxLabelStyle}>
                          <input
                            type="checkbox"
                            checked={musicDucking}
                            onChange={e => setMusicDucking(e.target.checked)}
                            style={{ marginRight: "8px" }}
                          />
                          Auto-lower music under speech
                        </label>
                        {musicDucking ? (
                          <label className="studio-slider-label">
                            <span>
                              Ducking strength {Math.round(Number(musicDuckingStrength || 0) * 100)}
                              %
                            </span>
                            <input
                              type="range"
                              min={0.15}
                              max={0.85}
                              step={0.05}
                              value={musicDuckingStrength}
                              onChange={e => setMusicDuckingStrength(Number(e.target.value))}
                            />
                          </label>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="studio-panel export-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Publish</span>
                  <h4>Render and export</h4>
                </div>
              </div>
              <p className="panel-description">
                Final export uses the active timeline, overlay stack, AI settings, and donor audio
                configuration shown above, exactly as approved in Studio.
              </p>
              <div className="clip-guidance-actions render-destination-row">
                <button
                  type="button"
                  className="clip-action-btn"
                  onClick={() => void handleExportRender("tiktok")}
                  disabled={isExporting}
                >
                  Export TikTok
                </button>
                <button
                  type="button"
                  className="clip-action-btn"
                  onClick={() => void handleExportRender("reels")}
                  disabled={isExporting}
                >
                  Export Reels
                </button>
                <button
                  type="button"
                  className="clip-action-btn"
                  onClick={() => void handleExportRender("shorts")}
                  disabled={isExporting}
                >
                  Export Shorts
                </button>
              </div>
              <button
                className="export-btn"
                onClick={() => void handleExportRender("general")}
                disabled={isExporting}
              >
                {exportStatusLabel}
              </button>
            </section>

            {overlays.length > 0 && (
              <section className="studio-panel layer-panel">
                <h5 style={{ margin: "0 0 10px 0" }}>🧱 Visual Layers</h5>
                <p
                  style={{
                    fontSize: "12px",
                    color: "rgba(247, 248, 251, 0.68)",
                    margin: "0 0 8px 0",
                  }}
                >
                  Select a layer to edit it. Drag to reorder the stack from front to back.
                </p>
                <div className="layer-list">
                  {[...overlays].reverse().map((overlay, reversedIndex) => {
                    const actualIndex = overlays.length - 1 - reversedIndex;
                    const isActive = activeOverlayId === overlay.id;
                    const label =
                      overlay.type === "text"
                        ? `Text: ${(overlay.text || "").slice(0, 16) || "Untitled"}`
                        : `${overlay.type === "image" ? "Image" : "Video"} Overlay`;
                    const detail =
                      overlay.type === "text" ? "Edit copy and position" : "Edit size and position";

                    return (
                      <div
                        key={overlay.id}
                        onClick={() => setActiveOverlayId(overlay.id)}
                        draggable
                        onDragStart={() => setDraggedOverlayId(overlay.id)}
                        onDragEnd={() => setDraggedOverlayId(null)}
                        onDragOver={e => {
                          e.preventDefault();
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          if (draggedOverlayId === null || draggedOverlayId === overlay.id) return;
                          moveOverlayToIndex(draggedOverlayId, actualIndex);
                          setDraggedOverlayId(null);
                        }}
                        className={`layer-row ${isActive ? "active" : ""}`}
                        style={
                          draggedOverlayId === overlay.id
                            ? { borderStyle: "dashed", borderColor: "#e52e71" }
                            : undefined
                        }
                      >
                        <div className="layer-row-copy">
                          <span className="layer-row-label">{label}</span>
                          <span className="layer-row-detail">{detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeOverlay && (
              <section className="studio-panel active-overlay-panel">
                <h5 style={{ margin: "0 0 10px 0" }}>🎛️ Layer Controls</h5>
                <p
                  style={{
                    fontSize: "12px",
                    color: "rgba(247, 248, 251, 0.68)",
                    margin: "0 0 10px 0",
                  }}
                >
                  Fine-tune the selected layer here. Arrow keys nudge it, and Shift nudges faster.
                </p>
                <div className="slider-stack">
                  <label className="studio-slider-label">
                    <span>Left: {Math.round(activeOverlay.x || 0)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={activeOverlay.x || 0}
                      onChange={e =>
                        updateOverlayPosition(
                          activeOverlay.id,
                          "x",
                          Number(e.target.value) - Number(activeOverlay.x || 0)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label className="studio-slider-label">
                    <span>Top: {Math.round(activeOverlay.y || 0)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={activeOverlay.y || 0}
                      onChange={e =>
                        updateOverlayPosition(
                          activeOverlay.id,
                          "y",
                          Number(e.target.value) - Number(activeOverlay.y || 0)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </label>
                  <div>
                    <button
                      type="button"
                      className="mini-toggle-btn"
                      onClick={() => {
                        deleteOverlay(activeOverlay.id);
                        setActiveOverlayId(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {(activeOverlay.type === "video" || activeOverlay.type === "image") && (
                    <>
                      <label className="studio-slider-label">
                        <span>Width: {Math.round(activeOverlay.width || 0)}%</span>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          step={1}
                          value={activeOverlay.width || 35}
                          onChange={e =>
                            updateOverlaySize(
                              activeOverlay.id,
                              "width",
                              Number(e.target.value) - Number(activeOverlay.width || 35)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </label>
                      <label className="studio-slider-label">
                        <span>Height: {Math.round(activeOverlay.height || 0)}%</span>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          step={1}
                          value={activeOverlay.height || 35}
                          onChange={e =>
                            updateOverlaySize(
                              activeOverlay.id,
                              "height",
                              Number(e.target.value) - Number(activeOverlay.height || 35)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </label>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViralClipStudio;

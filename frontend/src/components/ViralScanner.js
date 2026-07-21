import React, { useState, useRef, useEffect, useCallback } from "react";
import "./ViralScanner.css";
import { auth } from "../firebaseClient";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { applySafeMediaSource, createSecureId } from "../utils/security";
import { trackClipWorkflowEvent } from "../utils/clipWorkflowAnalytics";
import { uploadTemporaryVideoSource } from "../utils/sourceUpload";
import { playMediaSafely } from "../utils/mediaPlayback";
import { SafeImage, SafeVideo } from "./SafeMedia";

const CLIP_SCANNER_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CLIP_SCAN_CREDIT_COST = 8;
const CONTROL_TEXT_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  "g"
);

const normalizePlainText = value =>
  String(value ?? "")
    .replace(CONTROL_TEXT_PATTERN, " ")
    .replace(/[<>]/g, "")
    .trim();

const getRemoteSourceUrl = file => {
  if (typeof file === "string") return file;
  if (file && typeof file === "object" && typeof file.url === "string") return file.url;
  return "";
};

const getSourceRenderJobId = file =>
  file && typeof file === "object" && typeof file.renderJobId === "string"
    ? file.renderJobId.trim()
    : "";

const getScannerSourceType = file => {
  if (getSourceRenderJobId(file)) return "saved_multicam_master";
  if (getRemoteSourceUrl(file)) return "remote_url";
  return "local_file";
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
    pattern: /(offer|sale|product|launch|brand|ad|subscribe|buy|deal|discount|limited time)/i,
  },
  {
    label: "Live Performance",
    icon: "🎵",
    pattern:
      /(choir|worship|praise|gospel|performance|harmony|stage|live moment|live performance)/i,
  },
];

const getHookPreviewCopy = clip => {
  const reason = normalizePlainText(clip?.reason || "");
  if (/(why|how|what|question|asks)/i.test(reason)) return "THE ANSWER HITS HERE";
  if (/(emotion|shock|reveal|surprise|confession)/i.test(reason)) return "WAIT FOR THE TURN";
  if (/(fast|motion|energy|action|impact)/i.test(reason)) return "DON'T BLINK HERE";
  return "WATCH WHAT HAPPENS NEXT";
};

const getClipVisualAssets = clip => {
  const assets = [
    ...(Array.isArray(clip?.thumbnailOptions) ? clip.thumbnailOptions : []),
    ...(Array.isArray(clip?.posterOptions) ? clip.posterOptions : []),
    ...(Array.isArray(clip?.visualAssets) ? clip.visualAssets : []),
  ].filter(asset => asset?.url);
  return Array.from(new Map(assets.map(asset => [asset.id || asset.url, asset])).values());
};

const getClipIdentity = clip => String(clip?.id ?? `${clip?.start || 0}-${clip?.end || 0}`);

const getVisualCopySourceMeta = asset => {
  const source = normalizePlainText(asset?.copySource || "").toLowerCase();
  if (source === "ai_refined") {
    return { label: "AI Refined", className: "ai-refined" };
  }
  return { label: "Fallback Copy", className: "heuristic" };
};

const getVisualWhyText = asset =>
  normalizePlainText(asset?.aiWhy || asset?.subtitle || asset?.label || "");

const scrollElementIntoView = (element, options) => {
  if (!element || typeof element.scrollIntoView !== "function") return;
  element.scrollIntoView(options);
};

const buildScannerClipGuidance = clip => {
  const descriptorText = normalizePlainText(
    [clip?.reason, clip?.label, clip?.transcript, clip?.text].filter(Boolean).join(" ")
  );
  const duration = Math.max(
    0,
    Number(clip?.duration || Number(clip?.end || 0) - Number(clip?.start || 0))
  );
  const transcriptWordCount = normalizePlainText(clip?.transcript || clip?.text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  const isVisualOnly = clip?.hasAudio === false || clip?.analysisMode === "visual_only";
  const transcriptConfidence = Number(clip?.transcriptConfidence || 0);
  const contentType = normalizePlainText(clip?.contentType || "general").toLowerCase();
  const musicLike = /choir_performance|music_performance/.test(contentType);
  const speechTrusted =
    clip?.speechTrusted === true ||
    (!musicLike && transcriptConfidence >= 0.58 && transcriptWordCount >= 4);

  const signals = {
    speech:
      !isVisualOnly &&
      !musicLike &&
      (speechTrusted ||
        /(question|asks|says|voice|speaks|talks|explains|dialogue|quote|story|lesson|statement|answer)/i.test(
          descriptorText
        )),
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
      ) || transcriptWordCount >= 8,
  };

  const score =
    (signals.speech ? 20 : 0) +
    (signals.subject ? 20 : 0) +
    (signals.motion ? 20 : 0) +
    (signals.idealLength ? 20 : 0) +
    (signals.hook ? 20 : 0);

  const reasons = [];
  if (isVisualOnly) reasons.push("Visual-only scan: no audio stream was detected");
  if (musicLike)
    reasons.push("Performance energy carries the opening without needing a speech hook");
  else if (signals.speech) reasons.push("Starts with a spoken beat or voice-led setup");
  if (signals.subject) reasons.push("Clear face or central subject stays visible");
  if (signals.motion) reasons.push("Fast pacing or a scene change adds momentum");
  if (signals.idealLength) reasons.push("Length fits the short-form sweet spot");
  if (signals.hook) reasons.push("The opening has clear hook potential");
  if (reasons.length < 3 && descriptorText && !musicLike && transcriptConfidence >= 0.58) {
    reasons.push(descriptorText);
  }
  while (reasons.length < 3) {
    reasons.push(
      isVisualOnly
        ? "Scene changes and motion shaped this clip candidate"
        : musicLike
          ? "The clip is cleanly isolated around a strong live-performance beat"
          : "The clip is cleanly isolated and ready for editing"
    );
  }

  const improvements = [];
  if (!isVisualOnly && !musicLike && (!signals.speech || !signals.hook))
    improvements.push("Cut the first 2 seconds");
  if (!signals.hook) improvements.push("Add hook");
  if (!signals.speech) {
    improvements.push(isVisualOnly || musicLike ? "Add a visual hook/title" : "Add captions");
  }
  if (!signals.subject) improvements.push("Use zoom or crop to center the subject");
  if (!signals.idealLength) {
    improvements.push(duration < 10 ? "Extend to the payoff" : "Trim closer to 10-25 seconds");
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

  return {
    score,
    reasons: reasons.slice(0, 5),
    improvements: [...new Set(improvements)].slice(0, 3),
    categories,
    signals,
    hookText: getHookPreviewCopy(clip),
  };
};

const buildSourceFingerprint = file => {
  if (!file) return "";

  const renderJobId = getSourceRenderJobId(file);
  if (renderJobId) return `multicam:${renderJobId}`.slice(0, 180);

  const remoteUrl = getRemoteSourceUrl(file);
  if (remoteUrl) {
    try {
      const parsedUrl = new URL(remoteUrl, window.location.origin);
      return `remote:${parsedUrl.origin}${parsedUrl.pathname}`.slice(0, 180);
    } catch (_error) {
      return `remote:${String(remoteUrl).split("?")[0]}`.slice(0, 180);
    }
  }

  const name = normalizePlainText(file.name || "scan.mp4");
  const size = Number(file.size || 0);
  const lastModified = Number(file.lastModified || 0);
  const type = normalizePlainText(file.type || "application/octet-stream");
  return `local:${name}:${size}:${lastModified}:${type}`.slice(0, 180);
};

const buildStableSourceFingerprint = file => {
  if (!file) return "";

  const renderJobId = getSourceRenderJobId(file);
  if (renderJobId) return `multicam:${renderJobId}`.slice(0, 180);

  const remoteUrl = getRemoteSourceUrl(file);
  if (remoteUrl) {
    try {
      const parsedUrl = new URL(remoteUrl, window.location.origin);
      return `remote:${parsedUrl.origin}${parsedUrl.pathname}`.slice(0, 180);
    } catch (_error) {
      return `remote:${String(remoteUrl).split("?")[0]}`.slice(0, 180);
    }
  }

  const name = normalizePlainText(file.name || "scan.mp4");
  const size = Number(file.size || 0);
  const type = normalizePlainText(file.type || "application/octet-stream");
  return `local-stable:${name}:${size}:${type}`.slice(0, 180);
};

const getSourceFingerprints = file =>
  Array.from(
    new Set([buildSourceFingerprint(file), buildStableSourceFingerprint(file)].filter(Boolean))
  );

const getSourceLabel = file => {
  if (!file) return "Untitled source";
  if (getSourceRenderJobId(file)) return file.name || "Cam Combiner master";
  const remoteUrl = getRemoteSourceUrl(file);
  if (remoteUrl) {
    const cleaned = String(remoteUrl).split("?")[0];
    return cleaned.split("/").pop() || "Remote video";
  }
  return file.name || "Uploaded video";
};

const applyGuidanceToScenes = scenes =>
  (Array.isArray(scenes) ? scenes : []).map((scene, index) => {
    const baseClip = {
      ...scene,
      id: scene?.id ?? index,
      start: Number(scene?.start_time ?? scene?.start ?? 0),
      end: Number(scene?.end_time ?? scene?.end ?? scene?.start ?? 0),
      duration: Math.max(
        0,
        Number(
          scene?.duration ??
            Number(scene?.end_time ?? scene?.end ?? 0) -
              Number(scene?.start_time ?? scene?.start ?? 0)
        )
      ),
      backendScore: Number(scene?.backendScore ?? scene?.viral_score ?? scene?.score ?? 0),
      reason: scene?.label || scene?.reason || "High engagement potential detected",
      transcript: scene?.transcript || scene?.text || "",
    };

    const guidance = buildScannerClipGuidance(baseClip);
    return {
      ...baseClip,
      score: Number(scene?.score ?? scene?.viralScore ?? scene?.viral_score ?? guidance.score),
      reasons:
        Array.isArray(scene?.reasons) && scene.reasons.length ? scene.reasons : guidance.reasons,
      improvements:
        Array.isArray(scene?.improvements) && scene.improvements.length
          ? scene.improvements
          : guidance.improvements,
      categories:
        Array.isArray(scene?.categories) && scene.categories.length
          ? scene.categories
          : guidance.categories,
      hookText: scene?.hookText || guidance.hookText,
      scoreConfidence: Number(scene?.scoreConfidence ?? scene?.score_confidence ?? 0),
      scoreConfidenceLabel:
        scene?.scoreConfidenceLabel || scene?.score_confidence_label || "Exploratory evidence",
      scoreMeaning:
        scene?.scoreMeaning ||
        "Editorial potential based on this video's hook, clarity, energy, motion, and duration signals.",
      signals: scene?.signals || guidance.signals,
      hasAudio: scene?.hasAudio,
      analysisMode: scene?.analysisMode,
      visualAssets: getClipVisualAssets(scene),
      thumbnailOptions: Array.isArray(scene?.thumbnailOptions) ? scene.thumbnailOptions : [],
      posterOptions: Array.isArray(scene?.posterOptions) ? scene.posterOptions : [],
      thumbnailUrl:
        scene?.thumbnailUrl ||
        scene?.thumbnail_url ||
        scene?.thumbnailOptions?.[0]?.url ||
        scene?.visualAssets?.[0]?.url ||
        "",
    };
  });

const saveClipScannerCache = async ({ token, sourceFingerprint, sourceLabel, results }) => {
  if (!token || !sourceFingerprint || !Array.isArray(results) || !results.length) return;

  await fetch(API_ENDPOINTS.ANALYTICS_CLIP_SCANNER_CACHE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sourceFingerprint,
      sourceLabel,
      resultCount: results.length,
      topScore: Math.max(...results.map(item => Number(item.score || 0)), 0),
      results,
    }),
  });
};

const ClipResultThumbnail = ({
  videoSrc,
  clip,
  isActive,
  preferVideo = false,
  autoplayPreview = false,
  className = "",
}) => {
  const previewRef = useRef(null);
  const visualUrl = clip?.thumbnailUrl || getClipVisualAssets(clip)[0]?.url || "";
  const shouldUseVideo = Boolean(videoSrc && (preferVideo || !visualUrl));

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !shouldUseVideo || !clip) return;

    const clipStart = Math.max(0, Number(clip.start || 0));
    const rawClipEnd = Number(clip.end || clipStart + Number(clip.duration || 0) || clipStart + 6);
    const clipEnd = Math.max(clipStart + 1.5, rawClipEnd);
    const previewEnd = Math.min(clipEnd, clipStart + 8);

    const seekToClipStart = () => {
      try {
        video.currentTime = clipStart;
      } catch (_) {
        // Some remote videos do not allow seeking until more metadata is ready.
      }
    };

    const keepWithinPreviewWindow = () => {
      if (video.currentTime >= previewEnd - 0.08) {
        seekToClipStart();
        if (autoplayPreview) {
          const playback = video.play();
          if (typeof playback?.catch === "function") {
            playback.catch(() => {});
          }
        }
      }
    };

    const startPlayback = () => {
      if (!autoplayPreview) return;
      video.muted = true;
      video.playsInline = true;
      const playback = video.play();
      if (typeof playback?.catch === "function") {
        playback.catch(() => {});
      }
    };

    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    seekToClipStart();
    startPlayback();
    video.addEventListener("loadedmetadata", seekToClipStart);
    video.addEventListener("loadeddata", seekToClipStart);
    video.addEventListener("canplay", startPlayback);
    video.addEventListener("timeupdate", keepWithinPreviewWindow);

    return () => {
      video.removeEventListener("loadedmetadata", seekToClipStart);
      video.removeEventListener("loadeddata", seekToClipStart);
      video.removeEventListener("canplay", startPlayback);
      video.removeEventListener("timeupdate", keepWithinPreviewWindow);
      if (autoplayPreview) {
        video.pause();
      }
    };
  }, [clip, shouldUseVideo, autoplayPreview]);

  return (
    <div className={`scanner-clip-thumbnail ${isActive ? "active" : ""} ${className}`.trim()}>
      {!shouldUseVideo && visualUrl ? (
        <SafeImage src={visualUrl} alt={clip?.hookText || "Generated clip visual"} />
      ) : shouldUseVideo ? (
        <SafeVideo ref={previewRef} src={videoSrc} muted playsInline preload="metadata" />
      ) : (
        <span>No preview</span>
      )}
      <div className="scanner-clip-thumbnail-shade" />
      <span className="scanner-clip-thumbnail-score">
        🔥 {Math.round(Number(clip?.score || 0))}
      </span>
      <span className="scanner-clip-thumbnail-duration">
        {Math.max(0, Math.round(Number(clip?.duration || 0)))}s
      </span>
    </div>
  );
};

const ViralScanner = ({ file, onSelectClip, onClose, onUpgrade }) => {
  const videoRef = useRef(null);
  const videoSectionRef = useRef(null);
  const previewStopHandlerRef = useRef(null);
  const scanSessionIdRef = useRef(createSecureId("scan"));
  const loggedPreviewClipIdsRef = useRef(new Set());
  const sourceFingerprintRef = useRef("");
  const scanInFlightRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [previewClip, setPreviewClip] = useState(null);
  const [previewSoundOn, setPreviewSoundOn] = useState(false);
  const [previewRelativeTime, setPreviewRelativeTime] = useState(0);
  const [selectedClip, setSelectedClip] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanPhase, setScanPhase] = useState("idle");
  const [videoSrc, setVideoSrc] = useState(null);
  const [cachedScanMeta, setCachedScanMeta] = useState(null);
  const [cachedResultsReady, setCachedResultsReady] = useState(false);
  const [cacheLoadPending, setCacheLoadPending] = useState(false);
  const [learningMeta, setLearningMeta] = useState(null);

  // --- Credit System State ---
  const [creditBalance, setCreditBalance] = useState(null);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [scanAccess, setScanAccess] = useState({
    checking: true,
    allowed: false,
    code: null,
    message: "Checking your plan and credits before upload...",
    requiredCredits: CLIP_SCAN_CREDIT_COST,
    balance: null,
    topUpsAllowed: false,
  });
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedVisualByClipId, setSelectedVisualByClipId] = useState({});
  const paypalButtonsRef = useRef(null);

  const CREDIT_PACKAGES = [
    { id: "pack_boost", credits: 50, price: "4.99", name: "Boost Pack" },
    { id: "pack_pro", credits: 200, price: "14.99", name: "Pro Pack", savings: "25%" },
    { id: "pack_studio", credits: 500, price: "29.99", name: "Studio Pack", savings: "40%" },
  ];

  const formatBalance = balance => {
    if (balance === null || typeof balance === "undefined") return 0;
    if (typeof balance === "number" || typeof balance === "string") return balance;
    if (typeof balance === "object") {
      if (typeof balance.balance !== "undefined") return balance.balance;
      if (typeof balance.amount !== "undefined") return balance.amount;
      return JSON.stringify(balance);
    }
    return String(balance);
  };

  const refreshScanAccess = useCallback(async () => {
    setScanAccess(current => ({
      ...current,
      checking: true,
      message: "Checking your plan and credits before upload...",
    }));

    try {
      const user = auth.currentUser;
      if (!user) {
        const blocked = {
          checking: false,
          allowed: false,
          code: "AUTH_REQUIRED",
          message: "Please sign in before using Find Viral Clips. Nothing was uploaded.",
          requiredCredits: CLIP_SCAN_CREDIT_COST,
          balance: null,
          topUpsAllowed: false,
        };
        setScanAccess(blocked);
        return blocked;
      }

      const token = await user.getIdToken();
      const response = await fetch(API_ENDPOINTS.MEDIA_SCAN_PREFLIGHT, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Access check failed");
      }

      const access = {
        checking: false,
        allowed: Boolean(payload.allowed),
        code: payload.code || null,
        message:
          payload.message ||
          (payload.allowed
            ? "Find Viral Clips is ready."
            : "Find Viral Clips is not available right now."),
        requiredCredits: Number(payload.requiredCredits || CLIP_SCAN_CREDIT_COST),
        balance: Number(payload.balance || 0),
        tier: payload.tier || "free",
        planName: payload.planName || "Starter",
        topUpsAllowed: Boolean(payload.topUpsAllowed),
      };
      setCreditBalance(access.balance);
      setNeedsCredits(access.code === "VIRAL_SCAN_CREDITS_REQUIRED");
      setScanAccess(access);
      return access;
    } catch (error) {
      const blocked = {
        checking: false,
        allowed: false,
        code: "VIRAL_SCAN_PREFLIGHT_FAILED",
        message: `${error.message || "Access check failed"}. Nothing was uploaded. Try again.`,
        requiredCredits: CLIP_SCAN_CREDIT_COST,
        balance: null,
        topUpsAllowed: false,
      };
      setNeedsCredits(false);
      setScanAccess(blocked);
      return blocked;
    }
  }, []);

  useEffect(() => {
    void trackClipWorkflowEvent("scanner_opened", {
      scanSessionId: scanSessionIdRef.current,
      sourceType: getScannerSourceType(file),
    });

    sourceFingerprintRef.current = buildSourceFingerprint(file);
    setCachedResultsReady(false);
    setCachedScanMeta(null);
    setResults([]);
    setSelectedClip(null);
    setPreviewClip(null);
    setPreviewSoundOn(false);
    setStatusMessage("");
    setScanPhase("idle");
    setLearningMeta(null);

    if (file) {
      const activeVideo = videoRef.current;
      if (activeVideo && previewStopHandlerRef.current) {
        activeVideo.removeEventListener("timeupdate", previewStopHandlerRef.current);
        previewStopHandlerRef.current = null;
      }

      const remoteUrl = getRemoteSourceUrl(file);
      if (remoteUrl) {
        setVideoSrc(remoteUrl);
      } else {
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [file]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    applySafeMediaSource(video, videoSrc);
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || !isScanning || selectedClip || previewClip) return;

    const startAmbientPlayback = () => {
      video.muted = true;
      video.playsInline = true;
      const playback = video.play();
      if (typeof playback?.catch === "function") {
        playback.catch(() => {});
      }
    };

    const keepVideoMoving = () => {
      const duration = Number(video.duration || 0);
      if (duration > 0 && video.currentTime >= duration - 0.12) {
        video.currentTime = 0;
      }
    };

    startAmbientPlayback();
    video.addEventListener("loadedmetadata", startAmbientPlayback);
    video.addEventListener("canplay", startAmbientPlayback);
    video.addEventListener("timeupdate", keepVideoMoving);

    return () => {
      video.removeEventListener("loadedmetadata", startAmbientPlayback);
      video.removeEventListener("canplay", startAmbientPlayback);
      video.removeEventListener("timeupdate", keepVideoMoving);
      if (!selectedClip && !previewClip) {
        video.pause();
      }
    };
  }, [videoSrc, isScanning, selectedClip, previewClip]);

  useEffect(() => {
    const loadCachedScan = async () => {
      try {
        const user = auth.currentUser;
        const sourceFingerprints = getSourceFingerprints(file);
        if (!user || !sourceFingerprints.length) return;
        setCacheLoadPending(true);

        const token = await user.getIdToken();
        let cache = null;
        let matchedFingerprint = "";

        for (const sourceFingerprint of sourceFingerprints) {
          const response = await fetch(
            `${API_ENDPOINTS.ANALYTICS_CLIP_SCANNER_CACHE}?sourceFingerprint=${encodeURIComponent(sourceFingerprint)}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include",
            }
          );

          if (!response.ok) continue;

          const data = await response.json();
          const candidateCache = data?.cache;
          if (
            candidateCache &&
            Array.isArray(candidateCache.results) &&
            candidateCache.results.length &&
            Number(candidateCache.expiresAt || 0) > Date.now()
          ) {
            cache = candidateCache;
            matchedFingerprint = sourceFingerprint;
            break;
          }
        }

        if (!cache) return;

        const hydratedResults = applyGuidanceToScenes(cache.results);
        const rankedCachedResults = [...hydratedResults].sort(
          (left, right) => right.score - left.score || right.backendScore - left.backendScore
        );
        const bestCachedClip = rankedCachedResults[0] || null;

        setResults(hydratedResults);
        setSelectedClip(bestCachedClip);
        setCachedResultsReady(true);
        setCachedScanMeta({
          createdAt: cache.createdAt,
          expiresAt: cache.expiresAt,
          resultCount: cache.resultCount,
          topScore: cache.topScore,
          sourceLabel: cache.sourceLabel,
        });
        setStatusMessage("Loaded saved scan results. Re-scan if you want a fresh read.");

        void trackClipWorkflowEvent("scan_cache_loaded", {
          scanSessionId: scanSessionIdRef.current,
          sourceFingerprint: matchedFingerprint,
          resultCount: hydratedResults.length,
          cacheAgeHours: Math.round((Date.now() - Number(cache.createdAt || Date.now())) / 3600000),
        });
      } catch (_error) {
      } finally {
        setCacheLoadPending(false);
      }
    };

    void loadCachedScan();
  }, [file]);

  useEffect(() => {
    return () => {
      const activeVideo = videoRef.current;
      if (activeVideo && previewStopHandlerRef.current) {
        activeVideo.removeEventListener("timeupdate", previewStopHandlerRef.current);
      }
      previewStopHandlerRef.current = null;
    };
  }, []);

  // Check the plan and editing-credit balance before any source upload begins.
  useEffect(() => {
    void refreshScanAccess();
  }, [refreshScanAccess]);

  // PayPal SDK Loader
  useEffect(() => {
    if (!showCreditShop || paypalLoaded) return;
    const load = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.PAYMENTS_PAYPAL_CONFIG);
        const data = await res.json();
        const clientId = data.clientId || "sb";
        const currency = data.currency || "USD";

        if (document.getElementById("paypal-sdk-viral")) {
          setPaypalLoaded(true);
          return;
        }
        const script = document.createElement("script");
        script.id = "paypal-sdk-viral";
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
        script.async = true;
        script.onload = () => setPaypalLoaded(true);
        document.body.appendChild(script);
      } catch (e) {
        console.warn("Failed to load PayPal SDK:", e);
      }
    };
    load();
  }, [showCreditShop, paypalLoaded]);

  // Render PayPal Buttons
  useEffect(() => {
    if (!paypalLoaded || !selectedPackage || !window.paypal || !paypalButtonsRef.current) return;
    const container = paypalButtonsRef.current;
    container.replaceChildren();

    window.paypal
      .Buttons({
        createOrder: async () => {
          const user = auth.currentUser;
          const token = user ? await user.getIdToken() : null;
          const res = await fetch(
            `${API_BASE_URL.replace(/\/$/, "")}/api/payments/credits/create-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ packageId: selectedPackage.id }),
            }
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Order failed");
          return data.id;
        },
        onApprove: async data => {
          const user = auth.currentUser;
          const token = user ? await user.getIdToken() : null;
          const res = await fetch(
            `${API_BASE_URL.replace(/\/$/, "")}/api/payments/credits/capture-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ orderID: data.orderID, packageId: selectedPackage.id }),
            }
          );
          const details = await res.json();
          if (details.success) {
            const newBal =
              typeof details.balance === "number" ? details.balance : details.newCredits;
            setCreditBalance(newBal);
            setNeedsCredits(false);
            setShowCreditShop(false);
            setStatusMessage("Credits added! You can now scan.");
            void refreshScanAccess();
          }
        },
        onError: err => {
          console.error("PayPal Error", err);
          setStatusMessage("Payment failed. Please try again.");
        },
      })
      .render(container);
  }, [paypalLoaded, selectedPackage, refreshScanAccess]);

  const startScan = async (options = {}) => {
    if (scanInFlightRef.current || isScanning) return;
    setScanError("");
    const forceFresh = Boolean(options.forceFresh);

    if (!forceFresh && cachedResultsReady && results.length) {
      setStatusMessage(
        "Saved clips are already loaded. Use Fresh rescan only if you want to spend credits and analyze again."
      );
      return;
    }

    setStatusMessage("Checking your plan and credits before upload...");
    const access = await refreshScanAccess();
    if (!access.allowed) {
      const isCreditBlock = access.code === "VIRAL_SCAN_CREDITS_REQUIRED";
      setNeedsCredits(isCreditBlock);
      setStatusMessage(access.message);
      void trackClipWorkflowEvent(
        isCreditBlock ? "scan_blocked_insufficient_credits" : "scan_blocked_access",
        {
          scanSessionId: scanSessionIdRef.current,
          code: access.code,
          balance: access.balance,
          requiredCredits: access.requiredCredits,
        }
      );
      return;
    }

    const activeSessionId = createSecureId("scan");
    const scanNonce = forceFresh ? createSecureId("fresh") : "";
    scanInFlightRef.current = true;
    scanSessionIdRef.current = activeSessionId;
    loggedPreviewClipIdsRef.current = new Set();

    setIsScanning(true);
    setScanProgress(0);
    setScanPhase("preparing");
    if (forceFresh) {
      setResults([]);
      setSelectedClip(null);
      setCachedResultsReady(false);
      setCachedScanMeta(null);
    }
    setStatusMessage("Preparing video for AI analysis...");

    void trackClipWorkflowEvent("scan_started", {
      scanSessionId: activeSessionId,
      sourceType: getScannerSourceType(file),
    });

    let scanSucceeded = false;

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in.");
      const token = await user.getIdToken();

      let fileUrl = "";
      const sourceFingerprints = getSourceFingerprints(file);

      setScanPhase("waking");
      setStatusMessage("Preparing the secure AI analysis service...");
      const workerHealth = await fetch(API_ENDPOINTS.MEDIA_WORKER_HEALTH, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!workerHealth.ok) {
        const healthPayload = await workerHealth.json().catch(() => ({}));
        throw new Error(
          healthPayload.message ||
            "The AI worker could not be reached. Please try the scan again. Your video was not uploaded and no credits were used."
        );
      }

      // 1. Upload local videos to an authenticated, user-owned temporary path.
      let sourceStoragePath = null;
      if (file instanceof File || file instanceof Blob) {
        setScanPhase("uploading");
        setStatusMessage("Securely uploading your video to AutoPromote...");
        setScanProgress(5);

        try {
          const uploadResult = await uploadTemporaryVideoSource({
            file,
            purpose: "viral_scan",
            onProgress: (bytesTransferred, totalBytes) => {
              const ratio = totalBytes > 0 ? bytesTransferred / totalBytes : 0;
              setScanProgress(Math.max(5, Math.min(45, 5 + ratio * 40)));
              setStatusMessage(
                `Secure upload ${Math.round(ratio * 100)}% complete. AI analysis has not started yet.`
              );
            },
          });
          if (!uploadResult?.storagePath) {
            throw new Error("Secure upload did not return a storage path");
          }
          sourceStoragePath = uploadResult.storagePath;
          setStatusMessage(
            `Secure upload complete (${(uploadResult.size / (1024 * 1024)).toFixed(1)} MB). Starting AI analysis...`
          );
          setScanProgress(50);
        } catch (uploadError) {
          throw new Error(
            `Secure video upload failed: ${uploadError.message}. Nothing was sent to the AI worker and no credits were used.`
          );
        }
      } else if (getRemoteSourceUrl(file)) {
        fileUrl = getRemoteSourceUrl(file);
        setScanProgress(50);
      }

      // 2. The authenticated backend verifies ownership, creates a short-lived
      // worker URL, charges credits, and waits for real analysis results.
      setScanPhase("analyzing");
      setStatusMessage(
        "AI analysis is running. Verified clip scores will appear only when it finishes."
      );

      const response = await fetch(`${API_BASE_URL}/api/media/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileUrl: fileUrl || "",
          sourceStoragePath,
          renderJobId: getSourceRenderJobId(file) || null,
          forceFresh,
          scanNonce,
        }),
      });

      if (response.status === 403 || response.status === 402) {
        const blockPayload = await response.json().catch(() => ({}));
        const blockCode = blockPayload.code || "VIRAL_SCAN_CREDITS_REQUIRED";
        const isCreditBlock = blockCode === "VIRAL_SCAN_CREDITS_REQUIRED";
        void trackClipWorkflowEvent("scan_blocked_insufficient_credits", {
          scanSessionId: activeSessionId,
          code: blockCode,
        });
        setNeedsCredits(isCreditBlock);
        setScanAccess(current => ({
          ...current,
          checking: false,
          allowed: false,
          code: blockCode,
          message:
            blockPayload.message ||
            (isCreditBlock
              ? "Not enough credits to scan. Nothing else was processed."
              : "Your current plan does not include Find Viral Clips."),
          balance: blockPayload.balance ?? current.balance,
          requiredCredits:
            blockPayload.requiredCredits || blockPayload.required || CLIP_SCAN_CREDIT_COST,
        }));
        setStatusMessage(
          blockPayload.message ||
            (isCreditBlock
              ? "Not enough credits to scan."
              : "Your current plan does not include Find Viral Clips.")
        );
        setIsScanning(false);
        setScanProgress(0);
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        let errorPayload = null;
        try {
          errorPayload = JSON.parse(errText);
        } catch (_) {}
        const refundNotice = errorPayload?.creditsRefunded
          ? " Your scan credits were automatically refunded."
          : "";
        const errorDetail =
          errorPayload?.details || errorPayload?.message || errText || "Analysis failed";
        throw new Error(`Analysis Error: ${response.status} ${errorDetail}.${refundNotice}`);
      }

      const data = await response.json();
      scanSucceeded = true;
      setLearningMeta(data.learning || null);

      if (data.remainingCredits !== undefined) {
        setCreditBalance(data.remainingCredits);
      }

      const validScenes = applyGuidanceToScenes(data.scenes || []);

      if (validScenes.length === 0) {
        setStatusMessage("No specific viral moments found.");
        // Fallback demo clip if empty?
      } else {
        setStatusMessage("Analysis Complete.");
      }

      const rankedScenes = [...validScenes].sort(
        (left, right) => right.score - left.score || right.backendScore - left.backendScore
      );
      setResults(validScenes);
      setCachedResultsReady(true);
      setCachedScanMeta({
        createdAt: Date.now(),
        expiresAt: Date.now() + CLIP_SCANNER_CACHE_TTL_MS,
        resultCount: validScenes.length,
        topScore: rankedScenes[0]?.score ?? 0,
        sourceLabel: getSourceLabel(file),
      });

      await Promise.all(
        sourceFingerprints.map(sourceFingerprint =>
          saveClipScannerCache({
            token,
            sourceFingerprint,
            sourceLabel: getSourceLabel(file),
            results: validScenes,
          }).catch(() => {})
        )
      );

      void trackClipWorkflowEvent("scan_completed", {
        scanSessionId: activeSessionId,
        resultCount: validScenes.length,
        topScore: rankedScenes[0]?.score ?? 0,
        backendTopScore: rankedScenes[0]?.backendScore ?? 0,
        learningStatus: data.learning?.status || "warming_up",
        learningSamples: Number(data.learning?.sampleCount || 0),
      });

      if (rankedScenes.length > 0) {
        setSelectedClip(rankedScenes[0]);
        setTimeout(
          () =>
            handlePreviewClip(rankedScenes[0], { keepSelection: true, source: "auto_top_pick" }),
          0
        );
      }
    } catch (err) {
      console.error("Scan failed:", err);
      void trackClipWorkflowEvent("scan_failed", {
        scanSessionId: activeSessionId,
        message: err?.message || "Unknown scan failure",
      });
      setScanError(err?.message || "The scan could not be started. Please try again.");
      setStatusMessage("Error: " + err.message);
    } finally {
      scanInFlightRef.current = false;
      setIsScanning(false);
      setScanPhase("idle");
      setScanProgress(scanSucceeded ? 100 : 0);
    }
  };

  const handlePreviewClip = (clip, options = {}) => {
    const video = videoRef.current;
    if (!video) return;

    if (clip?.id !== undefined && !loggedPreviewClipIdsRef.current.has(clip.id)) {
      loggedPreviewClipIdsRef.current.add(clip.id);
      void trackClipWorkflowEvent("clip_previewed", {
        scanSessionId: scanSessionIdRef.current,
        clipId: String(clip.id),
        score: Number(clip.score || 0),
        source: options.source || "preview",
      });
    }

    scrollElementIntoView(videoSectionRef.current, {
      behavior: options.instantScroll ? "auto" : "smooth",
      block: "start",
      inline: "nearest",
    });

    if (previewStopHandlerRef.current) {
      video.removeEventListener("timeupdate", previewStopHandlerRef.current);
      previewStopHandlerRef.current = null;
    }

    const audiblePreview = options.audible !== false && options.source !== "auto_top_pick";
    video.currentTime = clip.start;
    video.muted = !audiblePreview;
    video.volume = audiblePreview ? 1 : 0;
    setPreviewSoundOn(audiblePreview);
    void playMediaSafely(video, {
      onUnexpectedError: error => console.warn("Clip preview playback failed", error),
    });
    setPreviewClip(clip);
    setPreviewRelativeTime(0);
    if (!options.keepSelection) {
      setSelectedClip(clip);
    }

    const stopHandler = () => {
      const activeVideo = videoRef.current;
      if (!activeVideo) {
        previewStopHandlerRef.current = null;
        return;
      }

      const relativeTime = Math.max(0, activeVideo.currentTime - Number(clip.start || 0));
      setPreviewRelativeTime(Math.min(relativeTime, Math.max(0, Number(clip.duration || 0))));

      if (activeVideo.currentTime >= clip.end) {
        activeVideo.pause();
        activeVideo.removeEventListener("timeupdate", stopHandler);
        previewStopHandlerRef.current = null;
        setPreviewRelativeTime(Math.max(0, Number(clip.duration || 0)));
      }
    };

    previewStopHandlerRef.current = stopHandler;
    video.addEventListener("timeupdate", stopHandler);
  };

  const formatTime = seconds => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? "0" + sec : sec}`;
  };

  const rankedResults = [...results].sort(
    (left, right) => right.score - left.score || right.backendScore - left.backendScore
  );
  const bestClipId = rankedResults[0]?.id ?? null;
  const topPickIds = new Set(rankedResults.slice(0, 2).map(clip => clip.id));
  const activePreviewDuration = Math.max(0, Number((previewClip || selectedClip)?.duration || 0));
  const activePreviewProgress = activePreviewDuration
    ? Math.min(100, (previewRelativeTime / activePreviewDuration) * 100)
    : 0;

  const getSelectedVisualForClip = clip => {
    const clipId = getClipIdentity(clip);
    return selectedVisualByClipId[clipId] || getClipVisualAssets(clip)[0] || null;
  };
  const activePreviewClip = previewClip || selectedClip;
  const activeSelectedVisual = getSelectedVisualForClip(activePreviewClip);

  const handleSelectVisual = (clip, asset) => {
    if (!clip || !asset) return;
    setSelectedVisualByClipId(current => ({
      ...current,
      [getClipIdentity(clip)]: asset,
    }));
  };

  const handleDownloadVisual = async asset => {
    if (!asset?.url) return;
    const safeName =
      normalizePlainText(asset.hookText || asset.label || asset.type || "promo-visual")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "promo-visual";
    try {
      const response = await fetch(asset.url, { mode: "cors" });
      if (!response.ok) throw new Error(`Visual fetch failed with ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeName}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
    } catch (_error) {
      window.open(asset.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleUseClip = (clip, improvementMode = false) => {
    if (!clip) return;
    const selectedVisual = getSelectedVisualForClip(clip);

    void trackClipWorkflowEvent("clip_package_selected", {
      scanSessionId: scanSessionIdRef.current,
      clipId: String(clip.id),
      score: Number(clip.score || 0),
      improveInEditor: improvementMode,
      selectedVisualType: selectedVisual?.type || null,
      rank: rankedResults.findIndex(item => item.id === clip.id) + 1,
    });

    onSelectClip({
      ...clip,
      suggestedHookText: clip.hookText,
      suggestedImprovements: clip.improvements,
      guidedScore: clip.score,
      improveInEditor: improvementMode,
      openStudio: false,
      selectedVisual,
      selectedThumbnailUrl: selectedVisual?.url || clip.thumbnailUrl || null,
      scanSessionId: scanSessionIdRef.current,
    });
  };

  return (
    <div className="viral-scanner-overlay" onClick={onClose}>
      <div className="viral-scanner-modal" onClick={e => e.stopPropagation()}>
        <header className="scanner-header">
          <h3>
            <span style={{ fontSize: "1.5rem" }}>🔥</span> Viral Moment Scanner
          </h3>
          <div className="scanner-header-actions">
            {/* Credit Display */}
            {creditBalance !== null && (
              <button
                type="button"
                className="scanner-credit-pill"
                onClick={() => {
                  if (scanAccess.topUpsAllowed) setShowCreditShop(true);
                }}
                disabled={!scanAccess.topUpsAllowed}
                aria-label={
                  scanAccess.topUpsAllowed
                    ? `${formatBalance(creditBalance)} credits available. Open credit shop`
                    : `${formatBalance(creditBalance)} limited trial credits available`
                }
                title={
                  scanAccess.topUpsAllowed
                    ? "Open credit shop"
                    : "Founding Tester credits are limited and cannot be topped up"
                }
              >
                💎 {formatBalance(creditBalance)} Credits
              </button>
            )}
            <button
              type="button"
              className="scanner-close-btn"
              onClick={onClose}
              aria-label="Close viral moment scanner"
              title="Close scanner"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Credit Shop Modal */}
        {showCreditShop && (
          <section
            className="scanner-credit-shop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scanner-credit-shop-title"
          >
            <div className="scanner-credit-shop-head">
              <div>
                <span>Keep creating</span>
                <h3 id="scanner-credit-shop-title">Get more credits</h3>
              </div>
              <button
                type="button"
                className="scanner-credit-shop-close"
                onClick={() => setShowCreditShop(false)}
                aria-label="Close credit shop"
              >
                ✕
              </button>
            </div>
            <p className="scanner-credit-shop-copy">
              Find Viral Clips costs <strong>{CLIP_SCAN_CREDIT_COST} credits</strong> per scan.
              Rendering a chosen clip uses 5 credits.
            </p>

            <div className="scanner-credit-package-grid">
              {CREDIT_PACKAGES.map(pkg => (
                <button
                  type="button"
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`scanner-credit-package ${selectedPackage?.id === pkg.id ? "is-selected" : ""}`}
                  aria-pressed={selectedPackage?.id === pkg.id}
                >
                  <strong>{pkg.name}</strong>
                  <span>
                    {pkg.credits} credits • ${pkg.price}
                  </span>
                </button>
              ))}
            </div>
            <div ref={paypalButtonsRef} className="scanner-paypal-slot" />
          </section>
        )}

        <div className="scanner-body">
          <div ref={videoSectionRef} className="scanner-video-column">
            {videoSrc ? (
              <div className="scanner-video-frame">
                <video ref={videoRef} controls={!selectedClip} />
                {activeSelectedVisual?.url ? (
                  <div className="scanner-selected-visual-preview">
                    <div>
                      <span>Selected thumbnail/poster</span>
                      <strong>
                        {activeSelectedVisual.hookText ||
                          activeSelectedVisual.label ||
                          "Promo visual"}
                      </strong>
                      <div className="scanner-visual-copy-meta">
                        <span
                          className={`scanner-copy-source-pill ${getVisualCopySourceMeta(activeSelectedVisual).className}`}
                        >
                          {getVisualCopySourceMeta(activeSelectedVisual).label}
                        </span>
                      </div>
                      {getVisualWhyText(activeSelectedVisual) ? (
                        <p>{getVisualWhyText(activeSelectedVisual)}</p>
                      ) : null}
                    </div>
                    <SafeImage
                      src={activeSelectedVisual.url}
                      alt="Selected thumbnail/poster preview"
                    />
                  </div>
                ) : null}
                {isScanning ? (
                  <div
                    className="scanner-processing-showcase"
                    data-testid="scanner-processing-visuals"
                  >
                    <div className="scanner-processing-live-pill">
                      {scanPhase === "uploading" ? "SECURE UPLOAD" : "VERIFIED ANALYSIS"}
                    </div>
                    <div className="scanner-processing-hero-copy">
                      <strong>
                        {scanPhase === "uploading"
                          ? "Securely uploading your video..."
                          : scanPhase === "analyzing"
                            ? "AI analysis is running..."
                            : "Preparing your scan..."}
                      </strong>
                      <span>
                        {scanPhase === "uploading"
                          ? "Your file is going to your private AutoPromote temporary storage. It is not being sent directly from this browser to the AI worker."
                          : "No clip names, scores, or detected moments are shown until the worker returns real analysis results."}
                      </span>
                    </div>
                    <div className="scanner-processing-timeline">
                      <div className="scanner-processing-timeline-head">
                        <span>{statusMessage}</span>
                        <strong>
                          {scanPhase === "uploading"
                            ? `${Math.round(Math.max(0, (scanProgress - 5) / 0.4))}% uploaded`
                            : "Working"}
                        </strong>
                      </div>
                      <div className="scanner-processing-track">
                        <span
                          className="scanner-processing-track-progress"
                          style={{
                            width:
                              scanPhase === "uploading"
                                ? `${Math.max(2, Math.min(100, (scanProgress - 5) / 0.4))}%`
                                : "100%",
                          }}
                        />
                      </div>
                    </div>
                    <div className="scanner-processing-insight">
                      <strong>🔒 Private temporary source</strong>
                      <span>
                        AutoPromote verifies ownership before the worker receives a short-lived read
                        link. The temporary source is deleted after processing.
                      </span>
                    </div>
                  </div>
                ) : null}
                {selectedClip ? (
                  <div className="scanner-clip-preview-controls">
                    <div>
                      <strong>
                        Previewing clip only: {formatTime(selectedClip.start)} -{" "}
                        {formatTime(selectedClip.end)}
                      </strong>
                      <span>
                        {formatTime(previewRelativeTime)} / {formatTime(activePreviewDuration)}
                      </span>
                    </div>
                    <div className="scanner-clip-preview-bar">
                      <span style={{ width: `${activePreviewProgress}%` }} />
                    </div>
                    <div className="scanner-clip-preview-actions">
                      <button
                        type="button"
                        onClick={() =>
                          handlePreviewClip(selectedClip, { keepSelection: true, audible: true })
                        }
                      >
                        Play selected clip with sound
                      </button>
                      <button
                        type="button"
                        aria-pressed={previewSoundOn}
                        onClick={() => {
                          const video = videoRef.current;
                          if (!video) return;
                          const nextSoundOn = !previewSoundOn;
                          video.muted = !nextSoundOn;
                          video.volume = nextSoundOn ? 1 : 0;
                          setPreviewSoundOn(nextSoundOn);
                          if (video.paused) {
                            void playMediaSafely(video, {
                              onUnexpectedError: error =>
                                console.warn("Clip preview playback failed", error),
                            });
                          }
                        }}
                      >
                        {previewSoundOn ? "🔊 Sound on" : "🔇 Turn sound on"}
                      </button>
                    </div>
                    <small>
                      These are detected moments from your source video. Exported clips are created
                      after you choose “Edit this clip”.
                    </small>
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ color: "#fff" }}>No video loaded</div>
            )}

            {/* Live scan status bar */}
            {isScanning && (
              <div className="scanner-live-bar">
                <div className="scanner-live-dot" />
                <span className="scanner-live-text">
                  {statusMessage || "Preparing secure analysis..."}
                </span>
                <span
                  className="scanner-live-text"
                  style={{ color: "#93c5fd", fontSize: "0.7rem" }}
                >
                  {scanPhase === "uploading" ? "Encrypted upload" : "No estimated results"}
                </span>
              </div>
            )}
          </div>

          <aside className="scanner-sidebar">
            <div className="scanner-controls">
              {!isScanning && results.length === 0 ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: "#cbd5e1", marginBottom: "15px" }}>
                    {cacheLoadPending
                      ? "Checking whether this video already has saved viral clips..."
                      : "Let AutoPromote rank the moments most likely to earn the next watch, then move the winner into Studio."}
                  </p>

                  {scanAccess.checking ? (
                    <button className="scan-btn" type="button" disabled aria-label="Start AI Scan">
                      Checking plan and credits...
                    </button>
                  ) : !scanAccess.allowed ? (
                    <div
                      className="scanner-access-block"
                      role="alert"
                      data-testid="scanner-access-block"
                    >
                      <p
                        style={{
                          color: "#fca5a5",
                          fontWeight: "bold",
                          fontSize: "0.9rem",
                          marginBottom: "8px",
                        }}
                      >
                        {scanAccess.code === "VIRAL_SCAN_PLAN_REQUIRED"
                          ? "Your plan does not include Find Viral Clips."
                          : scanAccess.code === "VIRAL_SCAN_CREDITS_REQUIRED"
                            ? `This scan needs ${scanAccess.requiredCredits} credits. You have ${formatBalance(scanAccess.balance)}.`
                            : "We could not verify access to Find Viral Clips."}
                      </p>
                      <p className="scanner-access-message">{scanAccess.message}</p>
                      <p className="scanner-no-upload-note">Your video has not been uploaded.</p>
                      {scanAccess.code === "VIRAL_SCAN_CREDITS_REQUIRED" &&
                      scanAccess.topUpsAllowed ? (
                        <button
                          className="scan-btn"
                          type="button"
                          onClick={() => setShowCreditShop(true)}
                          style={{ background: "#f59e0b" }}
                        >
                          Buy Credits
                        </button>
                      ) : (scanAccess.code === "VIRAL_SCAN_PLAN_REQUIRED" ||
                          scanAccess.code === "VIRAL_SCAN_CREDITS_REQUIRED") &&
                        onUpgrade ? (
                        <button className="scan-btn" type="button" onClick={onUpgrade}>
                          {scanAccess.code === "VIRAL_SCAN_CREDITS_REQUIRED"
                            ? "Trial Allowance Used — View Plans"
                            : "View Plans"}
                        </button>
                      ) : (
                        <button className="scan-btn" type="button" onClick={refreshScanAccess}>
                          Check Again
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {scanError ? (
                        <div
                          className="scanner-access-block scanner-scan-error"
                          role="alert"
                          data-testid="scanner-scan-error"
                        >
                          <p className="scanner-access-message">{scanError}</p>
                        </div>
                      ) : null}
                      <button
                        className="scan-btn"
                        type="button"
                        onClick={() => startScan()}
                        disabled={cacheLoadPending}
                      >
                        {scanError ? "Try AI Scan Again" : "Start AI Scan"}{" "}
                        <span style={{ fontSize: "0.8em", opacity: 0.8, marginLeft: "5px" }}>
                          ({CLIP_SCAN_CREDIT_COST} 💎)
                        </span>
                      </button>
                    </>
                  )}
                </div>
              ) : isScanning ? (
                <div className="scanner-processing-dashboard">
                  <div className="scanner-processing-dashboard-head">
                    <div>
                      <span className="scanner-processing-kicker">Viral Moment Scanner</span>
                      <h4>
                        {scanPhase === "uploading"
                          ? "Secure upload in progress"
                          : scanPhase === "analyzing"
                            ? "Verified AI analysis in progress"
                            : "Preparing secure analysis"}
                      </h4>
                      <p>{statusMessage}</p>
                    </div>
                    <div
                      className="scanner-processing-ring"
                      style={{
                        "--scanner-progress": `${scanPhase === "uploading" ? Math.max(0, (scanProgress - 5) / 0.4) : 100}`,
                      }}
                    >
                      <div className="scanner-processing-ring-core">
                        <strong>
                          {scanPhase === "uploading"
                            ? `${Math.round(Math.max(0, (scanProgress - 5) / 0.4))}%`
                            : "AI"}
                        </strong>
                        <span>{scanPhase === "uploading" ? "uploaded" : "working"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="scanner-processing-note">
                    Clip names, timestamps and scores will appear only after the backend returns
                    verified results.
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <h4 style={{ color: "#f8fafc", margin: "0 0 5px 0" }}>
                    AutoPromote Scan Complete
                  </h4>
                  <p style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>
                    Found {results.length} ranked moments. Preview the best candidate, then open it
                    in Studio.
                  </p>
                  {learningMeta ? (
                    <p style={{ color: "#a7f3d0", fontSize: "0.8rem", marginTop: "6px" }}>
                      {learningMeta.status === "active"
                        ? `Personalized from ${learningMeta.sampleCount} measured clip outcomes.`
                        : `Outcome learning is warming up (${learningMeta.sampleCount || 0}/3 measured clips).`}
                    </p>
                  ) : null}
                  {cachedScanMeta?.createdAt ? (
                    <p style={{ color: "#93c5fd", fontSize: "0.8rem", marginTop: "6px" }}>
                      Saved scan from {new Date(cachedScanMeta.createdAt).toLocaleString()}{" "}
                      available for 3 days.
                    </p>
                  ) : null}
                  <div className="scanner-rescan-actions">
                    <button
                      className="scan-btn"
                      onClick={() => {
                        setStatusMessage(
                          "These saved clips are ready. Pick one, preview it, or open it in Studio."
                        );
                      }}
                      style={{
                        marginTop: "10px",
                        fontSize: "0.9rem",
                        padding: "8px 16px",
                        background: "#0f766e",
                      }}
                    >
                      Keep saved clips
                    </button>
                    <button
                      className="scan-btn"
                      onClick={() => startScan({ forceFresh: true })}
                      disabled={isScanning}
                      style={{
                        marginTop: "10px",
                        fontSize: "0.9rem",
                        padding: "8px 16px",
                        background: "#334155",
                      }}
                    >
                      Fresh rescan
                    </button>
                  </div>
                </div>
              )}
            </div>

            {selectedClip ? (
              <div
                className={`scanner-guidance-card ${selectedClip.id === bestClipId ? "is-best" : ""}`}
                data-testid="scanner-guidance-card"
              >
                <div className="scanner-guidance-head">
                  <div>
                    <span className="scanner-guidance-kicker">
                      {selectedClip.id === bestClipId
                        ? "BEST CLIP"
                        : topPickIds.has(selectedClip.id)
                          ? "TOP PICK"
                          : "Selected clip"}
                    </span>
                    <div className="scanner-score-line">
                      <h4>🔥 Viral Score: {selectedClip.score}</h4>
                      <span>{selectedClip.scoreConfidenceLabel}</span>
                    </div>
                  </div>
                  <span className="scanner-guidance-rank-pill">
                    #{rankedResults.findIndex(clip => clip.id === selectedClip.id) + 1}
                  </span>
                </div>
                <p className="scanner-guidance-summary">
                  {selectedClip.id === bestClipId
                    ? selectedClip.reasons[0] ||
                      "This is AutoPromote's strongest candidate from the scan."
                    : selectedClip.reasons[0] ||
                      "This moment is strong enough to shape inside Studio."}
                </p>
                <div className="scanner-guidance-timing">
                  <span>Start: {Number(selectedClip.start || 0).toFixed(1)}s</span>
                  <span>End: {Number(selectedClip.end || 0).toFixed(1)}s</span>
                  <span>{Number(selectedClip.duration || 0).toFixed(1)}s</span>
                </div>
                <div className="scanner-tag-row">
                  {selectedClip.categories.map((category, index) => (
                    <span
                      key={`${selectedClip.id}-${category.label}-${index}`}
                      className="scanner-tag-pill"
                    >
                      {category.icon} {category.label}
                    </span>
                  ))}
                </div>
                <details className="scanner-score-details">
                  <summary>Why this clip?</summary>
                  <div className="scanner-reasons-list">
                    {selectedClip.reasons.slice(0, 4).map((reason, index) => (
                      <div key={`${selectedClip.id}-${index}`} className="scanner-reason-item">
                        <span aria-hidden="true">✓</span> {reason}
                      </div>
                    ))}
                    <div className="scanner-score-evidence" title={selectedClip.scoreMeaning}>
                      <span>Evidence confidence</span>
                      <strong>
                        {selectedClip.scoreConfidence > 0
                          ? `${Math.round(selectedClip.scoreConfidence)}%`
                          : "Building"}
                      </strong>
                    </div>
                    {selectedClip.learningApplied ? (
                      <p className="scanner-learning-note">
                        Personalized {Number(selectedClip.learnedAdjustment || 0) >= 0 ? "+" : ""}
                        {Number(selectedClip.learnedAdjustment || 0).toFixed(1)} from{" "}
                        {selectedClip.learningProfileSamples || 0} measured outcomes
                      </p>
                    ) : null}
                  </div>
                </details>
                <div className="scanner-guidance-actions">
                  <button
                    className="scanner-action-btn scanner-action-btn-primary"
                    onClick={() => handlePreviewClip(selectedClip, { keepSelection: true })}
                  >
                    Preview clip
                  </button>
                  <button
                    className="scanner-action-btn scanner-action-btn-primary"
                    onClick={() => handleUseClip(selectedClip)}
                  >
                    Edit this clip
                  </button>
                </div>
                {selectedClip.score < 60 ? (
                  <div className="scanner-fix-card">
                    <strong>This clip can perform better</strong>
                    {selectedClip.improvements.map((item, index) => (
                      <div key={`${selectedClip.id}-fix-${index}`} className="scanner-fix-item">
                        • {item}
                      </div>
                    ))}
                    <button
                      className="scanner-action-btn scanner-action-btn-primary"
                      onClick={() => handleUseClip(selectedClip, true)}
                    >
                      Use with fixes
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="results-list">
              {isScanning ? (
                <div className="scanner-live-moments-panel">
                  <div className="scanner-live-moments-head">
                    <div>
                      <span>Verified results pending</span>
                      <strong>No moments have been claimed yet</strong>
                    </div>
                    <small>{scanPhase === "uploading" ? "Secure upload" : "AI analysis"}</small>
                  </div>
                  <div className="scanner-live-moments-footnote">
                    AutoPromote is waiting for real worker output. Nothing displayed here is a
                    simulated detection or score.
                  </div>
                </div>
              ) : null}
              {results.map(clip => (
                <div
                  key={clip.id}
                  data-testid={`scanner-result-${clip.id}`}
                  className={`result-card ${selectedClip?.id === clip.id ? "active" : ""} ${clip.id === bestClipId ? "best-pick" : ""} ${topPickIds.has(clip.id) && clip.id !== bestClipId ? "runner-up" : ""}`}
                  onClick={() => handlePreviewClip(clip)}
                >
                  <ClipResultThumbnail
                    videoSrc={videoSrc}
                    clip={clip}
                    isActive={selectedClip?.id === clip.id}
                  />
                  <div className="result-header">
                    <div>
                      <div className="result-badge-row">
                        <span className="result-time">
                          {formatTime(clip.start)} - {formatTime(clip.end)}
                        </span>
                        {clip.id === bestClipId ? (
                          <span className="scanner-priority-pill best">BEST CLIP</span>
                        ) : null}
                        {topPickIds.has(clip.id) && clip.id !== bestClipId ? (
                          <span className="scanner-priority-pill">TOP PICK</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="viral-score">🔥 {clip.score}</span>
                  </div>
                  <p className="result-reason">{clip.reason}</p>
                  <div className="scanner-tag-row compact">
                    {clip.categories.map((category, index) => (
                      <span key={`${clip.id}-tag-${index}`} className="scanner-tag-pill compact">
                        {category.icon} {category.label}
                      </span>
                    ))}
                  </div>
                  <div className="scanner-mini-reasons">
                    {clip.reasons.slice(0, 3).map((reason, index) => (
                      <div key={`${clip.id}-reason-${index}`} className="scanner-mini-reason-item">
                        ✔ {reason}
                      </div>
                    ))}
                  </div>
                  {getClipVisualAssets(clip).length > 0 ? (
                    <div className="scanner-visual-pack">
                      <div className="scanner-visual-pack-head">
                        <span>Choose package visual</span>
                        <small>{getClipVisualAssets(clip).length} visuals</small>
                      </div>
                      {getSelectedVisualForClip(clip)?.url ? (
                        <div className="scanner-visual-pack-summary">
                          <span
                            className={`scanner-copy-source-pill ${getVisualCopySourceMeta(getSelectedVisualForClip(clip)).className}`}
                          >
                            {getVisualCopySourceMeta(getSelectedVisualForClip(clip)).label}
                          </span>
                          {getVisualWhyText(getSelectedVisualForClip(clip)) ? (
                            <p>{getVisualWhyText(getSelectedVisualForClip(clip))}</p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="scanner-visual-strip">
                        {getClipVisualAssets(clip)
                          .slice(0, 4)
                          .map(asset => {
                            const isSelected = getSelectedVisualForClip(clip)?.url === asset.url;
                            const copyMeta = getVisualCopySourceMeta(asset);
                            return (
                              <button
                                key={asset.id || asset.url}
                                type="button"
                                className={`scanner-visual-option ${isSelected ? "is-selected" : ""}`}
                                onClick={event => {
                                  event.stopPropagation();
                                  handleSelectVisual(clip, asset);
                                }}
                                title={asset.label || "Generated visual"}
                              >
                                <SafeImage
                                  src={asset.url}
                                  alt={asset.label || "Generated visual"}
                                />
                                <span
                                  className={`scanner-visual-option-pill ${copyMeta.className}`}
                                >
                                  {copyMeta.label}
                                </span>
                                <span className="scanner-visual-option-label">
                                  {isSelected ? "Selected" : asset.type || "Visual"}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                      {getSelectedVisualForClip(clip)?.url ? (
                        <div className="scanner-visual-actions">
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              handleDownloadVisual(getSelectedVisualForClip(clip));
                            }}
                          >
                            Download selected visual
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="scanner-card-actions">
                    <button
                      className="scanner-card-btn"
                      onClick={e => {
                        e.stopPropagation();
                        handlePreviewClip(clip, { keepSelection: true });
                      }}
                    >
                      Preview
                    </button>
                    <button
                      className="scanner-card-btn scanner-card-btn-primary"
                      onClick={e => {
                        e.stopPropagation();
                        handleUseClip(clip);
                      }}
                    >
                      Use package
                    </button>
                  </div>
                  {clip.score < 60 ? (
                    <div className="scanner-inline-warning">⚠ This clip can perform better</div>
                  ) : null}
                </div>
              ))}
              {results.length === 0 && !isScanning && scanAccess.allowed && !needsCredits && (
                <div className="empty-state">
                  Run an AutoPromote scan to surface the moments most worth editing.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ViralScanner;

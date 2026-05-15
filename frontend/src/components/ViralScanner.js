import React, { useState, useRef, useEffect } from "react";
import "./ViralScanner.css";
import { storage, auth } from "../firebaseClient";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { applySafeMediaSource, createSecureId } from "../utils/security";
import { trackClipWorkflowEvent } from "../utils/clipWorkflowAnalytics";

const CLIP_SCANNER_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CLIP_SCANNER_TEMP_SCAN_TTL_MS = 20 * 60 * 1000;
const CLIP_SCANNER_UPLOAD_CACHE_TTL_MS = CLIP_SCANNER_TEMP_SCAN_TTL_MS;
const CLIP_SCANNER_UPLOAD_CACHE_PREFIX = "autopromote:viralScannerUpload:";
const CONTROL_TEXT_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  "g"
);

const normalizePlainText = value =>
  String(value ?? "")
    .replace(CONTROL_TEXT_PATTERN, " ")
    .replace(/[<>]/g, "")
    .trim();

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
    pattern: /(choir|worship|praise|gospel|performance|harmony|stage|live moment|live performance)/i,
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
  if (musicLike) reasons.push("Performance energy carries the opening without needing a speech hook");
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
  if (!isVisualOnly && !musicLike && (!signals.speech || !signals.hook)) improvements.push("Cut the first 2 seconds");
  if (!signals.hook) improvements.push("Add hook");
  if (!signals.speech) {
    improvements.push(
      isVisualOnly || musicLike ? "Add a visual hook/title" : "Add captions"
    );
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

  if (typeof file === "string") {
    try {
      const parsedUrl = new URL(file, window.location.origin);
      return `remote:${parsedUrl.origin}${parsedUrl.pathname}`.slice(0, 180);
    } catch (_error) {
      return `remote:${String(file).split("?")[0]}`.slice(0, 180);
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

  if (typeof file === "string") {
    try {
      const parsedUrl = new URL(file, window.location.origin);
      return `remote:${parsedUrl.origin}${parsedUrl.pathname}`.slice(0, 180);
    } catch (_error) {
      return `remote:${String(file).split("?")[0]}`.slice(0, 180);
    }
  }

  const name = normalizePlainText(file.name || "scan.mp4");
  const size = Number(file.size || 0);
  const type = normalizePlainText(file.type || "application/octet-stream");
  return `local-stable:${name}:${size}:${type}`.slice(0, 180);
};

const getSourceFingerprints = file =>
  Array.from(new Set([buildSourceFingerprint(file), buildStableSourceFingerprint(file)].filter(Boolean)));

const getSourceLabel = file => {
  if (!file) return "Untitled source";
  if (typeof file === "string") {
    const cleaned = String(file).split("?")[0];
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

const getUploadCacheKey = fingerprint =>
  `${CLIP_SCANNER_UPLOAD_CACHE_PREFIX}${encodeURIComponent(fingerprint || "unknown")}`;

const readCachedUploadUrl = fingerprint => {
  if (!fingerprint) return "";
  try {
    const rawValue = window.localStorage.getItem(getUploadCacheKey(fingerprint));
    if (!rawValue) return "";
    const parsedValue = JSON.parse(rawValue);
    if (Number(parsedValue.expiresAt || 0) <= Date.now()) {
      window.localStorage.removeItem(getUploadCacheKey(fingerprint));
      return "";
    }
    return typeof parsedValue.url === "string" ? parsedValue.url : "";
  } catch (_error) {
    return "";
  }
};

const writeCachedUploadUrl = (fingerprints, url) => {
  if (!url || !Array.isArray(fingerprints)) return;
  try {
    const payload = JSON.stringify({
      url,
      createdAt: Date.now(),
      expiresAt: Date.now() + CLIP_SCANNER_UPLOAD_CACHE_TTL_MS,
    });
    fingerprints.filter(Boolean).forEach(fingerprint => {
      window.localStorage.setItem(getUploadCacheKey(fingerprint), payload);
    });
  } catch (_error) {}
};

const clearCachedUploadUrls = fingerprints => {
  if (!Array.isArray(fingerprints)) return;
  try {
    fingerprints.filter(Boolean).forEach(fingerprint => {
      window.localStorage.removeItem(getUploadCacheKey(fingerprint));
    });
  } catch (_error) {}
};

const ClipResultThumbnail = ({ videoSrc, clip, isActive }) => {
  const previewRef = useRef(null);
  const visualUrl = clip?.thumbnailUrl || getClipVisualAssets(clip)[0]?.url || "";

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !videoSrc || !clip) return;

    const seekToClipStart = () => {
      try {
        video.currentTime = Math.max(0, Number(clip.start || 0));
      } catch (_) {
        // Some remote videos do not allow seeking until more metadata is ready.
      }
    };

    seekToClipStart();
    video.addEventListener("loadedmetadata", seekToClipStart, { once: true });
    video.addEventListener("loadeddata", seekToClipStart, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", seekToClipStart);
      video.removeEventListener("loadeddata", seekToClipStart);
    };
  }, [videoSrc, clip]);

  return (
    <div className={`scanner-clip-thumbnail ${isActive ? "active" : ""}`}>
      {visualUrl ? (
        <img src={visualUrl} alt={clip?.hookText || "Generated clip visual"} />
      ) : videoSrc ? (
        <video ref={previewRef} src={videoSrc} muted playsInline preload="metadata" />
      ) : (
        <span>No preview</span>
      )}
      <div className="scanner-clip-thumbnail-shade" />
      <span className="scanner-clip-thumbnail-score">🔥 {Math.round(Number(clip?.score || 0))}</span>
      <span className="scanner-clip-thumbnail-duration">
        {Math.max(0, Math.round(Number(clip?.duration || 0)))}s
      </span>
    </div>
  );
};

const ViralScanner = ({ file, onSelectClip, onClose }) => {
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
  const [previewRelativeTime, setPreviewRelativeTime] = useState(0);
  const [selectedClip, setSelectedClip] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [videoSrc, setVideoSrc] = useState(null);
  const [cachedScanMeta, setCachedScanMeta] = useState(null);
  const [cachedResultsReady, setCachedResultsReady] = useState(false);
  const [cacheLoadPending, setCacheLoadPending] = useState(false);

  // --- Credit System State ---
  const [creditBalance, setCreditBalance] = useState(null);
  const [needsCredits, setNeedsCredits] = useState(false);
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

  useEffect(() => {
    void trackClipWorkflowEvent("scanner_opened", {
      scanSessionId: scanSessionIdRef.current,
      sourceType: typeof file === "string" ? "remote_url" : "local_file",
    });

    sourceFingerprintRef.current = buildSourceFingerprint(file);
    setCachedResultsReady(false);
    setCachedScanMeta(null);
    setResults([]);
    setSelectedClip(null);
    setPreviewClip(null);
    setStatusMessage("");

    if (file) {
      const activeVideo = videoRef.current;
      if (activeVideo && previewStopHandlerRef.current) {
        activeVideo.removeEventListener("timeupdate", previewStopHandlerRef.current);
        previewStopHandlerRef.current = null;
      }

      if (typeof file === "string") {
        setVideoSrc(file);
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

  // Fetch Credits on Mount
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const r = await fetch(API_ENDPOINTS.CREDITS_BALANCE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const text = await r.text();
          try {
            const data = JSON.parse(text);
            setCreditBalance(data.balance);
          } catch (e) {
            console.warn("Failed to parse credits", e);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch credits", e);
      }
    };
    fetchCredits();
  }, []);

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
          }
        },
        onError: err => {
          console.error("PayPal Error", err);
          setStatusMessage("Payment failed. Please try again.");
        },
      })
      .render(container);
  }, [paypalLoaded, selectedPackage]);

  const startScan = async (options = {}) => {
    if (scanInFlightRef.current || isScanning) return;
    const forceFresh = Boolean(options.forceFresh);

    if (!forceFresh && cachedResultsReady && results.length) {
      setStatusMessage(
        "Saved clips are already loaded. Use Fresh rescan only if you want to spend credits and analyze again."
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
    if (forceFresh) {
      setResults([]);
      setSelectedClip(null);
      setCachedResultsReady(false);
      setCachedScanMeta(null);
    }
    setStatusMessage("Preparing video for AI analysis...");

    void trackClipWorkflowEvent("scan_started", {
      scanSessionId: activeSessionId,
      sourceType: typeof file === "string" ? "remote_url" : "local_file",
    });

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in.");
      const token = await user.getIdToken();

      let fileUrl = "";
      const sourceFingerprints = getSourceFingerprints(file);
      if (forceFresh) {
        clearCachedUploadUrls(sourceFingerprints);
      }

      setStatusMessage("Checking AI worker availability...");
      const workerHealth = await fetch(API_ENDPOINTS.MEDIA_WORKER_HEALTH, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!workerHealth.ok) {
        const healthText = await workerHealth.text().catch(() => "");
        throw new Error(
          `AI worker is offline, so the video was not uploaded. ${healthText || "Try again when the worker is running."}`
        );
      }

      // 1. Upload if necessary
      if (file instanceof File || file instanceof Blob) {
        fileUrl = forceFresh ? "" : sourceFingerprints.map(readCachedUploadUrl).find(Boolean) || "";

        if (fileUrl) {
          setStatusMessage("Reusing the temporary upload for this video. No duplicate storage upload.");
          setScanProgress(50);
        } else {
          setStatusMessage(
            forceFresh
              ? "Uploading a fresh temporary scan copy. This forces a brand-new analysis pass."
              : "Uploading temporary scan copy. AutoPromote marks it for 20-minute cleanup."
          );
          const safeName = normalizePlainText(file.name || "scan.mp4").replace(/[^a-zA-Z0-9._-]+/g, "-");
          const expiresAt = Date.now() + CLIP_SCANNER_TEMP_SCAN_TTL_MS;
          const storagePath = `temp_scans/${user.uid}/${expiresAt}_${Date.now()}_${scanNonce || "scan"}_${safeName}`;
          const storageRef = ref(storage, storagePath);
          const uploadTask = uploadBytesResumable(storageRef, file, {
            customMetadata: {
              temporary: "true",
              feature: "find_viral_clips",
              forceFresh: String(forceFresh),
              scanNonce: scanNonce || "",
              deleteAfter: new Date(expiresAt).toISOString(),
              expiresAt: String(expiresAt),
            },
          });

          await new Promise((resolve, reject) => {
            uploadTask.on(
              "state_changed",
              snapshot => {
                const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setScanProgress(Math.round(prog / 2)); // First 50% is upload
              },
              error => reject(error),
              async () => {
                fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
                if (!forceFresh) {
                  writeCachedUploadUrl(sourceFingerprints, fileUrl);
                }
                resolve();
              }
            );
          });
        }
      } else if (typeof file === "string") {
        fileUrl = file;
        setScanProgress(50);
      }

      // 2. Call Node.js Backend (proxies to Python + Deducts Credits)
      setStatusMessage("AI Agent watching video...");

      const response = await fetch(`${API_BASE_URL}/api/media/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileUrl,
          forceFresh,
          scanNonce,
        }),
      });

      if (response.status === 403 || response.status === 402) {
        void trackClipWorkflowEvent("scan_blocked_insufficient_credits", {
          scanSessionId: activeSessionId,
        });
        setNeedsCredits(true);
        setShowCreditShop(true);
        setStatusMessage("Insufficient credits. Please top up to continue.");
        setIsScanning(false);
        setScanProgress(0);
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Analysis Error: ${response.status} ${errText}`);
      }

      const data = await response.json();

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
      setStatusMessage("Error: " + err.message);
    } finally {
      scanInFlightRef.current = false;
      setIsScanning(false);
      setScanProgress(100);
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

    video.currentTime = clip.start;
    video.play();
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
    const safeName = normalizePlainText(asset.hookText || asset.label || asset.type || "promo-visual")
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Credit Display */}
            {creditBalance !== null && (
              <div
                style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #444",
                  fontSize: "0.9rem",
                  color: "#ffd700",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setShowCreditShop(true)}
              >
                💎 {formatBalance(creditBalance)} Credits
              </div>
            )}
            <button className="scanner-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>

        {/* Credit Shop Modal */}
        {showCreditShop && (
          <div
            style={{
              position: "absolute",
              top: 60,
              left: 20,
              right: 20,
              zIndex: 100,
              background: "#1a1a1a",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #444",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
              <h3 style={{ color: "#fff", margin: 0 }}>Get More Credits</h3>
              <button
                onClick={() => setShowCreditShop(false)}
                style={{
                  background: "none",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  color: "#fff",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Close
              </button>
            </div>
            <p style={{ color: "#ccc", fontSize: "0.9rem", marginBottom: "10px" }}>
              Viral scans cost roughly <strong>20 credits</strong> per video.
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "15px" }}>
              {CREDIT_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  style={{
                    flex: 1,
                    minWidth: "120px",
                    padding: "12px",
                    borderRadius: "10px",
                    border: selectedPackage?.id === pkg.id ? "2px solid #4caf50" : "1px solid #444",
                    background: selectedPackage?.id === pkg.id ? "rgba(76, 175, 80, 0.2)" : "#222",
                    color: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{pkg.name}</div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                    {pkg.credits} credits • ${pkg.price}
                  </div>
                </button>
              ))}
            </div>
            <div ref={paypalButtonsRef} style={{ minHeight: "150px" }} />
          </div>
        )}

        <div className="scanner-body">
          <div ref={videoSectionRef} className="scanner-video-column">
            {videoSrc ? (
              <div className="scanner-video-frame">
                <video ref={videoRef} controls={!selectedClip} style={{ borderRadius: "8px" }} />
                {activeSelectedVisual?.url ? (
                  <div className="scanner-selected-visual-preview">
                    <div>
                      <span>Selected thumbnail/poster</span>
                      <strong>{activeSelectedVisual.hookText || activeSelectedVisual.label || "Promo visual"}</strong>
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
                    <img src={activeSelectedVisual.url} alt="Selected thumbnail/poster preview" />
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
                    <button
                      type="button"
                      onClick={() => handlePreviewClip(selectedClip, { keepSelection: true })}
                    >
                      Play selected clip
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ color: "#fff" }}>No video loaded</div>
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

                  {needsCredits ? (
                    <div>
                      <p
                        style={{
                          color: "#ef4444",
                          fontWeight: "bold",
                          fontSize: "0.9rem",
                          marginBottom: "8px",
                        }}
                      >
                        Not enough credits to scan.
                      </p>
                      <button
                        className="scan-btn"
                        onClick={() => setShowCreditShop(true)}
                        style={{ background: "#f59e0b" }}
                      >
                        Buy Credits
                      </button>
                    </div>
                  ) : (
                    <button className="scan-btn" onClick={() => startScan({ forceFresh: true })} disabled={cacheLoadPending}>
                      Start AI Scan{" "}
                      <span style={{ fontSize: "0.8em", opacity: 0.8, marginLeft: "5px" }}>
                        (20 💎)
                      </span>
                    </button>
                  )}
                </div>
              ) : isScanning ? (
                <div className="scanning-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${scanProgress}%` }}></div>
                  </div>
                  <div className="scanning-text">
                    {statusMessage || `Analyzing frames... ${Math.round(scanProgress)}%`}
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
                        setStatusMessage("These saved clips are ready. Pick one, preview it, or open it in Studio.");
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
                    <h4>🔥 Viral Score: {selectedClip.score}</h4>
                  </div>
                  <span className="scanner-guidance-rank-pill">
                    #{rankedResults.findIndex(clip => clip.id === selectedClip.id) + 1}
                  </span>
                </div>
                <p className="scanner-guidance-summary">
                  {selectedClip.id === bestClipId
                    ? "This is AutoPromote's strongest candidate from the scan."
                    : "This moment is strong enough to shape inside Studio."}
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
                <div className="scanner-reasons-list">
                  <strong>Why this clip</strong>
                  {selectedClip.reasons.slice(0, 4).map((reason, index) => (
                    <div key={`${selectedClip.id}-${index}`} className="scanner-reason-item">
                      ✔ {reason}
                    </div>
                  ))}
                </div>
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
                    Use clip package
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
                              <img src={asset.url} alt={asset.label || "Generated visual"} />
                              <span className={`scanner-visual-option-pill ${copyMeta.className}`}>
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
              {results.length === 0 && !isScanning && !needsCredits && (
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { API_ENDPOINTS } from "../config";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import "./SmartPromoSummaryPanel.css";

const PROMO_DURATIONS = [15, 30, 60];
const STORY_EDIT_DURATIONS = [60, 120, 180, 300];
const PROMO_OUTPUT_MODES = [
  {
    id: "campaign_set",
    label: "4 Promo Clips",
    summary: "Four different short cuts for hook, proof, replay, and close.",
    pill: "Campaign Set",
  },
  {
    id: "story_edit",
    label: "Full Story Edit + Clips",
    summary:
      "One polished 60s-5min story edit from the full video, plus shorter promo clips for posting.",
    pill: "Story Master",
  },
];
const PROMO_STYLES = [
  {
    id: "clean",
    label: "Clean",
    summary: "Readable, polished, and platform-safe for clear promo storytelling.",
  },
  {
    id: "hype",
    label: "Hype",
    summary: "Higher energy structure for punchy social cuts and attention spikes.",
  },
  {
    id: "minimal",
    label: "Minimal",
    summary: "Tight and understated when the footage should do most of the work.",
  },
];
const PROMO_ANGLES = [
  {
    id: "stop_scroll",
    label: "Stop Scroll",
    summary: "Built to interrupt attention fast with punchier openings and sharper social pressure.",
  },
  {
    id: "proof_angle",
    label: "Proof Angle",
    summary: "Leans into receipts, real outcomes, and clips that feel convincing on first watch.",
  },
  {
    id: "problem_solution",
    label: "Problem / Solution",
    summary: "Frames the promo around tension first, then shows the shift or the fix cleanly.",
  },
  {
    id: "emotional_pull",
    label: "Emotional Pull",
    summary: "Lets strong human moments breathe so the clip feels felt, not just watched.",
  },
  {
    id: "authority_burst",
    label: "Authority Burst",
    summary: "Turns the source into fast, confident clips that feel expert and worth trusting.",
  },
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const getSelectedPreset = (items, id) => items.find(item => item.id === id) || items[0];

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

const buildPromoDirectorBrief = ({ durationSeconds, style, angle, outputMode }) => {
  const isStoryEdit = outputMode === "story_edit";
  const durationIntent =
    isStoryEdit
      ? durationSeconds >= 180
        ? "full five-minute story edit"
        : "polished short-form story edit"
      : durationSeconds <= 15
      ? "fastest proof window"
      : durationSeconds >= 60
        ? "deeper demo story"
        : "balanced social pitch";
  const styleIntent = {
    clean: "clean structure, readable captions, and safe brand polish",
    hype: "harder openings, sharper pacing, and more social pressure",
    minimal: "less noise, calmer proof, and cleaner product focus",
  }[style.id] || style.summary;
  const angleIntent = {
    stop_scroll: "open with the most interruptive visual or promise",
    proof_angle: "lead with receipts, outcomes, or believable evidence",
    problem_solution: "show pain first, then make the solution feel obvious",
    emotional_pull: "protect the human moment so the promo feels felt",
    authority_burst: "make the brand or creator feel trusted fast",
  }[angle.id] || angle.summary;

  return {
    title: `${angle.label} · ${durationSeconds}s ${style.label}`,
    summary: `Director is aiming for ${durationIntent}: ${styleIntent}, then ${angleIntent}.`,
    bullets: isStoryEdit
      ? [
          "First output is a full story master, capped at 5 minutes, built from the best chapters.",
          "Extra clips still give the user quick promo options after the full edit.",
          "Audio, speech, and story captions should flow smoothly instead of feeling randomly chopped.",
        ]
      : [
          "Four clips should cover different story chapters, not repeat one highlight.",
          "Captions should explain the moment quickly for silent scrolling.",
          "Each clip should earn a different job: hook, proof, replay, or final push.",
        ],
  };
};

const getFreshAuthToken = async forceRefresh => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Please log in to use Smart Promo Summary.");
  return user.getIdToken(Boolean(forceRefresh));
};

const buildStatusLabel = analysis => {
  const progress = Number(analysis?.progress || 0);
  const status = String(analysis?.status || "").toLowerCase();

  if (status === "queued") return "Queued for promo generation...";
  if (status === "failed") return analysis?.error || "Promo generation failed.";
  if (status === "completed") return "Promo clips are ready.";

  if (progress < 25) return "Analyzing video...";
  if (progress < 50) return "Selecting highlights...";
  if (progress < 75) return "Generating captions...";
  return "Rendering clips...";
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
    campaignRoleLabel: clip.campaignRoleLabel || (clip.storyMaster ? "Story Master" : null),
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
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [styleId, setStyleId] = useState("clean");
  const [promoAngle, setPromoAngle] = useState("stop_scroll");
  const [outputMode, setOutputMode] = useState("campaign_set");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [jobId, setJobId] = useState("");
  const [promoClips, setPromoClips] = useState([]);
  const [analysisDetails, setAnalysisDetails] = useState(null);
  const [errorText, setErrorText] = useState("");
  const [restoringClips, setRestoringClips] = useState(false);
  const [pendingEstimate, setPendingEstimate] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [selectedVisualByClipId, setSelectedVisualByClipId] = useState({});
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
  const activeDurations = outputMode === "story_edit" ? STORY_EDIT_DURATIONS : PROMO_DURATIONS;
  const selectedOutputMode = useMemo(
    () => getSelectedPreset(PROMO_OUTPUT_MODES, outputMode),
    [outputMode]
  );
  const waitEstimate =
    outputMode === "story_edit"
      ? "about 20-40 minutes"
      : durationSeconds <= 15
        ? "about 10-20 minutes"
        : "about 15-30 minutes";
  const selectedStyle = useMemo(() => getSelectedPreset(PROMO_STYLES, styleId), [styleId]);
  const selectedAngle = useMemo(() => getSelectedPreset(PROMO_ANGLES, promoAngle), [promoAngle]);
  const promoDirectorBrief = useMemo(
    () =>
      buildPromoDirectorBrief({
        durationSeconds,
        style: selectedStyle,
        angle: selectedAngle,
        outputMode,
      }),
    [durationSeconds, selectedStyle, selectedAngle, outputMode]
  );

  useEffect(() => {
    const nextDurations = outputMode === "story_edit" ? STORY_EDIT_DURATIONS : PROMO_DURATIONS;
    if (!nextDurations.includes(durationSeconds)) {
      setDurationSeconds(outputMode === "story_edit" ? 120 : 30);
    }
  }, [outputMode, durationSeconds]);

  const sourceSummary = useMemo(() => {
    if (sourceFile?.name) return sourceFile.name;
    if (typeof sourceUrl === "string" && sourceUrl) return "Current editor video";
    return "Current source";
  }, [sourceFile, sourceUrl]);

  const resolveVideoSource = async () => {
    if (sourceFile instanceof File || sourceFile instanceof Blob) {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in to generate promo clips.");
      const token = await user.getIdToken(true);
      const safeName =
        typeof sourceFile.name === "string" && sourceFile.name
          ? sourceFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_")
          : `promo-source-${Date.now()}.mp4`;
      const uploadResult = await uploadSourceFileViaBackend({
        file: sourceFile,
        token,
        mediaType: "video",
        fileName: safeName,
      });
      return {
        videoUrl: uploadResult?.url,
        sourceStoragePath: uploadResult?.storagePath || null,
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
          setStatusText("Restored your available promo clips.");
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
      if (onStatusChange) onStatusChange(nextStatus);

      if (analysis.status === "completed") {
        const clips = normalizePromoAnalysisResults(analysis);
        setPromoClips(clips);
        setAnalysisDetails({
          analysisReused: Boolean(analysis.analysisReused),
          workflowType: analysis.workflowType || null,
          confidenceSummary: analysis.confidenceSummary || null,
        });
        if (analysis.analysisReused) {
          setStatusText("Promo clips are ready. Reused saved analysis.");
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
        clipCount: outputMode === "story_edit" ? 4 : 4,
        outputMode,
        includeCaptions: true,
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
    setStatusText("Uploading and preparing Smart Promo Summary...");

    try {
      let token = await getFreshAuthToken(true);
      setStatusText("Uploading source video...");
      const { videoUrl, sourceStoragePath } = await resolveVideoSource();
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
            durationSeconds,
            style: styleId,
            promoAngle,
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
          `Smart Promo Summary started. ${payload.creditsRemaining ?? "?"} credits remaining.`
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

  const handleDownload = clip => {
    window.open(clip.url, "_blank", "noopener,noreferrer");
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
    <div className="promo-summary-overlay" role="dialog" aria-modal="true" aria-label="Smart Promo Summary">
      <div className="promo-summary-shell">
        <div className="promo-summary-header">
          <div>
            <span className="promo-summary-eyebrow">Premium Promo Engine</span>
            <h3>Smart Promo Summary</h3>
            <p>
              Turn one long video into either four short promo cuts or a polished story edit plus
              clips, with auto story captions and social pacing.
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
            Output: {outputMode === "story_edit" ? "1 story edit + clips" : "4 clips"}
          </div>
          <div className="promo-summary-pill">Mode: {selectedOutputMode.pill}</div>
        </div>
        <div className="promo-summary-billing-note">
          Smart Promo Summary is a credit-based generation. Your monthly editing credits are used
          first, and you can top up anytime if you want more promo runs before renewal.
        </div>
        <div className="promo-summary-billing-note promo-summary-time-note">
          Promo rendering can take {waitEstimate} depending on source length, captions, and upload speed.
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

          <section className="promo-summary-card promo-summary-card-wide">
            <span className="promo-summary-card-label">Promo Angle</span>
            <div className="promo-summary-angle-grid">
              {PROMO_ANGLES.map(angle => (
                <button
                  key={angle.id}
                  type="button"
                  className={`promo-summary-style-card ${promoAngle === angle.id ? "is-active" : ""}`}
                  onClick={() => setPromoAngle(angle.id)}
                >
                  <strong>{angle.label}</strong>
                  <span>{angle.summary}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="promo-summary-card">
            <span className="promo-summary-card-label">Status</span>
            <div className="promo-summary-status">
              <strong>{statusText || "Ready to generate."}</strong>
              <span>
                Credits are deducted before processing. Early platform failures are refunded; completed promo clips stay available until they expire.
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
                {isGenerating ? "Generating Promo..." : isEstimating ? "Estimating..." : "Generate Promo"}
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
              <span className="promo-summary-card-label">Confirm Promo Package</span>
              <strong>{pendingEstimate.credits} credits required</strong>
              <p>
                Credits cover video analysis, clip generation, captions, thumbnail/poster rendering,
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
            <strong>Promo Results</strong>
            <span>
              {jobId
                ? `Job ${jobId}`
                : outputMode === "story_edit"
                  ? "You will get a full story master first, then extra promo clips from different chapters."
                  : "You will get a 4-clip campaign set with different hook angles, not four copies of the same cut."}
            </span>
          </div>
          {promoClips.length > 0 && (
            <div className="promo-summary-campaign-map">
              <span>Campaign set map</span>
              <strong>
                {outputMode === "story_edit"
                  ? "Full story master -> hook cut -> proof cut -> close cut"
                  : "Hook the scroll -> prove the value -> create replay -> push the next action"}
              </strong>
            </div>
          )}
          {outputMode === "story_edit" && analysisDetails?.confidenceSummary ? (
            <div className="promo-summary-campaign-map">
              <span>Story confidence</span>
              <strong>
                {analysisDetails.confidenceSummary.confidenceLabel || "Confidence pending"}
                {analysisDetails.analysisReused ? " · Reused analysis" : " · Fresh analysis"}
              </strong>
              <small>
                {analysisDetails.confidenceSummary.summary ||
                  "Story master confidence is based on ordered speech chapters and transcript reliability."}
              </small>
            </div>
          ) : null}
          {promoClips.length === 0 ? (
            <div className="promo-summary-empty">
              {restoringClips
                ? "Checking for available promo clips..."
                : outputMode === "story_edit"
                  ? "We will generate one coherent story master first, then three derived shorts from the same narrative flow."
                  : "We will generate four different promo cuts with distinct campaign roles, short story captions, and a 24-hour download window."}
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
                        <img src={selectedVisual.url} alt="Selected promo visual preview" />
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
                    <strong>{clip.promoCaption || clip.title || `Promo Cut ${index + 1}`}</strong>
                    <span>
                      {(clip.duration || durationSeconds) ? `${Math.round(Number(clip.duration || durationSeconds))}s` : ""}
                      {clip.viralScore ? ` · Score ${Math.round(Number(clip.viralScore))}` : ""}
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
                            <img src={asset.url} alt={asset.label || asset.type || "Promo visual"} />
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
    </div>
  );
}

export default SmartPromoSummaryPanel;

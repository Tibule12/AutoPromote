import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
import "./SmartPromoSummaryPanel.css";

const PROMO_DURATIONS = [15, 30, 60];
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

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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

const fallbackPromoClips = analysis =>
  (Array.isArray(analysis?.clips) ? analysis.clips : [])
    .filter(clip => clip?.url)
    .map((clip, index) => ({
      id: `fallback-${index + 1}`,
      url: clip.url,
      title: clip.text || `Promo Cut ${index + 1}`,
      promoCaption: clip.text || `Promo Cut ${index + 1}`,
      duration: clip.duration,
      viralScore: clip.viralScore,
      expiresAt: analysis?.expiresAt || null,
    }));

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [jobId, setJobId] = useState("");
  const [promoClips, setPromoClips] = useState([]);
  const [errorText, setErrorText] = useState("");
  const pollingActiveRef = useRef(true);

  const promoCost = Number(creditCosts?.["promo-summary"] || 18);

  useEffect(() => {
    pollingActiveRef.current = true;
    return () => {
      pollingActiveRef.current = false;
    };
  }, []);

  const canAfford = creditBalance === null || Number(creditBalance) >= promoCost;

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
      const safeName =
        typeof sourceFile.name === "string" && sourceFile.name
          ? sourceFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_")
          : `promo-source-${Date.now()}.mp4`;
      const storagePath = `temp_sources/${user.uid}/promo_${Date.now()}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, sourceFile);
      const url = await getDownloadURL(storageRef);
      return { videoUrl: url, sourceStoragePath: storagePath };
    }

    if (sourceFile?.url) {
      return { videoUrl: sourceFile.url, sourceStoragePath: null };
    }

    if (typeof sourceUrl === "string" && sourceUrl) {
      return { videoUrl: sourceUrl, sourceStoragePath: null };
    }

    throw new Error("No source video is available for promo generation.");
  };

  const fetchAnalysis = async token => {
    const response = await fetch(API_ENDPOINTS.CLIPS_ANALYSIS(jobId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Status check failed with ${response.status}`);
    }
    const payload = await response.json();
    return payload.analysis || payload;
  };

  const startPolling = async token => {
    while (pollingActiveRef.current) {
      const analysis = await fetchAnalysis(token);
      const nextStatus = buildStatusLabel(analysis);
      setStatusText(nextStatus);
      if (onStatusChange) onStatusChange(nextStatus);

      if (analysis.status === "completed") {
        const clips = Array.isArray(analysis.promoClips) && analysis.promoClips.length
          ? analysis.promoClips
          : fallbackPromoClips(analysis);
        setPromoClips(clips);
        return;
      }

      if (analysis.status === "failed") {
        throw new Error(analysis.error || "Promo generation failed.");
      }

      await wait(4000);
    }
  };

  const handleGenerate = async () => {
    setErrorText("");
    setPromoClips([]);
    setIsGenerating(true);
    setStatusText("Preparing Smart Promo Summary...");

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in to use Smart Promo Summary.");
      const token = await user.getIdToken();
      const { videoUrl, sourceStoragePath } = await resolveVideoSource();

      const response = await fetch(API_ENDPOINTS.CLIPS_PROMO_SUMMARY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl,
          durationSeconds,
          style: styleId,
          sourceStoragePath,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Unable to start promo generation.");
      }

      setJobId(payload.jobId || "");
      setStatusText("Analyzing video...");
      if (onStatusChange) {
        onStatusChange(
          `Smart Promo Summary started. ${payload.creditsRemaining ?? "?"} credits remaining.`
        );
      }

      if (payload.jobId) {
        await startPolling(token);
      }
    } catch (error) {
      setErrorText(error.message || "Promo generation failed.");
      setStatusText(error.message || "Promo generation failed.");
      if (onStatusChange) onStatusChange(error.message || "Promo generation failed.");
    } finally {
      setIsGenerating(false);
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

  return (
    <div className="promo-summary-overlay" role="dialog" aria-modal="true" aria-label="Smart Promo Summary">
      <div className="promo-summary-shell">
        <div className="promo-summary-header">
          <div>
            <span className="promo-summary-eyebrow">Premium Promo Engine</span>
            <h3>Smart Promo Summary</h3>
            <p>Turn one long video into four short promo cuts with auto story captions and social pacing.</p>
          </div>
          <button type="button" className="promo-summary-close" onClick={onClose} aria-label="Close promo summary">
            &times;
          </button>
        </div>

        <div className="promo-summary-meta">
          <div className="promo-summary-pill">Source: {sourceSummary}</div>
          <div className="promo-summary-pill">Cost: {promoCost} credits</div>
          <div className="promo-summary-pill">Balance: {creditBalance ?? "..."}</div>
          <div className="promo-summary-pill">Output: 4 clips</div>
        </div>
        <div className="promo-summary-billing-note">
          Smart Promo Summary is a credit-based generation. Your monthly editing credits are used
          first, and you can top up anytime if you want more promo runs before renewal.
        </div>

        <div className="promo-summary-grid">
          <section className="promo-summary-card">
            <span className="promo-summary-card-label">Duration</span>
            <div className="promo-summary-choice-row">
              {PROMO_DURATIONS.map(value => (
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
                Credits are deducted before processing. If generation fails, credits are refunded automatically.
              </span>
            </div>
            {errorText && <div className="promo-summary-error">{errorText}</div>}
            {!canAfford && (
              <div className="promo-summary-error">
                You need {promoCost} credits for this feature.
              </div>
            )}
            <div className="promo-summary-action-row">
              <button
                type="button"
                className="promo-summary-primary"
                onClick={handleGenerate}
                disabled={isGenerating || !canAfford}
              >
                {isGenerating ? "Generating Promo..." : "Generate Promo"}
              </button>
              <button type="button" className="promo-summary-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </section>
        </div>

        <div className="promo-summary-results">
          <div className="promo-summary-results-head">
            <strong>Promo Results</strong>
            <span>{jobId ? `Job ${jobId}` : "4 unique promo options will appear here."}</span>
          </div>
          {promoClips.length === 0 ? (
            <div className="promo-summary-empty">
              We will generate four different promo cuts with short story captions and a 24-hour download window.
            </div>
          ) : (
            <div className="promo-summary-results-grid">
              {promoClips.map((clip, index) => (
                <article key={clip.id || clip.url || index} className="promo-summary-result-card">
                  <div className="promo-summary-video-shell">
                    <video src={clip.url} controls preload="metadata" />
                  </div>
                  <div className="promo-summary-result-copy">
                    <strong>{clip.promoCaption || clip.title || `Promo Cut ${index + 1}`}</strong>
                    <span>
                      {(clip.duration || durationSeconds) ? `${Math.round(Number(clip.duration || durationSeconds))}s` : ""}
                      {clip.viralScore ? ` · Score ${Math.round(Number(clip.viralScore))}` : ""}
                    </span>
                    <small>{formatExpiry(clip.expiresAt)}</small>
                  </div>
                  <div className="promo-summary-result-actions">
                    <button type="button" className="promo-summary-secondary" onClick={() => handleDownload(clip)}>
                      Download
                    </button>
                    <button
                      type="button"
                      className="promo-summary-primary"
                      onClick={() => onUseClip && onUseClip(clip)}
                    >
                      Use in Editor
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SmartPromoSummaryPanel;

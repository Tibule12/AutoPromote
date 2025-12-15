// ClipStudioPanel.js
// AI Clip Generation Studio (Opus Clip style)
// Analyze videos and generate viral short clips

import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./ClipStudioPanel.css";
import GeneratePublishModal from "./GeneratePublishModal";

const ClipStudioPanel = ({ content = [] }) => {
  const [selectedContent, setSelectedContent] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [generatedClips, setGeneratedClips] = useState([]);
  // Note: unused preview/analysis state removed to satisfy linter warnings
  const [exportOptions, setExportOptions] = useState({
    aspectRatio: "9:16",
    addCaptions: true,
    addBranding: false,
  });
  const [gpOpen, setGpOpen] = useState(false);
  // Locks and modal state to prevent duplicate actions and confirm exports
  const [generatingClipId, setGeneratingClipId] = useState(null);
  const [exportingClipId, setExportingClipId] = useState(null);
  const [confirmExport, setConfirmExport] = useState({
    open: false,
    clipId: null,
    platforms: [],
    scheduledTime: new Date(Date.now() + 3600000).toISOString(),
  });
  const [exportImmediate, setExportImmediate] = useState(false);

  // Filter for videos only
  const videoContent = content.filter(c => c.type === "video");

  // Run once on mount — dependencies intentionally omitted
  /* mount-only effect (intentional) */
  // eslint-disable-next-line
  useEffect(() => {
    loadGeneratedClips();
  }, []);

  const loadGeneratedClips = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/clips/user`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => ({ ok: false, status: 500 }));

      if (response.ok) {
        const data = await response.json();
        setGeneratedClips(data.clips || []);
      } else {
        // Endpoint not ready or error - silently ignore
        setGeneratedClips([]);
      }
    } catch (error) {
      // Silently handle - clips feature may not be deployed yet
      setGeneratedClips([]);
    }
  };

  const analyzeVideo = async contentItem => {
    if (!contentItem.url) {
      toast.error("Video URL not available");
      return;
    }

    setAnalyzing(true);
    setSelectedContent(contentItem);

    const toastId = toast.loading("Analyzing video... This may take a few minutes");

    try {
      const token = await auth.currentUser?.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/clips/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId: contentItem.id,
          videoUrl: contentItem.url,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Analysis failed");
      }

      const result = await response.json();
      toast.success(`Found ${result.clipsGenerated} potential clips!`, { id: toastId });

      // Load analysis details
      await loadAnalysis(result.analysisId);
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error(error.message, { id: toastId });
    } finally {
      setAnalyzing(false);
    }
  };

  const loadAnalysis = async analysisId => {
    try {
      const token = await auth.currentUser?.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/clips/analysis/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentAnalysis(data.analysis);
      }
    } catch (error) {
      console.error("Failed to load analysis:", error);
    }
  };

  const generateClip = async clip => {
    if (!currentAnalysis?.id) return toast.error("No analysis selected");
    if (generatingClipId) return; // another generation in-flight
    setGeneratingClipId(clip.id);
    const toastId = toast.loading("Generating clip...");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/clips/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisId: currentAnalysis.id,
          clipId: clip.id,
          options: exportOptions,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(error.error || error.message || "Generation failed");
      }

      await response.json().catch(() => null);
      toast.success("Clip generated successfully!", { id: toastId });
      await loadGeneratedClips();
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(error.message || "Generation failed", { id: toastId });
    } finally {
      setGeneratingClipId(null);
    }
  };

  // Open export confirmation modal instead of sending immediately
  const exportClip = async (clipId, platforms) => {
    setConfirmExport({
      open: true,
      clipId,
      platforms: platforms || ["tiktok"],
      scheduledTime: new Date(Date.now() + 3600000).toISOString(),
    });
    setExportImmediate(false);
  };

  const performExport = async () => {
    if (!confirmExport.clipId || exportingClipId) return;
    setExportingClipId(confirmExport.clipId);
    const toastId = toast.loading("Scheduling export...");

    try {
      const token = await auth.currentUser?.getIdToken();
      const payload = {
        platforms: confirmExport.platforms,
        scheduledTime: confirmExport.scheduledTime,
        immediate_post: exportImmediate,
        immediatePost: exportImmediate,
      };

      const response = await fetch(`${API_BASE_URL}/api/clips/${confirmExport.clipId}/export`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const parsed = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMsg = parsed.error || parsed.message || "Export failed";
        throw new Error(errMsg);
      }

      // If backend indicates pending approval, surface that specifically
      const status = parsed.status || (parsed.content && parsed.content.status) || "";
      if (
        status === "pending_approval" ||
        (parsed.message && parsed.message.toLowerCase().includes("pending"))
      ) {
        toast.success("Export queued — pending admin approval", { id: toastId });
      } else {
        toast.success(parsed.message || "Clip scheduled for export!", { id: toastId });
      }
    } catch (error) {
      console.error("Export error:", error);
      toast.error(error.message || "Export failed", { id: toastId });
    } finally {
      setExportingClipId(null);
      setConfirmExport({
        open: false,
        clipId: null,
        platforms: [],
        scheduledTime: new Date(Date.now() + 3600000).toISOString(),
      });
      setExportImmediate(false);
    }
  };

  const formatDuration = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimestamp = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="clip-studio-panel">
      <GeneratePublishModal
        open={gpOpen}
        contentItem={selectedContent || {}}
        onClose={() => setGpOpen(false)}
        onStarted={jobId => {
          setGpOpen(false);
          toast.success("Generation started");
        }}
      />
      <div className="clip-studio-header">
        <h2>🎬 AI Clip Studio</h2>
        <p>Generate viral short clips from your long-form videos</p>
      </div>

      {!currentAnalysis ? (
        <>
          {/* Video Selection */}
          <div className="video-selection-section">
            <h3>Select a Video to Analyze</h3>

            {videoContent.length === 0 ? (
              <div className="empty-state">
                <p>📹 No videos uploaded yet</p>
                <p className="empty-hint">
                  Upload a long-form video to get started with AI clip generation
                </p>
              </div>
            ) : (
              <div className="video-grid">
                {videoContent.map(video => (
                  <div key={video.id} className="video-card">
                    {video.url && (
                      <video
                        src={video.url}
                        className="video-thumbnail"
                        muted
                        onClick={e => (e.target.paused ? e.target.play() : e.target.pause())}
                      />
                    )}
                    <div className="video-card-info">
                      <h4>{video.title || "Untitled Video"}</h4>
                      {video.duration && (
                        <span className="duration-badge">{formatDuration(video.duration)}</span>
                      )}
                      <p className="video-description">
                        {video.description ? video.description.substring(0, 100) : "No description"}
                      </p>

                      {video.clipAnalysis?.analyzed ? (
                        <div className="analysis-status">
                          <span className="analyzed-badge">✓ Analyzed</span>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => loadAnalysis(video.clipAnalysis.analysisId)}
                          >
                            View {video.clipAnalysis.clipsGenerated} Clips
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-primary"
                          onClick={() => analyzeVideo(video)}
                          disabled={analyzing}
                        >
                          {analyzing ? "Analyzing..." : "Generate Clips"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Previously Generated Clips */}
          {generatedClips.length > 0 && (
            <div className="generated-clips-section">
              <h3>📂 Your Generated Clips ({generatedClips.length})</h3>
              <div className="clips-grid">
                {generatedClips.map(clip => (
                  <div key={clip.id} className="generated-clip-card">
                    <video src={clip.url} className="clip-preview" controls />
                    <div className="clip-info">
                      <div className="clip-score">
                        <span className="score-badge">⚡ {clip.viralScore}</span>
                      </div>
                      <p className="clip-caption">{clip.caption}</p>
                      <p className="clip-meta">
                        {formatDuration(clip.duration)} • {clip.reason}
                      </p>
                      <div className="clip-platforms">
                        {clip.platforms?.map(p => (
                          <span key={p} className="platform-tag">
                            {p}
                          </span>
                        ))}
                      </div>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => exportClip(clip.id, clip.platforms || ["tiktok"])}
                        disabled={exportingClipId === clip.id}
                      >
                        {exportingClipId === clip.id ? "Scheduling..." : "Export to Platforms"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Analysis Results */}
          <div className="analysis-results">
            <div className="results-header">
              <button className="btn-back" onClick={() => setCurrentAnalysis(null)}>
                ← Back to Videos
              </button>
              <div className="results-summary">
                <h3>Analysis Complete</h3>
                <p>Found {currentAnalysis.topClips?.length || 0} potential viral clips</p>
                <div className="analysis-stats">
                  <span>Duration: {formatDuration(currentAnalysis.duration)}</span>
                  <span>Scenes: {currentAnalysis.scenesDetected}</span>
                  {currentAnalysis.transcriptLength > 0 && (
                    <span>Transcript: {currentAnalysis.transcriptLength} segments</span>
                  )}
                </div>
              </div>
            </div>

            {/* Export Options */}
            <div className="export-options">
              <h4>Export Settings</h4>
              <div className="options-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={exportOptions.addCaptions}
                    onChange={e =>
                      setExportOptions({ ...exportOptions, addCaptions: e.target.checked })
                    }
                  />
                  Add Captions
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={exportOptions.addBranding}
                    onChange={e =>
                      setExportOptions({ ...exportOptions, addBranding: e.target.checked })
                    }
                  />
                  Add Branding
                </label>
                <label>
                  Aspect Ratio:
                  <select
                    value={exportOptions.aspectRatio}
                    onChange={e =>
                      setExportOptions({ ...exportOptions, aspectRatio: e.target.value })
                    }
                  >
                    <option value="9:16">9:16 (Vertical - TikTok/Reels)</option>
                    <option value="16:9">16:9 (Horizontal - YouTube)</option>
                    <option value="1:1">1:1 (Square - Instagram)</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Clip Suggestions */}
            <div className="clip-suggestions">
              <h4>Suggested Clips (sorted by viral potential)</h4>
              <div className="clips-list">
                {currentAnalysis.topClips?.map((clip, index) => (
                  <div key={clip.id || index} className="clip-suggestion">
                    <div className="clip-rank">#{index + 1}</div>
                    <div className="clip-timeline">
                      <div className="timeline-bar">
                        <div
                          className="timeline-segment"
                          style={{
                            left: `${(clip.start / currentAnalysis.duration) * 100}%`,
                            width: `${((clip.end - clip.start) / currentAnalysis.duration) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="timeline-labels">
                        <span>{formatTimestamp(clip.start)}</span>
                        <span>{formatTimestamp(clip.end)}</span>
                      </div>
                    </div>
                    <div className="clip-details">
                      <div className="clip-score-large">
                        <span className="score-number">{clip.score}</span>
                        <span className="score-label">Viral Score</span>
                      </div>
                      <div className="clip-content">
                        <p className="clip-reason">
                          <strong>Why this clip:</strong> {clip.reason}
                        </p>
                        {clip.text && (
                          <p className="clip-transcript">
                            &quot;{clip.text.substring(0, 150)}...&quot;
                          </p>
                        )}
                        <div className="clip-meta-info">
                          <span>Duration: {formatDuration(clip.end - clip.start)}</span>
                          {clip.platforms && <span>Best for: {clip.platforms.join(", ")}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="clip-actions">
                      <button
                        className="btn-primary"
                        onClick={() => generateClip(clip)}
                        disabled={generatingClipId === clip.id}
                      >
                        {generatingClipId === clip.id ? "Generating..." : "Generate Clip"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      {/* Export Confirmation Modal */}
      {confirmExport.open && (
        <div
          className="export-modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{ background: "#0f1724", padding: 20, borderRadius: 8, width: "min(640px,95%)" }}
          >
            <h3 style={{ marginTop: 0 }}>Confirm Export</h3>
            <p>
              You&apos;re about to schedule this clip for export to:{" "}
              <strong>{(confirmExport.platforms || []).join(", ")}</strong>
            </p>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label>Scheduled time</label>
              <input
                type="datetime-local"
                value={confirmExport.scheduledTime ? confirmExport.scheduledTime.slice(0, 16) : ""}
                onChange={e =>
                  setConfirmExport(prev => ({
                    ...prev,
                    scheduledTime: new Date(e.target.value).toISOString(),
                  }))
                }
                style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={exportImmediate}
                  onChange={e => setExportImmediate(e.target.checked)}
                />
                <span>Publish immediately (requires admin approval or sufficient permissions)</span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setConfirmExport({
                    open: false,
                    clipId: null,
                    platforms: [],
                    scheduledTime: new Date(Date.now() + 3600000).toISOString(),
                  });
                  setExportImmediate(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={performExport}
                disabled={exportingClipId === confirmExport.clipId}
              >
                {exportingClipId === confirmExport.clipId ? "Scheduling..." : "Confirm & Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipStudioPanel;

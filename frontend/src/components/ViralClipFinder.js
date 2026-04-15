// ViralClipFinder.js
// Phase 2: AI Viral Moment Detection (Opus Clip Competitor)
import React, { useState, useEffect, useRef, useCallback } from "react";
import "./ViralClipFinder.css";
import { API_BASE_URL } from "../config";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { sanitizeUrl } from "../utils/security";
import toast from "react-hot-toast";

const ASPECT_RATIOS = [
  { key: "9:16", label: "9:16", desc: "TikTok / Reels / Shorts" },
  { key: "1:1", label: "1:1", desc: "Instagram Feed" },
  { key: "16:9", label: "16:9", desc: "YouTube / Landscape" },
];

const SORT_OPTIONS = [
  { key: "score", label: "Viral Score" },
  { key: "duration", label: "Duration" },
  { key: "time", label: "Timeline Order" },
];

function ViralClipFinder({ file, onSave, onCancel }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scenes, setScenes] = useState([]);
  const [selectedScene, setSelectedScene] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [batchRendering, setBatchRendering] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState(null);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [captionStyle, setCaptionStyle] = useState("bold_pop");
  const [smartCropMode, setSmartCropMode] = useState("center");
  const [sortBy, setSortBy] = useState("score");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [trimAdjustments, setTrimAdjustments] = useState({}); // { [sceneId]: { start, end } }
  const [expandedScene, setExpandedScene] = useState(null);
  const [clipResults, setClipResults] = useState({}); // { [sceneId]: { url, file } }
  const videoRef = useRef(null);
  const localBlobRef = useRef(null);

  // Upload source on mount if it's a file object
  useEffect(() => {
    let active = true;
    const uploadSource = async () => {
      if (file instanceof File || file instanceof Blob) {
        setStatusMessage("Uploading source video for analysis...");
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) {
          setStatusMessage("Sign in to use clip finder.");
          return;
        }

        // Create a local blob URL for preview while uploading
        try {
          localBlobRef.current = URL.createObjectURL(file);
        } catch (_) {}

        try {
          const safeName = (file.name || "source.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `temp_analysis/${user.uid}/${Date.now()}_${safeName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          if (active) {
            setSourceUrl(url);
            setStatusMessage("Ready to analyze.");
          }
        } catch (e) {
          if (active) setStatusMessage("Upload failed: " + e.message);
        }
      } else if (file && file.isRemote) {
        setSourceUrl(file.url);
        setStatusMessage("Ready to analyze.");
      } else if (typeof file === "string" && file) {
        setSourceUrl(file);
        setStatusMessage("Ready to analyze.");
      }
    };
    uploadSource();
    return () => {
      active = false;
      if (localBlobRef.current) {
        URL.revokeObjectURL(localBlobRef.current);
        localBlobRef.current = null;
      }
    };
  }, [file]);

  // Handle scene selection playback
  useEffect(() => {
    if (selectedScene && videoRef.current) {
      const video = videoRef.current;
      const trim = trimAdjustments[selectedScene.id];
      const startTime = trim ? trim.start : selectedScene.start;

      const playVideo = () => {
        video.currentTime = startTime;
        video.play().catch(() => {});
      };

      if (video.readyState >= 3) {
        playVideo();
      } else {
        video.addEventListener("loadeddata", playVideo, { once: true });
      }
    }
  }, [selectedScene, trimAdjustments]);

  // Stop playback when scene ends
  const handleTimeUpdate = () => {
    if (selectedScene && videoRef.current) {
      const trim = trimAdjustments[selectedScene.id];
      const endTime = trim ? trim.end : selectedScene.end;
      if (videoRef.current.currentTime >= endTime) {
        videoRef.current.pause();
      }
    }
  };

  const sortedScenes = useCallback(() => {
    const sorted = [...scenes];
    if (sortBy === "score") sorted.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
    else if (sortBy === "duration") sorted.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    else sorted.sort((a, b) => (a.start || 0) - (b.start || 0));
    return sorted;
  }, [scenes, sortBy]);

  const toggleSelectScene = (sceneId, e) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === scenes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scenes.map(s => s.id)));
    }
  };

  const handleTrimChange = (sceneId, field, value) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setTrimAdjustments(prev => ({
      ...prev,
      [sceneId]: {
        start: prev[sceneId]?.start ?? scene.start,
        end: prev[sceneId]?.end ?? scene.end,
        [field]: parseFloat(value) || 0,
      },
    }));
  };

  const getEffectiveTiming = scene => {
    const trim = trimAdjustments[scene.id];
    return {
      start: trim?.start ?? scene.start,
      end: trim?.end ?? scene.end,
    };
  };

  const handleAnalyze = async () => {
    if (!sourceUrl) return;
    setAnalyzing(true);
    setScenes([]);
    setSelectedScene(null);
    setClipResults({});
    setSelectedIds(new Set());
    setStatusMessage("AI is watching your video to find viral moments...");

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 3, 92));
    }, 2500);

    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/media/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: sourceUrl && sourceUrl.url ? sourceUrl.url : sourceUrl,
          aspectRatio,
          captionStyle,
          smartCropMode,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 402) {
          throw new Error("Insufficient Growth Credits! Please top up in the Marketplace.");
        }
        throw new Error("Analysis failed: " + errText);
      }

      const data = await response.json();
      const foundScenes = (data.scenes || []).map((s, i) => ({
        ...s,
        id: s.id || `clip-${i + 1}`,
        duration: s.duration || s.end - s.start,
      }));
      setScenes(foundScenes);
      setProgress(100);
      setStatusMessage(
        `Found ${foundScenes.length} viral moments! (${data.remainingCredits ?? "—"} credits left)`
      );

      if (foundScenes.length > 0) {
        setSelectedScene(foundScenes[0]);
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("Error: " + error.message);
      toast.error(error.message);
    } finally {
      clearInterval(interval);
      setAnalyzing(false);
    }
  };

  const renderSingleClip = async scene => {
    const auth = getAuth();
    const token = await auth.currentUser.getIdToken();
    const timing = getEffectiveTiming(scene);

    const response = await fetch(`${API_BASE_URL}/api/media/render-clip`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileUrl: sourceUrl && sourceUrl.url ? sourceUrl.url : sourceUrl,
        startTime: timing.start,
        endTime: timing.end,
        aspectRatio,
        captionStyle,
        smartCropMode,
      }),
    });

    if (!response.ok) throw new Error("Rendering failed");
    const data = await response.json();

    let newFile;
    try {
      const blob = await fetch(data.url).then(r => r.blob());
      newFile = new File([blob], `viral_clip_${scene.id}.mp4`, { type: "video/mp4" });
    } catch {
      newFile = { name: `viral_clip_${scene.id}.mp4`, url: data.url, isRemote: true };
    }

    return { url: data.url, file: newFile };
  };

  const handleRender = async scene => {
    setRendering(true);
    setStatusMessage(`Rendering clip ${scene.id}...`);
    try {
      const result = await renderSingleClip(scene);
      setClipResults(prev => ({ ...prev, [scene.id]: result }));
      setStatusMessage("Clip rendered! Download or send to editor.");
      toast.success("Clip rendered successfully!");
    } catch (e) {
      setStatusMessage("Render Error: " + e.message);
      toast.error("Render failed: " + e.message);
    } finally {
      setRendering(false);
    }
  };

  const handleBatchRender = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      toast("Select clips to batch render.");
      return;
    }
    setBatchRendering(true);
    setBatchProgress({ done: 0, total: ids.length });
    setStatusMessage(`Batch rendering ${ids.length} clips...`);
    const results = {};
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      const scene = scenes.find(s => s.id === ids[i]);
      if (!scene) continue;
      setBatchProgress({ done: i, total: ids.length });
      try {
        results[scene.id] = await renderSingleClip(scene);
      } catch {
        failed++;
      }
    }
    setClipResults(prev => ({ ...prev, ...results }));
    setBatchRendering(false);
    setBatchProgress({ done: ids.length, total: ids.length });
    const done = ids.length - failed;
    setStatusMessage(`Batch complete: ${done} rendered${failed ? `, ${failed} failed` : ""}.`);
    toast.success(`${done} clips rendered!`);
  };

  const handleDownloadClip = sceneId => {
    const result = clipResults[sceneId];
    if (!result) return;
    if (result.file instanceof File || result.file instanceof Blob) {
      const url = URL.createObjectURL(result.file);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.file.name || `clip-${sceneId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (result.url) {
      window.open(sanitizeUrl(result.url), "_blank", "noopener,noreferrer");
    }
  };

  const handleSendToEditor = sceneId => {
    const result = clipResults[sceneId];
    if (result?.file) {
      onSave(result.file);
    }
  };

  const handleOpenInStudio = scene => {
    // Pass the scene as clip suggestion so VideoEditor will open VCS
    const timing = getEffectiveTiming(scene);
    onSave({
      name: `viral_clip_${scene.id}.mp4`,
      url: sourceUrl?.url || sourceUrl,
      isRemote: true,
      openStudio: true,
      clips: [
        {
          id: scene.id,
          start: timing.start,
          end: timing.end,
          duration: timing.end - timing.start,
          reason: scene.reason || "AI-detected viral moment",
          viralScore: scene.viralScore,
        },
      ],
    });
  };

  const videoPreviewSrc = sourceUrl
    ? sanitizeUrl(typeof sourceUrl === "string" ? sourceUrl : sourceUrl.url || sourceUrl)
    : localBlobRef.current || "";

  const bestScore = scenes.length ? Math.max(...scenes.map(s => s.viralScore || 0)) : 0;
  const avgScore = scenes.length
    ? Math.round(scenes.reduce((sum, s) => sum + (s.viralScore || 0), 0) / scenes.length)
    : 0;
  const totalDuration = scenes.reduce((sum, s) => {
    const t = getEffectiveTiming(s);
    return sum + (t.end - t.start);
  }, 0);

  return (
    <div className="viral-finder-container">
      <div className="finder-header">
        <h2>🚀 Viral Clip Finder</h2>
        <div className="finder-header-actions">
          {scenes.length > 0 && (
            <div className="finder-stats">
              <span className="stat-badge">🔥 Best: {bestScore}</span>
              <span className="stat-badge">📊 Avg: {avgScore}</span>
              <span className="stat-badge">⏱ {Math.round(totalDuration)}s total</span>
            </div>
          )}
          <button className="close-btn" onClick={onCancel}>
            &times;
          </button>
        </div>
      </div>

      {/* Aspect Ratio + Sort Controls */}
      {scenes.length === 0 && !analyzing && (
        <div className="finder-controls-bar">
          <div className="aspect-ratio-picker">
            <label>Output Format:</label>
            <div className="ratio-buttons">
              {ASPECT_RATIOS.map(ar => (
                <button
                  key={ar.key}
                  className={`ratio-btn ${aspectRatio === ar.key ? "active" : ""}`}
                  onClick={() => setAspectRatio(ar.key)}
                  title={ar.desc}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
            <label
              style={{
                fontSize: "13px",
                color: "#bbb",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Caption Style:
              <select
                value={captionStyle}
                onChange={e => setCaptionStyle(e.target.value)}
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "#1a1a2e",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: "12px",
                }}
              >
                <option value="bold_pop">Bold Pop</option>
                <option value="karaoke">Karaoke Fill</option>
                <option value="glow">Neon Glow</option>
                <option value="bounce">Bounce</option>
                <option value="minimal">Minimal</option>
                <option value="">Classic</option>
              </select>
            </label>
            <label
              style={{
                fontSize: "13px",
                color: "#bbb",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Smart Crop:
              <select
                value={smartCropMode}
                onChange={e => setSmartCropMode(e.target.value)}
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "#1a1a2e",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: "12px",
                }}
              >
                <option value="center">🎯 Center</option>
                <option value="speaker_track">👤 Speaker</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="finder-content">
        {scenes.length === 0 ? (
          <div className="analysis-state">
            <div className="emoji-display">🧠</div>
            <p>{statusMessage || "Upload a long video to automatically extract the best clips."}</p>
            {analyzing && (
              <div className="progress-bar">
                <div className="fill" style={{ width: `${progress}%` }}></div>
                <span className="progress-label">{progress}%</span>
              </div>
            )}
            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={analyzing || !sourceUrl}
            >
              {analyzing ? "Analyzing..." : "🔍 Find Viral Clips (8 credits)"}
            </button>
            <p className="credit-hint">AI scans your video for the best moments</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="results-toolbar">
              <div className="toolbar-left">
                <button className="toolbar-btn" onClick={selectAll}>
                  {selectedIds.size === scenes.length ? "Deselect All" : "Select All"}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    className="toolbar-btn primary"
                    onClick={handleBatchRender}
                    disabled={batchRendering || rendering}
                  >
                    {batchRendering
                      ? `Rendering ${batchProgress.done + 1}/${batchProgress.total}...`
                      : `Render ${selectedIds.size} Clips (${selectedIds.size * 5} cr)`}
                  </button>
                )}
                <div className="sort-control">
                  <label>Sort:</label>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    {SORT_OPTIONS.map(o => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="aspect-switch">
                  {ASPECT_RATIOS.map(ar => (
                    <button
                      key={ar.key}
                      className={`ratio-btn small ${aspectRatio === ar.key ? "active" : ""}`}
                      onClick={() => setAspectRatio(ar.key)}
                      title={ar.desc}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="toolbar-right">
                <button
                  className="toolbar-btn secondary"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  🔄 Re-analyze
                </button>
              </div>
            </div>

            {statusMessage && <div className="finder-status-bar">{statusMessage}</div>}

            <div className="results-wrapper">
              {/* Left Side: Video Player */}
              <div className="video-player-section">
                <div className="video-aspect-container">
                  {videoPreviewSrc && (
                    <video
                      ref={videoRef}
                      src={videoPreviewSrc}
                      controls
                      className="preview-player"
                      onTimeUpdate={handleTimeUpdate}
                    />
                  )}
                </div>
                <div className="player-hint">
                  {selectedScene
                    ? `Playing: ${formatTime(getEffectiveTiming(selectedScene).start)} — ${formatTime(getEffectiveTiming(selectedScene).end)} (${Math.round(getEffectiveTiming(selectedScene).end - getEffectiveTiming(selectedScene).start)}s)`
                    : "Select a clip to preview"}
                </div>

                {/* Trim controls for selected scene */}
                {selectedScene && (
                  <div className="trim-controls">
                    <h4>✂️ Adjust Clip Timing</h4>
                    <div className="trim-row">
                      <label>
                        Start:
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={getEffectiveTiming(selectedScene).start.toFixed(1)}
                          onChange={e =>
                            handleTrimChange(selectedScene.id, "start", e.target.value)
                          }
                          className="trim-input"
                        />
                      </label>
                      <label>
                        End:
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={getEffectiveTiming(selectedScene).end.toFixed(1)}
                          onChange={e => handleTrimChange(selectedScene.id, "end", e.target.value)}
                          className="trim-input"
                        />
                      </label>
                      <span className="trim-duration">
                        {Math.max(
                          0,
                          getEffectiveTiming(selectedScene).end -
                            getEffectiveTiming(selectedScene).start
                        ).toFixed(1)}
                        s
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Scene List */}
              <div className="results-grid">
                {sortedScenes().map((scene, idx) => {
                  const isBest = scene.viralScore === bestScore && bestScore > 0;
                  const isRendered = !!clipResults[scene.id];
                  const isSelected = selectedIds.has(scene.id);
                  const timing = getEffectiveTiming(scene);
                  const clipDuration = Math.round(timing.end - timing.start);

                  return (
                    <div
                      key={scene.id}
                      className={`scene-card ${selectedScene?.id === scene.id ? "active" : ""} ${isBest ? "best" : ""} ${isRendered ? "rendered" : ""}`}
                      onClick={() => setSelectedScene(scene)}
                    >
                      <div className="scene-card-header">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => toggleSelectScene(scene.id, e)}
                          className="scene-checkbox"
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="scene-rank">#{idx + 1}</span>
                        <div className="scene-score-badge">
                          {isBest && <span className="best-tag">BEST</span>}
                          🔥 {scene.viralScore}
                        </div>
                        <span className="scene-duration">{clipDuration}s</span>
                      </div>

                      <div className="scene-time-range">
                        {formatTime(timing.start)} — {formatTime(timing.end)}
                      </div>

                      {scene.reason && <div className="scene-reason">{scene.reason}</div>}

                      {/* Viral score bar */}
                      <div className="score-bar-container">
                        <div
                          className="score-bar-fill"
                          style={{ width: `${Math.min(100, scene.viralScore || 0)}%` }}
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="scene-actions">
                        {!isRendered ? (
                          <button
                            className="scene-action-btn render"
                            onClick={e => {
                              e.stopPropagation();
                              handleRender(scene);
                            }}
                            disabled={rendering || batchRendering}
                          >
                            {rendering && selectedScene?.id === scene.id
                              ? "Rendering..."
                              : "🎬 Render (5 cr)"}
                          </button>
                        ) : (
                          <>
                            <button
                              className="scene-action-btn download"
                              onClick={e => {
                                e.stopPropagation();
                                handleDownloadClip(scene.id);
                              }}
                            >
                              📥 Download
                            </button>
                            <button
                              className="scene-action-btn use"
                              onClick={e => {
                                e.stopPropagation();
                                handleSendToEditor(scene.id);
                              }}
                            >
                              ✅ Use Clip
                            </button>
                          </>
                        )}
                        <button
                          className="scene-action-btn studio"
                          onClick={e => {
                            e.stopPropagation();
                            handleOpenInStudio(scene);
                          }}
                          title="Open in Viral Clip Studio for advanced editing"
                        >
                          🎛️ Studio
                        </button>
                      </div>

                      {isRendered && <div className="rendered-badge">✓ Ready</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default ViralClipFinder;

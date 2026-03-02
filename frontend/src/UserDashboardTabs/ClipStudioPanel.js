// ClipStudioPanel.js
// AI Clip Generation Studio (Opus Clip style)
// Analyze videos and generate viral short clips

import React, { useState, useEffect, useRef } from "react";
import { auth, db, storage } from "../firebaseClient";
import { doc, setDoc, getDoc } from "firebase/firestore"; // Import Firestore functions
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./ClipStudioPanel.css";
import MemeticComposerPanel from "./MemeticComposerPanel";
import GeneratePublishModal from "./GeneratePublishModal";

const ClipStudioPanel = ({ content = [], onRefresh }) => {
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
  const [previewClipId, setPreviewClipId] = useState(null); // Track which clip is being previewed
  const [activeTab, setActiveTab] = useState("studio"); // "studio" | "gallery"

  // Montage Feature
  const [selectedClipIds, setSelectedClipIds] = useState([]); // Array of selected clip IDs
  const [isMontageMode, setIsMontageMode] = useState(false); // To toggle button text/state

  // Memetic Composer UI toggle and state
  const [composerOpen, setComposerOpen] = useState(false);
  const [preloadedClipUrl, setPreloadedClipUrl] = useState(null);

  const openComposerWithClip = videoUrl => {
    setPreloadedClipUrl(videoUrl);
    setComposerOpen(true);
  };

  // Controls the "Clean Interface" aspect
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef(null); // Ref for file upload

  // Filter for videos only, and exclude generated AI clips to keep the library clean
  // Updated: Only show videos explicitly uploaded via Clip Studio (source_context = clip_studio) to separate from general uploads
  const videoContent = content.filter(
    c =>
      c.type === "video" &&
      c.sourceType !== "ai_clip" &&
      !c.sourceAnalysisId &&
      !c.sourceClipId &&
      c.sourceContext === "clip_studio"
  );

  const handleFileUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a video file.");
      return;
    }

    const toastId = toast.loading("Uploading video...");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be logged in to upload.");

      // 1. Upload to Storage (Temporary folder for cleanup)
      if (file.size < 100) throw new Error("File too small/corrupted.");

      const storagePath = `temp_sources/${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);

      const uploadResult = await uploadBytes(storageRef, file);
      if (uploadResult.metadata.size < 100) throw new Error("Upload corrupted.");

      const url = await getDownloadURL(storageRef);

      // 2. Create Content Document
      const contentId = `upload-${Date.now()}`; // Generate a temporary ID (or let Firestore auto-gen)
      // Using a deterministic ID here for simplicity, but doc() without ID auto-generates
      const newContentRef = doc(db, "content", contentId);

      const newContent = {
        id: contentId,
        title: file.name,
        type: "video",
        url: url,
        userId: user.uid,
        user_id: user.uid, // Required for backend query compatibility
        created_at: new Date().toISOString(), // Match backend schema expectations
        createdAt: new Date().toISOString(),
        description: "Uploaded via Clip Studio",
        platform_options: {}, // Initialize empty
        sourceContext: "clip_studio", // TAG: Mark as Clip Studio Source
      };

      await setDoc(newContentRef, newContent);

      toast.success("Video uploaded! Select it from the list to analyze.", { id: toastId });

      // 3. Refresh Parent Content List
      if (onRefresh) onRefresh();

      // 4. Ensure we are showing the library view
      setShowLibrary(true);
    } catch (error) {
      console.error("Upload failed", error);
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Run once on mount and whenever activeTab changes to 'gallery'
  useEffect(() => {
    if (activeTab === "gallery") {
      loadGeneratedClips();
    }
  }, [activeTab]);

  // Initial load
  useEffect(() => {
    loadGeneratedClips();
  }, []);

  const loadGeneratedClips = async () => {
    try {
      const start = Date.now();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        console.warn("No auth token available, skipping clip load");
        return;
      }

      console.log("Fetching generated clips...");
      const response = await fetch(`${API_BASE_URL}/api/clips/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`Loaded ${data.clips?.length} clips in ${Date.now() - start}ms`);
        setGeneratedClips(data.clips || []);
      } else {
        console.error("Failed to load clips:", response.status, await response.text());
        toast.error(`Could not load clips: ${response.status}`);
        setGeneratedClips([]);
      }
    } catch (error) {
      console.error("Error loading clips:", error);
      toast.error(`Error loading clips: ${error.message}`);
      setGeneratedClips([]);
    }
  };

  const analyzeVideo = async contentItem => {
    if (!contentItem.url) {
      toast.error("Video URL not available");
      return;
    }

    setAnalyzing(true);
    setSelectedContent(contentItem); // Ensure UI reflects selection

    const toastId = toast.loading("Analyzing video... This takes ~1-2 mins per 10min of video");

    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/clips/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId: contentItem.id,
          videoUrl: contentItem.url, // Ensure we pass the URL
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 402) {
          toast.error(
            `Insufficient Credits! Needed: ${errorData.required}. Use PayPal or PayFast in Marketplace.`,
            { id: toastId }
          );
          // Optionally open credit purchase modal here
          if (
            window.confirm(
              "Insufficient credits! Go to Marketplace to purchase via PayPal/PayFast?"
            )
          ) {
            // Assuming this function is executed in context of UserDashboard
            // We cannot directly switch tabs here without props, but the message is clear.
          }
          return;
        }

        throw new Error(`Server Error: ${errorData.details || errorData.error || "Unknown"}`);
      }

      const result = await response.json();

      // Adapt to new API response structure: { success, analysisId, async: true }
      const analysisId = result.analysisId || (result.data && result.data.analysisId);

      if (result.async) {
        toast.success("Analysis Queued! You can close this tab and check back later.", {
          id: toastId,
        });
        setAnalyzing(true);

        // Start Polling
        const pollInterval = setInterval(async () => {
          const token = await auth.currentUser?.getIdToken();
          try {
            const pollRes = await fetch(`${API_BASE_URL}/api/clips/analysis/${analysisId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (pollRes.ok) {
              const statusData = await pollRes.json();
              const job = statusData.data || statusData.analysis || statusData;

              if (job.status === "completed") {
                clearInterval(pollInterval);
                setAnalyzing(false);
                setCurrentAnalysis(job);
                setGeneratedClips(job.clipSuggestions || []);
                toast.success(`Analysis Complete! Found ${job.clipSuggestions?.length} clips.`);
              } else if (job.status === "failed") {
                clearInterval(pollInterval);
                setAnalyzing(false);
                toast.error(`Analysis Failed: ${job.error}`);
              } else {
                // Update progress toast or UI
                // console.log(`Job ${analysisId} status: ${job.status}`);
              }
            }
          } catch (e) {
            console.warn("Polling error", e);
          }
        }, 5000);
      } else {
        // Synchronous fallback (old behavior)
        const clipCount = result.data.clipSuggestions ? result.data.clipSuggestions.length : 0;
        toast.success(
          `Success! Found ${clipCount} clips. Credits left: ${result.creditsRemaining}`,
          { id: toastId }
        );
        await loadAnalysis(analysisId);
      }
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

  // --- Multi-Select & Montage State ---
  // selectedClipIds state is declared at top level now
  const [generatingMontage, setGeneratingMontage] = useState(false);

  const toggleClipSelection = clipId => {
    setSelectedClipIds(prev =>
      prev.includes(clipId) ? prev.filter(id => id !== clipId) : [...prev, clipId]
    );
  };

  const generateMontage = async () => {
    if (selectedClipIds.length < 2) return toast.error("Select at least 2 clips for a montage");
    if (generatingMontage) return;

    setGeneratingMontage(true);
    const toastId = toast.loading("Stitching Montage...");
    try {
      const token = await auth.currentUser?.getIdToken();

      // Find the actual clip objects
      const segmentsToStitch = (currentAnalysis.clipSuggestions || [])
        .filter(c => selectedClipIds.includes(c.id))
        .map(c => ({
          start: c.start,
          end: c.end,
          // We could also pass individual clip settings here if UI supported it
        }))
        // Sort by start time? Or montage order (selection order)? Let's assume timeline order for now.
        .sort((a, b) => a.start - b.start);

      const response = await fetch(`${API_BASE_URL}/api/clips/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisId: currentAnalysis.id,
          // We reuse the generate endpoint but pass specific montage params
          isMontage: true,
          montageSegments: segmentsToStitch,
          options: {
            ...exportOptions,
            addMusic: true, // Auto-add music for montages nicely
            addHook: true,
            hookText: "BEST MOMENTS 🔥",
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(error.error || error.message || "Generation failed");
      }

      await response.json().catch(() => null);
      toast.success("Montage created!", { id: toastId });
      await loadGeneratedClips();
      setSelectedClipIds([]); // Clear selection
    } catch (error) {
      console.error("Montage error:", error);
      toast.error(error.message || "Montage failed", { id: toastId });
    } finally {
      setGeneratingMontage(false);
    }
  };

  const generateClip = async clip => {
    if (!currentAnalysis?.id) return toast.error("No analysis selected");
    if (generatingClipId) return; // another generation in-flight
    setGeneratingClipId(clip.id);
    const toastId = toast.loading("Generating clip...");
    try {
      const token = await auth.currentUser?.getIdToken();
      // Payload for single clip
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
  // const exportClip = async (clipId, platforms) => { ... } (Removed unused function)

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
        <div>
          <h2>🎬 AI Clip Studio</h2>
          <p>Generate viral short clips from your long-form videos</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className={`btn-secondary ${activeTab === "gallery" ? "active-tab" : ""}`}
            onClick={() => setActiveTab("gallery")}
            style={{
              background:
                activeTab === "gallery" ? "var(--viral-accent-primary)" : "rgba(255,255,255,0.1)",
              color: activeTab === "gallery" ? "#000" : "#fff",
              border: "none",
            }}
          >
            📂 My Clips ({generatedClips.length})
          </button>
          <button className="btn-viral-lab" onClick={() => setComposerOpen(true)}>
            🧬 Open Viral Lab
          </button>
        </div>
      </div>

      {composerOpen && (
        <MemeticComposerPanel
          onClose={() => {
            setComposerOpen(false);
            setPreloadedClipUrl(null);
          }}
          initialVideoUrl={preloadedClipUrl}
        />
      )}

      {activeTab === "gallery" ? (
        <div className="gallery-view" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h3>Your Generated Clips Library</h3>
            <button className="btn-secondary" onClick={() => setActiveTab("studio")}>
              Create New Clips
            </button>
          </div>

          {generatedClips.length === 0 ? (
            <div className="empty-state">
              <p>No clips generated yet.</p>
              <button className="btn-primary" onClick={() => setActiveTab("studio")}>
                Start Creating
              </button>
            </div>
          ) : (
            <div
              className="generated-clips-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "20px",
              }}
            >
              {generatedClips.map(clip => (
                <div
                  key={clip.id}
                  className="generated-clip-card"
                  style={{
                    background: "var(--viral-bg-card)",
                    padding: "15px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "177.78%",
                      marginBottom: "15px",
                      background: "#000",
                      borderRadius: "6px",
                      overflow: "hidden",
                    }}
                  >
                    <video
                      src={clip.url}
                      controls
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                  <div className="generated-clip-info">
                    <h4
                      style={{
                        margin: "0 0 8px 0",
                        fontSize: "16px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={clip.title}
                    >
                      {clip.title}
                    </h4>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--viral-text-muted)",
                        margin: "0 0 10px 0",
                      }}
                    >
                      Created: {new Date(clip.createdAt).toLocaleDateString()}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <span
                        className="viral-chip"
                        style={{
                          fontSize: "12px",
                          background: "rgba(0,255,136,0.1)",
                          color: "#00ff88",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        ⚡ Score: {clip.viralScore || 85}
                      </span>
                      <span style={{ fontSize: "12px", color: "#aaa" }}>
                        {formatDuration(clip.duration)}
                      </span>
                    </div>

                    <a
                      href={clip.url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary"
                      style={{
                        display: "block",
                        textAlign: "center",
                        textDecoration: "none",
                        width: "100%",
                      }}
                    >
                      Download Video
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : !currentAnalysis ? (
        <>
          {/* Landing State - Clean UI */}
          {!showLibrary ? (
            <div className="clip-landing-state">
              <div className="landing-card-center">
                <div className="landing-icon-large">✂️</div>
                <h3>Start a New Clip Project</h3>
                <p>Select a video from your library to begin analysis.</p>
                <div className="landing-actions">
                  <button className="btn-primary" onClick={() => setShowLibrary(true)}>
                    Select Video from Library
                  </button>
                  {/* If we had an upload function passed down, we'd add it here */}
                </div>
              </div>

              {/* Show recently generated clips cleanly below if any exist */}
              {generatedClips.length > 0 && (
                <div className="landing-recent-clips">
                  <h4>Recent Clips</h4>
                  <div className="mini-clips-list">
                    {generatedClips.slice(0, 4).map(clip => (
                      <div
                        key={clip.id}
                        className="mini-clip-item"
                        onClick={() => {
                          /* view logic if needed */
                        }}
                      >
                        <span className="mini-clip-score">⚡ {clip.viralScore}</span>
                        <span className="mini-clip-date">
                          {new Date(clip.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="video-selection-section">
              <div
                className="selection-header-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <h3>Select a Video to Analyze</h3>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept="video/*"
                    onChange={handleFileUpload}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ marginRight: "8px" }}
                  >
                    Upload New Video
                  </button>
                  <button className="btn-secondary" onClick={() => setShowLibrary(false)}>
                    Cancel
                  </button>
                </div>
              </div>

              {videoContent.length === 0 ? (
                <div className="empty-state">
                  <p>📹 No videos uploaded yet</p>
                  <p className="empty-hint">Upload a long-form video in the Upload tab first.</p>
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
                          {video.description
                            ? video.description.substring(0, 100)
                            : "No description"}
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
          )}

          {/* Detailed Generated Clips View - Only show when NOT in landing state or perhaps in a separate tab? 
              For now keeping it hidden in landing state to reduce clutter as requested.
          */}
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
                <p>
                  Found {(currentAnalysis.topClips || currentAnalysis.clipSuggestions || []).length}{" "}
                  potential viral clips
                </p>
                <div className="analysis-stats">
                  <span>Duration: {formatDuration(currentAnalysis.duration)}</span>
                  <span>Scenes: {currentAnalysis.scenesDetected}</span>
                  {currentAnalysis.transcriptLength > 0 && (
                    <span>Transcript: {currentAnalysis.transcriptLength} segments</span>
                  )}
                </div>
              </div>
            </div>

            {/* Generated Clips (Ready to Download) */}
            {generatedClips.filter(c => c.sourceAnalysisId === currentAnalysis.id).length > 0 && (
              <div
                className="generated-clips-preview-section"
                style={{
                  marginBottom: "2rem",
                  padding: "1rem",
                  background: "rgba(0, 255, 136, 0.05)",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 255, 136, 0.2)",
                }}
              >
                <h4 style={{ color: "#00ff88", marginTop: 0 }}>✅ Generated Clips (Ready)</h4>
                <div
                  className="generated-clips-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                    gap: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  {generatedClips
                    .filter(c => c.sourceAnalysisId === currentAnalysis.id)
                    .map(clip => (
                      <div
                        key={clip.id}
                        className="generated-clip-card"
                        style={{
                          background: "rgba(0,0,0,0.3)",
                          padding: "10px",
                          borderRadius: "6px",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            paddingBottom: "177.78%",
                            marginBottom: "10px",
                            background: "#000",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <video
                            src={clip.url}
                            controls
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        </div>
                        <div className="generated-clip-info">
                          <h5
                            style={{
                              margin: "0 0 5px 0",
                              fontSize: "14px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={clip.title}
                          >
                            {clip.title}
                          </h5>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "11px",
                              color: "#aaa",
                            }}
                          >
                            <span>{new Date(clip.createdAt).toLocaleDateString()}</span>
                            <span>Score: {clip.viralScore}</span>
                          </div>
                          <a
                            href={clip.url}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary"
                            style={{
                              display: "block",
                              textAlign: "center",
                              marginTop: "10px",
                              padding: "6px",
                              fontSize: "12px",
                              textDecoration: "none",
                            }}
                          >
                            Download Video
                          </a>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

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
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <h4>Suggested Clips (sorted by viral potential)</h4>
                {selectedClipIds.length > 1 && (
                  <button
                    className="btn-viral-lab"
                    onClick={generateMontage}
                    disabled={generatingMontage}
                    style={{
                      background: "linear-gradient(45deg, #FF0080, #7928CA)",
                      border: "none",
                      color: "white",
                      padding: "8px 16px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {generatingMontage
                      ? "Stitching..."
                      : `🎬 Create Montage (${selectedClipIds.length})`}
                  </button>
                )}
              </div>

              <div className="clips-list">
                {(currentAnalysis.topClips || currentAnalysis.clipSuggestions || []).map(
                  (clip, index) => (
                    <div
                      key={clip.id || index}
                      className={`clip-suggestion ${selectedClipIds.includes(clip.id) ? "selected-for-montage" : ""}`}
                      style={{
                        border: selectedClipIds.includes(clip.id)
                          ? "2px solid #7928CA"
                          : "1px solid #333",
                        background: selectedClipIds.includes(clip.id)
                          ? "rgba(121, 40, 202, 0.1)"
                          : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", marginRight: "10px" }}>
                        <input
                          type="checkbox"
                          checked={selectedClipIds.includes(clip.id)}
                          onChange={() => toggleClipSelection(clip.id)}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            accentColor: "#7928CA",
                          }}
                        />
                      </div>
                      <div className="clip-rank">#{index + 1}</div>
                      <div className="clip-center-column">
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
                          {previewClipId === (clip.id || index) ? (
                            <div className="clip-preview-player">
                              <video
                                src={currentAnalysis.videoUrl || selectedContent?.url}
                                controls
                                autoPlay
                                style={{
                                  width: "100%",
                                  maxHeight: "300px",
                                  borderRadius: "8px",
                                  marginBottom: "10px",
                                }}
                                onLoadedMetadata={e => {
                                  e.target.currentTime = clip.start;
                                }}
                                onTimeUpdate={e => {
                                  if (e.target.currentTime >= clip.end) {
                                    e.target.pause();
                                    setPreviewClipId(null); // Close preview or just pause
                                  }
                                }}
                              />
                              <button
                                className="close-preview-btn"
                                onClick={() => setPreviewClipId(null)}
                                style={{
                                  marginTop: "5px",
                                  padding: "4px 8px",
                                  background: "#444",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                }}
                              >
                                Close Output Preview
                              </button>
                            </div>
                          ) : (
                            <div className="clip-score-large">
                              <span className="score-number">
                                {clip.viralScore || clip.score || 85}
                              </span>
                              <span className="score-label">Viral Score</span>
                              <button
                                className="preview-clip-btn"
                                onClick={() => setPreviewClipId(clip.id || index)}
                                style={{
                                  marginTop: "8px",
                                  padding: "6px 12px",
                                  background: "rgba(0, 255, 255, 0.1)",
                                  border: "1px solid cyan",
                                  color: "cyan",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: "bold",
                                }}
                              >
                                ▶ Preview
                              </button>
                            </div>
                          )}
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
                      </div>
                      <div className="clip-actions">
                        <button
                          className="btn-primary"
                          onClick={() => generateClip(clip)}
                          disabled={generatingClipId === clip.id}
                        >
                          {generatingClipId === clip.id ? "Generating..." : "Generate Clip"}
                        </button>

                        <button
                          className="btn-viral-lab"
                          onClick={() =>
                            openComposerWithClip(currentAnalysis.url || currentAnalysis.videoUrl)
                          }
                          title="Open in Viral Lab"
                        >
                          🧬 Viral Lab
                        </button>
                      </div>
                    </div>
                  )
                )}
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
            style={{
              background: "var(--viral-bg-panel)",
              padding: 30,
              borderRadius: 16,
              width: "min(640px,95%)",
              border: "var(--glass-border)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              backdropFilter: "blur(12px)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#fff", fontSize: "1.5rem" }}>Confirm Export</h3>
            <p style={{ color: "var(--viral-text-muted)" }}>
              You&apos;re about to schedule this clip for export to:{" "}
              <strong style={{ color: "var(--viral-accent-primary)" }}>
                {(confirmExport.platforms || []).join(", ")}
              </strong>
            </p>
            <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
              <label style={{ color: "#e2e8f0" }}>Scheduled time</label>
              <input
                type="datetime-local"
                className="cyber-input"
                value={confirmExport.scheduledTime ? confirmExport.scheduledTime.slice(0, 16) : ""}
                onChange={e =>
                  setConfirmExport(prev => ({
                    ...prev,
                    scheduledTime: new Date(e.target.value).toISOString(),
                  }))
                }
                style={{
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "#05050a",
                  color: "#fff",
                  fontFamily: "monospace",
                }}
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

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
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

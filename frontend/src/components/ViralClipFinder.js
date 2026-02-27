// ViralClipFinder.js
// Phase 2: AI Viral Moment Detection (Opus Clip Style)
import React, { useState, useEffect, useRef } from "react";
import "./ViralClipFinder.css";
import { API_BASE_URL } from "../config";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

function ViralClipFinder({ file, onSave, onCancel }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0); // Mock progress for now
  const [scenes, setScenes] = useState([]);
  const [selectedScene, setSelectedScene] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState(null);
  const videoRef = useRef(null);

  // Upload source on mount if it's a file object
  useEffect(() => {
    let active = true;
    const uploadSource = async () => {
      if (file instanceof File) {
        setStatusMessage("Uploading source video for analysis...");
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        try {
          const storagePath = `temp_analysis/${user.uid}/${Date.now()}_source.mp4`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          if (active) setSourceUrl(url);
          setStatusMessage("Ready to analyze.");
        } catch (e) {
          setStatusMessage("Upload failed: " + e.message);
        }
      } else if (file && file.isRemote) {
        setSourceUrl(file.url);
      } else {
        setSourceUrl(file); // Assume string URL
      }
    };
    uploadSource();
    return () => {
      active = false;
    };
  }, [file]);

  // Handle scene selection playback
  useEffect(() => {
    if (selectedScene && videoRef.current) {
      const video = videoRef.current;

      const playVideo = () => {
        video.currentTime = selectedScene.start;
        video.play().catch(e => console.log("Playback failed:", e));
      };

      if (video.readyState >= 3) {
        playVideo();
      } else {
        video.addEventListener("loadeddata", playVideo, { once: true });
      }
    }
  }, [selectedScene]);

  // Stop playback when scene ends
  const handleTimeUpdate = () => {
    if (selectedScene && videoRef.current) {
      if (videoRef.current.currentTime >= selectedScene.end) {
        videoRef.current.pause();
        // Optional: Loop
        // videoRef.current.currentTime = selectedScene.start;
        // videoRef.current.play();
      }
    }
  };

  const handleAnalyze = async () => {
    if (!sourceUrl) return;
    setAnalyzing(true);
    setStatusMessage("AI is watching your video to find viral moments...");

    // Simulate progress while waiting
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 5, 90));
    }, 2000);

    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      // Endpoint matches Node.js backend route
      const response = await fetch(`${API_BASE_URL}/api/media/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileUrl: sourceUrl && sourceUrl.url ? sourceUrl.url : sourceUrl }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 402) {
          throw new Error("Insufficient Growth Credits! Please top up in the Marketplace.");
        }
        throw new Error("Analysis failed: " + errText);
      }

      const data = await response.json();

      const foundScenes = data.scenes || [];
      setScenes(foundScenes);
      setStatusMessage(`Found ${foundScenes.length} viral moments!`);
      setProgress(100);

      // Select first scene by default if available
      if (foundScenes.length > 0) {
        setSelectedScene(foundScenes[0]);
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("Error: " + error.message);
    } finally {
      clearInterval(interval);
      setAnalyzing(false);
    }
  };

  const handleRender = async scene => {
    setRendering(true);
    setStatusMessage(`Rendering Clip ${scene.id}...`);
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/media/render-clip`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: sourceUrl && sourceUrl.url ? sourceUrl.url : sourceUrl, // Handle remote object or string
          startTime: scene.start,
          endTime: scene.end,
        }),
      });

      if (!response.ok) throw new Error("Rendering failed");
      const data = await response.json();

      // Convert URL to File object for parent form
      let newFile;
      try {
        const blob = await fetch(data.url).then(r => r.blob());
        newFile = new File([blob], `viral_clip_${scene.id}.mp4`, { type: "video/mp4" });
      } catch (blobErr) {
        console.warn("CORS prevented blob conversion, using remote URL fallback:", blobErr);
        newFile = {
          name: `viral_clip_${scene.id}.mp4`,
          url: data.url,
          isRemote: true,
        };
      }

      onSave(newFile);
    } catch (e) {
      setStatusMessage("Render Error: " + e.message);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="viral-finder-container">
      <div className="finder-header">
        <h2>🚀 Viral Clip Finder</h2>
        <button className="close-btn" onClick={onCancel}>
          &times;
        </button>
      </div>

      <div className="finder-content">
        {scenes.length === 0 ? (
          <div className="analysis-state">
            <div className="emoji-display">🧠</div>
            <p>{statusMessage || "Upload a long video to automatically extract the best clips."}</p>
            {analyzing && (
              <div className="progress-bar">
                <div className="fill" style={{ width: `${progress}%` }}></div>
              </div>
            )}
            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={analyzing || !sourceUrl}
            >
              {analyzing ? "Analyzing..." : "🔍 Find Viral Clips"}
            </button>
          </div>
        ) : (
          <div className="results-wrapper" style={{ display: "flex", gap: "20px", height: "100%" }}>
            {/* Left Side: Video Player */}
            <div
              className="video-player-section"
              style={{ flex: 2, display: "flex", flexDirection: "column", minWidth: "0" }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  paddingTop: "56.25%",
                  backgroundColor: "#000",
                  borderRadius: "8px",
                }}
              >
                {sourceUrl && (
                  <video
                    ref={videoRef}
                    src={sourceUrl}
                    controls
                    className="preview-player"
                    onTimeUpdate={handleTimeUpdate}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                )}
              </div>
              <div
                className="player-hint"
                style={{ marginTop: "10px", color: "#ccc", textAlign: "center" }}
              >
                {selectedScene
                  ? `Playing Scene: ${formatTime(selectedScene.start)} - ${formatTime(selectedScene.end)}`
                  : "Select a clip to preview"}
              </div>
            </div>

            {/* Right Side: Scene List */}
            <div
              className="results-grid"
              style={{
                flex: 1,
                overflowY: "auto",
                maxHeight: "500px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingRight: "5px",
              }}
            >
              {scenes.map(scene => (
                <div
                  key={scene.id}
                  className={`scene-card ${selectedScene?.id === scene.id ? "active" : ""}`}
                  onClick={() => setSelectedScene(scene)}
                  style={{
                    border: selectedScene?.id === scene.id ? "2px solid #00D1FF" : "1px solid #444",
                    padding: "12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    backgroundColor: selectedScene?.id === scene.id ? "#1a1a1a" : "#2a2a2a",
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div className="scene-score" style={{ fontWeight: "bold" }}>
                      🔥 {scene.viralScore}
                    </div>
                    <div className="duration" style={{ fontSize: "0.9em", color: "#888" }}>
                      {Math.round(scene.duration)}s
                    </div>
                  </div>

                  <div className="scene-info" style={{ marginTop: "5px" }}>
                    <div className="time-range" style={{ fontSize: "0.9em" }}>
                      {formatTime(scene.start)} - {formatTime(scene.end)}
                    </div>
                    {scene.reason && (
                      <div
                        className="scene-reason"
                        style={{ fontSize: "0.8em", color: "#aaa", marginTop: "2px" }}
                      >
                        {scene.reason}
                      </div>
                    )}
                  </div>

                  {selectedScene?.id === scene.id && (
                    <button
                      className="render-btn"
                      onClick={e => {
                        e.stopPropagation();
                        handleRender(scene);
                      }}
                      disabled={rendering}
                      style={{
                        marginTop: "10px",
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#00D1FF",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        color: "white",
                      }}
                    >
                      {rendering ? "Rendering..." : "Export This Clip"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
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

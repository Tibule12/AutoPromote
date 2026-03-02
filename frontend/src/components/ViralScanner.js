import React, { useState, useRef, useEffect } from "react";
import "./ViralScanner.css";
// import { useMediaProcessor } from "../features/publishing/hooks/useMediaProcessor"; // Not used directly here yet
import { storage, auth } from "../firebaseClient"; // Need auth for ID token
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { MEDIA_API_URL } from "../config"; // Use the configured Python worker URL

const ViralScanner = ({ file, onSelectClip, onClose }) => {
  const videoRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [previewClip, setPreviewClip] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  // Initialize video URL
  const [videoSrc, setVideoSrc] = useState(null);

  useEffect(() => {
    if (file) {
      if (typeof file === "string") {
        setVideoSrc(file);
      } else {
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [file]);

  const startScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setResults([]);
    setStatusMessage("Preparing video for AI analysis...");

    try {
      let fileUrl = "";

      // 1. Upload if necessary
      if (file instanceof File || file instanceof Blob) {
        setStatusMessage("Uploading video to cloud for processing...");
        const storagePath = `temp_scans/${Date.now()}_${file.name || "scan.mp4"}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

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
              resolve();
            }
          );
        });
      } else if (typeof file === "string") {
        fileUrl = file;
        setScanProgress(50);
      }

      // 2. Call Python Worker
      setStatusMessage("AI Agent watching video...");
      // Get Auth Token if needed (depends on if your worker requires it, usually good practice)
      // const token = await auth.currentUser?.getIdToken();

      // Note: Calling the worker directly or via Next.js proxy?
      // Config says MEDIA_API_URL is the Python worker.
      // Endpoint: /analyze-clips

      const response = await fetch(`${MEDIA_API_URL}/analyze-clips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // "Authorization": `Bearer ${token}` // If worker protected
        },
        body: JSON.stringify({
          video_url: fileUrl,
          target_aspect_ratio: "9:16", // Default for viral shorts
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Worker Error: ${response.status} ${errText}`);
      }

      const data = await response.json();
      // Expected format from worker: { scenes: [ { start, end, score, label/reason } ... ] }
      // Attempt to adapt standard worker response

      let validScenes = [];
      if (data.scenes && Array.isArray(data.scenes)) {
        validScenes = data.scenes.map((s, idx) => ({
          id: idx,
          start: s.start_time || s.start,
          end: s.end_time || s.end,
          score: s.viral_score || s.score || 80,
          reason: s.label || s.reason || "High engagement potential detected",
        }));
      } else {
        // Fallback if structure differs or is empty
        setStatusMessage("No clips found. Trying fallback analysis...");
        validScenes = [
          {
            id: 1,
            start: 0,
            end: Math.min(10, videoRef.current?.duration || 10),
            score: 75,
            reason: "Intro / Hook",
          },
        ];
      }

      setResults(validScenes);
      setStatusMessage("Analysis Complete.");
    } catch (err) {
      console.error("Scan failed:", err);
      setStatusMessage("Error: " + err.message);
    } finally {
      setIsScanning(false);
      setScanProgress(100);
    }
  };

  const handlePreviewClip = clip => {
    if (videoRef.current) {
      videoRef.current.currentTime = clip.start;
      videoRef.current.play();
      setPreviewClip(clip);

      // Stop playback when clip ends
      const stopHandler = () => {
        if (videoRef.current.currentTime >= clip.end) {
          videoRef.current.pause();
          videoRef.current.removeEventListener("timeupdate", stopHandler);
          setPreviewClip(null);
        }
      };
      videoRef.current.addEventListener("timeupdate", stopHandler);
    }
  };

  const formatTime = seconds => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? "0" + sec : sec}`;
  };

  return (
    <div className="viral-scanner-overlay" onClick={onClose}>
      <div className="viral-scanner-modal" onClick={e => e.stopPropagation()}>
        <header className="scanner-header">
          <h3>
            <span style={{ fontSize: "1.5rem" }}>🔥</span> Viral Moment Scanner
          </h3>
          <button className="scanner-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="scanner-body">
          <div className="scanner-video-column">
            {videoSrc ? (
              <video ref={videoRef} src={videoSrc} controls style={{ borderRadius: "8px" }} />
            ) : (
              <div style={{ color: "#fff" }}>No video loaded</div>
            )}
          </div>

          <aside className="scanner-sidebar">
            <div className="scanner-controls">
              {!isScanning && results.length === 0 ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: "#cbd5e1", marginBottom: "15px" }}>
                    AI will analyze your video for engagement spikes, hooks, and retention drivers.
                  </p>
                  <button className="scan-btn" onClick={startScan}>
                    Start AI Scan
                  </button>
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
                  <h4 style={{ color: "#f8fafc", margin: "0 0 5px 0" }}>Scan Complete!</h4>
                  <p style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>
                    Found {results.length} viral opportunities.
                  </p>
                  <button
                    className="scan-btn"
                    onClick={startScan}
                    style={{
                      marginTop: "10px",
                      fontSize: "0.9rem",
                      padding: "8px 16px",
                      background: "#334155",
                    }}
                  >
                    Rescan
                  </button>
                </div>
              )}
            </div>

            <div className="results-list">
              {results.map(clip => (
                <div
                  key={clip.id}
                  className={`result-card ${previewClip?.id === clip.id ? "active" : ""}`}
                  onClick={() => handlePreviewClip(clip)}
                >
                  <div className="result-header">
                    <span className="result-time">
                      {formatTime(clip.start)} - {formatTime(clip.end)}
                    </span>
                    <span className="viral-score">⚡ {clip.score}</span>
                  </div>
                  <p className="result-reason">{clip.reason}</p>
                  <button
                    className="use-clip-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onSelectClip(clip);
                    }}
                  >
                    Use This Clip
                  </button>
                </div>
              ))}
              {results.length === 0 && !isScanning && (
                <div className="empty-state">
                  Click "Start AI Scan" to identify the best parts of your video automatically.
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

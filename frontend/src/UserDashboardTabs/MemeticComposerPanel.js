import React, { useEffect, useState, useRef } from "react";
import { getAuth } from "firebase/auth";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./MemeticComposerPanel.css";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Extended params for full Viral Engineering
const defaultParams = {
  novelty: 50,
  valence: 50, // Mood: 0 (Dark) - 100 (Cute/Happy)
  trendiness: 50,
  hookTiming: "early", // early (0-2s), balanced (2-5s), build-up (5s+)
  tempo: 1.0, // 0.8x - 1.5x
  ambiguity: 30, // 0 (Direct) - 100 (Cryptic)
  thumbnailStrategy: "text_overlay", // face_closeup, text_overlay, action_frame
  captionStyle: "viral", // viral, cute, minimal
};

const MemeticComposerPanel = ({ onClose, initialVideoUrl = null }) => {
  const [seedVideo, setSeedVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [params, setParams] = useState(defaultParams);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plan, setPlan] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Audio Playback Refs (repurposed for preview)
  const videoPreviewRef = useRef(null);

  // Simulation State
  const canvasRef = useRef(null);

  // modal state for variant preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVariant, setPreviewVariant] = useState(null);

  // --- Effects ---

  // Draw Simulation Graph when params change
  useEffect(() => {
    drawSimulationGraph();
  }, [params]);

  // --- Handlers ---

  const handleFileChange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setSeedVideo(file);
    setVideoUrl(URL.createObjectURL(file));

    // Auto-upload to get processed URL
    setUploading(true);
    try {
      const auth = getAuth();
      const storage = getStorage();
      const storageRef = ref(
        storage,
        `memetic_seeds/${auth.currentUser.uid}/${Date.now()}_${file.name}`
      );
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setVideoUrl(url); // Switch to remote URL
      toast.success("Seed video uploaded successfully!");
    } catch (err) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const generateMutations = async () => {
    if (!videoUrl || uploading) {
      toast.error("Please upload a video first.");
      return;
    }

    setLoadingPlan(true);

    try {
      const auth = getAuth();
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const res = await fetch(`${API_BASE_URL}/api/media/memetic/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          videoUrl,
          baseVariant: {
            novelty: params.novelty,
            valence: params.valence,
            trendiness: params.trendiness,
            tempo: params.tempo,
            hookTiming: params.hookTiming, // passed
            ambiguity: params.ambiguity,
          },
        }),
      });

      if (!res.ok) throw new Error("Mutation failed");

      const data = await res.json();

      // Map backend variants to frontend preview capable objects
      // Using original videoUrl as placeholder for preview if backend didn't return one
      const enhancedVariants = data.variants.map(v => ({
        ...v,
        videoUrl: v.previewUrl || videoUrl,
      }));

      setPlan({ ...data, variants: enhancedVariants });
      toast.success("Mutations Generated! 🧬");
    } catch (err) {
      console.error(err);
      toast.error("Generation failed: " + err.message);
    } finally {
      setLoadingPlan(false);
    }
  };

  const applyVariant = async variant => {
    toast("Generating Preview for: " + variant.style.toUpperCase() + "...");

    try {
      const auth = getAuth();
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const res = await fetch(`${API_BASE_URL}/api/media/memetic/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          videoUrl,
          variantId: variant.id,
          style: variant.style,
        }),
      });

      if (!res.ok) throw new Error("Preview generation failed");
      const data = await res.json();

      // Update the variant with the real preview URL
      const updatedV = { ...variant, videoUrl: data.previewUrl };
      setPreviewVariant(updatedV);
      setPreviewOpen(true);
      toast.success("Preview Ready! 🎬");
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    }
  };

  const drawSimulationGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid (Tron-like)
    ctx.strokeStyle = "rgba(0, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Virality Curve Logic
    const points = [];
    const steps = 100;

    // Base Curve
    let currentY = height * 0.8;

    ctx.beginPath();
    ctx.moveTo(0, currentY);

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;

      // Novelty Factor (Initial Spike)
      const noveltyBoost = i < 15 ? (params.novelty / 100) * 50 : 0;

      // Valence Factor (Positive keeps it high)
      const valenceTrend = ((params.valence - 50) / 50) * i * 0.5;

      // Chaos (Random Jitter)
      const jitter = (Math.random() - 0.5) * (params.trendiness / 5);

      // Calculate Y
      // Start low/mid, rise based on Novelty, Sustain based on Valence
      const wave = Math.sin((i / 10) * params.tempo) * 10;
      const targetY = height * 0.6 - noveltyBoost - valenceTrend + wave + jitter;

      // Smooth transition
      currentY += (targetY - currentY) * 0.1;

      ctx.lineTo(x, currentY);
    }

    // Gradient Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(0, 255, 255, 0.6)");
    gradient.addColorStop(1, "rgba(0, 255, 255, 0.0)");

    ctx.strokeStyle = "#00FFFF";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Close path for fill
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewVariant(null);
  };

  return (
    <div className="memetic-composer-panel">
      {/* Header */}
      <div className="composer-header">
        <h2 className="glitch-text" data-text="MEMETIC COMPOSER">
          MEMETIC COMPOSER_
        </h2>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="composer-grid">
        {/* Left: Lab Controls */}
        <div className="lab-section">
          <h3>🧬 Mutation Genes</h3>

          <div className="gene-control">
            <label>Novelty (Surprise Factor)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.novelty}
              onChange={e => setParams({ ...params, novelty: parseInt(e.target.value) })}
            />
            <span className="value-display">{params.novelty}%</span>
          </div>

          <div className="gene-control">
            <label>Valence (Mood: Dark vs. Cute)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.valence}
              onChange={e => setParams({ ...params, valence: parseInt(e.target.value) })}
            />
            <div className="mood-labels">
              <span>💀 Dark</span>
              <span>😊 Cute</span>
            </div>
          </div>

          <div className="gene-control">
            <label>Chaos / Trendiness</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.trendiness}
              onChange={e => setParams({ ...params, trendiness: parseInt(e.target.value) })}
            />
            <span className="value-display">{params.trendiness}%</span>
          </div>

          <div className="gene-control">
            <label>Tempo Multiplier</label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={params.tempo}
              onChange={e => setParams({ ...params, tempo: parseFloat(e.target.value) })}
            />
            <span className="value-display">{params.tempo}x</span>
          </div>
        </div>

        {/* Center: Propagation Simulator */}
        <div className="simulation-section">
          <h3>📈 Viral Propagation Simulator</h3>
          <div className="canvas-container">
            <canvas ref={canvasRef} width={600} height={300}></canvas>
          </div>

          <div className="seed-upload-area">
            {!videoUrl ? (
              <div className="upload-placeholder">
                <label htmlFor="seed-upload" className="upload-btn">
                  📂 Upload Seed Video
                </label>
                <input
                  id="seed-upload"
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  hidden
                />
                <p>MP4, MOV (Limit 50MB)</p>
              </div>
            ) : (
              <div className="video-preview-mini">
                <video src={videoUrl} controls className="seed-video-preview" />
                <button
                  className="clear-video-btn"
                  onClick={() => {
                    setVideoUrl(null);
                    setSeedVideo(null);
                  }}
                >
                  🗑️ Clear
                </button>
              </div>
            )}
          </div>

          <button
            className={`generate-btn ${loadingPlan ? "loading" : ""}`}
            onClick={generateMutations}
            disabled={!videoUrl || loadingPlan}
          >
            {loadingPlan ? "BREEDING VARIANTS..." : "🚀 GENERATE MUTATIONS"}
          </button>
        </div>

        {/* Right: Results / Variants */}
        <div className="variants-section">
          <h3>🧪 Experimental Results</h3>

          {!plan && (
            <div className="empty-state">
              <p>No mutations generated yet.</p>
              <p>Upload a seed video and adjust genes to begin breeding.</p>
            </div>
          )}

          {plan && (
            <div className="variants-list">
              {plan.variants.map(v => (
                <div
                  key={v.id}
                  className={`variant-card style-${v.style}`}
                  onClick={() => applyVariant(v)}
                >
                  <div className="variant-header">
                    <h4>{v.title}</h4>
                    <span className="viral-score">{v.viralScore} VR</span>
                  </div>
                  <p className="variant-reason">{v.reason}</p>
                  <div className="variant-actions">
                    <button className="preview-btn">👁️ Preview</button>
                    <button className="export-btn">💾 Export</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && previewVariant && (
        <div className="preview-modal-overlay">
          <div className="preview-modal-content">
            <h3>Preview: {previewVariant.title}</h3>
            <div className="preview-player-placeholder">
              {/* In real app, this plays the variant.previewUrl */}
              <video
                src={previewVariant.videoUrl}
                controls
                autoPlay
                loop
                style={{ width: "100%" }}
              />
              <div className="variant-hud-overlay">
                <span>STYLE: {previewVariant.style.toUpperCase()}</span>
              </div>
            </div>
            <button className="close-btn-modal" onClick={closePreview}>
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemeticComposerPanel;

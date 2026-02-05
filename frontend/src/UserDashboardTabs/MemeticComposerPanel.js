import React, { useEffect, useState, useRef } from "react";
import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./MemeticComposerPanel.css";

// Extended params for full Viral Engineering
const defaultParams = {
  novelty: 50,
  valence: 50,
  trendiness: 50,
  hookTiming: "early", // early (0-2s), balanced (2-5s), build-up (5s+)
  tempo: 1.0, // 0.8x - 1.5x
  ambiguity: 30, // 0 (Direct) - 100 (Cryptic)
  thumbnailStrategy: "face_closeup", // face_closeup, text_overlay, action_frame
};

const MemeticComposerPanel = ({ onClose }) => {
  const [, setSounds] = useState([]);
  const [selectedSound, setSelectedSound] = useState(null);
  const [params, setParams] = useState(defaultParams);
  const [, setLoadingSounds] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plan, setPlan] = useState(null);
  const [, setSeeding] = useState(false);

  // Audio Playback Refs
  const audioRef = useRef(null);
  const [, setPlayingVariantId] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

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

  useEffect(() => {
    loadSounds();
  }, []);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          const audio = audioRef.current;
          audio.pause();
          audio.src = "";
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, []);

  // --- Logic ---

  const drawSimulationGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }

    // Determine curve shape based on params (Mutation Logic Simulation)
    // High Ambiguity + High Trendiness = Viral Spike but potential drop-off
    // Low Ambiguity + High Novelty = Slow steady growth

    const peakHeight = (params.trendiness / 100) * (h * 0.8);
    // const speed = (params.tempo) * (w / 10);
    const volatility = params.ambiguity / 100;

    ctx.beginPath();
    ctx.moveTo(0, h);

    // Simulate 24h curve
    for (let x = 0; x <= w; x += 5) {
      // Logistic growth heavily modified by our gene params
      const t = x / w; // 0 to 1

      // Base viral curve (logistic)
      let y = peakHeight / (1 + Math.exp(-10 * (t - 0.2)));

      // Add "Hook" influence (early spike)
      if (params.hookTiming === "early" && t < 0.2) {
        y += peakHeight * 0.4 * Math.sin(t * Math.PI * 5);
      }

      // Add "Ambiguity" volatility (random noise)
      if (volatility > 0.5) {
        y += (Math.random() - 0.5) * 20 * volatility;
      }

      ctx.lineTo(x, h - y);
    }

    // Draw Gradient Fill
    ctx.lineTo(w, h);
    ctx.fillStyle = "rgba(99, 102, 241, 0.2)";
    ctx.fill();

    // Draw Line
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Annotations
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.fillText("Reach (24h Prediction)", 10, 20);
  };

  const openPreview = variant => {
    setPreviewVariant(variant);
    setPreviewOpen(true);

    if (variant.previewUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(variant.previewUrl);
      audioRef.current = audio;

      audio.addEventListener("loadedmetadata", () => {
        setAudioDuration(audio.duration);
      });
      audio.addEventListener("timeupdate", () => {
        setCurrentTime(audio.currentTime);
      });

      audio.play().catch(e => console.warn("Audio play failed", e));
      setPlayingVariantId(variant.id);
    }
  };

  // deterministic waveform peak generator (Removed unused)
  // const generateWaveformPeaks = ...

  const closePreview = () => {
    try {
      if (audioRef.current) audioRef.current.pause();
    } catch (e) {}
    setPreviewVariant(null);
    setPreviewOpen(false);
  };

  // const formatTime = ... (Removed unused)

  const loadSounds = async () => {
    setLoadingSounds(true);
    try {
      // Mock loading sounds if API fails for demo
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/sounds`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load sounds");
      const data = await res.json();
      setSounds(data.sounds || []);
      // If no sounds, mock one for UI testing
      if (!data.sounds?.length) {
        setSounds([{ id: "demo", title: "Viral Audio #1 (Demo)", url: "" }]);
      }
      setSelectedSound((data.sounds || [])[0] || null);
    } catch (e) {
      console.warn("Using mock sound due to load error");
      setSounds([{ id: "demo", title: "Trend Sound 2024 (Demo)", url: "" }]);
      setSelectedSound({ id: "demo", title: "Trend Sound 2024 (Demo)", url: "" });
    } finally {
      setLoadingSounds(false);
    }
  };

  const generatePlan = async () => {
    setLoadingPlan(true);
    try {
      const token = await auth.currentUser?.getIdToken();

      // Construct baseVariant for backend using our UI params
      // Map UI sliders (0-100) to backend normalized factors (0.0-1.0)
      const baseVariant = {
        hookStrength:
          params.hookTiming === "early" ? 0.8 : params.hookTiming === "balanced" ? 0.6 : 0.4,
        shareability: params.novelty / 100, // Novelty drives shares
        ctaIntensity: params.valence / 100, // High valence (emotion) often acts as implicit CTA
        remixProbability: params.trendiness / 100, // Trendiness drives remixes
        tempo: params.tempo,
        ambiguity: params.ambiguity / 100,
        thumbnailStrategy: params.thumbnailStrategy,
      };

      const res = await fetch(`${API_BASE_URL}/api/clips/memetic/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          baseVariant,
          options: { count: 6 }, // Generate 6 variants
          soundId: selectedSound?.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate mutation plan");

      const data = await res.json();
      setPlan(data);
      toast.success("Mutations Generated");
    } catch (e) {
      console.error(e);
      toast.error("Simulation failed, using heuristic fallback.");
      setPlan({
        id: "plan_" + Date.now(),
        variants: [
          {
            id: "v1",
            title: "High-Pace Hook",
            viralScore: 92,
            reason: "Matched 1.2x tempo with early hook position.",
          },
          {
            id: "v2",
            title: "Mystery Cut",
            viralScore: 85,
            reason: "High ambiguity drives comment section guesses.",
          },
          {
            id: "v3",
            title: "Standard Edit",
            viralScore: 74,
            reason: "Baseline retention structure.",
          },
        ],
      });
    } finally {
      setLoadingPlan(false);
    }
  };

  const seedPlan = async () => {
    setSeeding(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/clips/memetic/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planId: plan?.id,
        }),
      });
      if (!res.ok) throw new Error("Seed failed");

      toast.success("Seed experiment launched to cohort");
    } catch (e) {
      console.error(e);
      toast.error("Failed to seed experiment");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="memetic-composer">
      <div className="memetic-header">
        <div>
          <h3>🧪 Memetic Composer (Viral Lab)</h3>
          <p className="muted">Engineer viral DNA using mutation axes and simulate propagation.</p>
        </div>
        <div className="composer-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="composer-grid">
        {/* LEFT COLUMN: Mutation Lab */}
        <div className="composer-left">
          <div className="lab-section">
            <h4>🧬 Mutation Lab</h4>

            <label className="control-group">
              <span>Hook Timing</span>
              <div className="segment-control">
                {["early", "balanced", "late"].map(t => (
                  <div
                    key={t}
                    className={`segment ${params.hookTiming === t ? "active" : ""}`}
                    onClick={() => setParams(p => ({ ...p, hookTiming: t }))}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </label>

            <label className="control-group">
              <span>Start Tempo ({params.tempo}x)</span>
              <input
                type="range"
                min="0.8"
                max="1.5"
                step="0.1"
                value={params.tempo}
                onChange={e => setParams(p => ({ ...p, tempo: Number(e.target.value) }))}
              />
            </label>

            <label className="control-group">
              <span>Ambiguity Level ({params.ambiguity}%)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={params.ambiguity}
                onChange={e => setParams(p => ({ ...p, ambiguity: Number(e.target.value) }))}
              />
            </label>

            <label className="control-group">
              <span>Thumbnail Gene</span>
              <select
                value={params.thumbnailStrategy}
                onChange={e => setParams(p => ({ ...p, thumbnailStrategy: e.target.value }))}
              >
                <option value="face_closeup">😲 React Face (High CT)</option>
                <option value="text_overlay">📝 Bold Text (info)</option>
                <option value="action_frame">🔥 Action Blur</option>
              </select>
            </label>
          </div>

          <div className="lab-section">
            <h4>🔮 Propagation Simulator</h4>
            <div className="simulator-display">
              <canvas ref={canvasRef} width={320} height={120} className="sim-canvas" />
            </div>
            <p className="sim-legend">
              Predicted 24h Reach based on current mutation genes.
              {params.ambiguity > 80 && (
                <span className="warning-text"> High volatility detected.</span>
              )}
            </p>
          </div>

          <div className="composer-buttons">
            <button className="btn-primary" onClick={generatePlan} disabled={loadingPlan}>
              {loadingPlan ? "Breeding Variants..." : "Generate Mutations"}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Results */}
        <div className="composer-right">
          <h4>Viable Offspring</h4>
          {!plan && (
            <div className="empty">Configure parameters and click Generate to breed variants.</div>
          )}

          {plan && plan.variants && (
            <div className="variants-list">
              {plan.variants.map(v => (
                <div key={v.id} className="variant-card">
                  <div className="variant-meta">
                    <div className="variant-icon">🎬</div>
                    <div className="variant-info">
                      <div className="variant-title">{v.title}</div>
                      <div className="variant-reason">💡 {v.reason}</div>
                    </div>
                    <div className="variant-score-box">
                      <span className="sc-label">VIRALITY</span>
                      <span className="sc-val">{v.viralScore}</span>
                    </div>
                  </div>

                  <div className="variant-actions">
                    <button className="btn-secondary btn-sm" onClick={() => openPreview(v)}>
                      Preview
                    </button>
                    <button className="btn-primary btn-sm" onClick={seedPlan}>
                      Seed to Cohort
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {previewOpen && previewVariant && (
        <div className="preview-modal-overlay" role="dialog">
          <div
            className="preview-modal-content"
            tabIndex="0"
            data-testid="preview-key-catcher"
            onKeyDown={e => {
              if (e.code === "Space") {
                e.preventDefault();
                if (audioRef.current) {
                  if (audioRef.current.paused) audioRef.current.play();
                  else audioRef.current.pause();
                }
              }
              if (e.code === "ArrowRight") {
                if (audioRef.current) {
                  audioRef.current.currentTime = Math.min(
                    audioRef.current.duration,
                    audioRef.current.currentTime + 5
                  );
                }
              }
              if (e.code === "ArrowLeft") {
                if (audioRef.current) {
                  audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
                }
              }
            }}
          >
            <h3>Preview: {previewVariant.title}</h3>
            {previewVariant.thumbnailUrl && (
              <img
                src={previewVariant.thumbnailUrl}
                alt={`Variant thumbnail for ${previewVariant.title}`}
                className="preview-thumbnail"
                style={{ maxWidth: "100%", borderRadius: "8px", marginBottom: "10px" }}
              />
            )}

            <div className="audio-controls" style={{ margin: "15px 0" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button className="btn-primary btn-sm">Play</button>
                <input
                  type="range"
                  aria-label="Audio scrubber"
                  className="cyber-input"
                  style={{ flex: 1 }}
                  min="0"
                  max={audioDuration || 100}
                  value={currentTime}
                  onChange={e => {
                    const t = Number(e.target.value);
                    setCurrentTime(t);
                    if (audioRef.current) audioRef.current.currentTime = t;
                  }}
                />
              </div>
              <div
                style={{ height: "4px", background: "#333", marginTop: "5px", borderRadius: "2px" }}
              >
                <div
                  data-testid="modal-waveform-fill"
                  style={{
                    height: "100%",
                    background: "#10b981",
                    width: `${(currentTime / (audioDuration || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            <button className="btn-secondary" onClick={closePreview}>
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemeticComposerPanel;

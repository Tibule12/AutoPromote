import React, { useEffect, useState } from "react";
import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./MemeticComposerPanel.css";

const defaultParams = { novelty: 50, valence: 50, trendiness: 50 };

const MemeticComposerPanel = ({ onClose }) => {
  const [sounds, setSounds] = useState([]);
  const [selectedSound, setSelectedSound] = useState(null);
  const [params, setParams] = useState(defaultParams);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plan, setPlan] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const audioRef = React.useRef(null);
  const [playingVariantId, setPlayingVariantId] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioHandlersRef = React.useRef({});

  // modal state for variant preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVariant, setPreviewVariant] = useState(null);

  const openPreview = variant => {
    setPreviewVariant(variant);
    setPreviewOpen(true);
    // prepare audio for preview
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = variant.previewUrl || variant.url || selectedSound?.url || "";
    setAudioCurrentTime(0);
    setAudioDuration(0);
  };

  const closePreview = () => {
    // pause playback and close
    try {
      if (audioRef.current) audioRef.current.pause();
    } catch (e) {}
    setPreviewVariant(null);
    setPreviewOpen(false);
  };

  const formatTime = secs => {
    const s = Math.floor(secs || 0);
    const mins = Math.floor(s / 60);
    const secsDisplay = s % 60;
    return `${mins}:${secsDisplay.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    loadSounds();
  }, []);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          // remove event listeners if present
          const audio = audioRef.current;
          const handlers = audioHandlersRef.current || {};
          if (audio.removeEventListener) {
            if (handlers.loadedmetadata)
              audio.removeEventListener("loadedmetadata", handlers.loadedmetadata);
            if (handlers.timeupdate) audio.removeEventListener("timeupdate", handlers.timeupdate);
            if (handlers.ended) audio.removeEventListener("ended", handlers.ended);
          } else {
            if (handlers.loadedmetadata) audio.onloadedmetadata = null;
            if (handlers.timeupdate) audio.ontimeupdate = null;
            if (handlers.ended) audio.onended = null;
          }
          audio.pause();
        } catch (e) {
          /* ignore */
        }
        audioRef.current = null;
        audioHandlersRef.current = {};
        setAudioDuration(0);
        setAudioCurrentTime(0);
        setPlayingVariantId(null);
      }
    };
  }, []);

  const loadSounds = async () => {
    setLoadingSounds(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/sounds`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load sounds");
      const data = await res.json();
      setSounds(data.sounds || []);
      setSelectedSound((data.sounds || [])[0] || null);
    } catch (e) {
      console.error("Failed to fetch sounds", e);
      toast.error("Could not load sounds");
    } finally {
      setLoadingSounds(false);
    }
  };

  const generatePlan = async () => {
    if (!selectedSound) return toast.error("Select a sound first");
    setLoadingPlan(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const body = {
        baseSound: selectedSound.id || selectedSound.providerId || selectedSound.url,
        mutationParams: params,
      };
      const res = await fetch(`${API_BASE_URL}/api/clips/memetic/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "plan failed" }));
        throw new Error(err.error || "Plan failed");
      }
      const data = await res.json();
      setPlan(data);
      toast.success("Plan generated");
    } catch (e) {
      console.error("Plan error", e);
      toast.error(e.message || "Failed to generate plan");
    } finally {
      setLoadingPlan(false);
    }
  };

  const seedPlan = async () => {
    if (!plan || !plan.variants) return toast.error("No plan to seed");
    setSeeding(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/clips/memetic/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: "Composer experiment", plan: plan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "seed failed" }));
        throw new Error(err.error || "Seed failed");
      }
      await res.json().catch(() => null);
      toast.success("Seed created");
      setPlan(null);
    } catch (e) {
      console.error("Seed error", e);
      toast.error(e.message || "Failed to seed plan");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="memetic-composer">
      <div className="memetic-header">
        <div>
          <h3>🧪 Memetic Composer</h3>
          <p className="muted">Design, mutate, and seed memetic experiments from a sound</p>
        </div>
        <div className="composer-actions">
          <button className="btn-secondary" onClick={onClose} aria-label="Close composer">
            Close
          </button>
        </div>
      </div>

      <div className="composer-grid">
        <div className="composer-left">
          <label htmlFor="sound-select">Base Sound</label>
          <select
            id="sound-select"
            value={selectedSound?.id || ""}
            onChange={e => setSelectedSound(sounds.find(s => (s.id || "") === e.target.value))}
          >
            {loadingSounds && <option>Loading sounds...</option>}
            {!loadingSounds && sounds.length === 0 && <option>No sounds available</option>}
            {!loadingSounds &&
              sounds.map(s => (
                <option key={s.id || s.providerId || s.url} value={s.id || s.providerId || s.url}>
                  {s.title ||
                    s.name ||
                    `${s.provider || "sound"} - ${s.id || s.providerId || s.url}`}
                </option>
              ))}
          </select>

          <div className="mutation-controls">
            <h4>Mutation Controls</h4>
            <label>
              Novelty: <strong>{params.novelty}</strong>
              <input
                type="range"
                min="0"
                max="100"
                value={params.novelty}
                onChange={e => setParams(p => ({ ...p, novelty: Number(e.target.value) }))}
              />
            </label>
            <label>
              Emotional Valence: <strong>{params.valence}</strong>
              <input
                type="range"
                min="0"
                max="100"
                value={params.valence}
                onChange={e => setParams(p => ({ ...p, valence: Number(e.target.value) }))}
              />
            </label>
            <label>
              Trendiness: <strong>{params.trendiness}</strong>
              <input
                type="range"
                min="0"
                max="100"
                value={params.trendiness}
                onChange={e => setParams(p => ({ ...p, trendiness: Number(e.target.value) }))}
              />
            </label>

            <div className="composer-buttons">
              <button className="btn-primary" onClick={generatePlan} disabled={loadingPlan}>
                {loadingPlan ? "Generating..." : "Generate Plan"}
              </button>
            </div>
          </div>
        </div>

        <div className="composer-right">
          <h4>Plan & Variants</h4>
          {!plan && <div className="empty">No plan yet — generate to see variants</div>}
          {plan && plan.variants && (
            <div className="variants-list">
              {plan.variants.map(v => (
                <div key={v.id} className="variant-card">
                  <div className="variant-meta">
                    {v.thumbnailUrl && (
                      <img
                        src={v.thumbnailUrl}
                        alt={v.caption || v.title || "Variant thumbnail"}
                        className="variant-thumbnail"
                        onClick={() => openPreview(v)}
                        role="button"
                      />
                    )}
                    <div className="variant-caption">{v.caption || v.title || "Variant"}</div>
                    <div className="variant-score">⚡ {v.score || v.viralScore || "—"}</div>
                  </div>
                  <div className="variant-actions">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const url = v.previewUrl || selectedSound?.url;
                        if (!url) return toast.error("No audio available for preview");

                        if (!audioRef.current) audioRef.current = new Audio();
                        const audio = audioRef.current;

                        // pause if already playing this variant
                        if (playingVariantId === v.id) {
                          audio.pause();
                          setPlayingVariantId(null);
                          return;
                        }

                        audio.src = url;
                        // attach events
                        const handlers = {};
                        handlers.loadedmetadata = () => setAudioDuration(audio.duration || 0);
                        handlers.timeupdate = () => setAudioCurrentTime(audio.currentTime || 0);
                        handlers.ended = () => setPlayingVariantId(null);

                        // store handlers to remove later on cleanup
                        audioHandlersRef.current = handlers;

                        if (audio.addEventListener) {
                          audio.addEventListener("loadedmetadata", handlers.loadedmetadata);
                          audio.addEventListener("timeupdate", handlers.timeupdate);
                          audio.addEventListener("ended", handlers.ended);
                        } else {
                          // fallback for older browsers
                          audio.onloadedmetadata = handlers.loadedmetadata;
                          audio.ontimeupdate = handlers.timeupdate;
                          audio.onended = handlers.ended;
                        }

                        audio
                          .play()
                          .then(() => setPlayingVariantId(v.id))
                          .catch(err => {
                            console.error("Audio play failed", err);
                            toast.error("Unable to play audio preview");
                          });
                      }}
                    >
                      {playingVariantId === v.id ? "Pause" : "Preview"}
                    </button>
                    <button className="btn-primary btn-sm" onClick={seedPlan} disabled={seeding}>
                      {seeding ? "Seeding..." : "Seed Plan"}
                    </button>
                  </div>

                  {/* Scrubber (visible when this variant is playing or has loaded) */}
                  {playingVariantId === v.id && (
                    <div className="audio-scrubber">
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, audioDuration)}
                        step="0.1"
                        value={Math.min(audioCurrentTime, audioDuration)}
                        onChange={e => {
                          const t = Number(e.target.value);
                          if (
                            audioRef.current &&
                            typeof audioRef.current.currentTime !== "undefined"
                          ) {
                            audioRef.current.currentTime = t;
                            setAudioCurrentTime(t);
                          }
                        }}
                        aria-label="Audio scrubber"
                      />
                      <div className="scrubber-times">
                        {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                      </div>
                    </div>
                  )}

                  {/* small visual progress bar when playing */}
                  {playingVariantId === v.id && (
                    <div className="waveform-bar" aria-hidden="true">
                      <div
                        className="waveform-fill"
                        style={{
                          width:
                            audioDuration > 0
                              ? `${(audioCurrentTime / audioDuration) * 100}%`
                              : `0%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Preview Modal */}
          {previewOpen && previewVariant && (
            <div className="preview-modal-overlay" role="dialog" aria-modal="true">
              <div className="preview-modal">
                <div className="preview-header">
                  <h4>{previewVariant.caption || previewVariant.title || "Preview"}</h4>
                  <div>
                    <button
                      className="btn-secondary"
                      onClick={closePreview}
                      aria-label="Close preview"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="preview-content">
                  {previewVariant.thumbnailUrl && (
                    <img
                      className="preview-image"
                      src={previewVariant.thumbnailUrl}
                      alt={previewVariant.caption || previewVariant.title || "Preview"}
                    />
                  )}

                  <div className="preview-meta">
                    <p>{previewVariant.reason || previewVariant.description || ""}</p>

                    <div className="modal-controls">
                      <button
                        className="btn-primary"
                        onClick={() => {
                          try {
                            if (!audioRef.current) audioRef.current = new Audio();
                            const audio = audioRef.current;
                            audio.src =
                              previewVariant.previewUrl ||
                              previewVariant.url ||
                              selectedSound?.url ||
                              "";

                            // attach handlers similar to inline preview
                            const handlers = {};
                            handlers.loadedmetadata = () => setAudioDuration(audio.duration || 0);
                            handlers.timeupdate = () => setAudioCurrentTime(audio.currentTime || 0);
                            handlers.ended = () => setPlayingVariantId(null);
                            audioHandlersRef.current = handlers;
                            if (audio.addEventListener) {
                              audio.addEventListener("loadedmetadata", handlers.loadedmetadata);
                              audio.addEventListener("timeupdate", handlers.timeupdate);
                              audio.addEventListener("ended", handlers.ended);
                            } else {
                              audio.onloadedmetadata = handlers.loadedmetadata;
                              audio.ontimeupdate = handlers.timeupdate;
                              audio.onended = handlers.ended;
                            }

                            audio.play();
                            setPlayingVariantId(previewVariant.id);
                          } catch (e) {
                            toast.error("Unable to play preview");
                          }
                        }}
                      >
                        Play
                      </button>

                      <button
                        className="btn-secondary"
                        onClick={() => {
                          try {
                            if (audioRef.current) audioRef.current.pause();
                          } catch (e) {}
                          setPlayingVariantId(null);
                        }}
                      >
                        Pause
                      </button>

                      <div style={{ flex: 1 }} />

                      <div className="scrubber-times">
                        {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                      </div>
                    </div>

                    {/* waveform in modal */}
                    <div className="waveform-bar" aria-hidden="true" style={{ marginTop: 12 }}>
                      <div
                        className="waveform-fill"
                        data-testid="modal-waveform-fill"
                        style={{
                          width:
                            audioDuration > 0
                              ? `${(audioCurrentTime / audioDuration) * 100}%`
                              : `0%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemeticComposerPanel;

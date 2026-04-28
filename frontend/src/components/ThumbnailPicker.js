/**
 * ThumbnailPicker.js
 * Beautiful frame-by-frame thumbnail selector with text overlay editor.
 * Users extract candidate frames, pick one, customize with text, and save.
 */
import React, { useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./ThumbnailPicker.css";

const PLATFORMS = {
  tiktok:    { label: "TikTok / Shorts", icon: "🎵", ratio: "9:16" },
  youtube:   { label: "YouTube",         icon: "▶️", ratio: "16:9" },
  instagram: { label: "Instagram",        icon: "📸", ratio: "1:1" },
  facebook:  { label: "Facebook",         icon: "👤", ratio: "1.91:1" },
  twitter:   { label: "Twitter / X",      icon: "🐦", ratio: "16:9" },
  linkedin:  { label: "LinkedIn",         icon: "💼", ratio: "1.91:1" },
};

const MOODS = ["energetic", "calm", "luxurious", "playful", "mysterious", "educational", "minimal"];

const MOOD_LABELS = {
  energetic:  ["🔥", "Energetic"],
  calm:       ["🌊", "Calm"],
  luxurious:  ["💎", "Luxurious"],
  playful:    ["🎉", "Playful"],
  mysterious: ["🌙", "Mysterious"],
  educational:["📚", "Educational"],
  minimal:    ["◻️", "Minimal"],
};

export default function ThumbnailPicker({ contentId, mediaUrl, title = "", onSaved }) {
  const [frames, setFrames] = useState([]);
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [headline, setHeadline] = useState(title || "");
  const [subtitle, setSubtitle] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [mood, setMood] = useState("energetic");
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const carouselRef = useRef(null);

  const apiHeaders = useCallback(() => {
    const token = localStorage.getItem("token") || "test-token";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const extractFrames = useCallback(async () => {
    if (!contentId) return toast.error("No content selected");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/content/${contentId}/thumbnail/extract-frames`,
        {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({ count: 8, strategy: "smart" }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Extraction failed");
      }
      const data = await res.json();
      setFrames(data.frames || []);
      setDuration(data.duration || 0);
      setSelectedFrameIdx(0);
      toast.success(`Extracted ${data.frames.length} frames`);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [contentId, apiHeaders]);

  const generateThumbnail = useCallback(async () => {
    if (!contentId || !frames.length) return toast.error("Extract frames first");
    setGenerating(true);
    setError(null);
    try {
      const selectedFrame = frames[selectedFrameIdx];
      const res = await fetch(
        `${API_BASE_URL}/api/content/${contentId}/thumbnail/generate`,
        {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
            time: selectedFrame.time,
            platform,
            headline,
            subtitle,
            mood,
            saveToStorage: true,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed");
      }
      const data = await res.json();
      setPreviewUrl(data.thumbnail?.storageUrl || data.thumbnail?.dataUrl);
      toast.success("Thumbnail saved! 🎉");
      if (onSaved) onSaved(data.thumbnail);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }, [contentId, frames, selectedFrameIdx, platform, headline, subtitle, mood, apiHeaders, onSaved]);

  const generateAll = useCallback(async () => {
    if (!contentId) return toast.error("No content selected");
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/content/${contentId}/thumbnail/generate-all`,
        {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
            time: frames[selectedFrameIdx]?.time || 2,
            headline,
            subtitle,
            mood,
            showBrand: true,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Bulk generation failed");
      }
      const data = await res.json();
      const firstPlat = Object.keys(data.thumbnails)[0];
      if (firstPlat) setPreviewUrl(data.thumbnails[firstPlat]?.storageUrl);
      toast.success("Thumbnails generated for all platforms! 🚀");
      if (onSaved) onSaved(data.thumbnails);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }, [contentId, frames, selectedFrameIdx, headline, subtitle, mood, apiHeaders, onSaved]);

  const scrollCarousel = (dir) => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: dir * 200, behavior: "smooth" });
    }
  };

  return (
    <div className="thumbnail-picker">
      {/* Header */}
      <div className="tp-header">
        <h2 className="tp-title">
          <span>🎬</span> Thumbnail Studio
        </h2>
        <p className="tp-subtitle">Pick a frame, add your hook, and make it pop!</p>
      </div>

      {/* Error display */}
      {error && (
        <div className="tp-error">
          ⚠️ {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Step 1: Extract Frames */}
      <div className="tp-section">
        <div className="tp-section-header">
          <span className="tp-step">1</span>
          <span>Extract candidate frames</span>
        </div>
        <button
          className={`tp-btn tp-btn-primary ${loading ? "tp-btn-loading" : ""}`}
          onClick={extractFrames}
          disabled={loading}
        >
          {loading ? "⏳ Extracting..." : "📸 Extract Frames"}
        </button>
        {duration > 0 && (
          <span className="tp-meta">Video duration: {duration}s</span>
        )}
      </div>

      {/* Step 2: Frame Carousel */}
      {frames.length > 0 && (
        <div className="tp-section">
          <div className="tp-section-header">
            <span className="tp-step">2</span>
            <span>Pick a frame ({selectedFrameIdx + 1} of {frames.length})</span>
          </div>

          <div className="tp-carousel-wrapper">
            <button className="tp-carousel-arrow tp-arrow-left" onClick={() => scrollCarousel(-1)}>
              ‹
            </button>
            <div className="tp-carousel" ref={carouselRef}>
              {frames.map((frame, idx) => (
                <div
                  key={idx}
                  className={`tp-frame-card ${idx === selectedFrameIdx ? "tp-frame-selected" : ""}`}
                  onClick={() => setSelectedFrameIdx(idx)}
                >
                  <img src={frame.dataUrl} alt={`Frame at ${frame.time}s`} />
                  <span className="tp-frame-time">{frame.time}s</span>
                  {idx === selectedFrameIdx && (
                    <div className="tp-frame-check">✓</div>
                  )}
                </div>
              ))}
            </div>
            <button className="tp-carousel-arrow tp-arrow-right" onClick={() => scrollCarousel(1)}>
              ›
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Customize */}
      {frames.length > 0 && (
        <div className="tp-section">
          <div className="tp-section-header">
            <span className="tp-step">3</span>
            <span>Customize your thumbnail</span>
          </div>

          <div className="tp-customize-grid">
            {/* Platform selector */}
            <div className="tp-field">
              <label>Platform</label>
              <div className="tp-platform-chips">
                {Object.entries(PLATFORMS).map(([key, plat]) => (
                  <button
                    key={key}
                    className={`tp-chip ${platform === key ? "tp-chip-active" : ""}`}
                    onClick={() => setPlatform(key)}
                    title={plat.label}
                  >
                    {plat.icon} {key}
                  </button>
                ))}
              </div>
            </div>

            {/* Mood selector */}
            <div className="tp-field">
              <label>Mood / Style</label>
              <div className="tp-mood-chips">
                {MOODS.map(m => (
                  <button
                    key={m}
                    className={`tp-chip tp-chip-mood ${mood === m ? "tp-chip-active" : ""}`}
                    onClick={() => setMood(m)}
                  >
                    {MOOD_LABELS[m]?.[0]} {MOOD_LABELS[m]?.[1]}
                  </button>
                ))}
              </div>
            </div>

            {/* Headline */}
            <div className="tp-field">
              <label>Headline (main text)</label>
              <input
                type="text"
                className="tp-input"
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                placeholder="e.g. SHOCKING RESULTS! 🔥"
                maxLength={60}
              />
            </div>

            {/* Subtitle */}
            <div className="tp-field">
              <label>Subtitle (optional)</label>
              <input
                type="text"
                className="tp-input"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="Watch until the end..."
                maxLength={80}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Generate & Preview */}
      {frames.length > 0 && (
        <div className="tp-section">
          <div className="tp-section-header">
            <span className="tp-step">4</span>
            <span>Generate &amp; preview</span>
          </div>

          <div className="tp-actions">
            <button
              className="tp-btn tp-btn-primary"
              onClick={generateThumbnail}
              disabled={generating}
            >
              {generating ? "⏳ Generating..." : `✨ Generate for ${PLATFORMS[platform]?.icon} ${platform}`}
            </button>
            <button
              className="tp-btn tp-btn-secondary"
              onClick={generateAll}
              disabled={generating}
            >
              🚀 Generate for all platforms
            </button>
          </div>

          {previewUrl && (
            <div className="tp-preview">
              <div className="tp-preview-label">Preview — {platform} ({PLATFORMS[platform]?.ratio})</div>
              <img src={previewUrl} alt="Thumbnail preview" className="tp-preview-img" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

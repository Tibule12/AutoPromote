/**
 * ThumbnailGenerator — YouTube-style clickbait thumbnail creator.
 * Extracts frames from a video, scores them, overlays bold text,
 * and lets the user pick, edit, download, and save.
 * Pure client-side: canvas + video element. No server, no FFmpeg.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "./ThumbnailGenerator.css";

/* ── helpers ─────────────────────────────────────────────── */

/** Calculate image variance (higher = more contrast / less flat) */
function imageVariance(imageData) {
  const d = imageData.data;
  let sum = 0, sumSq = 0, n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += gray;
    sumSq += gray * gray;
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Simple skin-tone detector — rough proxy for "person in frame" */
function skinPixelRatio(imageData) {
  const d = imageData.data;
  let skin = 0, total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
      skin++;
    }
  }
  return skin / total;
}

/* ── TEXT OVERLAY STYLES ─────────────────────────────────── */
const TEXT_STYLES = [
  { name: "🔥 Bold Red",    font: "900 52px Impact, sans-serif", color: "#FF3B30", stroke: "#000", strokeW: 4 },
  { name: "⚡ Neon Yellow", font: "900 48px Impact, sans-serif", color: "#FFD60A", stroke: "#8B5A00", strokeW: 4 },
  { name: "💚 Toxic Green", font: "900 50px Impact, sans-serif", color: "#32D74B", stroke: "#000", strokeW: 5 },
  { name: "🤍 Clean White", font: "900 54px Arial Black, sans-serif", color: "#FFFFFF", stroke: "#000", strokeW: 5 },
];

/* ── component ───────────────────────────────────────────── */

export default function ThumbnailGenerator({ videoSrc, videoRef: externalRef, onSelect, onClose }) {
  const internalRef = useRef(null);
  const vidRef = externalRef || internalRef;
  const canvasRef = useRef(null);

  const [frames, setFrames] = useState([]);        // { dataUrl, time, score }
  const [thumbnails, setThumbnails] = useState([]); // { dataUrl, text, styleIdx }
  const [status, setStatus] = useState("idle");     // idle | extracting | ready
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [uploading, setUploading] = useState(false);

  /* ── extract & score frames ────────────────────────────── */
  const generateFrames = useCallback(async () => {
    const video = vidRef.current;
    if (!video) return;
    setStatus("extracting");

    // Wait for video to be seekable
    if (video.readyState < 2) {
      await new Promise(r => { video.oncanplay = r; });
    }

    // Pause video and seek through 8 smart points
    const duration = video.duration || 60;
    const seekPoints = [0.1, 0.2, 0.3, 0.42, 0.55, 0.68, 0.78, 0.9].map(p => p * duration);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const results = [];
    for (const t of seekPoints) {
      video.currentTime = t;
      await new Promise(r => { video.onseeked = r; });
      // Small delay for frame to render
      await new Promise(r => setTimeout(r, 80));

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const variance = imageVariance(imageData);
      const skin = skinPixelRatio(imageData);

      // Score: 40% variance + 40% skin detection + 20% position bonus
      const posBonus = (t / duration > 0.3 && t / duration < 0.7) ? 20 : 10;
      const score = (variance / 1000) * 40 + skin * 40 + posBonus;

      results.push({
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        time: Math.round(t * 10) / 10,
        score: Math.round(score),
      });
    }

    // Sort by score, take top 6
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 6);

    // Apply text overlay to each
    const withText = top.map((f, i) => ({
      ...f,
      text: getDefaultText(i),
      styleIdx: i % TEXT_STYLES.length,
    }));

    setFrames(top);
    setThumbnails(withText);
    setSelectedIdx(0);
    setStatus("ready");
  }, [vidRef]);

  /* ── draw text on canvas ───────────────────────────────── */
  const renderThumbnail = useCallback((frame, text, styleIdx) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Draw base image
    const img = new Image();
    img.onload = () => {
      canvas.width = 1280;
      canvas.height = 720;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (!text.trim()) return;

      const style = TEXT_STYLES[styleIdx] || TEXT_STYLES[0];
      ctx.font = style.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Shadow / stroke
      if (style.stroke) {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.strokeW;
        ctx.lineJoin = "round";
      }

      // Semi-transparent dark bar behind text
      const metrics = ctx.measureText(text);
      const barH = 110;
      const barY = canvas.height - barH - 20;
      const barX = canvas.width / 2 - metrics.width / 2 - 60;
      const barW = metrics.width + 120;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 16);
      ctx.fill();

      // Text with stroke
      ctx.fillStyle = style.color;
      if (style.stroke) ctx.strokeText(text, canvas.width / 2, barY + barH / 2);
      ctx.fillText(text, canvas.width / 2, barY + barH / 2);
    };
    img.src = frame.dataUrl;
  }, []);

  useEffect(() => {
    if (status === "ready" && thumbnails.length > 0) {
      renderThumbnail(thumbnails[selectedIdx], thumbnails[selectedIdx].text, thumbnails[selectedIdx].styleIdx);
    }
  }, [status, selectedIdx, thumbnails, renderThumbnail]);

  /* ── actions ───────────────────────────────────────────── */
  const updateText = (idx, text) => {
    setThumbnails(prev => prev.map((t, i) => i === idx ? { ...t, text } : t));
    if (idx === selectedIdx) renderThumbnail(thumbnails[idx], text, thumbnails[idx].styleIdx);
  };

  const cycleStyle = (idx) => {
    setThumbnails(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const next = (t.styleIdx + 1) % TEXT_STYLES.length;
      if (idx === selectedIdx) renderThumbnail(t, t.text, next);
      return { ...t, styleIdx: next };
    }));
  };

  const downloadThumbnail = (frame, text, styleIdx) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1280, 720);
      if (text.trim()) {
        const style = TEXT_STYLES[styleIdx] || TEXT_STYLES[0];
        ctx.font = style.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = style.color;
        if (style.stroke) { ctx.strokeStyle = style.stroke; ctx.lineWidth = style.strokeW; ctx.lineJoin = "round"; ctx.strokeText(text, 640, 620); }
        ctx.fillText(text, 640, 620);
      }
      const link = document.createElement("a");
      link.download = `thumbnail-${Date.now()}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    };
    img.src = frame.dataUrl;
  };

  const saveAndClose = async () => {
    const t = thumbnails[selectedIdx];
    if (!t) return;
    setUploading(true);
    try {
      const canvas = canvasRef.current;
      const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.92));
      const auth = getAuth();
      const userId = auth.currentUser?.uid || "anonymous";
      const storageRef = ref(storage, `thumbnails/${userId}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(storageRef);
      onSelect?.({
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
        storageUrl: url,
        text: t.text,
        time: t.time,
      });
    } catch (e) {
      console.warn("Upload failed", e);
    } finally {
      setUploading(false);
    }
  };

  /* ── render ────────────────────────────────────────────── */
  const selected = thumbnails[selectedIdx];

  return (
    <div className="tg-overlay" onClick={onClose}>
      <div className="tg-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tg-header">
          <h2>🎬 Thumbnail Studio</h2>
          <p>Stop the scroll. Get the click.</p>
          <div className="tg-header-actions">
            {status === "idle" && (
              <button className="tg-btn tg-btn-primary" onClick={generateFrames}>
                ⚡ Generate Thumbnails
              </button>
            )}
            {status === "extracting" && (
              <button className="tg-btn tg-btn-primary" disabled>
                ⏳ Analyzing video frames...
              </button>
            )}
            {status === "ready" && (
              <>
                <button className="tg-btn tg-btn-outline" onClick={generateFrames}>
                  🔄 Regenerate
                </button>
                <button className="tg-btn tg-btn-primary" onClick={saveAndClose} disabled={uploading}>
                  {uploading ? "⏳ Uploading..." : "✅ Use This Thumbnail"}
                </button>
              </>
            )}
          </div>
        </div>

        {status === "ready" && (
          <>
            {/* Large Preview */}
            <div className="tg-preview-section">
              <canvas ref={canvasRef} className="tg-preview-canvas" />
            </div>

            {/* Grid */}
            <div className="tg-grid-label">Pick a thumbnail — edit text to make it yours</div>
            <div className="tg-grid">
              {thumbnails.map((t, i) => (
                <div
                  key={i}
                  className={`tg-card ${i === selectedIdx ? "tg-card-selected" : ""}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <img src={t.dataUrl} alt={`Frame ${t.time}s`} className="tg-card-img" />
                  <div className="tg-card-info">
                    <span className="tg-card-score">Score: {t.score}</span>
                    <span className="tg-card-time">{t.time}s</span>
                  </div>
                  <button className="tg-card-style-btn" onClick={e => { e.stopPropagation(); cycleStyle(i); }} title="Change text style">
                    🎨 {TEXT_STYLES[t.styleIdx]?.name}
                  </button>
                  <input
                    className="tg-card-text"
                    value={t.text}
                    onChange={e => updateText(i, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder="Add bold text..."
                    maxLength={40}
                  />
                  <button className="tg-card-dl" onClick={e => { e.stopPropagation(); downloadThumbnail(t, t.text, t.styleIdx); }}>
                    ⬇
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="tg-close" onClick={onClose}>✕</button>
      </div>
      {videoSrc && (
        <video
          ref={internalRef}
          src={videoSrc}
          style={{ display: "none" }}
          crossOrigin="anonymous"
          preload="auto"
        />
      )}
    </div>
  );
}

function getDefaultText(i) {
  const defaults = ["WATCH THIS", "YOU WON'T BELIEVE", "DON'T SCROLL", "WAIT FOR IT", "MIND BLOWN", "MUST SEE"];
  return defaults[i % defaults.length];
}

// CinematicEffectsPanel.js
// Modern Effects panel: Presets, Adjustments, Focus & Motion, Overlays
// Pure CSS/frontend — no backend processing required.

import React from "react";
import "./CinematicEffectsPanel.css";
import { CINEMATIC_PRESETS } from "../hooks/useCinematicEffects";

function Slider({ label, value, min, max, step = 0.01, format, onChange }) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <div className="cep-slider-row">
      <div className="cep-slider-meta">
        <span className="cep-slider-label">{label}</span>
        <span className="cep-slider-value">{display}</span>
      </div>
      <input
        type="range"
        className="cep-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function CinematicEffectsPanel({
  fx,
  onUpdate,
  onApplyPreset,
  onReset,
  hasEffects,
}) {
  return (
    <div className="cep-panel">
      {/* Header */}
      <div className="cep-header">
        <div className="cep-header-left">
          <span className="cep-header-icon">✨</span>
          <span className="cep-header-title">Cinematic Effects</span>
        </div>
        {hasEffects && (
          <button className="cep-reset-btn" onClick={onReset} title="Reset all effects to default">
            Reset
          </button>
        )}
      </div>

      <div className="cep-body">
        {/* ── PRESETS ── */}
        <section className="cep-section">
          <div className="cep-section-heading">
            <span className="cep-section-dot" />
            Presets
          </div>
          <div className="cep-presets-grid">
            {CINEMATIC_PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`cep-preset-card ${fx.preset === preset.id ? "is-active" : ""}`}
                onClick={() => onApplyPreset(preset)}
                title={preset.desc}
              >
                <span className="cep-preset-icon">{preset.icon}</span>
                <span className="cep-preset-name">{preset.name}</span>
                {fx.preset === preset.id && <span className="cep-preset-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ── ADJUSTMENTS ── */}
        <section className="cep-section">
          <div className="cep-section-heading">
            <span className="cep-section-dot" />
            Adjustments
          </div>

          <Slider
            label="Brightness"
            value={fx.brightness}
            min={0.5}
            max={1.5}
            format={v => `${v.toFixed(2)}`}
            onChange={v => onUpdate("brightness", v)}
          />
          <Slider
            label="Contrast"
            value={fx.contrast}
            min={0.5}
            max={2.0}
            format={v => `${v.toFixed(2)}`}
            onChange={v => onUpdate("contrast", v)}
          />
          <Slider
            label="Saturation"
            value={fx.saturation}
            min={0}
            max={2.0}
            format={v => `${v.toFixed(2)}`}
            onChange={v => onUpdate("saturation", v)}
          />
          <Slider
            label="Temperature"
            value={fx.temperature}
            min={-1}
            max={1}
            format={v =>
              v > 0.02 ? `+${v.toFixed(2)} 🔥` : v < -0.02 ? `${v.toFixed(2)} ❄️` : "Neutral"
            }
            onChange={v => onUpdate("temperature", v)}
          />
          <Slider
            label="Clarity"
            value={fx.sharpness}
            min={0}
            max={1}
            format={v => `${Math.round(v * 100)}%`}
            onChange={v => onUpdate("sharpness", v)}
          />
        </section>

        {/* ── FOCUS & MOTION ── */}
        <section className="cep-section">
          <div className="cep-section-heading">
            <span className="cep-section-dot" />
            Focus &amp; Motion
          </div>

          <Slider
            label="Punch-in Zoom"
            value={fx.zoom}
            min={1}
            max={2}
            format={v => `${v.toFixed(2)}×`}
            onChange={v => onUpdate("zoom", v)}
          />

          {fx.zoom > 1 && (
            <div className="cep-anchor-row">
              <span className="cep-anchor-label">Anchor Point</span>
              <div className="cep-anchor-buttons">
                {[
                  { id: "left", label: "⬅ Left" },
                  { id: "center", label: "⊙ Center" },
                  { id: "right", label: "Right ➡" },
                ].map(a => (
                  <button
                    key={a.id}
                    className={`cep-anchor-btn ${fx.zoomAnchor === a.id ? "is-active" : ""}`}
                    onClick={() => onUpdate("zoomAnchor", a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Slider
            label="Background Blur"
            value={fx.blur}
            min={0}
            max={20}
            step={0.5}
            format={v => (v > 0 ? `${v.toFixed(1)} px` : "Off")}
            onChange={v => onUpdate("blur", v)}
          />

          {fx.blur > 0 && (
            <>
              {/* Blur mode toggle */}
              <div className="cep-blur-mode-row">
                <span className="cep-slider-label">Blur Mode</span>
                <div className="cep-blur-mode-buttons">
                  <button
                    className={`cep-blur-mode-btn ${fx.blurMode === "edge" ? "is-active" : ""}`}
                    onClick={() => onUpdate("blurMode", "edge")}
                    title="Depth-of-field: blurs edges, keeps center sharp"
                  >
                    🎯 Edge Depth
                  </button>
                  <button
                    className={`cep-blur-mode-btn ${fx.blurMode === "full" ? "is-active" : ""}`}
                    onClick={() => onUpdate("blurMode", "full")}
                    title="Blurs the entire video frame"
                  >
                    🌫️ Full Blur
                  </button>
                </div>
              </div>

              {/* Timed blur */}
              <div className="cep-timed-blur-row">
                <span className="cep-slider-label">Blur Timing</span>
                <div className="cep-timed-blur-inputs">
                  <label className="cep-time-input-wrap">
                    <span className="cep-time-label">Start</span>
                    <input
                      type="number"
                      className="cep-time-input"
                      min={-1}
                      step={0.5}
                      value={fx.blurStart}
                      onChange={e => onUpdate("blurStart", parseFloat(e.target.value) || -1)}
                      title="-1 = always active"
                    />
                    <span className="cep-time-unit">s</span>
                  </label>
                  <label className="cep-time-input-wrap">
                    <span className="cep-time-label">End</span>
                    <input
                      type="number"
                      className="cep-time-input"
                      min={-1}
                      step={0.5}
                      value={fx.blurEnd}
                      onChange={e => onUpdate("blurEnd", parseFloat(e.target.value) || -1)}
                      title="-1 = always active"
                    />
                    <span className="cep-time-unit">s</span>
                  </label>
                </div>
                <span className="cep-time-hint">Set both to -1 for always on</span>
              </div>
            </>
          )}
        </section>

        {/* ── OVERLAYS ── */}
        <section className="cep-section">
          <div className="cep-section-heading">
            <span className="cep-section-dot" />
            Overlays
          </div>

          <Slider
            label="Vignette"
            value={fx.vignette}
            min={0}
            max={1}
            format={v => (v > 0 ? `${Math.round(v * 100)}%` : "Off")}
            onChange={v => onUpdate("vignette", v)}
          />

          <div className="cep-overlay-type-block">
            <span className="cep-slider-label" style={{ marginBottom: 6, display: "block" }}>
              Gradient / Tint
            </span>
            <div className="cep-overlay-type-buttons">
              {[
                { id: "", label: "Off" },
                { id: "gradient-bottom", label: "▼ Bottom" },
                { id: "gradient-top", label: "▲ Top" },
                { id: "tint", label: "Color Tint" },
              ].map(t => (
                <button
                  key={t.id}
                  className={`cep-overlay-type-btn ${fx.overlayType === t.id ? "is-active" : ""}`}
                  onClick={() => onUpdate("overlayType", t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {fx.overlayType && (
            <div className="cep-overlay-controls">
              <Slider
                label="Opacity"
                value={fx.overlayOpacity}
                min={0}
                max={1}
                format={v => `${Math.round(v * 100)}%`}
                onChange={v => onUpdate("overlayOpacity", v)}
              />
              <div className="cep-color-row">
                <span className="cep-slider-label">Color</span>
                <div className="cep-color-pick-wrap">
                  <input
                    type="color"
                    className="cep-color-pick"
                    value={fx.overlayColor}
                    onChange={e => onUpdate("overlayColor", e.target.value)}
                  />
                  <span className="cep-color-value">{fx.overlayColor}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── FILM & CINEMATIC ── */}
        <section className="cep-section">
          <div className="cep-section-heading">
            <span className="cep-section-dot" />
            Film &amp; Cinematic
          </div>

          <Slider
            label="Film Grain"
            value={fx.filmGrain}
            min={0}
            max={1}
            format={v => (v > 0 ? `${Math.round(v * 100)}%` : "Off")}
            onChange={v => onUpdate("filmGrain", v)}
          />
          <Slider
            label="Letterbox Bars"
            value={fx.letterbox}
            min={0}
            max={15}
            step={0.5}
            format={v => (v > 0 ? `${v.toFixed(1)}%` : "Off")}
            onChange={v => onUpdate("letterbox", v)}
          />
          <Slider
            label="Fade In"
            value={fx.fadeIn}
            min={0}
            max={3}
            step={0.1}
            format={v => (v > 0 ? `${v.toFixed(1)}s` : "Off")}
            onChange={v => onUpdate("fadeIn", v)}
          />
          <Slider
            label="Fade Out"
            value={fx.fadeOut}
            min={0}
            max={3}
            step={0.1}
            format={v => (v > 0 ? `${v.toFixed(1)}s` : "Off")}
            onChange={v => onUpdate("fadeOut", v)}
          />
        </section>
      </div>
    </div>
  );
}

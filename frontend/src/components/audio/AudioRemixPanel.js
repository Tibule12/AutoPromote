import React from "react";
import {
  AUDIO_REMIX_PRESETS,
  applyAudioRemixPreset,
  normalizeAudioRemix,
  patchAudioRemix,
} from "./audioRemixModel";
import "./audioRemix.css";

const signed = value => `${value > 0 ? "+" : ""}${Number(value).toFixed(0)}`;

export default function AudioRemixPanel({ value, onChange, bypass, onBefore, onPreview }) {
  const remix = normalizeAudioRemix(value);
  const patch = update => onChange(patchAudioRemix(remix, update));
  const step = (key, amount) => patch({ [key]: Number(remix[key]) + amount });
  const eq = [
    ["Bass", "bass", "#b252ff"],
    ["Clarity", "clarity", "#7888ff"],
    ["Air", "air", "#24d6f1"],
    ["Reverb", "reverb", "#f25ab8"],
  ];
  return (
    <section className="audio-remix-panel" aria-label="Remix Audio" data-testid="audio-remix-panel">
      <header className="audio-remix-header">
        <div>
          <span className="audio-remix-mark" aria-hidden="true">
            ▥
          </span>
          <strong>REMIX AUDIO</strong>
        </div>
        <span className={`audio-remix-live ${remix.enabled && !bypass ? "is-live" : ""}`}>
          <i /> {remix.enabled && !bypass ? "LIVE PREVIEW" : "READY"}
        </span>
      </header>

      <div className="audio-remix-presets" aria-label="Audio remix presets">
        {AUDIO_REMIX_PRESETS.map((preset, index) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`audio-remix-preset-${preset.id}`}
            className={`audio-remix-preset preset-art-${index + 1} ${remix.preset === preset.id && remix.enabled ? "is-active" : ""}`}
            aria-pressed={remix.preset === preset.id && remix.enabled}
            onClick={() => onChange(applyAudioRemixPreset(preset.id))}
          >
            <span className="audio-remix-preset-art" aria-hidden="true">
              {preset.icon}
            </span>
            <strong>{preset.name}</strong>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>

      <div className="audio-remix-hero-controls">
        <div className="audio-remix-stepper">
          <span>◔</span>
          <div>
            <small>Speed</small>
            <strong>{remix.speed.toFixed(2)}×</strong>
          </div>
          <span className="audio-remix-step-buttons">
            <button
              type="button"
              aria-label="Increase remix speed"
              onClick={() => step("speed", 0.01)}
            >
              ⌃
            </button>
            <button
              type="button"
              aria-label="Decrease remix speed"
              onClick={() => step("speed", -0.01)}
            >
              ⌄
            </button>
          </span>
        </div>
        <div className="audio-remix-stepper">
          <span>▥</span>
          <div>
            <small>Voice Pitch</small>
            <strong>{signed(remix.pitch)}</strong>
          </div>
          <span className="audio-remix-step-buttons">
            <button
              type="button"
              aria-label="Increase voice pitch"
              disabled={remix.keepPitch}
              onClick={() => step("pitch", 1)}
            >
              ⌃
            </button>
            <button
              type="button"
              aria-label="Decrease voice pitch"
              disabled={remix.keepPitch}
              onClick={() => step("pitch", -1)}
            >
              ⌄
            </button>
          </span>
        </div>
      </div>

      <div className="audio-remix-eq-heading">
        <strong>Equalizer</strong>
        <button type="button" onClick={() => onChange(applyAudioRemixPreset(remix.preset))}>
          Reset
        </button>
      </div>
      <div className="audio-remix-eq">
        {eq.map(([label, key, color]) => {
          const reverb = key === "reverb";
          const min = reverb ? 0 : -12;
          const max = reverb ? 100 : 12;
          return (
            <label key={key} style={{ "--remix-color": color }}>
              <output>{reverb ? `${Math.round(remix[key])}%` : signed(remix[key])}</output>
              <input
                aria-label={`${label} equalizer`}
                type="range"
                min={min}
                max={max}
                step={1}
                value={remix[key]}
                onChange={event => patch({ [key]: Number(event.target.value) })}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>

      <label className="audio-remix-toggle">
        <input
          aria-label="Keep Pitch"
          type="checkbox"
          checked={remix.keepPitch}
          onChange={event => patch({ keepPitch: event.target.checked })}
        />
        <span className="audio-remix-toggle-track">
          <i />
        </span>
        <span>
          <strong>Keep Pitch</strong>
          <small>Preserve the natural vocal tone</small>
        </span>
      </label>

      <label className="audio-remix-intensity">
        <span>
          <strong>Intensity</strong>
          <output>{Math.round(remix.intensity)}%</output>
        </span>
        <input
          aria-label="Remix intensity"
          type="range"
          min={0}
          max={100}
          step={1}
          value={remix.intensity}
          onChange={event => patch({ intensity: Number(event.target.value) })}
        />
      </label>

      <div className="audio-remix-actions">
        <button type="button" className={bypass ? "is-active" : ""} onClick={onBefore}>
          ↶ Before
        </button>
        <button type="button" className="audio-remix-primary" onClick={onPreview}>
          ▶ Preview Remix
        </button>
      </div>
      <p className="audio-remix-note">
        Live EQ, reverb and speed preview. Studio-quality pitch is finalized in export.
      </p>
    </section>
  );
}

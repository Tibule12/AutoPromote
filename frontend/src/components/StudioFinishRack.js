import React from "react";
import { CINEMATIC_PRESETS } from "../hooks/useCinematicEffects";

const VISUALIZER_MODES = [
  { id: "wave", label: "Neon wave", icon: "〰" },
  { id: "bars", label: "Voice bars", icon: "▥" },
  { id: "ring", label: "Pulse ring", icon: "◉" },
];

const Slider = ({ label, value, min, max, step = 0.01, onChange, format }) => (
  <label className="finish-rack-slider">
    <span>
      {label}
      <b>{format ? format(value) : Number(value).toFixed(2)}</b>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={event => onChange(Number(event.target.value))}
    />
  </label>
);

export default function StudioFinishRack({
  fx,
  hasEffects,
  onUpdateFx,
  onApplyPreset,
  onReset,
  visualizer,
  onUpdateVisualizer,
  keyframes = [],
  currentTime = 0,
  duration = 1,
  onAddKeyframe,
  onRemoveKeyframe,
  onSeekKeyframe,
  scopes,
  scopeMode = "parade",
  onScopeModeChange,
  beatCount = 0,
  beatSnapEnabled = true,
  onBeatSnapChange,
}) {
  return (
    <section className="studio-finish-rack" data-testid="studio-finish-rack">
      <div className="studio-finish-rack__heading">
        <div>
          <span>Color · VFX · Voice motion</span>
          <strong>Finish &amp; Motion</strong>
        </div>
        <button type="button" onClick={onReset} disabled={!hasEffects && !visualizer.enabled}>
          Reset
        </button>
      </div>

      <div className="finish-preset-strip" aria-label="Finish presets">
        {CINEMATIC_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            className={fx.preset === preset.id ? "is-active" : ""}
            onClick={() => onApplyPreset(preset)}
            title={preset.desc}
          >
            <span>{preset.icon}</span>
            <strong>{preset.name}</strong>
          </button>
        ))}
      </div>

      <details className="finish-rack-section" open>
        <summary>
          <span>Professional color</span>
          <small>Instant client preview</small>
        </summary>
        <div className="finish-rack-grid">
          <Slider
            label="Exposure"
            value={fx.brightness}
            min={0.65}
            max={1.4}
            onChange={value => onUpdateFx("brightness", value)}
          />
          <Slider
            label="Contrast"
            value={fx.contrast}
            min={0.65}
            max={1.75}
            onChange={value => onUpdateFx("contrast", value)}
          />
          <Slider
            label="Saturation"
            value={fx.saturation}
            min={0}
            max={1.8}
            onChange={value => onUpdateFx("saturation", value)}
          />
          <Slider
            label="Warmth"
            value={fx.temperature}
            min={-1}
            max={1}
            onChange={value => onUpdateFx("temperature", value)}
          />
          <Slider
            label="Clarity"
            value={fx.sharpness}
            min={0}
            max={1}
            onChange={value => onUpdateFx("sharpness", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Vignette"
            value={fx.vignette}
            min={0}
            max={0.85}
            onChange={value => onUpdateFx("vignette", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
        </div>
      </details>

      <details className="finish-rack-section" open>
        <summary>
          <span>Adjustment layer</span>
          <small>{keyframes.length} keyframes · {Number(currentTime || 0).toFixed(2)}s</small>
        </summary>
        <div className="finish-keyframe-toolbar">
          <button type="button" onClick={onAddKeyframe}>
            ◆ Add grade keyframe
          </button>
          <span>Animates exposure, contrast and saturation with render-accurate interpolation.</span>
        </div>
        <div className="finish-keyframe-track" aria-label="Finish keyframes">
          <i style={{ left: `${(Number(currentTime || 0) / Math.max(0.1, duration)) * 100}%` }} />
          {keyframes.map(keyframe => (
            <button
              key={keyframe.id}
              type="button"
              style={{ left: `${(Number(keyframe.time || 0) / Math.max(0.1, duration)) * 100}%` }}
              aria-label={`Finish keyframe at ${Number(keyframe.time || 0).toFixed(2)} seconds`}
              onClick={() => onSeekKeyframe?.(keyframe)}
              onDoubleClick={() => onRemoveKeyframe?.(keyframe.id)}
              title="Click to seek · double-click to remove"
            >
              ◆
            </button>
          ))}
        </div>
        <div className="finish-magnetic-row">
          <button
            type="button"
            className={beatSnapEnabled ? "is-active" : ""}
            aria-pressed={beatSnapEnabled}
            onClick={() => onBeatSnapChange?.(!beatSnapEnabled)}
          >
            🧲 Magnetic beats
          </button>
          <span>{beatCount ? `${beatCount} rhythm points detected` : "Add music to detect rhythm"}</span>
        </div>
      </details>

      <details className="finish-rack-section" open>
        <summary>
          <span>Video scopes</span>
          <small>Measure, do not guess</small>
        </summary>
        <div className="finish-scope-tabs" role="tablist" aria-label="Video scope mode">
          {["parade", "luma"].map(mode => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={scopeMode === mode}
              className={scopeMode === mode ? "is-active" : ""}
              onClick={() => onScopeModeChange?.(mode)}
            >
              {mode === "parade" ? "RGB Parade" : "Luma"}
            </button>
          ))}
        </div>
        {scopes}
      </details>

      <details className="finish-rack-section">
        <summary>
          <span>Live VFX texture</span>
          <small>Controlled, not random</small>
        </summary>
        <div className="finish-rack-grid">
          <Slider
            label="Film grain"
            value={fx.filmGrain}
            min={0}
            max={1}
            onChange={value => onUpdateFx("filmGrain", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="RGB edge"
            value={fx.chromaticAberration}
            min={0}
            max={1}
            onChange={value => onUpdateFx("chromaticAberration", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="VHS tracking"
            value={fx.vhsTracking}
            min={0}
            max={1}
            onChange={value => onUpdateFx("vhsTracking", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Light leak"
            value={fx.lightLeak}
            min={0}
            max={1}
            onChange={value => onUpdateFx("lightLeak", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
        </div>
      </details>

      <details className="finish-rack-section" open>
        <summary>
          <span>Podcast voice visual</span>
          <small>Web Audio reactive</small>
        </summary>
        <div className="visualizer-switch-row">
          <button
            type="button"
            className={visualizer.enabled ? "is-active" : ""}
            aria-pressed={visualizer.enabled}
            onClick={() => onUpdateVisualizer("enabled", !visualizer.enabled)}
          >
            {visualizer.enabled ? "Live" : "Off"}
          </button>
          <span>Reacts to the real source voice—no generated motion.</span>
        </div>
        <div className="visualizer-mode-grid" aria-label="Visualizer style">
          {VISUALIZER_MODES.map(option => (
            <button
              key={option.id}
              type="button"
              className={visualizer.mode === option.id ? "is-active" : ""}
              aria-pressed={visualizer.mode === option.id}
              onClick={() => onUpdateVisualizer("mode", option.id)}
            >
              <span>{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
        <div className="visualizer-detail-row">
          <label>
            <span>Glow</span>
            <input
              type="color"
              aria-label="Visualizer glow color"
              value={visualizer.color}
              onChange={event => onUpdateVisualizer("color", event.target.value)}
            />
          </label>
          <div role="group" aria-label="Visualizer position">
            {["top", "bottom"].map(position => (
              <button
                key={position}
                type="button"
                className={visualizer.position === position ? "is-active" : ""}
                onClick={() => onUpdateVisualizer("position", position)}
              >
                {position}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Voice response"
          value={visualizer.intensity}
          min={0.25}
          max={1.5}
          onChange={value => onUpdateVisualizer("intensity", value)}
          format={value => `${Math.round(value * 100)}%`}
        />
      </details>
    </section>
  );
}

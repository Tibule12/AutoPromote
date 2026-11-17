import React from "react";
import { CINEMATIC_PRESETS } from "../hooks/useCinematicEffects";
import {
  DEAD_CONTENT_REVITALIZER_PRESETS,
  HSL_QUALIFIER_PRESETS,
  POWER_WINDOW_PRESETS,
} from "./studioColorScience";

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
  mainFrame,
  onUpdateMainFrame,
}) {
  const qualifier = fx.qualifier || fx.advancedColor?.qualifier || {};
  const powerWindow = fx.powerWindow || fx.advancedColor?.powerWindow || {};

  const applyRevitalizerPreset = preset => {
    onUpdateFx("revitalizerPresetId", preset.id);
    onUpdateFx("precisionGrade", true);
    onUpdateFx("dehaze", preset.dehaze);
    onUpdateFx("clarity", preset.clarity);
    onUpdateFx("shadowRecovery", preset.shadowRecovery);
    onUpdateFx("highlightRollOff", preset.highlightRollOff);
    onUpdateFx("vibrance", preset.vibrance);
    onUpdateFx("skinToneProtect", preset.skinToneProtect);
    if (preset.exposureStops !== undefined) onUpdateFx("exposureStops", preset.exposureStops);
    if (preset.contrast !== undefined) onUpdateFx("contrast", preset.contrast);
    if (preset.saturation !== undefined) onUpdateFx("saturation", preset.saturation);
    if (preset.sharpness !== undefined) onUpdateFx("sharpness", preset.sharpness);
    if (preset.temperature !== undefined) onUpdateFx("temperature", preset.temperature);
    if (preset.tint !== undefined) onUpdateFx("tint", preset.tint);
    if (preset.lift !== undefined) onUpdateFx("lift", preset.lift);
    if (preset.gamma !== undefined) onUpdateFx("gamma", preset.gamma);
    if (preset.gain !== undefined) onUpdateFx("gain", preset.gain);
  };

  const updateQualifierField = (field, value) => {
    const nextQualifier = {
      enabled: true,
      hueCenter: 0.075,
      hueWidth: 0.08,
      satMin: 0.16,
      satMax: 0.95,
      lumMin: 0.1,
      lumMax: 0.92,
      softness: 0.24,
      hueShift: 0,
      saturation: 1.15,
      gain: 1.04,
      exposureStops: 0,
      desaturateOutside: 0,
      colorizeColor: "",
      colorizeStrength: 0,
      showMatte: false,
      ...qualifier,
      [field]: value,
    };
    onUpdateFx("qualifier", nextQualifier);
  };

  const updatePowerWindowField = (field, value) => {
    const nextWindow = {
      enabled: true,
      shape: "ellipse",
      x: 0.5,
      y: 0.44,
      rx: 0.26,
      ry: 0.34,
      rotation: 0,
      feather: 0.28,
      invert: false,
      exposureStops: 0.25,
      saturation: 1.1,
      gain: 1.06,
      ...powerWindow,
      [field]: value,
    };
    onUpdateFx("powerWindow", nextWindow);
  };

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

      <details className="finish-rack-section" open>
        <summary>
          <span>Main footage frame</span>
          <small>Preview = final export</small>
        </summary>
        <div className="main-frame-controls">
          <label className="main-frame-toggle">
            <span>
              <b>Rounded footage</b>
              <small>Add a margin and rounded corners to the footage.</small>
            </span>
            <input
              type="checkbox"
              aria-label="Rounded main footage"
              checked={mainFrame?.enabled !== false}
              onChange={event => onUpdateMainFrame?.("enabled", event.target.checked)}
            />
          </label>
          <div className="finish-rack-grid">
            <Slider
              label="Canvas margin"
              value={Number(mainFrame?.insetPercent ?? 3)}
              min={0}
              max={10}
              step={0.5}
              onChange={value => onUpdateMainFrame?.("insetPercent", value)}
              format={value => `${Number(value).toFixed(1)}%`}
            />
            <Slider
              label="Corner curve"
              value={Number(mainFrame?.radiusPercent ?? 8)}
              min={3}
              max={16}
              step={0.5}
              onChange={value => onUpdateMainFrame?.("radiusPercent", value)}
              format={value => `${Number(value).toFixed(1)}%`}
            />
          </div>
          <div className="main-frame-background" role="group" aria-label="Main frame background">
            <span>Canvas</span>
            <button
              type="button"
              className={mainFrame?.background === "studio_black" ? "is-active" : ""}
              onClick={() => onUpdateMainFrame?.("background", "studio_black")}
            >
              True black
            </button>
            <button
              type="button"
              className={mainFrame?.background === "soft_blur" ? "is-active" : ""}
              onClick={() => onUpdateMainFrame?.("background", "soft_blur")}
            >
              Soft blur
            </button>
          </div>
        </div>
      </details>

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
        <label className="inspector-toggle-row">
          <span><b>Precision RGB grade</b><small>Matched tone transfer in preview and render. Static grade; disable to use animated legacy grade keys.</small></span>
          <input type="checkbox" aria-label="Precision RGB grade" checked={!!fx.precisionGrade}
            onChange={event => onUpdateFx("precisionGrade", event.target.checked)} />
        </label>
        {fx.precisionGrade ? <div className="finish-rack-grid">
          <Slider label="Exposure stops" value={fx.exposureStops ?? 0} min={-2} max={2} step={.05} onChange={value => onUpdateFx("exposureStops", value)} />
          <Slider label="Lift" value={fx.lift ?? 0} min={-.15} max={.15} step={.005} onChange={value => onUpdateFx("lift", value)} />
          <Slider label="Gamma" value={fx.gamma ?? 1} min={.6} max={1.6} onChange={value => onUpdateFx("gamma", value)} />
          <Slider label="Gain" value={fx.gain ?? 1} min={.6} max={1.4} onChange={value => onUpdateFx("gain", value)} />
          <Slider label="Tint" value={fx.tint ?? 0} min={-1} max={1} onChange={value => onUpdateFx("tint", value)} />
        </div> : null}
      </details>

      <details className="finish-rack-section" data-testid="finish-dead-revitalizer-section" open>
        <summary>
          <span>Dead-content revitalizer</span>
          <small>Bring flat, dark &amp; dull clips to life</small>
        </summary>
        <div className="finish-preset-strip" role="group" aria-label="Dead content revitalizer presets">
          {Object.values(DEAD_CONTENT_REVITALIZER_PRESETS).map(preset => (
            <button
              key={preset.id}
              type="button"
              className={fx.revitalizerPresetId === preset.id ? "is-active" : ""}
              onClick={() => applyRevitalizerPreset(preset)}
              title={preset.description}
            >
              <span>{preset.icon}</span>
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>
        <div className="finish-rack-grid">
          <Slider
            label="Dehaze & black recovery"
            value={fx.dehaze ?? 0}
            min={0}
            max={1}
            step={0.02}
            onChange={value => onUpdateFx("dehaze", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Shadow rescue"
            value={fx.shadowRecovery ?? 0}
            min={0}
            max={1}
            step={0.02}
            onChange={value => onUpdateFx("shadowRecovery", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Highlight roll-off"
            value={fx.highlightRollOff ?? 0}
            min={0}
            max={1}
            step={0.02}
            onChange={value => onUpdateFx("highlightRollOff", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Midtone micro-contrast"
            value={fx.clarity ?? 0}
            min={0}
            max={1}
            step={0.02}
            onChange={value => onUpdateFx("clarity", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Smart vibrance"
            value={fx.vibrance ?? 0}
            min={-1}
            max={1}
            step={0.02}
            onChange={value => onUpdateFx("vibrance", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Skin tone protection"
            value={fx.skinToneProtect ?? 0.85}
            min={0}
            max={1}
            step={0.02}
            onChange={value => onUpdateFx("skinToneProtect", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
        </div>
      </details>

      <details className="finish-rack-section" data-testid="finish-selective-object-section" open>
        <summary>
          <span>Selective object &amp; body color</span>
          <small>Target skin, clothing, objects or regions</small>
        </summary>
        <div className="finish-rack-grid">
          <label className="finish-rack-slider">
            <span>Target object / body hue</span>
            <select
              aria-label="Selective object qualifier preset"
              value={fx.qualifierPresetId || ""}
              onChange={event => {
                const presetId = event.target.value;
                onUpdateFx("qualifierPresetId", presetId);
                onUpdateFx(
                  "qualifier",
                  presetId && HSL_QUALIFIER_PRESETS[presetId]
                    ? { ...HSL_QUALIFIER_PRESETS[presetId] }
                    : null
                );
              }}
            >
              <option value="">Off (All colours)</option>
              {Object.entries(HSL_QUALIFIER_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="finish-rack-slider">
            <span>Body / object spatial zone</span>
            <select
              aria-label="Selective spatial power window"
              value={fx.powerWindowPresetId || ""}
              onChange={event => {
                const presetId = event.target.value;
                onUpdateFx("powerWindowPresetId", presetId);
                onUpdateFx(
                  "powerWindow",
                  presetId && POWER_WINDOW_PRESETS[presetId]
                    ? { ...POWER_WINDOW_PRESETS[presetId] }
                    : null
                );
              }}
            >
              <option value="">Off (Full frame)</option>
              {Object.entries(POWER_WINDOW_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {qualifier.enabled ? (
          <div className="finish-rack-grid">
            <Slider
              label="Target hue center"
              value={qualifier.hueCenter ?? 0.075}
              min={0}
              max={1}
              step={0.01}
              onChange={value => updateQualifierField("hueCenter", value)}
              format={value => `${Math.round(value * 360)}°`}
            />
            <Slider
              label="Target hue width"
              value={qualifier.hueWidth ?? 0.08}
              min={0.01}
              max={0.5}
              step={0.01}
              onChange={value => updateQualifierField("hueWidth", value)}
              format={value => `${Math.round(value * 360)}°`}
            />
            <Slider
              label="Target hue shift"
              value={qualifier.hueShift ?? 0}
              min={-0.5}
              max={0.5}
              step={0.01}
              onChange={value => updateQualifierField("hueShift", value)}
              format={value => `${Math.round(value * 360)}°`}
            />
            <Slider
              label="Target saturation"
              value={qualifier.saturation ?? 1.15}
              min={0}
              max={2}
              step={0.02}
              onChange={value => updateQualifierField("saturation", value)}
              format={value => `${Number(value).toFixed(2)}x`}
            />
            <Slider
              label="Object recolor strength"
              value={qualifier.colorizeStrength ?? 0}
              min={0}
              max={1}
              step={0.02}
              onChange={value => updateQualifierField("colorizeStrength", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Outside B&W splash"
              value={qualifier.desaturateOutside ?? 0}
              min={0}
              max={1}
              step={0.05}
              onChange={value => updateQualifierField("desaturateOutside", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
            <label className="finish-rack-slider">
              <span>Object recolor swatch</span>
              <input
                type="color"
                aria-label="Object recolor swatch"
                value={qualifier.colorizeColor || "#e11d48"}
                onChange={event => {
                  updateQualifierField("colorizeColor", event.target.value);
                  if (!qualifier.colorizeStrength) updateQualifierField("colorizeStrength", 0.35);
                }}
              />
            </label>
            <label className="inspector-toggle-row">
              <span>
                <b>Isolate matte preview</b>
                <small>Highlight selected object/body pixels in cyan.</small>
              </span>
              <input
                type="checkbox"
                aria-label="Isolate matte preview"
                checked={!!qualifier.showMatte}
                onChange={event => updateQualifierField("showMatte", event.target.checked)}
              />
            </label>
          </div>
        ) : null}

        {powerWindow.enabled ? (
          <div className="finish-rack-grid">
            <Slider
              label="Zone center X"
              value={powerWindow.x ?? 0.5}
              min={0}
              max={1}
              step={0.01}
              onChange={value => updatePowerWindowField("x", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Zone center Y"
              value={powerWindow.y ?? 0.44}
              min={0}
              max={1}
              step={0.01}
              onChange={value => updatePowerWindowField("y", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Zone radius X"
              value={powerWindow.rx ?? 0.26}
              min={0.05}
              max={0.9}
              step={0.01}
              onChange={value => updatePowerWindowField("rx", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Zone radius Y"
              value={powerWindow.ry ?? 0.34}
              min={0.05}
              max={0.9}
              step={0.01}
              onChange={value => updatePowerWindowField("ry", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Zone feather"
              value={powerWindow.feather ?? 0.28}
              min={0.02}
              max={0.8}
              step={0.02}
              onChange={value => updatePowerWindowField("feather", value)}
              format={value => `${Math.round(value * 100)}%`}
            />
          </div>
        ) : null}
      </details>

      <details className="finish-rack-section" open>
        <summary>
          <span>Adjustment layer</span>
          <small>{keyframes.length} keyframes · {Number(currentTime || 0).toFixed(2)}s</small>
        </summary>
        <div className="finish-keyframe-toolbar">
          <button type="button" onClick={onAddKeyframe} disabled={!!fx.precisionGrade}>
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
          {[
            { id: "parade", label: "RGB Parade" },
            { id: "waveform", label: "Waveform" },
            { id: "vectorscope", label: "Vectorscope" },
            { id: "luma", label: "Luma" },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scopeMode === id}
              className={scopeMode === id ? "is-active" : ""}
              onClick={() => onScopeModeChange?.(id)}
            >
              {label}
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
          <Slider
            label="Pro-Mist bloom"
            value={fx.dreamGlow ?? 0}
            min={0}
            max={1}
            onChange={value => onUpdateFx("dreamGlow", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Anamorphic flare"
            value={fx.anamorphicFlare ?? 0}
            min={0}
            max={1}
            onChange={value => onUpdateFx("anamorphicFlare", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
          <Slider
            label="Optical edge blur"
            value={fx.lensBlur ?? 0}
            min={0}
            max={1}
            onChange={value => onUpdateFx("lensBlur", value)}
            format={value => `${Math.round(value * 100)}%`}
          />
        </div>
      </details>

      <details className="finish-rack-section" open>
        <summary>
          <span>Voice-reactive visual</span>
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

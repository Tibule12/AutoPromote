import React, { useState } from 'react';
import {
  CINEMA_3D_LUT_PRESETS,
  buildProceduralColorCube,
  parseColorCube,
} from './studioColorCube';
import {
  DEAD_CONTENT_REVITALIZER_PRESETS,
  HSL_QUALIFIER_PRESETS,
  POWER_WINDOW_PRESETS,
} from './studioColorScience';

export default function StudioAdjustmentControls({
  layer,
  onChange,
  onUpdate,
  onMove,
  index = 0,
  count = 1,
  showLegacySelective = true,
}) {
  const [error, setError] = useState('');
  const emit = onChange || onUpdate || (() => {});
  const fx = layer.finishFx || layer.effects?.color || {};
  const adv = fx.advancedColor || {};
  const curve = adv.curve || {};
  const hsl = adv.hsl || {};
  const qualifier = adv.qualifier || fx.qualifier || {};
  const powerWindow = adv.powerWindow || fx.powerWindow || {};

  const update = patch => emit({ ...layer, finishFx: { ...fx, ...patch } });
  const updateAdv = advPatch =>
    update({
      advancedColor: {
        ...adv,
        ...advPatch,
      },
    });
  const updateQualifier = qPatch =>
    updateAdv({
      qualifier: {
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
        colorizeColor: '',
        colorizeStrength: 0,
        showMatte: false,
        ...qualifier,
        ...qPatch,
      },
    });
  const updateWindow = wPatch =>
    updateAdv({
      powerWindow: {
        enabled: true,
        shape: 'ellipse',
        x: 0.5,
        y: 0.44,
        rx: 0.28,
        ry: 0.34,
        rotation: 0,
        feather: 0.28,
        invert: false,
        exposureStops: 0.2,
        saturation: 1.08,
        gain: 1.05,
        ...powerWindow,
        ...wPatch,
      },
    });

  return (
    <div data-testid="adjustment-grade-controls" className="ap-adj-grade-suite">
      <div className="ap-flow-field-row">
        <label className="ap-flow-checkbox-row">
          <input
            type="checkbox"
            aria-label="Adjustment enabled"
            checked={layer.enabled !== false}
            onChange={e => emit({ ...layer, enabled: e.target.checked })}
          />{' '}
          Enabled
        </label>
        <label className="ap-comp-field">
          <span>Effect strength {layer.intensity ?? 100}%</span>
          <input
            type="range"
            min="0"
            max="100"
            aria-label="Adjustment strength"
            value={layer.intensity ?? 100}
            onChange={e => emit({ ...layer, intensity: Number(e.target.value) })}
          />
        </label>
      </div>

      {/* Primary Grade */}
      <div className="ap-flow-field-row">
        {[
          ['exposureStops', 'Exposure', -2, 2, 0.05, 0],
          ['brightness', 'Brightness', 0.65, 1.4, 0.01, 1],
          ['contrast', 'Contrast', 0.65, 1.75, 0.01, 1],
          ['saturation', 'Saturation', 0, 1.8, 0.01, 1],
        ].map(([key, label, min, max, step, fallback]) => (
          <label key={key} className="ap-comp-field">
            <span>
              {label} {Number(fx[key] > 10 ? fx[key] / 100 : (fx[key] ?? fallback)).toFixed(2)}
            </span>
            <input
              aria-label={`Adjustment ${label.toLowerCase()}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={fx[key] > 10 ? fx[key] / 100 : (fx[key] ?? fallback)}
              onChange={e => update({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>

      {/* Dead-Content Revitalizer ("Bring to Life Dead Quality Content") */}
      <details className="ap-grade-subdrawer" open>
        <summary>⚡ Dead-Content Revitalizer (Restore Flat / Dark / Lifeless Footage)</summary>
        <div className="ap-flow-field-row">
          <label className="ap-comp-field">
            <span>1-Click Revival Preset</span>
            <select
              aria-label="Adjustment revitalizer preset"
              className="ap-comp-select"
              value={fx.revitalizerPresetId || ''}
              onChange={e => {
                const presetId = e.target.value;
                const preset = DEAD_CONTENT_REVITALIZER_PRESETS[presetId];
                if (!preset) {
                  update({
                    revitalizerPresetId: '',
                    dehaze: 0,
                    clarity: 0,
                    shadowRecovery: 0,
                    highlightRollOff: 0,
                    vibrance: 0,
                  });
                  return;
                }
                update({
                  revitalizerPresetId: presetId,
                  dehaze: preset.dehaze,
                  clarity: preset.clarity,
                  shadowRecovery: preset.shadowRecovery,
                  highlightRollOff: preset.highlightRollOff,
                  vibrance: preset.vibrance,
                  skinToneProtect: preset.skinToneProtect,
                  exposureStops: preset.exposureStops ?? fx.exposureStops ?? 0,
                  contrast: preset.contrast ?? fx.contrast ?? 1,
                  saturation: preset.saturation ?? fx.saturation ?? 1,
                });
              }}
            >
              <option value="">Off (Manual Signal)</option>
              {Object.values(DEAD_CONTENT_REVITALIZER_PRESETS).map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.icon} {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ap-flow-field-row">
          {[
            ['dehaze', 'Dehaze & Blacks', 0, 1, 0.02, 0],
            ['shadowRecovery', 'Shadow Rescue', 0, 1, 0.02, 0],
            ['highlightRollOff', 'Highlight Roll-Off', 0, 1, 0.02, 0],
            ['clarity', 'Midtone Clarity', 0, 1, 0.02, 0],
            ['vibrance', 'Smart Vibrance', -1, 1, 0.02, 0],
            ['skinToneProtect', 'Skin Tone Protect', 0, 1, 0.02, 0.85],
          ].map(([key, label, min, max, step, fallback]) => (
            <label key={key} className="ap-comp-field">
              <span>
                {label} {Math.round(Number(fx[key] ?? fallback) * 100)}%
              </span>
              <input
                aria-label={`Adjustment ${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={fx[key] ?? fallback}
                onChange={e => update({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </details>

      {/* Selective Object & Body Part Color Grading */}
      {showLegacySelective ? (<details className="ap-grade-subdrawer" open>
        <summary>🎯 Selective Object &amp; Body Part Color (HSL Key + Power Window)</summary>
        <div className="ap-flow-field-row">
          <label className="ap-comp-field">
            <span>Target Object / Body Color Preset</span>
            <select
              aria-label="Adjustment object qualifier preset"
              className="ap-comp-select"
              value={adv.qualifierPresetId || ''}
              onChange={e => {
                const presetId = e.target.value;
                const preset = HSL_QUALIFIER_PRESETS[presetId];
                updateAdv({
                  qualifierPresetId: presetId,
                  qualifier: preset ? { ...preset } : null,
                });
              }}
            >
              <option value="">Off (Full Frame Color)</option>
              {Object.entries(HSL_QUALIFIER_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ap-comp-field">
            <span>Body / Object Spatial Region</span>
            <select
              aria-label="Adjustment power window preset"
              className="ap-comp-select"
              value={adv.powerWindowPresetId || ''}
              onChange={e => {
                const presetId = e.target.value;
                const preset = POWER_WINDOW_PRESETS[presetId];
                updateAdv({
                  powerWindowPresetId: presetId,
                  powerWindow: preset ? { ...preset } : null,
                });
              }}
            >
              <option value="">Off (No Spatial Window)</option>
              {Object.entries(POWER_WINDOW_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {qualifier.enabled ? (
          <div className="ap-flow-field-row">
            <label className="ap-comp-field">
              <span>Target Hue {Math.round(Number(qualifier.hueCenter ?? 0.075) * 360)}°</span>
              <input
                aria-label="Adjustment qualifier hueCenter"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={qualifier.hueCenter ?? 0.075}
                onChange={e => updateQualifier({ hueCenter: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Hue Width {Math.round(Number(qualifier.hueWidth ?? 0.08) * 360)}°</span>
              <input
                aria-label="Adjustment qualifier hueWidth"
                type="range"
                min="0.01"
                max="0.5"
                step="0.01"
                value={qualifier.hueWidth ?? 0.08}
                onChange={e => updateQualifier({ hueWidth: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>TargetHue Shift {Math.round(Number(qualifier.hueShift || 0) * 360)}°</span>
              <input
                aria-label="Adjustment qualifier hueShift"
                type="range"
                min="-0.5"
                max="0.5"
                step="0.01"
                value={qualifier.hueShift || 0}
                onChange={e => updateQualifier({ hueShift: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Target Sat {Number(qualifier.saturation ?? 1.15).toFixed(2)}x</span>
              <input
                aria-label="Adjustment qualifier saturation"
                type="range"
                min="0"
                max="2"
                step="0.02"
                value={qualifier.saturation ?? 1.15}
                onChange={e => updateQualifier({ saturation: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Recolor Object</span>
              <input
                aria-label="Adjustment qualifier colorizeColor"
                type="color"
                value={qualifier.colorizeColor || '#e11d48'}
                onChange={e =>
                  updateQualifier({
                    colorizeColor: e.target.value,
                    colorizeStrength: Math.max(0.25, Number(qualifier.colorizeStrength || 0)),
                  })
                }
              />
            </label>
            <label className="ap-comp-field">
              <span>Recolor Mix {Math.round(Number(qualifier.colorizeStrength || 0) * 100)}%</span>
              <input
                aria-label="Adjustment qualifier colorizeStrength"
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={qualifier.colorizeStrength || 0}
                onChange={e => updateQualifier({ colorizeStrength: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Outside B&amp;W {Math.round(Number(qualifier.desaturateOutside || 0) * 100)}%</span>
              <input
                aria-label="Adjustment qualifier desaturateOutside"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={qualifier.desaturateOutside || 0}
                onChange={e => updateQualifier({ desaturateOutside: Number(e.target.value) })}
              />
            </label>
            <label className="ap-flow-checkbox-row">
              <input
                type="checkbox"
                aria-label="Adjustment qualifier showMatte"
                checked={!!qualifier.showMatte}
                onChange={e => updateQualifier({ showMatte: e.target.checked })}
              />{' '}
              Show Isolation Matte
            </label>
          </div>
        ) : null}

        {powerWindow.enabled ? (
          <div className="ap-flow-field-row">
            <label className="ap-comp-field">
              <span>Region Center X {Math.round(Number(powerWindow.x ?? 0.5) * 100)}%</span>
              <input
                aria-label="Adjustment window x"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={powerWindow.x ?? 0.5}
                onChange={e => updateWindow({ x: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Region Center Y {Math.round(Number(powerWindow.y ?? 0.44) * 100)}%</span>
              <input
                aria-label="Adjustment window y"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={powerWindow.y ?? 0.44}
                onChange={e => updateWindow({ y: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Region Width {Math.round(Number(powerWindow.rx ?? 0.28) * 100)}%</span>
              <input
                aria-label="Adjustment window rx"
                type="range"
                min="0.05"
                max="0.9"
                step="0.01"
                value={powerWindow.rx ?? 0.28}
                onChange={e => updateWindow({ rx: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Region Height {Math.round(Number(powerWindow.ry ?? 0.34) * 100)}%</span>
              <input
                aria-label="Adjustment window ry"
                type="range"
                min="0.05"
                max="0.9"
                step="0.01"
                value={powerWindow.ry ?? 0.34}
                onChange={e => updateWindow({ ry: Number(e.target.value) })}
              />
            </label>
            <label className="ap-comp-field">
              <span>Feather {Math.round(Number(powerWindow.feather ?? 0.28) * 100)}%</span>
              <input
                aria-label="Adjustment window feather"
                type="range"
                min="0.02"
                max="0.8"
                step="0.02"
                value={powerWindow.feather ?? 0.28}
                onChange={e => updateWindow({ feather: Number(e.target.value) })}
              />
            </label>
          </div>
        ) : null}
      </details>) : null}

      {/* 3-Way Color Wheels (Lift / Gamma / Gain) & White Balance (Warmth / Tint) */}
      <details className="ap-grade-subdrawer" open>
        <summary>3-Way Wheels (Lift · Gamma · Gain) &amp; White Balance</summary>
        <div className="ap-flow-field-row">
          {[
            ['lift', 'Lift (Shadows)', -0.15, 0.15, 0.005, 0],
            ['gamma', 'Gamma (Midtones)', 0.6, 1.6, 0.01, 1],
            ['gain', 'Gain (Highlights)', 0.6, 1.4, 0.01, 1],
            ['temperature', 'Warmth', -1, 1, 0.02, 0],
            ['tint', 'Tint (G/M)', -1, 1, 0.02, 0],
          ].map(([key, label, min, max, step, fallback]) => (
            <label key={key} className="ap-comp-field">
              <span>
                {label} {Number(fx[key] ?? fallback).toFixed(2)}
              </span>
              <input
                aria-label={`Adjustment ${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={fx[key] ?? fallback}
                onChange={e => update({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </details>

      {/* 5-Knot Tone Curve & Global HSL Secondary */}
      <details className="ap-grade-subdrawer">
        <summary>Tone Curve &amp; HSL Qualifier</summary>
        <div className="ap-flow-field-row">
          {[
            ['shadows', 'Curve Shadows'],
            ['midtones', 'Curve Midtones'],
            ['highlights', 'Curve Highlights'],
          ].map(([field, label]) => (
            <label key={`curve-${field}`} className="ap-comp-field">
              <span>
                {label} {Number(curve[field] || 0) > 0 ? `+${curve[field]}` : Number(curve[field] || 0)}
              </span>
              <input
                aria-label={`Adjustment curve ${field}`}
                type="range"
                min="-100"
                max="100"
                step="1"
                value={Number(curve[field] || 0)}
                onChange={e =>
                  updateAdv({
                    curve: { ...curve, [field]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          {[
            ['hue', 'HSL Hue'],
            ['saturation', 'HSL Sat'],
            ['luminance', 'HSL Luma'],
          ].map(([field, label]) => (
            <label key={`hsl-${field}`} className="ap-comp-field">
              <span>
                {label} {Number(hsl[field] || 0) > 0 ? `+${hsl[field]}` : Number(hsl[field] || 0)}
              </span>
              <input
                aria-label={`Adjustment hsl ${field}`}
                type="range"
                min="-100"
                max="100"
                step="1"
                value={Number(hsl[field] || 0)}
                onChange={e =>
                  updateAdv({
                    hsl: { ...hsl, [field]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>

      {/* 3D .cube LUT Lab (Procedural Presets + Custom .cube Upload) */}
      <div className="ap-flow-field-row">
        <label className="ap-comp-field">
          <span>3D LUT Look Preset</span>
          <select
            aria-label="Adjustment LUT preset"
            className="ap-comp-select"
            value={adv.lutPresetId || ''}
            onChange={e => {
              const presetId = e.target.value;
              if (!presetId) {
                updateAdv({ lutPresetId: '', lutData: null, lutName: '' });
                return;
              }
              const cube = buildProceduralColorCube(presetId, 17);
              if (cube) {
                updateAdv({
                  lutPresetId: presetId,
                  lutData: {
                    size: cube.size,
                    data: cube.data,
                    domainMin: cube.domainMin,
                    domainMax: cube.domainMax,
                  },
                  lutIntensity: adv.lutIntensity ?? 100,
                  lutName: cube.title,
                });
                setError('');
              }
            }}
          >
            <option value="">None (Neutral Cube)</option>
            {CINEMA_3D_LUT_PRESETS.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ap-comp-field">
          <span>Import .cube LUT</span>
          <input
            type="file"
            accept=".cube"
            aria-label="Adjustment LUT"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 12 * 1024 * 1024)
                  throw Error('Choose a LUT smaller than 12 MB.');
                const lutData = parseColorCube(await file.text());
                update({
                  advancedColor: {
                    ...adv,
                    lutPresetId: '',
                    lutData,
                    lutIntensity: 100,
                    lutName: file.name,
                  },
                });
                setError('');
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        </label>
      </div>

      {adv.lutData ? (
        <div className="ap-flow-field-row">
          <label className="ap-comp-field">
            <span>LUT mix {adv.lutIntensity ?? 100}%</span>
            <input
              type="range"
              min="0"
              max="100"
              aria-label="Adjustment LUT mix"
              value={adv.lutIntensity ?? 100}
              onChange={e => updateAdv({ lutIntensity: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            className="ap-flow-reset-btn"
            onClick={() => updateAdv({lutPresetId:'',lutData:null,lutName:'',lutFile:null})}
          >
            Remove LUT
          </button>
        </div>
      ) : null}

      <label className="ap-flow-checkbox-row">
        <input
          type="checkbox"
          aria-label="Adjustment glow enabled"
          checked={!!fx.glow?.enabled}
          onChange={e =>
            update({
              glow: { radius: 8, intensity: 0.2, ...fx.glow, enabled: e.target.checked },
            })
          }
        />{' '}
        Glow
      </label>
      {fx.glow?.enabled ? (
        <div className="ap-flow-field-row">
          <label className="ap-comp-field">
            <span>Glow radius</span>
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              aria-label="Adjustment glow radius"
              value={fx.glow.radius ?? 8}
              onChange={e =>
                update({ glow: { ...fx.glow, radius: Number(e.target.value) } })
              }
            />
          </label>
          <label className="ap-comp-field">
            <span>Glow strength</span>
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              aria-label="Adjustment glow strength"
              value={fx.glow.intensity ?? 0.2}
              onChange={e =>
                update({ glow: { ...fx.glow, intensity: Number(e.target.value) } })
              }
            />
          </label>
        </div>
      ) : null}

      <div className="ap-flow-field-row">
        <button
          type="button"
          className="ap-flow-reset-btn"
          aria-label="Move adjustment earlier"
          disabled={index <= 0}
          onClick={() => onMove?.(-1)}
        >
          Earlier
        </button>
        <button
          type="button"
          className="ap-flow-reset-btn"
          aria-label="Move adjustment later"
          disabled={index >= count - 1}
          onClick={() => onMove?.(1)}
        >
          Later
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

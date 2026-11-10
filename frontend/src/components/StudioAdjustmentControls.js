import React, { useState } from 'react';
import {
  CINEMA_3D_LUT_PRESETS,
  buildProceduralColorCube,
  parseColorCube,
} from './studioColorCube';

export default function StudioAdjustmentControls({ layer, onChange, onMove, index, count }) {
  const [error, setError] = useState('');
  const fx = layer.finishFx || layer.effects?.color || {};
  const adv = fx.advancedColor || {};
  const curve = adv.curve || {};
  const hsl = adv.hsl || {};
  const update = patch => onChange({ ...layer, finishFx: { ...fx, ...patch } });
  const updateAdv = advPatch =>
    update({
      advancedColor: {
        ...adv,
        ...advPatch,
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
            onChange={e => onChange({ ...layer, enabled: e.target.checked })}
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
            onChange={e => onChange({ ...layer, intensity: Number(e.target.value) })}
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
            onClick={() => update({ advancedColor: {} })}
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
          onClick={() => onMove(-1)}
        >
          Earlier
        </button>
        <button
          type="button"
          className="ap-flow-reset-btn"
          aria-label="Move adjustment later"
          disabled={index >= count - 1}
          onClick={() => onMove(1)}
        >
          Later
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

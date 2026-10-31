import React, { useState } from 'react';
import { parseColorCube } from './studioColorCube';

export default function StudioAdjustmentControls({ layer, onChange, onMove, index, count }) {
  const [error, setError] = useState('');
  const fx = layer.finishFx || layer.effects?.color || {};
  const update = patch => onChange({ ...layer, finishFx: { ...fx, ...patch } });
  return <div data-testid="adjustment-grade-controls">
    <label><input type="checkbox" aria-label="Adjustment enabled" checked={layer.enabled !== false}
      onChange={e => onChange({ ...layer, enabled: e.target.checked })} /> Enabled</label>
    {[
      ['exposureStops', 'Exposure', -2, 2, .05, 0],
      ['brightness', 'Brightness', .65, 1.4, .01, 1],
      ['contrast', 'Contrast', .65, 1.75, .01, 1],
      ['saturation', 'Saturation', 0, 1.8, .01, 1],
    ].map(([key, label, min, max, step, fallback]) => <label key={key} className="ap-comp-field">
      <span>{label} {Number(fx[key] ?? fallback).toFixed(2)}</span>
      <input aria-label={`Adjustment ${label.toLowerCase()}`} type="range" min={min} max={max} step={step}
        value={fx[key] > 10 ? fx[key] / 100 : fx[key] ?? fallback}
        onChange={e => update({ [key]: Number(e.target.value) })} />
    </label>)}
    <label className="ap-comp-field"><span>Effect strength {layer.intensity ?? 100}%</span>
      <input type="range" min="0" max="100" aria-label="Adjustment strength" value={layer.intensity ?? 100}
        onChange={e => onChange({ ...layer, intensity: Number(e.target.value) })} />
    </label>
    <label className="ap-comp-field"><span>Import .cube LUT</span>
      <input type="file" accept=".cube" aria-label="Adjustment LUT" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
          if (file.size > 12 * 1024 * 1024) throw Error('Choose a LUT smaller than 12 MB.');
          const lutData = parseColorCube(await file.text());
          update({ advancedColor: { lutData, lutIntensity: 100, lutName: file.name } }); setError('');
        } catch (err) { setError(err.message); }
      }} />
    </label>
    {fx.advancedColor?.lutData ? <button type="button" onClick={() => update({ advancedColor: {} })}>Remove LUT</button> : null}
    <label><input type="checkbox" aria-label="Adjustment glow enabled" checked={!!fx.glow?.enabled}
      onChange={e => update({ glow: { radius: 8, intensity: .2, ...fx.glow, enabled: e.target.checked } })} /> Glow</label>
    {fx.glow?.enabled ? <>
      <label className="ap-comp-field"><span>Glow radius</span><input type="range" min="0" max="40" step="1"
        aria-label="Adjustment glow radius" value={fx.glow.radius ?? 8}
        onChange={e => update({ glow: { ...fx.glow, radius: Number(e.target.value) } })} /></label>
      <label className="ap-comp-field"><span>Glow strength</span><input type="range" min="0" max="1" step=".01"
        aria-label="Adjustment glow strength" value={fx.glow.intensity ?? .2}
        onChange={e => update({ glow: { ...fx.glow, intensity: Number(e.target.value) } })} /></label>
    </> : null}
    <div><button type="button" aria-label="Move adjustment earlier" disabled={index <= 0} onClick={() => onMove(-1)}>Earlier</button>
      <button type="button" aria-label="Move adjustment later" disabled={index >= count - 1} onClick={() => onMove(1)}>Later</button></div>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

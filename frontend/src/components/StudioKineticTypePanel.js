import React, { useState } from 'react';
import { KINETIC_TYPE_DIRECTIONS, KINETIC_TYPE_RECIPES, KINETIC_TYPE_STYLES } from './studioKineticType';

const TILT_STYLES = new Set(['spin', 'wave_cascade', 'whip_slam', 'glitch_jitter', 'spiral_vortex', 'stomp_drop']);

export default function StudioKineticTypePanel({ onBuild, locked }) {
  const [options, setOptions] = useState({ unit: 'word', style: 'rise', direction: 'forward', stagger: .12, entry: .5, travel: 8, tilt: 12, exit: .25 });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = (label, key, low, high, step) => <label key={key}><span>{label}</span>
    <input aria-label={`Kinetic ${label.toLowerCase()}`} type="number" min={low} max={high} step={step}
      value={options[key]} disabled={busy || locked || (key === 'travel' && options.style === 'pop') || (key === 'tilt' && !TILT_STYLES.has(options.style))}
      onChange={event => setOptions(current => ({ ...current, [key]: event.target.value === '' ? '' : Number(event.target.value) }))} /></label>;
  return <details className="advanced-tool-section kinetic-type-panel" open data-testid="kinetic-type-panel">
    <summary>Kinetic typography</summary>
    <p>Separate this title into editable words or letters. Each gets ordinary motion keys inside one group. Undo restores the original title.</p>
    <div className="motion-position-grid" data-testid="kinetic-type-recipe-strip">
      {KINETIC_TYPE_RECIPES.map(recipe => (
        <button
          key={recipe.id}
          type="button"
          disabled={busy || locked}
          data-testid={`kinetic-recipe-${recipe.id}`}
          onClick={() => setOptions(current => ({ ...current, ...recipe.options }))}
        >
          {recipe.label}
        </button>
      ))}
    </div>
    <div className="title-typography-row">
      {[['Unit', 'unit', [['word', 'Words'], ['letter', 'Letters']]],
        ['Movement', 'style', KINETIC_TYPE_STYLES],
        ['Order', 'direction', KINETIC_TYPE_DIRECTIONS]].map(([label, key, choices]) =>
        <label key={key} className="inspector-select-field"><span>{label}</span><select aria-label={`Kinetic ${label.toLowerCase()}`}
          value={options[key]} disabled={busy || locked} onChange={event => setOptions(current => ({ ...current, [key]: event.target.value }))}>
          {choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>)}
    </div>
    <div className="motion-position-grid">
      {field('Stagger (s)', 'stagger', 0, 1, .01)}{field('Entrance (s)', 'entry', .1, 3, .05)}
      {field('Travel (%)', 'travel', 0, 30, 1)}{field('Rotation (deg)', 'tilt', 0, 90, 1)}
      {field('Exit (s)', 'exit', .1, 3, .05)}
    </div>
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" disabled={busy || locked} onClick={async () => {
      setBusy(true); setError('');
      try { await onBuild(options); } catch (failure) { setError(failure.message); }
      finally { setBusy(false); }
    }}>{busy ? 'Building text motion…' : 'Build editable text motion'}</button>
    {locked ? <p>Unlock the Graphics track to edit text motion.</p> : null}
  </details>;
}

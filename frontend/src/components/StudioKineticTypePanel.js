import React, { useState } from 'react';

export default function StudioKineticTypePanel({ onBuild, locked }) {
  const [options, setOptions] = useState({ unit: 'word', style: 'rise', direction: 'forward', stagger: .12, entry: .5, travel: 8, tilt: 12, exit: .25 });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = (label, key, low, high, step) => <label key={key}><span>{label}</span>
    <input aria-label={`Kinetic ${label.toLowerCase()}`} type="number" min={low} max={high} step={step}
      value={options[key]} disabled={busy || locked || (key === 'travel' && options.style === 'pop') || (key === 'tilt' && options.style !== 'spin')}
      onChange={event => setOptions(current => ({ ...current, [key]: event.target.value === '' ? '' : Number(event.target.value) }))} /></label>;
  return <details className="advanced-tool-section kinetic-type-panel" open data-testid="kinetic-type-panel">
    <summary>Kinetic typography</summary>
    <p>Separate this title into editable words or letters. Each gets ordinary motion keys inside one group. Undo restores the original title.</p>
    <div className="title-typography-row">
      {[['Unit', 'unit', [['word', 'Words'], ['letter', 'Letters']]],
        ['Movement', 'style', [['rise', 'Rise'], ['pop', 'Pop'], ['spin', 'Spin']]],
        ['Order', 'direction', [['forward', 'First to last'], ['reverse', 'Last to first'], ['center', 'Center out']]]].map(([label, key, choices]) =>
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

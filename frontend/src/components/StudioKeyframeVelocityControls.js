import React, { useEffect, useState } from 'react';
import { studioCurveVelocity, editStudioCurveVelocity } from './studioMotionEditing';

function VelocityNumber({ label, value, disabled, onCommit }) {
  const [draft, setDraft] = useState(''), [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value === null ? '' : String(Number(value.toFixed(4)))); }, [value, editing]);
  return <label><span>{label}</span><input type="number" step="0.1" aria-label={label} disabled={disabled}
    value={draft} placeholder={value === null ? 'Unbounded tangent' : ''}
    onFocus={() => setEditing(true)} onChange={event => setDraft(event.target.value)}
    onBlur={() => { setEditing(false); if (draft !== '' && Number.isFinite(Number(draft)) && Number(draft) !== Number(value?.toFixed(4))) onCommit(Number(draft)); }}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(value === null ? '' : String(Number(value.toFixed(4)))); setEditing(false); }
    }} /></label>;
}

export default function StudioKeyframeVelocityControls({ curve, first, last, duration, locked, property, onUpdate }) {
  const [error, setError] = useState('');
  const values = studioCurveVelocity(curve, first, last, duration);
  const unit = property === 'rotation' ? '°/s' : property === 'scale' ? 'scale/s' : property === 'opacity' ? 'opacity/s' : '%/s';
  return <div className="studio-velocity-controls">
    <div className="motion-position-grid">{[['start', `Start velocity (${unit})`], ['end', `End velocity (${unit})`],
      ['startInfluence', 'Start influence (%)'], ['endInfluence', 'End influence (%)']].map(([field, label]) =>
      <VelocityNumber key={field} label={label} value={values[field]} disabled={locked || first === last}
        onCommit={value => {
          try { const next = editStudioCurveVelocity(curve, first, last, duration, field, value); setError(''); onUpdate(next); }
          catch (failure) { setError(failure.message); }
        }} />)}</div>
    <small>Velocity is signed property change per programme second. Influence preserves that endpoint velocity. Editing writes a custom cubic curve.</small>
    {error && <span className="pro-keyframe-error" role="alert">{error}</span>}
  </div>;
}

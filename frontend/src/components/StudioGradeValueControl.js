import React, { useEffect, useId, useState } from 'react';

export default function StudioGradeValueControl({ label, ariaLabel, value, min, max, step, onChange }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => { setDraft(String(value)); setError(''); }, [value]);
  const commit = () => {
    const next = draft.trim() === '' ? NaN : Number(draft);
    if (!Number.isFinite(next) || next < min || next > max) {
      setError(`Enter a value from ${min} to ${max}.`);
      return;
    }
    setError('');
    if (next !== Number(value)) onChange(next);
  };
  return <div className="studio-grade-value-control">
    <div className="studio-grade-value-control__header">
      <label htmlFor={id}>{label}</label>
      <input type="number" inputMode="decimal" step="any" min={min} max={max}
        aria-label={`${ariaLabel} value`} aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined} value={draft}
        onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.stopPropagation(); commit(); }
          if (event.key === 'Escape') { event.stopPropagation(); setDraft(String(value)); setError(''); }
        }} />
    </div>
    <input id={id} type="range" aria-label={ariaLabel} min={min} max={max} step={step}
      value={value} onChange={event => onChange(Number(event.target.value))} />
    {error && <small id={`${id}-error`} role="alert">{error}</small>}
  </div>;
}

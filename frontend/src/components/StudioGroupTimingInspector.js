import React, { useEffect, useState } from 'react';

function TimingValue({ label, value, disabled, onCommit }) {
  const [draft, setDraft] = useState(String(value)), [error, setError] = useState('');
  useEffect(() => { setDraft(String(Number(value.toFixed(6)))); setError(''); }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < 0) { setError('Use a finite time at or after zero.'); return; }
    setError(''); if (next !== value) onCommit(next);
  };
  return <label>{label}<input type="number" aria-label={label} value={draft} min={0} step="any" disabled={disabled}
    aria-invalid={!!error} onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); setDraft(String(value)); setError(''); }
    }} />{error && <small role="alert">{error}</small>}</label>;
}

export default function StudioGroupTimingInspector({ row, onEdit, onFit, onDelete }) {
  if (!row || !onEdit) return null;
  return <div className="studio-group-timing" aria-label={`${row.name} clip timing`}>
    <strong>Group clip · {row.childCount} layers</strong>
    <TimingValue label={`${row.name} move to (seconds)`} value={row.startTime} disabled={row.locked}
      onCommit={value => onEdit(row.id, 'move', value)} />
    <TimingValue label={`${row.name} in (seconds)`} value={row.startTime} disabled={row.locked}
      onCommit={value => onEdit(row.id, 'trim-start', value)} />
    <TimingValue label={`${row.name} out (seconds)`} value={row.startTime + row.duration} disabled={row.locked}
      onCommit={value => onEdit(row.id, 'trim-end', value)} />
    <small>Move carries child clips and keys together. In/Out limits visibility; child source edits and keys stay available.</small>
    <button type="button" disabled={row.locked} onClick={() => onFit(row.id)}>Fit {row.name} to children</button>
    <button type="button" disabled={row.locked} onClick={() => onDelete(row.id)}>Delete {row.name} and layers</button>
  </div>;
}

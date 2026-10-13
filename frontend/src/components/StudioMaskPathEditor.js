import React, { useEffect, useState } from 'react';
import { DEFAULT_STUDIO_MASK_POLYGON, parseStudioMaskPolygon } from './studioMaskGeometry';

// Keep incomplete typing out of the canonical graph and live render consumer.
// Enter/blur commits one valid path through the ordinary layer history command.
export default function StudioMaskPathEditor({ mask, onChange }) {
  const saved = mask.path || DEFAULT_STUDIO_MASK_POLYGON;
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(saved); setError(''); }, [saved]);
  const commit = () => {
    const path = draft.trim();
    if (path === saved) { setError(''); return; }
    try {
      parseStudioMaskPolygon(path);
      setError('');
      onChange({ ...mask, path });
    } catch (failure) { setError(failure.message); }
  };
  return <label className="inspector-select-field">
    <span>Polygon path</span>
    <input type="text" aria-label="Mask polygon path" maxLength={2057}
      value={draft} aria-invalid={!!error}
      onChange={event => { setDraft(event.target.value); setError(''); }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); }
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); setDraft(saved); setError('');
        }
      }} />
    <small>Use 3–64 points in layer percentages. Enter or leave the field to apply; Escape cancels.</small>
    {error ? <small role="alert">{error}</small> : null}
  </label>;
}

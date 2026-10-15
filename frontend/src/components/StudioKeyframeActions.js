import React, { useState } from 'react';
import { STUDIO_EASINGS } from './studioAutomation';
export default function StudioKeyframeActions({ count, copied, locked, pasteLocked, pasteTarget, pasteTargets, onPasteTarget, frameStep, onAction, onCopy, onPaste, onSelectAll, onClear, error }) {
  const [factor, setFactor] = useState('2'), [easing, setEasing] = useState('ease_in_out');
  const disabled = !count || locked;
  return <div className="pro-keyframe-actions" role="toolbar" aria-label="Selected keyframes">
    <strong aria-live="polite">{count} keys selected</strong>
    <button type="button" onClick={onSelectAll}>Select visible keys</button>
    <button type="button" disabled={!count} onClick={onClear}>Clear selection</button>
    <button type="button" disabled={!count} onClick={onCopy}>Copy keys</button>
    <label>Paste to <select aria-label="Keyframe paste destination" value={pasteTarget} onChange={e => onPasteTarget(e.target.value)}>
      <option value="">Original layers</option>
      {pasteTargets.map(target => <option key={target.id} value={target.id}>{target.label}{target.locked ? ' · Locked' : ''}</option>)}
    </select></label>
    <button type="button" disabled={!copied || pasteLocked} onClick={onPaste} title="Paste supported properties onto the chosen layer, with the first copied key at the playhead">Paste at playhead</button>
    <button type="button" disabled={disabled} onClick={() => onAction('move', -frameStep)} aria-label="Move selected keys one frame earlier">◀ 1f</button>
    <button type="button" disabled={disabled} onClick={() => onAction('move', frameStep)} aria-label="Move selected keys one frame later">1f ▶</button>
    <label>Time scale <input aria-label="Selected keyframe time scale" type="number" min="0.01" max="100" step="0.1" value={factor} onChange={e => setFactor(e.target.value)} /></label>
    <button type="button" disabled={disabled || count < 2} onClick={() => onAction('scale', Number(factor))}>Scale key timing</button>
    <select aria-label="Selected keyframe interpolation" value={easing} onChange={e => setEasing(e.target.value)}>{STUDIO_EASINGS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
    <button type="button" disabled={disabled} onClick={() => onAction('easing', easing)}>Apply interpolation</button>
    <button type="button" disabled={disabled} onClick={() => onAction('delete')}>Delete keys</button>
    <small>{locked ? 'Unlock selected tracks to edit.' : 'Drag empty property space to box-select. Shift adds; Alt subtracts; Escape cancels.'}</small>
    {error && <span className="pro-keyframe-error" role="alert">{error}</span>}
  </div>;
}

import React, { useEffect, useState } from 'react';
import { GROUP_BOUNDS, GROUP_TRANSFORM, evaluateStudioGroupTransform } from './studioGroups';
import { motionKeyAtPlayhead } from './studioMotionProperties';
import StudioKeyframeCurveEditor from './StudioKeyframeCurveEditor';
import './StudioLayerStack.css';

function GroupNumber({ group, field, onChange, onProperty, locked }) {
  const value = group.transform[field], [draft, setDraft] = useState(String(value)), [error, setError] = useState('');
  useEffect(() => { setDraft(String(value)); setError(''); }, [value]);
  const commit = () => {
    const next = Number(draft), [min, max] = GROUP_BOUNDS[field];
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max) {
      setError(`Use ${min} to ${max}.`); return;
    }
    setError(''); if (next !== value) {
      if (onProperty) onProperty(group.id, field, next); else onChange(group.id, { ...group.transform, [field]: next });
    }
  };
  return <label><span>{field === 'x' || field === 'y' ? `${field.toUpperCase()} (%)` : field}</span>
    <input type="number" aria-label={`${group.name} ${field}`} min={GROUP_BOUNDS[field][0]} max={GROUP_BOUNDS[field][1]}
      step={field === 'scale' || field === 'opacity' ? .01 : 1} value={draft} aria-invalid={!!error} disabled={locked}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
    {error && <small role="alert">{error}</small>}
  </label>;
}

export default function StudioGroupInspector({ tree, entries, onCreate, onTransform, onReset, onRemove, onMove,
  keyframes = [], playhead = 0, keyTolerance = .04, locked = false, onProperty, onToggleKey, onSeek, onUpdateKey, focusKeyId }) {
  const [selected, setSelected] = useState([]), byId = new Map(entries.map(entry => [entry.id, entry]));
  const label = id => tree.byId.get(id)?.name || byId.get(id)?.label || id;
  const chosen = selected.filter(id => tree.roots.includes(id));
  return <section className="studio-group-inspector" aria-label="Graphic groups">
    <h5>Group transforms</h5>
    <p>Choose layers or groups to move together. Children keep their edits and keyframes. Add a property key at the playhead to animate the group. Groups use the canvas centre as their anchor and export Normal-blend children. Evaluated values stay within each control’s range.</p>
    <div className="studio-group-selection">{tree.roots.map(id => <label key={id}>
      <input type="checkbox" aria-label={`Group selection ${label(id)}`} checked={chosen.includes(id)}
        onChange={e => setSelected(current => e.target.checked ? [...current, id] : current.filter(item => item !== id))} />
      {label(id)}</label>)}</div>
    <button type="button" disabled={!chosen.length} onClick={() => { onCreate(chosen); setSelected([]); }}>Group selected layers</button>
    {tree.groups.map(group => {
      const keys = keyframes.filter(key => key.targetId === group.id);
      const displayed = { ...group, transform: evaluateStudioGroupTransform(group, keys, playhead) };
      return <fieldset key={group.id} data-group-id={group.id}>
      <legend>{group.name}</legend>
      <small>{tree.parent.has(group.id) ? `Inside ${label(tree.parent.get(group.id))}` : 'Root group'}</small>
      <div className="studio-group-fields">{Object.keys(GROUP_TRANSFORM).map(field => {
        const atPlayhead = motionKeyAtPlayhead(keys, group.id, field, playhead, keyTolerance);
        const previous = keys.filter(key => key.property === field && key.time < playhead - keyTolerance).sort((a,b) => a.time-b.time).at(-1);
        const next = keys.filter(key => key.property === field && key.time > playhead + keyTolerance).sort((a,b) => a.time-b.time)[0];
        return <div key={field}>
          <GroupNumber group={displayed} field={field} onChange={onTransform} onProperty={onProperty} locked={locked} />
          {onToggleKey && <div>
            <button type="button" aria-label={`Previous ${group.name} ${field} keyframe`} disabled={!previous} onClick={() => onSeek(previous.time)}>‹</button>
            <button type="button" aria-label={`${atPlayhead ? 'Remove' : 'Add'} ${group.name} ${field} keyframe at playhead`}
              aria-pressed={!!atPlayhead} disabled={locked} onClick={() => onToggleKey(group.id, field)}>{atPlayhead ? '◆' : '◇'}</button>
            <button type="button" aria-label={`Next ${group.name} ${field} keyframe`} disabled={!next} onClick={() => onSeek(next.time)}>›</button>
          </div>}
        </div>;
      })}</div>
      {keys.length > 0 && onUpdateKey && <StudioKeyframeCurveEditor keyframes={keys} kind="group" valueBounds={GROUP_BOUNDS}
        focusId={focusKeyId} locked={locked} onUpdate={onUpdateKey} onSelect={id => onSeek(keys.find(key => key.id === id).time)} />}
      <ol>{[...group.layerIds].reverse().map((id, index) => <li key={id}>
        <span>{label(id)}</span>
        <button type="button" aria-label={`Bring ${label(id)} forward in ${group.name}`} disabled={index === 0}
          onClick={() => onMove(id, 'forward')}>↑</button>
        <button type="button" aria-label={`Send ${label(id)} backward in ${group.name}`} disabled={index === group.layerIds.length - 1}
          onClick={() => onMove(id, 'backward')}>↓</button>
      </li>)}</ol>
      <button type="button" disabled={locked} onClick={() => onReset ? onReset(group.id) : onTransform(group.id, { ...GROUP_TRANSFORM })}>Reset {group.name} transform</button>
      <button type="button" disabled={locked} onClick={() => onRemove(group.id)}>Remove {group.name} transform</button>
    </fieldset>; })}
  </section>;
}

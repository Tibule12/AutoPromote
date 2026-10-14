import React, { useEffect, useState } from 'react';
import { GROUP_BOUNDS, GROUP_TRANSFORM } from './studioGroups';
import './StudioLayerStack.css';

function GroupNumber({ group, field, onChange }) {
  const value = group.transform[field], [draft, setDraft] = useState(String(value)), [error, setError] = useState('');
  useEffect(() => { setDraft(String(value)); setError(''); }, [value]);
  const commit = () => {
    const next = Number(draft), [min, max] = GROUP_BOUNDS[field];
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max) {
      setError(`Use ${min} to ${max}.`); return;
    }
    setError(''); if (next !== value) onChange(group.id, { ...group.transform, [field]: next });
  };
  return <label><span>{field === 'x' || field === 'y' ? `${field.toUpperCase()} (%)` : field}</span>
    <input type="number" aria-label={`${group.name} ${field}`} min={GROUP_BOUNDS[field][0]} max={GROUP_BOUNDS[field][1]}
      step={field === 'scale' || field === 'opacity' ? .01 : 1} value={draft} aria-invalid={!!error}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
    {error && <small role="alert">{error}</small>}
  </label>;
}

export default function StudioGroupInspector({ tree, entries, onCreate, onTransform, onRemove, onMove }) {
  const [selected, setSelected] = useState([]), byId = new Map(entries.map(entry => [entry.id, entry]));
  const label = id => tree.byId.get(id)?.name || byId.get(id)?.label || id;
  const chosen = selected.filter(id => tree.roots.includes(id));
  return <section className="studio-group-inspector" aria-label="Graphic groups">
    <h5>Group transforms</h5>
    <p>Choose layers or groups to move together. Children keep their edits and keyframes. Groups use the canvas centre as their anchor and currently export Normal-blend children.</p>
    <div className="studio-group-selection">{tree.roots.map(id => <label key={id}>
      <input type="checkbox" aria-label={`Group selection ${label(id)}`} checked={chosen.includes(id)}
        onChange={e => setSelected(current => e.target.checked ? [...current, id] : current.filter(item => item !== id))} />
      {label(id)}</label>)}</div>
    <button type="button" disabled={!chosen.length} onClick={() => { onCreate(chosen); setSelected([]); }}>Group selected layers</button>
    {tree.groups.map(group => <fieldset key={group.id} data-group-id={group.id}>
      <legend>{group.name}</legend>
      <small>{tree.parent.has(group.id) ? `Inside ${label(tree.parent.get(group.id))}` : 'Root group'}</small>
      <div className="studio-group-fields">{Object.keys(GROUP_TRANSFORM).map(field =>
        <GroupNumber key={field} group={group} field={field} onChange={onTransform} />)}</div>
      <ol>{[...group.layerIds].reverse().map((id, index) => <li key={id}>
        <span>{label(id)}</span>
        <button type="button" aria-label={`Bring ${label(id)} forward in ${group.name}`} disabled={index === 0}
          onClick={() => onMove(id, 'forward')}>↑</button>
        <button type="button" aria-label={`Send ${label(id)} backward in ${group.name}`} disabled={index === group.layerIds.length - 1}
          onClick={() => onMove(id, 'backward')}>↓</button>
      </li>)}</ol>
      <button type="button" onClick={() => onTransform(group.id, { ...GROUP_TRANSFORM })}>Reset {group.name} transform</button>
      <button type="button" onClick={() => onRemove(group.id)}>Remove {group.name} transform</button>
    </fieldset>)}
  </section>;
}

import React, { useEffect, useState } from 'react';
import { GROUP_BOUNDS, GROUP_TRANSFORM, evaluateStudioGroupTransform } from './studioGroups';
import { motionKeyAtPlayhead } from './studioMotionProperties';
import StudioKeyframeCurveEditor from './StudioKeyframeCurveEditor';
import StudioMaskPathEditor from './StudioMaskPathEditor';
import StudioGroupTimingInspector from './StudioGroupTimingInspector';
import { STUDIO_EXPORT_BLEND_MODES } from './studioBlendModes';
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
  onComposite,
  timingRows = [], onEditTiming, onFitTiming, onDeleteGroup,
  keyframes = [], playhead = 0, keyTolerance = .04, locked = false, onProperty, onToggleKey, onSeek, onUpdateKey, focusKeyId }) {
  const [selected, setSelected] = useState([]), byId = new Map(entries.map(entry => [entry.id, entry]));
  const label = id => tree.byId.get(id)?.name || byId.get(id)?.label || id;
  const chosen = selected.filter(id => tree.roots.includes(id));
  return <section className="studio-group-inspector" aria-label="Graphic groups">
    <h5>Group transforms</h5>
    <p>Choose layers or groups to move together. Children keep their edits and keyframes. Add a property key at the playhead to animate the group. A group mask clips the combined children before its transform; its blend mode combines that result with its sibling backdrop. Groups use the canvas centre as their anchor.</p>
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
      <StudioGroupTimingInspector row={timingRows.find(row => row.id === group.id)} onEdit={onEditTiming}
        onFit={onFitTiming} onDelete={onDeleteGroup} />
      {onComposite && <div>
        <label>Blend mode <select aria-label={`${group.name} blend mode`} value={group.blendMode || 'normal'} disabled={locked}
          onChange={event => onComposite(group.id, { blendMode: event.target.value })}>
          {STUDIO_EXPORT_BLEND_MODES.map(mode => <option key={mode} value={mode}>{mode.replaceAll('-', ' ')}</option>)}
        </select></label>
        <label><input type="checkbox" aria-label={`${group.name} enable mask`} checked={!!group.mask?.enabled} disabled={locked}
          onChange={event => onComposite(group.id, { mask: { ...group.mask, enabled: event.target.checked } })} />Enable group mask</label>
        {group.mask?.enabled && <>
          <label>Mask shape <select aria-label={`${group.name} mask shape`} value={group.mask.shape || 'rectangle'} disabled={locked}
            onChange={event => onComposite(group.id, { mask: { ...group.mask, shape: event.target.value } })}>
            {['rectangle', 'ellipse', 'polygon'].map(shape => <option key={shape}>{shape}</option>)}
          </select></label>
          {group.mask.shape === 'polygon' && <StudioMaskPathEditor mask={group.mask} label={`${group.name} mask polygon path`} disabled={locked}
            onChange={mask => onComposite(group.id, { mask })} />}
          {(group.mask.shape || 'rectangle') === 'rectangle' && <label>Corner radius (%)
            <input type="range" aria-label={`${group.name} mask corner radius`} min={0} max={50} step={1} disabled={locked} value={group.mask.radius ?? 6}
              onChange={event => onComposite(group.id, { mask: { ...group.mask, radius: Number(event.target.value) } })} />
          </label>}
          <label>Feather (px)
            <input type="range" aria-label={`${group.name} mask feather`} min={0} max={100} step={1} disabled={locked} value={group.mask.feather ?? 0}
              onChange={event => onComposite(group.id, { mask: { ...group.mask, feather: Number(event.target.value) } })} />
          </label>
          <label><input type="checkbox" aria-label={`${group.name} invert mask`} checked={!!group.mask.inverted} disabled={locked}
            onChange={event => onComposite(group.id, { mask: { ...group.mask, inverted: event.target.checked } })} />Invert group mask</label>
          <button type="button" disabled={locked} onClick={() => onComposite(group.id, { mask: { enabled: false } })}>Reset {group.name} mask</button>
        </>}
      </div>}
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

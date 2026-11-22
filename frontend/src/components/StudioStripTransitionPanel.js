import React, { useState } from 'react';
import { buildStudioStripTransitionPlan, STRIP_TRANSITION_LAYOUTS } from './studioStripTransition';
import './StudioStripTransitionPanel.css';

export default function StudioStripTransitionPanel({ getSnapshot, projectMedia = [], time = 0, onApply, locked }) {
  const [settings, setSettings] = useState({ layout: 'fashion_mosaic', count: 5, direction: 'alternating',
    outgoingId: '', incomingId: '', outgoingStart: 0, incomingStart: 0,
    openingHold: 1.5, transitionDuration: 1.4, incomingHold: 1.5, stagger: .08 });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const media = projectMedia.filter(m => m.status === 'ready' && ['', 'video'].includes(m.mediaType || m.type || '') && m.url && m.storagePath);
  const set = (field, value) => { setSettings(current => ({ ...current, [field]: value })); setMessage(''); };
  return <details className="advanced-tool-section studio-strip-transition" data-testid="studio-strip-transition" open>
    <summary>Strip transitions</summary>
    <p>Reveal a new shot through moving picture panels. Each panel stays editable in the timeline.</p>
    <fieldset disabled={busy || locked}>
      <label>Layout<select aria-label="Strip transition layout" value={settings.layout} onChange={e => set('layout', e.target.value)}>
        {STRIP_TRANSITION_LAYOUTS.map(l => <option value={l.id} key={l.id}>{l.label}</option>)}
      </select></label>
      <div className="studio-strip-transition__grid">
        {[['outgoingId', 'Outgoing footage'], ['incomingId', 'Incoming footage']].map(([field, label]) => <label key={field}>{label}
          <select aria-label={label} value={settings[field]} onChange={e => set(field, e.target.value)}><option value="">Choose saved video</option>
            {media.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>)}
        {[
          ['outgoingStart', 'Outgoing source start (s)', 0, 3600, .01],
          ['incomingStart', 'Incoming source start (s)', 0, 3600, .01],
          ['openingHold', 'Opening hold (s)', 0, 8, .05],
          ['transitionDuration', 'Transition duration (s)', .3, 4, .05],
          ['incomingHold', 'Incoming hold (s)', .1, 8, .05],
          ['stagger', 'Piece stagger (s)', 0, .3, .01],
        ].map(([field, label, min, max, step]) => <label key={field}>{label}<input aria-label={label} type="number"
          value={settings[field]} {...{ min, max, step }} onChange={e => set(field, e.target.value === '' ? '' : Number(e.target.value))} /></label>)}
        <label>Travel<select aria-label="Strip travel direction" value={settings.direction} onChange={e => set('direction', e.target.value)}>
          {['alternating', 'left', 'right', 'up', 'down'].map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
        </select></label>
        <label>Pieces<select aria-label="Strip piece count" disabled={settings.layout === 'fashion_mosaic'} value={settings.layout === 'fashion_mosaic' ? 5 : settings.count} onChange={e => set('count', Number(e.target.value))}>
          {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
        </select></label>
      </div>
      <p>Starts at {Number(time).toFixed(2)}s. Uses {(Number(settings.openingHold) + Number(settings.transitionDuration) + Number(settings.incomingHold)).toFixed(2)}s of the programme. Original programme sound continues; the picture panels are silent.</p>
      {media.length < 2 ? <p>Import footage in Project media. You can also use two different moments from the same saved video.</p> : null}
      <button type="button" className="inspector-primary-action" disabled={!settings.outgoingId || !settings.incomingId} onClick={async () => {
        setBusy(true); setMessage('');
        try { await onApply(buildStudioStripTransitionPlan(getSnapshot(), { ...settings, startTime: time }));
          setMessage('Transition added. Refine its footage layers, masks and movement keys in the timeline. Undo removes the complete transition.'); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
      }}>{busy ? 'Adding transition…' : 'Add editable strip transition'}</button>
    </fieldset>
    {locked ? <p>Unlock Video, Graphics and B-roll to add a transition.</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}

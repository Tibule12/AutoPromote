import React, { useState } from 'react';
import { buildStudioSubjectEchoPlan } from './studioSubjectEcho';
import { buildStudioSubjectCirclePlan } from './studioSubjectCircle';
import './StudioSubjectEchoControls.css';

export default function StudioSubjectEchoControls({ getSnapshot, projectMedia = [], time = 0, getSize, onApply, locked }) {
  const [settings, setSettings] = useState({ sourceMediaId: '', matteMediaId: '', mode: 'tinted', layout: 'trail', count: 4,
    delay: .12, opacity: .5, spread: -3, sourceStart: 0, matteStart: 0, duration: 4, trails: false, trailX: 55, trailY: 80 });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const media = projectMedia.filter(m => m.status === 'ready' && m.url && m.storagePath && Number(m.duration) > 0);
  const set = (field, value) => { setSettings(s => ({ ...s, [field]: value })); setMessage(''); };
  const circle = settings.layout === 'circle';
  const numeric = [ ['count', 'Echo copies', circle ? 4 : 2, circle ? 8 : 6, 1], ['delay', 'Delay per copy (s)', .04, circle ? .3 : .5, .01],
    ['opacity', 'Nearest echo opacity', .05, circle ? 1 : .8, .05], ...(!circle ? [['spread', 'Spread per copy (%)', -12, 12, .5]] : []),
    ['sourceStart', 'Source start (s)', 0, 3600, .01], ['matteStart', 'Matching matte start (s)', 0, 3600, .01],
    ['duration', 'Effect duration (s)', .5, 12, .1] ];
  return <details className="advanced-tool-section studio-subject-echo" data-testid="studio-subject-echo">
    <summary>Subject echoes &amp; light arcs</summary>
    <p>Layer earlier poses behind a sharp lead subject. Use a matching matte video with a white subject and black background; this control does not isolate people automatically.</p>
    <fieldset disabled={busy || locked}>
      <div className="studio-subject-echo__grid">
        <label>Copy arrangement<select aria-label="Copy arrangement" value={settings.layout} onChange={e => {
          const layout=e.target.value;setSettings(s=>({...s,layout,count:layout==='circle'?Math.max(4,s.count):Math.min(6,s.count),
            opacity:layout==='circle'?1:Math.min(.8,s.opacity),circleX:s.circleX??53,circleY:s.circleY??73,radiusX:s.radiusX??32,radiusY:s.radiusY??9,anchorX:s.anchorX??50,anchorY:s.anchorY??70}));setMessage('');
        }}><option value="trail">Delayed trail</option><option value="circle">Copy circle</option></select></label>
        {[['sourceMediaId', 'Subject footage'], ['matteMediaId', 'Matching subject matte']].map(([field, label]) => <label key={field}>{label}
          <select value={settings[field]} onChange={e => set(field, e.target.value)}><option value="">Choose saved video</option>
            {media.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>)}
        {!circle && <label>Echo appearance<select value={settings.mode} onChange={e => set('mode', e.target.value)}>
          <option value="tinted">Tinted photographic echoes</option><option value="ghost">Photographic ghosts</option><option value="chroma">Coloured silhouettes</option>
        </select></label>}
        {numeric.map(([field, label, min, max, step]) => <label key={field}>{label}<input type="number" min={min} max={max} step={step}
          value={settings[field]} onChange={e => set(field, e.target.value === '' ? '' : Number(e.target.value))} /></label>)}
      </div>
      {circle && <><p>Copies form a floor ellipse with smaller back copies and larger front copies. Set the foot anchor from the supplied footage; this arranges 2D poses and does not generate new camera angles.</p>
        <div className="studio-subject-echo__grid">{[['circleX','Circle centre X (%)',35,65],['circleY','Circle floor Y (%)',50,85],['radiusX','Circle radius X (%)',15,40],['radiusY','Circle depth Y (%)',3,15],['anchorX','Source foot X (%)',15,85],['anchorY','Source foot Y (%)',40,88]].map(([field,label,min,max])=><label key={field}>{label}<input type="number" aria-label={label} min={min} max={max} step="0.1" value={settings[field]??''} onChange={e=>set(field,e.target.value===''?'':Number(e.target.value))}/></label>)}</div></>}
      {!circle && <label className="studio-subject-echo__toggle"><input type="checkbox" checked={settings.trails} onChange={e => set('trails', e.target.checked)} />Add editable light arcs</label>}
      {!circle && settings.trails ? <><p>Arcs are drawn paths. Position them here, then refine their vector points and stroke keys; they do not track feet automatically.</p>
        <div className="studio-subject-echo__grid">{[['trailX', 'Light origin X (%)'], ['trailY', 'Light origin Y (%)']].map(([field, label]) =>
          <label key={field}>{label}<input type="number" min="10" max="90" step="1" value={settings[field]} onChange={e => set(field, e.target.value === '' ? '' : Number(e.target.value))} /></label>)}</div></> : null}
      <p>Starts at the playhead: {Number(time).toFixed(2)}s. Creates editable layers and source offsets; Undo removes the complete operation.</p>
      <button type="button" disabled={!settings.sourceMediaId || !settings.matteMediaId} onClick={async () => {
        setBusy(true); setMessage('');
        try { const build = circle ? buildStudioSubjectCirclePlan : buildStudioSubjectEchoPlan;
          const plan = build(getSnapshot(), { ...settings, startTime: time, ...getSize() });
          await onApply(plan); setMessage(circle ? 'Copy circle applied. Refine source offsets, floor light, mattes and depth keys.' : 'Subject echoes applied. Refine the individual layers, matte connections and light paths in the timeline.'); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
      }}>{busy ? 'Building editable echoes…' : circle ? 'Apply copy circle' : 'Apply subject echoes'}</button>
    </fieldset>
    {locked ? <p>Unlock Video, Graphics and B-roll to add echoes.</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}

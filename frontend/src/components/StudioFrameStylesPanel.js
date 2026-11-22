import React, { useEffect, useId, useRef, useState } from 'react';
import { STUDIO_FRAME_STYLES, buildStudioFramePlan } from './studioFrameStyles';
import { calculateBpm, normalizeBeatMarkers } from './studioBeatEngine';
import { ORIGINAL_STUDIO_SOUNDS, SOUND_EFFECT_PRESETS } from './motion/soundDesign';
import './StudioFrameStylesPanel.css';

function FrameThumbnail({ style, poster }) {
  const uid = useId().replace(/:/g, '');
  return <svg className="studio-frame-thumbnail" viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill={style.background} />
    {style.panels.map(([x, y, w, h, rotation, kind], i) => {
      const id = `${uid}-${i}`, shape = kind === 'ellipse' ? <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} />
        : kind === 'hexagon' ? <polygon points={`${x-w/4},${y-h/2} ${x+w/4},${y-h/2} ${x+w/2},${y} ${x+w/4},${y+h/2} ${x-w/4},${y+h/2} ${x-w/2},${y}`} />
        : <rect x={x-w/2} y={y-h/2} width={w} height={h} />;
      return <g key={i} transform={`rotate(${rotation} ${x} ${y})`}>
        <defs><clipPath id={id}>{shape}</clipPath><linearGradient id={`${id}-fill`} x2="1" y2="1"><stop stopColor={style.accent}/><stop offset="1" stopColor="#172235"/></linearGradient></defs>
        <g fill={style.frame} stroke={style.frame} strokeWidth="3">{shape}</g>
        <g clipPath={`url(#${id})`}>
          <rect x={x-w/2} y={y-h/2} width={w} height={h} fill={`url(#${id}-fill)`} />
          {poster ? <image href={poster} x={x-w/2} y={y-h/2} width={w} height={h} preserveAspectRatio="xMidYMid slice"/> : <><circle cx={x} cy={y-h*.12} r={Math.min(w,h)*.12} fill="#ffffff" opacity=".7"/><ellipse cx={x} cy={y+h*.26} rx={w*.26} ry={h*.3} fill="#ffffff" opacity=".35"/></>}
        </g>
      </g>;
    })}
    {style.id === 'redline' ? <rect x="78" y="8" width="1" height="76" fill={style.accent}/> : null}
    {style.id === 'cinemascope' ? <path d="M6 24v-5h5 M89 19h5v5 M6 74v5h5 M89 79h5v-5" stroke={style.accent} strokeWidth=".6" fill="none"/> : null}
    <text x="8" y="95" fill={style.accent} fontSize="3.4" fontFamily="Inter,sans-serif" letterSpacing=".5">{style.tag}</text>
  </svg>;
}

export default function StudioFrameStylesPanel({ getSnapshot, projectMedia = [], time = 0, beatMarkers = [], getSize, onApply, locked }) {
  const [settings, setSettings] = useState({ styleId: 'museum', sourceIds: ['', '', ''], sourceStarts: [0, 0, 0], duration: 3,
    motion: 'drift', motionAmount: .5, border: 1.2, beatMode: 'music', bpm: 120, phase: 0, snapStart: false,
    soundMode: 'entrance', soundVolume: .25, caption: '' });
  const [gallery, setGallery] = useState(false), [family, setFamily] = useState('All'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const browseRef = useRef(null), dialogRef = useRef(null);
  const style = STUDIO_FRAME_STYLES.find(s => s.id === settings.styleId);
  const media = projectMedia.filter(m => m.status === 'ready' && ['', 'video'].includes(m.mediaType || m.type || '') && m.url && m.storagePath);
  const beats = normalizeBeatMarkers(beatMarkers), bpm = calculateBpm(beats);
  const poster = media.find(m => m.id === settings.sourceIds[0])?.poster;
  const set = (key, value) => { setSettings(s => ({ ...s, [key]: value })); setMessage(''); };
  const choose = next => { setSettings(s => ({ ...s, styleId: next.id, background: next.background, frame: next.frame, accent: next.accent, tone: next.tone, caption: '' })); setGallery(false); setMessage(''); };
  useEffect(() => {
    if (gallery) dialogRef.current?.querySelector('button')?.focus();
    else browseRef.current?.focus({ preventScroll: true });
  }, [gallery]);
  const numeric = (key, label, min, max, step) => <label key={key}>{label}<input aria-label={label} type="number" {...{min,max,step}} value={settings[key]}
    onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))}/></label>;
  return <details className="advanced-tool-section studio-frame-styles" data-testid="studio-frame-styles" open>
    <summary>Original frame styles</summary>
    <div className="studio-frame-current"><FrameThumbnail style={style} poster={poster}/><div><small>{style.family} · COLLECTION 01</small><strong>{style.name}</strong><p>{style.description}</p></div></div>
    <button type="button" ref={browseRef} className="inspector-secondary-action" onClick={() => setGallery(true)}>Browse {STUDIO_FRAME_STYLES.length} frame styles</button>
    <p className="studio-frame-note">Layout preview. Apply a frame to inspect the actual moving footage in Studio.</p>
    <fieldset disabled={busy || locked}>
      {['Main footage', 'Second view (optional)', 'Third view (optional)'].map((label, index) => <div className="studio-frame-source" key={label}>
        <label>{label}<select aria-label={label} value={settings.sourceIds[index]} onChange={e => {const values=[...settings.sourceIds];values[index]=e.target.value;set('sourceIds',values);}}>
          <option value="">{index ? 'Use main footage' : 'Choose saved video'}</option>{media.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></label>
        <label>Source {index+1} start (s)<input aria-label={`Frame source ${index+1} start (s)`} type="number" min="0" max="3600" step=".01" disabled={index>0&&!settings.sourceIds[index]}
          value={settings.sourceStarts[index]} onChange={e=>{const values=[...settings.sourceStarts];values[index]=e.target.value===''?'':Number(e.target.value);set('sourceStarts',values);}}/></label>
      </div>)}
      <label>Caption<input aria-label="Frame caption" value={settings.caption} maxLength={80} placeholder={style.tag} onChange={e=>set('caption',e.target.value)}/></label>
      <div className="studio-frame-palette">{[['background','Background'],['frame','Frame'],['accent','Accent']].map(([key,label])=><label key={key}>{label}<input type="color" aria-label={`Frame ${label.toLowerCase()} colour`} value={settings[key]||style[key]} onChange={e=>set(key,e.target.value)}/></label>)}</div>
      {numeric('duration','Frame duration (s)',.5,12,.05)}{numeric('border','Border width (%)',.2,4,.1)}
      <label>Motion<select aria-label="Frame motion" value={settings.motion} onChange={e=>set('motion',e.target.value)}><option value="none">Still layout</option><option value="drift">Slow drift</option><option value="beat">Pulse on beats</option></select></label>
      <label>Motion amount<input type="range" aria-label="Frame motion amount" min="0" max="1" step=".01" value={settings.motionAmount} onChange={e=>set('motionAmount',Number(e.target.value))}/></label>
      <details className="studio-frame-subsection" open><summary>Beat sync</summary>
        <p>{beats.length ? `${beats.length} music beats available${bpm ? ` · approximately ${bpm} BPM` : ''}.` : 'Add music in Sound to use its detected beats, or set your own tempo grid.'}</p>
        <label>Beat source<select aria-label="Frame beat source" value={settings.beatMode} onChange={e=>set('beatMode',e.target.value)}><option value="music">Detected music beats</option><option value="tempo">My tempo grid</option></select></label>
        {settings.beatMode==='tempo'?<>{numeric('bpm','Tempo (BPM)',40,240,1)}{numeric('phase','Grid origin (s)',0,86400,.01)}</>:null}
        <label className="studio-frame-check"><input type="checkbox" aria-label="Snap frame start to beat" checked={settings.snapStart} onChange={e=>set('snapStart',e.target.checked)}/>Snap start to a nearby beat</label>
      </details>
      <details className="studio-frame-subsection" open><summary>Sound design</summary>
        <label>Cue placement<select aria-label="Frame sound placement" value={settings.soundMode} onChange={e=>set('soundMode',e.target.value)}><option value="off">No added cue</option><option value="entrance">Frame entrance</option><option value="strong_beats">Strong beats</option></select></label>
        <label>Sound effect<select aria-label="Frame sound effect" value={settings.tone||style.tone} onChange={e=>set('tone',e.target.value)}>
          <optgroup label="AutoPromote originals">{ORIGINAL_STUDIO_SOUNDS.map(s=><option key={s.tone} value={s.tone}>{s.name}</option>)}</optgroup>
          <optgroup label="Studio essentials">{SOUND_EFFECT_PRESETS.filter(s=>!ORIGINAL_STUDIO_SOUNDS.some(o=>o.tone===s.tone)).map(s=><option key={s.tone} value={s.tone}>{s.name}</option>)}</optgroup>
        </select></label>
        <label>Cue volume<input type="range" aria-label="Frame cue volume" min="0" max="1" step=".01" value={settings.soundVolume} onChange={e=>set('soundVolume',Number(e.target.value))}/></label>
      </details>
      <p>Starts near {Number(time).toFixed(2)}s. Creates editable footage, borders, captions, motion keys and sound cues. Original programme sound continues.</p>
      <button type="button" className="inspector-primary-action" disabled={!settings.sourceIds[0]} onClick={async()=>{
        setBusy(true);setMessage('');
        try{await onApply(buildStudioFramePlan(getSnapshot(),{...settings,startTime:time,beats,...getSize()}));setMessage(`${style.name} added. Edit its layers and sound cues in the timeline; Undo removes the complete frame.`);}
        catch(error){setMessage(error.message);}finally{setBusy(false);}
      }}>{busy?'Adding frame…':'Add editable frame'}</button>
    </fieldset>
    {locked?<p>Unlock Video, Graphics and B-roll to add a frame.</p>:null}{message?<p role="status">{message}</p>:null}
    {gallery?<div className="studio-frame-gallery-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setGallery(false);}}>
      <div className="studio-frame-gallery" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="studio-frame-gallery-title" onKeyDown={e=>{
        if(e.key==='Escape'){e.stopPropagation();setGallery(false);}if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll('button:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      }}><header><div><small>AUTOPROMOTE ORIGINALS · COLLECTION 01</small><h3 id="studio-frame-gallery-title">Give your footage a new frame.</h3></div><button type="button" aria-label="Close frame gallery" onClick={()=>setGallery(false)}>×</button></header>
        <div className="studio-frame-categories" role="group" aria-label="Frame style categories">{['All',...new Set(STUDIO_FRAME_STYLES.map(s=>s.family))].map(f=><button type="button" key={f} aria-pressed={family===f} onClick={()=>setFamily(f)}>{f}</button>)}</div>
        <div className="studio-frame-gallery-grid">{STUDIO_FRAME_STYLES.filter(s=>family==='All'||s.family===family).map(s=><button type="button" key={s.id} aria-label={`Choose ${s.name} frame`} aria-pressed={s.id===style.id} className="studio-frame-style-card" onClick={()=>choose(s)}><FrameThumbnail style={s} poster={poster}/><span><strong>{s.name}</strong><small>{s.family}</small></span><p>{s.description}</p></button>)}</div>
      </div>
    </div>:null}
  </details>;
}

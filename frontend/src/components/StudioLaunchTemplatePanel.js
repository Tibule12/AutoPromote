import { applySafeMediaSource } from "../utils/security";
import React, { useEffect, useRef, useState } from 'react';
import { auth } from '../firebaseClient';
import ProductHelpButton from './ProductHelpButton';
import { uploadSourceFileViaBackend } from '../utils/sourceUpload';
import { instantiateStudioCreativeTemplate, proposeStudioDirectorTemplate, studioTemplateReference, STUDIO_CREATIVE_TEMPLATES } from './studioCreativeTemplate';

import { resolveStudioTemplateRecipe, materializeStudioHookRanges } from './studioHookTemplate';
import './StudioLaunchTemplatePanel.css';
const roleLabels = { statementFootage: 'Guest statement', reactionFootage: 'Real reaction', questionFootage: 'Question', answerFootage: 'Answer / revelation', actionFootage: 'Decisive action', wideFootage: 'Wider context', conflictFootage: 'Conflict / counter-angle', struggleFootage: 'The struggle', journeyFootage: 'A step forward', payoffFootage: 'The hopeful result', detailFootage: 'Movement / detail', beforeFootage: 'Preparation / before', contextFootage: 'Process / context', resultFootage: 'Finished result', narration: 'Narration', payoffVoice: 'Closing words', music: 'Music bed' };

const noCaptions = [];
export default function StudioLaunchTemplatePanel({ projectId, media, instance, onApply, hookLibraryRequest = 0, sourceCaptions = noCaptions }) {
  const [copy, setCopy] = useState({ headline: 'RAISE\nTHE RITUAL', featureOne: 'PRECISION.\nIN EVERY POUR.',
    featureTwo: 'CRAFTED FOR\nYOUR EVERYDAY.', callToAction: 'Discover the collection', brandColour: '#ffb15a' });
  const [slots, setSlots] = useState({});
  const [variationId, setVariationId] = useState('signature');
  const [transcripts, setTranscripts] = useState({});
  const [templateId, setTemplateId] = useState(`${STUDIO_CREATIVE_TEMPLATES[0].templateId}@${STUDIO_CREATIVE_TEMPLATES[0].version}`);
  const [aspect, setAspect] = useState('16:9');
  const template = STUDIO_CREATIVE_TEMPLATES.find(item => `${item.templateId}@${item.version}` === templateId);
  const selectableMedia = [...new Map([...media, ...Object.values(slots)].map(asset => [asset.id, asset])).values()];
  const hook = template.executionDefinition.hook;
  let recipe = resolveStudioTemplateRecipe(template, variationId);
  try { recipe = materializeStudioHookRanges(recipe, slots); } catch (_) { /* Apply reports invalid source drafts. */ }
  const plannedSeconds = recipe.sequence.reduce((sum, shot) => sum + shot.duration, 0);
  const copyLabel = key => recipe.inputPresentation?.[key]?.label || ({ headline: 'Launch headline', featureOne: 'Feature one', featureTwo: 'Feature two', callToAction: 'Launch CTA', brandColour: 'Launch colour' })[key] || key;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const restoredRef = useRef(null), libraryRef = useRef(null);
  useEffect(() => {
    if (!hookLibraryRequest) return;
    const next = STUDIO_CREATIVE_TEMPLATES.find(item => item.executionDefinition.hook);
    setTemplateId(`${next.templateId}@${next.version}`); setVariationId(next.executionDefinition.defaultVariation);
    setAspect(next.executionDefinition.defaultAspect); setProposal(null);
    setCopy(current => ({ ...current, ...Object.fromEntries(Object.entries(next.executionDefinition.inputPresentation).map(([key, value]) => [key, value.default])) }));
    const frame = requestAnimationFrame(() => {
      if (libraryRef.current) { libraryRef.current.open = true; libraryRef.current.scrollIntoView({ block: 'nearest' }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [hookLibraryRequest]);
  const defaultFocus = (slot, key, fallback) => {
    let time = 0;
    for (const shot of recipe.sequence) {
      if (shot.slot === slot) { const boundary = time; return [...(recipe.framing?.positions || [])].reverse().find(row => row.time <= boundary)?.[key] ?? fallback; }
      time += shot.duration;
    }
    return fallback;
  };
  useEffect(() => {
    if (!instance?.bindings) return;
    const identity = JSON.stringify(instance);
    if (restoredRef.current === identity) return;
    const restored = {};
    for (const [slot, binding] of Object.entries(instance.bindings)) {
      if (typeof binding === 'string') continue;
      const asset = media.find(item => item.id === binding.assetId && item.contentHash === binding.contentHash);
      if (!asset) return;
      restored[slot] = { ...asset, trimStart: binding.trimStart || 0, ...(binding.focus ? { focus: binding.focus } : {}), ...(binding.selectedEnd !== undefined ? { selectedEnd: binding.selectedEnd } : {}) };
    }
    restoredRef.current = identity;
    setTemplateId(`${instance.templateRef.templateId}@${instance.templateRef.version}`);
    setAspect(instance.aspect || '16:9');
    setVariationId(instance.variationId || 'signature');
    setCopy(current => ({ ...current, ...Object.fromEntries(Object.entries(instance.bindings).filter(([, value]) => typeof value === 'string')) }));
    const restoredCaptions = {}, captionSources = new Set();
    for (const [slot, asset] of Object.entries(restored)) {
      if (captionSources.has(asset.id)) continue;
      const cues = sourceCaptions.filter(cue => cue.sourceClipId === asset.id);
      if (cues.length) { restoredCaptions[slot] = cues; captionSources.add(asset.id); }
    }
    setTranscripts(restoredCaptions);
    setSlots(restored); setProposal(null);
  }, [instance, media, sourceCaptions]);
  const bindFile = async (slot, file) => {
    if (!file) return;
    setProposal(null);
    setBusy(true); setStatus(`Saving ${file.name}…`);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in before applying a template.');
      const mediaType = template.inputSlots.find(input => input.id === slot)?.type;
      if (!['image', 'audio', 'video'].includes(mediaType)) throw new Error('Unsupported template media input.');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const contentHash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
      let duration = 0;
      if (mediaType !== 'image') {
        const url = URL.createObjectURL(file);
        try { duration = await new Promise((resolve, reject) => {
          const player = document.createElement(mediaType); player.preload = 'metadata';
          const timer = setTimeout(() => { player.removeAttribute('src'); reject(new Error('Could not read media duration.')); }, 15000);
          player.onloadedmetadata = () => { clearTimeout(timer); resolve(player.duration); player.removeAttribute('src'); };
          player.onerror = () => { clearTimeout(timer); reject(new Error('Unsupported media.')); };
          if (!applySafeMediaSource(player, url)) { clearTimeout(timer); reject(new Error("Invalid media URL.")); }
        }); } finally { URL.revokeObjectURL(url); }
      }
      const uploaded = await uploadSourceFileViaBackend({ file, mediaType, fileName: file.name,
        token: await user.getIdToken(), getToken: () => user.getIdToken(), purpose: 'studio_project' });
      setSlots(current => ({ ...current, [slot]: { id: `launch-${contentHash.slice(0, 24)}`, name: file.name,
        mediaType, type: mediaType, ownerUid: user.uid, contentHash,
        storagePath: uploaded.storagePath, url: uploaded.url, duration, status: 'ready' } }));
      setTranscripts(current => { const next = { ...current }; delete next[slot]; return next; });
      setStatus(`${file.name} saved.`);
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  };
  const apply = async actor => {
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in before applying a template.');
      const supplied = { ...copy, ...slots };
      const bindings = Object.fromEntries(template.inputSlots.filter(input => supplied[input.id] !== undefined)
        .map(input => [input.id, supplied[input.id]]));
      const options = { template, templateRef: await studioTemplateReference(template),
        ownerUid: user.uid, projectId, bindings, actor, aspect, variationId,
        transcripts: Object.fromEntries(Object.entries(transcripts).filter(([slot]) => bindings[slot])) };
      if (actor === 'director') {
        setProposal(await proposeStudioDirectorTemplate({ ...options, intent: template.categoryIds[0] }));
        setStatus(hook ? 'Director prepared this hook. Review before applying.' : 'Director selected the launch edit from your brief. Review before applying.');
        return;
      }
      const result = await instantiateStudioCreativeTemplate(options);
      onApply(result.snapshot);
      setStatus(hook ? 'Hook template applied. Cuts, captions, source focus, motion and sound remain editable.' : 'Launch template applied. Clips, titles, keys and sound remain editable.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  };
  return <details ref={libraryRef} className="studio-template-library studio-authored-templates" data-testid="launch-template-panel">
    <summary>{template.label} · {Number(plannedSeconds.toFixed(3))} seconds</summary>
    <ProductHelpButton featureId="studio.templates" label="Templates" workspaceType="STUDIO" />
    <p className="studio-authored-templates__intro">{hook ? hook.promise : 'Bind your footage, logo and soundtrack, then edit the resulting project.'}</p>
    <label style={{ display: 'block', marginTop: 8 }}>Template
      <select aria-label="Creative template" value={templateId} onChange={e => {
        const next = STUDIO_CREATIVE_TEMPLATES.find(item => `${item.templateId}@${item.version}` === e.target.value);
        setTemplateId(e.target.value); setAspect(next.executionDefinition.defaultAspect || '16:9'); setProposal(null);
        setVariationId(next.executionDefinition.defaultVariation || 'signature'); setTranscripts({});
        setCopy(current => ({ ...current, ...Object.fromEntries(Object.entries(next.executionDefinition.inputPresentation || {}).map(([key, value]) => [key, value.default])) }));
      }}>{STUDIO_CREATIVE_TEMPLATES.map(item => <option key={`${item.templateId}@${item.version}`} value={`${item.templateId}@${item.version}`}>{item.label} · {item.version}</option>)}</select>
    </label>
    <label style={{ display: 'block', marginTop: 8 }}>Aspect ratio
      <select aria-label="Template aspect ratio" value={aspect} onChange={e => { setAspect(e.target.value); setProposal(null); }}>
        {template.supportedAspects.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    {hook && <label>Opening arrangement<select aria-label="Hook variation" value={variationId} onChange={e => { setVariationId(e.target.value); setProposal(null); }}>
      {template.executionDefinition.variations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>}
    {hook && <details className="studio-authored-templates__plan"><summary>See the cut sequence</summary>
      <ol>{recipe.sequence.map((shot, index) => <li key={index}>{roleLabels[shot.slot] || shot.slot}<small>{shot.duration}s</small></li>)}</ol>
    </details>}
    {Object.entries(copy).filter(([key]) => template.inputSlots.some(input => input.id === key && ['text', 'colour'].includes(input.type))).map(([key, value]) => <label key={key} style={{ display: 'block', marginTop: 8 }}>
      {copyLabel(key)}
      {key === 'brandColour' ? <input aria-label="Launch colour" type="color" value={value}
        onChange={e => { setProposal(null); setCopy(c => ({ ...c, [key]: e.target.value })); }} />
        : <textarea aria-label={copyLabel(key)} value={value} rows={2} onChange={e => { setProposal(null); setCopy(c => ({ ...c, [key]: e.target.value })); }} />}
    </label>)}
    {template.inputSlots.filter(input => ['image', 'audio', 'video'].includes(input.type)).map(input => {
      const slot = input.id;
      return <fieldset key={slot}><legend>{hook ? roleLabels[slot] || slot : slot}{!input.required && ' · optional'}</legend>
      <select aria-label={`Select ${slot}`} value={slots[slot]?.id || ''}
        onChange={e => { setProposal(null); const asset = selectableMedia.find(a => a.id === e.target.value);
          setTranscripts(current => { const next = { ...current }; delete next[slot]; return next; });
          setSlots(current => { const next = { ...current }; if (asset) { const { trimStart, selectedEnd, focus, ...source } = asset; next[slot] = { ...source }; } else delete next[slot]; return next; }); }}><option value="">Choose saved media</option>
        {selectableMedia.filter(a => a.storagePath && a.contentHash &&
          (a.mediaType || a.type) === input.type)
          .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      {input.type !== 'image' && slots[slot] && <label>Source in-point (seconds)
        <input type="number" min="0" step="0.125" aria-label={`${slot} in-point`}
          value={slots[slot].trimStart || 0} onChange={e => {
            setProposal(null); const value = Number(e.target.value);
            setSlots(current => ({ ...current, [slot]: { ...current[slot], trimStart: value } }));
          }} /></label>}
      {hook && slots[slot] && recipe.sequence.some(shot => shot.slot === slot && shot.fitRange) && <label>Source out-point (seconds, optional)
        <input aria-label={`${slot} out-point`} type="number" min="0" step="0.001" value={slots[slot].selectedEnd ?? ''} placeholder="Use the authored duration" onChange={e => {
          const value = e.target.value === '' ? undefined : Number(e.target.value); setProposal(null);
          setSlots(current => ({ ...current, [slot]: { ...current[slot], selectedEnd: value } }));
        }} /><small>End on a complete sentence. Cuts snap to the nearest 24 fps frame; following accents move with the range.</small></label>}
      <input aria-label={`Upload ${slot}`} type="file" disabled={busy}
        accept={input.type === 'image' ? 'image/png,image/webp' : input.type === 'audio' ? 'audio/*' : 'video/*'}
        onChange={e => bindFile(slot, e.target.files[0])} />
      {slots[slot] && <small>{slots[slot].name}</small>}
      {hook && slots[slot] && input.type === 'video' && <details><summary>Source framing and captions</summary>
        <div className="studio-authored-templates__focus">{[['x','Focus X',0,100,1,50],['y','Focus Y',0,100,1,50],['zoom','Zoom',1,3,.01,1]].map(([key,label,min,max,step,fallback]) => <label key={key}>{label}<input aria-label={`${slot} ${label}`} type="number" min={min} max={max} step={step} value={slots[slot].focus?.[key] ?? defaultFocus(slot,key,fallback)} onChange={e => {
          const value = Number(e.target.value); setProposal(null); setSlots(current => ({ ...current, [slot]: { ...current[slot], focus: { x: defaultFocus(slot,'x',50), y: defaultFocus(slot,'y',50), zoom: defaultFocus(slot,'zoom',1), ...current[slot].focus, [key]: value } } }));
        }} /></label>)}</div>
        <label>Source captions (JSON)<input aria-label={`Captions for ${slot}`} type="file" accept="application/json,.json" onChange={async e => {
          const file = e.target.files[0]; if (!file) return;
          try { if (file.size > 1024*1024) throw new Error('Use caption JSON smaller than 1 MB.');
            const data = JSON.parse(await file.text()), cues = data.segments || data;
            if (!Array.isArray(cues) || cues.length > 500) throw new Error('Provide up to 500 source-timed caption cues.');
            setTranscripts(current => ({ ...current, [slot]: cues })); setProposal(null); setStatus(`${cues.length} source captions loaded. Check their words after applying.`);
          } catch (error) { setStatus(error.message); }
        }} /></label><small>{transcripts[slot]?.length || 0} source cues. Captions remain editable after applying.</small>
      </details>}
    </fieldset>;
    })}
    <button type="button" disabled={busy} onClick={() => apply('manual')}>{hook ? 'Apply hook template' : 'Apply launch template'}</button>
    <button type="button" disabled={busy} onClick={() => apply('director')}>{hook ? 'Director: prepare hook' : 'Director: select launch edit'}</button>
    {proposal && <div role="region" aria-label="Director launch selection">
      <strong>{template.label}</strong>
      <p>{proposal.selectionReason}</p>
      <small>Uses your selected source ranges. No analysis or generation job starts here.</small>
      <button type="button" onClick={() => {
        if (proposal.result.projectId !== projectId || proposal.result.ownerUid !== auth.currentUser?.uid) {
          setProposal(null); setStatus('Project changed. Ask Director to select again.'); return;
        }
        onApply(proposal.result.snapshot); setProposal(null);
        setStatus('Director launch edit applied. All clips, titles, keys and sound remain editable.');
      }}>{hook ? 'Apply Director hook' : 'Apply Director launch'}</button>
      <button type="button" onClick={() => setProposal(null)}>Dismiss selection</button>
    </div>}
    <p role="status">{status}</p>
  </details>;
}

import React, { useEffect, useRef, useState } from 'react';
import { auth } from '../firebaseClient';
import ProductHelpButton from './ProductHelpButton';
import { uploadSourceFileViaBackend } from '../utils/sourceUpload';
import { instantiateStudioCreativeTemplate, proposeStudioDirectorTemplate, studioTemplateReference, STUDIO_CREATIVE_TEMPLATES } from './studioCreativeTemplate';

export default function StudioLaunchTemplatePanel({ projectId, media, instance, onApply }) {
  const [copy, setCopy] = useState({ headline: 'RAISE\nTHE RITUAL', featureOne: 'PRECISION.\nIN EVERY POUR.',
    featureTwo: 'CRAFTED FOR\nYOUR EVERYDAY.', callToAction: 'Discover the collection', brandColour: '#ffb15a' });
  const [slots, setSlots] = useState({});
  const [templateId, setTemplateId] = useState(`${STUDIO_CREATIVE_TEMPLATES[0].templateId}@${STUDIO_CREATIVE_TEMPLATES[0].version}`);
  const [aspect, setAspect] = useState('16:9');
  const template = STUDIO_CREATIVE_TEMPLATES.find(item => `${item.templateId}@${item.version}` === templateId);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const restoredRef = useRef(null);
  useEffect(() => {
    if (!instance?.bindings) return;
    const identity = JSON.stringify(instance);
    if (restoredRef.current === identity) return;
    const restored = {};
    for (const [slot, binding] of Object.entries(instance.bindings)) {
      if (typeof binding === 'string') continue;
      const asset = media.find(item => item.id === binding.assetId && item.contentHash === binding.contentHash);
      if (!asset) return;
      restored[slot] = { ...asset, trimStart: binding.trimStart || 0 };
    }
    restoredRef.current = identity;
    setTemplateId(`${instance.templateRef.templateId}@${instance.templateRef.version}`);
    setAspect(instance.aspect || '16:9');
    setCopy(current => Object.fromEntries(Object.keys(current).map(key => [key, instance.bindings[key] || current[key]])));
    setSlots(restored); setProposal(null);
  }, [instance, media]);
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
          player.onerror = () => { clearTimeout(timer); reject(new Error('Unsupported media.')); }; player.src = url;
        }); } finally { URL.revokeObjectURL(url); }
      }
      const uploaded = await uploadSourceFileViaBackend({ file, mediaType, fileName: file.name,
        token: await user.getIdToken(), getToken: () => user.getIdToken(), purpose: 'studio_project' });
      setSlots(current => ({ ...current, [slot]: { id: `launch-${contentHash.slice(0, 24)}`, name: file.name,
        mediaType, type: mediaType, ownerUid: user.uid, contentHash,
        storagePath: uploaded.storagePath, url: uploaded.url, duration, status: 'ready' } }));
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
        ownerUid: user.uid, projectId, bindings, actor, aspect };
      if (actor === 'director') {
        setProposal(await proposeStudioDirectorTemplate({ ...options, intent: template.categoryIds[0] }));
        setStatus('Director selected the launch edit from your brief. Review before applying.');
        return;
      }
      const result = await instantiateStudioCreativeTemplate(options);
      onApply(result.snapshot);
      setStatus('Launch template applied. Clips, titles, keys and sound remain editable.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  };
  if (!template) return <details className="studio-template-library" data-testid="launch-template-panel">
    <summary>Saved template unavailable</summary>
    <p role="status">This project uses a template version that is unavailable in this Studio build. Your existing edit is preserved.</p>
    <label>Choose a template for a new edit
      <select aria-label="Creative template" value="" onChange={event => {
        const next = STUDIO_CREATIVE_TEMPLATES.find(item => `${item.templateId}@${item.version}` === event.target.value);
        if (!next) return;
        setTemplateId(event.target.value); setAspect(next.executionDefinition.defaultAspect || "16:9"); setProposal(null); setSlots({});
      }}>
        <option value="" disabled>Choose a template</option>
        {STUDIO_CREATIVE_TEMPLATES.map(item => <option key={`${item.templateId}@${item.version}`} value={`${item.templateId}@${item.version}`}>{item.label} · {item.version}</option>)}
      </select>
    </label>
  </details>;
  return <details className="studio-template-library" data-testid="launch-template-panel">
    <summary>{template.label} · 20 seconds</summary>
    <ProductHelpButton featureId="studio.templates" label="Templates" workspaceType="STUDIO" />
    <small>Private draft. Bind your footage, logo and soundtrack, then edit the resulting project.</small>
    <label style={{ display: 'block', marginTop: 8 }}>Template
      <select aria-label="Creative template" value={templateId} onChange={e => {
        const next = STUDIO_CREATIVE_TEMPLATES.find(item => `${item.templateId}@${item.version}` === e.target.value);
        setTemplateId(e.target.value); setAspect(next.executionDefinition.defaultAspect || '16:9'); setProposal(null);
      }}>{STUDIO_CREATIVE_TEMPLATES.map(item => <option key={`${item.templateId}@${item.version}`} value={`${item.templateId}@${item.version}`}>{item.label} · {item.version}</option>)}</select>
    </label>
    <label style={{ display: 'block', marginTop: 8 }}>Aspect ratio
      <select aria-label="Template aspect ratio" value={aspect} onChange={e => { setAspect(e.target.value); setProposal(null); }}>
        {template.supportedAspects.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    {Object.entries(copy).map(([key, value]) => <label key={key} style={{ display: 'block', marginTop: 8 }}>
      {({ headline: 'Launch headline', featureOne: 'Feature one', featureTwo: 'Feature two',
        callToAction: 'Launch CTA', brandColour: 'Launch colour' })[key]}
      {key === 'brandColour' ? <input aria-label="Launch colour" type="color" value={value}
        onChange={e => { setProposal(null); setCopy(c => ({ ...c, [key]: e.target.value })); }} />
        : <textarea aria-label={({ headline: 'Launch headline', featureOne: 'Feature one', featureTwo: 'Feature two',
          callToAction: 'Launch CTA' })[key]} value={value} rows={2} onChange={e => { setProposal(null); setCopy(c => ({ ...c, [key]: e.target.value })); }} />}
    </label>)}
    {template.inputSlots.filter(input => ['image', 'audio', 'video'].includes(input.type)).map(input => {
      const slot = input.id;
      return <label key={slot}
      style={{ display: 'block', marginTop: 8 }}>{slot}
      <select aria-label={`Select ${slot}`} value={slots[slot]?.id || ''}
        onChange={e => { setProposal(null); const asset = media.find(a => a.id === e.target.value);
          if (asset) setSlots(c => ({ ...c, [slot]: { ...asset } })); }}><option value="">Choose saved media</option>
        {media.filter(a => a.storagePath && a.contentHash &&
          (a.mediaType || a.type) === input.type)
          .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      {slot.endsWith('Footage') && slots[slot] && <label>Source in-point (seconds)
        <input type="number" min="0" step="0.125" aria-label={`${slot} in-point`}
          value={slots[slot].trimStart || 0} onChange={e => {
            setProposal(null); const value = Number(e.target.value);
            setSlots(current => ({ ...current, [slot]: { ...current[slot], trimStart: value } }));
          }} /></label>}
      <input aria-label={`Upload ${slot}`} type="file" disabled={busy}
        accept={input.type === 'image' ? 'image/png,image/webp' : input.type === 'audio' ? 'audio/*' : 'video/*'}
        onChange={e => bindFile(slot, e.target.files[0])} />
      {slots[slot] && <small>{slots[slot].name}</small>}
    </label>;
    })}
    <button type="button" disabled={busy} onClick={() => apply('manual')}>Apply launch template</button>
    <button type="button" disabled={busy} onClick={() => apply('director')}>Director: select launch edit</button>
    {proposal && <div role="region" aria-label="Director launch selection">
      <strong>{proposal.templateRef.templateId} · {proposal.templateRef.version}</strong>
      <p>{proposal.selectionReason}</p>
      <small>Uses your saved inputs. No model job is started.</small>
      <button type="button" onClick={() => {
        if (proposal.result.projectId !== projectId || proposal.result.ownerUid !== auth.currentUser?.uid) {
          setProposal(null); setStatus('Project changed. Ask Director to select again.'); return;
        }
        onApply(proposal.result.snapshot); setProposal(null);
        setStatus('Director launch edit applied. All clips, titles, keys and sound remain editable.');
      }}>Apply Director launch</button>
      <button type="button" onClick={() => setProposal(null)}>Dismiss selection</button>
    </div>}
    <p role="status">{status}</p>
  </details>;
}

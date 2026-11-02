import React, { useState } from 'react';
import { buildStudioEvidenceScenePlan } from './studioSceneActions';

export default function StudioSceneActionsPanel({ getSnapshot, projectMedia = [], time, onApply, locked = false }) {
  const [source, setSource] = useState(''), [plan, setPlan] = useState(null), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // A changing playhead does not need a reconciled/validated project. Ask for
  // its current canonical state only when constructing the reviewed action.
  const media = projectMedia.filter(item => item.status === 'ready' && item.storagePath && item.url);
  return <details className="advanced-tool-section" data-testid="studio-scene-actions">
    <summary>Cinematic Scene · editable actions</summary>
    <p>Review a scene plan with animated typography, artwork, groups, media, rigs and grading. It uses the same editable layers and motion tools as the rest of Studio.</p>
    <label>Evidence source<select aria-label="Scene evidence source" value={source} onChange={e => setSource(e.target.value)}>
      <option value="">Choose saved project video</option>{media.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <button type="button" disabled={!source} onClick={() => {
      try { setPlan(buildStudioEvidenceScenePlan(getSnapshot(), source, time)); setMessage('Review the media and placement before applying. This local recipe makes no transcript or AI-inference claim.'); }
      catch (error) { setMessage(error.message); }
    }}>Build evidence scene plan</button>
    <label>Import scene actions<input type="file" accept=".json" aria-label="Scene action plan" onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try { if (file.size > 1024 * 1024) throw Error('Choose a scene plan smaller than 1 MiB.'); setPlan(JSON.parse(await file.text())); setMessage('Review this plan before applying.'); }
      catch (error) { setMessage(error.message); }
    }} /></label>
    {plan ? <><pre style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(plan, null, 2)}</pre>
      <button type="button" disabled={busy || locked} onClick={async () => {
        setBusy(true);
        try { await onApply(plan); setPlan(null); setMessage('Scene actions applied. Undo restores the previous edit.'); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
      }}>{busy ? 'Preparing editable scene…' : 'Apply reviewed scene actions'}</button></> : null}
    {locked ? <p>Unlock the Video, Graphics and B-roll tracks to apply a complete scene.</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}

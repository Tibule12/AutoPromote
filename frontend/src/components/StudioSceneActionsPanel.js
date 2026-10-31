import React, { useState } from 'react';
import { buildStudioEvidenceScenePlan } from './studioSceneActions';

export default function StudioSceneActionsPanel({ snapshot, time, onApply }) {
  const [source, setSource] = useState(''), [plan, setPlan] = useState(null), [message, setMessage] = useState('');
  const media = (snapshot.projectMedia || []).filter(item => item.status === 'ready' && item.storagePath && item.url);
  return <details className="advanced-tool-section" data-testid="studio-scene-actions">
    <summary>Cinematic Scene · editable actions</summary>
    <p>Build a local evidence-screen recipe or import a reviewed scene plan. Every action becomes an editable Studio layer or keyframe.</p>
    <label>Evidence source<select aria-label="Scene evidence source" value={source} onChange={e => setSource(e.target.value)}>
      <option value="">Choose saved project video</option>{media.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <button type="button" disabled={!source} onClick={() => {
      try { setPlan(buildStudioEvidenceScenePlan(snapshot, source, time)); setMessage('Review the media and placement before applying. This local recipe makes no transcript or AI-inference claim.'); }
      catch (error) { setMessage(error.message); }
    }}>Build evidence scene plan</button>
    <label>Import scene actions<input type="file" accept=".json" aria-label="Scene action plan" onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try { if (file.size > 256 * 1024) throw Error('Choose a scene plan smaller than 256 KB.'); setPlan(JSON.parse(await file.text())); setMessage('Review this plan before applying.'); }
      catch (error) { setMessage(error.message); }
    }} /></label>
    {plan ? <><pre style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(plan, null, 2)}</pre>
      <button type="button" onClick={() => { try { onApply(plan); setPlan(null); setMessage('Scene actions applied. Undo restores the previous edit.'); } catch (error) { setMessage(error.message); } }}>Apply reviewed scene actions</button></> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}

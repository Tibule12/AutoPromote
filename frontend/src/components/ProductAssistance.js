import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import './ProductAssistance.css';

export async function askProductAssistance(input, signal) {
  const response = await fetch(`${API_BASE_URL}/api/product-assistance/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal, credentials: 'omit',
  });
  if (!response.ok) throw new Error(response.status === 400
    ? 'Use a product question and safe feature context. Leave out links, credentials and private project information.'
    : 'Product documentation is temporarily unavailable. Please try again.');
  return response.json();
}
// API documentation paths alone can become links; model/server text cannot inject
// external/private URLs or HTML. React escapes all question and result prose.
const docUrl = value => typeof value === 'string' && /^\/api\/product-assistance\/docs\/[a-z0-9_./#-]+$/i.test(value) && !value.includes('..') ? `${API_BASE_URL}${value}` : undefined;
const DocLink = ({ url, children }) => <a href={docUrl(url)} target="_blank" rel="noreferrer">{children}</a>;
export function ProductAssistanceLauncher({ onClick, className = "product-assistance-open" }) {
  return <button type="button" className={className} aria-label="Ask AutoPromote" title="Ask AutoPromote" onClick={onClick || (() => window.dispatchEvent(new Event('autopromote:open-product-help')))}>
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2V11.5a9 9 0 0 1 18 0Z" /><path d="M7 11h.01M11 11h.01M15 11h.01" /></svg>
  </button>;
}
export default function ProductAssistance({ request = askProductAssistance, launcher = true }) {
  const [open, setOpen] = useState(false), [question, setQuestion] = useState('');
  const [mode, setMode] = useState('EXPLAIN'), [context, setContext] = useState({});
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialogRef = useRef(null), inputRef = useRef(null), priorFocus = useRef(null), controller = useRef(null);
  const sequence = useRef(0);
  const run = async (text, selectedMode, selectedContext) => {
    controller.current?.abort(); controller.current = new AbortController();
    const attempt = ++sequence.current;
    const deadline = setTimeout(() => { if (attempt === sequence.current) controller.current?.abort(); }, 15000);
    setBusy(true); setError(''); setResult(null);
    try {
      const answer = await request({ question: text, mode: selectedMode, context: selectedContext }, controller.current.signal);
      if (attempt === sequence.current) setResult(answer);
    } catch (failure) { if (attempt === sequence.current) setError(failure.name === 'AbortError' ? 'Documentation lookup timed out. Please try again.' : failure.message); }
    finally { clearTimeout(deadline); if (attempt === sequence.current) setBusy(false); }
  };
  const close = () => { ++sequence.current; controller.current?.abort(); setOpen(false); setBusy(false); priorFocus.current?.focus(); };
  const openHelp = () => { priorFocus.current = document.activeElement; setContext({}); setQuestion(''); setResult(null); setError(''); setOpen(true); };
  useEffect(() => {
    const openGlobalHelp = () => openHelp();
    const help = event => {
      const id = event.detail?.selected_feature_id;
      if (typeof id !== 'string' || !/^[a-z0-9_.]{1,100}$/.test(id)) return;
      const safe = { selected_feature_id: id };
      if (['STUDIO', 'CAM_COMBINER', 'IDEA_VIDEO'].includes(event.detail?.workspace_type)) safe.workspace_type = event.detail.workspace_type;
      priorFocus.current = document.activeElement; setContext(safe); setMode('EXPLAIN'); setQuestion('What is this?'); setOpen(true);
      run('What is this?', 'EXPLAIN', safe);
    };
    window.addEventListener('autopromote:product-help', help);
    window.addEventListener('autopromote:open-product-help', openGlobalHelp);
    return () => { window.removeEventListener('autopromote:product-help', help); window.removeEventListener('autopromote:open-product-help', openGlobalHelp); controller.current?.abort(); };
    // The request adapter is stable; mutable result/mode/context are not captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  const onKey = event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...dialogRef.current.querySelectorAll('button,input,select,a[href],summary')].filter(el => !el.disabled && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  return <>
    {launcher && <ProductAssistanceLauncher onClick={openHelp} />}
    {open && createPortal(<div className="product-assistance-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <aside className="product-assistance-panel" role="dialog" aria-modal="true" aria-labelledby="product-assistance-title" ref={dialogRef} onKeyDown={onKey}>
        <div className="product-assistance-heading"><h2 id="product-assistance-title">Ask AutoPromote</h2><button type="button" aria-label="Close product help" onClick={close}>×</button></div>
        <p>Product help from the current documentation. This panel explains workflows; it cannot change your project or run jobs.</p>
        {context.selected_feature_id && <p>Context: {result?.features?.[0]?.name || 'Selected feature'} <button type="button" onClick={() => { ++sequence.current; controller.current?.abort(); setBusy(false); setContext({}); setResult(null); }}>Clear context</button></p>}
        <form onSubmit={event => { event.preventDefault(); run(question, mode, context); }}>
          <label>Question<input ref={inputRef} value={question} maxLength={1000} onChange={event => setQuestion(event.target.value)} placeholder="How do I add keyframes?" /></label>
          <label>Help mode<select value={mode} onChange={event => setMode(event.target.value)}><option value="EXPLAIN">Explain</option><option value="GUIDE">Guide</option><option value="DIAGNOSE">Diagnose</option></select></label>
          <button type="submit" disabled={busy || !question.trim()}>{busy ? 'Looking up documentation…' : 'Ask'}</button>
        </form>
        {error && <p role="alert">{error}</p>}
        <div aria-live="polite" aria-busy={busy}>
          {result && <>
            <p className="product-assistance-answer">{result.answer}</p>
            {result.features.map(feature => <section key={feature.feature_id} className="product-assistance-feature">
              <h3>{feature.name} <span className={`product-readiness status-${feature.status.toLowerCase()}`}>{feature.status}</span></h3>
              <p><strong>Where:</strong> {feature.location}</p><p><strong>Next step:</strong> {feature.next_step}</p>
              {!!feature.how_to_use.length && <ol>{feature.how_to_use.map(step => <li key={step}>{step}</li>)}</ol>}
              <p><strong>Preview:</strong> {feature.preview_behavior}</p><p><strong>Final output:</strong> {feature.render_behavior}</p>
              <ul>{feature.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
              {!!feature.dependencies.length && <p><strong>Requires:</strong> {feature.dependencies.map(d => `${d.name} (${d.status})`).join('; ')}</p>}
              {feature.common_errors.map(item => <p key={item.condition}><strong>{item.condition}:</strong> {item.resolution}</p>)}
            </section>)}
            {!!result.controls.length && <details><summary>Related controls ({result.controls.length})</summary>{result.controls.map(control => <p key={control.control_id}><DocLink url={control.documentation_url}>{control.label}</DocLink> — {control.meaning} Keyframes: {control.keyframeable}; preview: {control.preview_support}; final: {control.render_support}.</p>)}</details>}
            {result.tasks.map(task => <details key={task.task_id}><summary>{task.title} · {task.status}</summary><p>{task.summary}</p><ol>{task.steps.map((step, i) => <li key={i}>{step.instruction} ({step.status})</li>)}</ol><ul>{task.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul><DocLink url={task.documentation_url}>Read related guide</DocLink></details>)}
            {result.documentation_gap && <p>A documentation gap was recorded for review. No undocumented cause or workflow has been assumed.</p>}
            <details><summary>{result.sources.label}</summary><p>Product {result.sources.product_version} · knowledge {result.sources.knowledge_version} · updated {result.sources.updated_at}</p><DocLink url={result.sources.documentation_url}>Documentation index</DocLink>{result.features.map(f => <p key={f.feature_id}><DocLink url={f.documentation_url}>{f.name}</DocLink></p>)}</details>
          </>}
        </div>
      </aside>
    </div>, document.body)}
  </>;
}

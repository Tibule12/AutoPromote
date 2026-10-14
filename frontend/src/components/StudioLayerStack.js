import React from 'react';
import './StudioLayerStack.css';

export default function StudioLayerStack({ entries, onMove }) {
  if (!entries.length) return null;
  return <section className="studio-layer-stack" aria-label="Layer stack">
    <h5>Layer order</h5>
    <p>Top layers appear in front. Footage stays below this stack; captions stay above it.</p>
    <ol>
      {[...entries].reverse().map((entry, index) => <li key={entry.id}
        data-layer-id={entry.id} data-layer-kind={entry.kind}>
        <span><strong>{entry.label}</strong><small>{entry.kind === 'three_d' ? '3D' : entry.kind === 'motion' ? 'Motion' : 'Visual'}</small></span>
        <button type="button" aria-label={`Bring ${entry.label} forward`} disabled={index === 0}
          onClick={() => onMove(entry.id, 'forward')}>↑</button>
        <button type="button" aria-label={`Send ${entry.label} backward`} disabled={index === entries.length - 1}
          onClick={() => onMove(entry.id, 'backward')}>↓</button>
      </li>)}
    </ol>
  </section>;
}

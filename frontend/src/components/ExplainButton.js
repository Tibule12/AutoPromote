import React from 'react';
import toast from 'react-hot-toast';

// Small Explain button that asks the assistant for a short explanation of a context
export default function ExplainButton({ contextSummary = '', label = 'Explain' }) {
  const handle = async () => {
    try {
      const res = await fetch('/api/assistant/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: `Explain: ${contextSummary}` }) });
      const j = await res.json();
      if (j && j.reply) toast((t) => (<div style={{ whiteSpace: 'pre-wrap' }}>{j.reply}</div>), { duration: 8000 });
      else toast('No explanation available');
    } catch (e) {
      console.warn(e);
      toast.error('Failed to get explanation');
    }
  };

  return (
    <button onClick={handle} style={{ background: 'transparent', border: '1px dashed #ccc', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', color: '#fff' }}>{label}</button>
  );
}
